import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { globSync } from 'node:fs';

/**
 * Presupuesto de performance del storefront.
 *
 * Mide el peso real que descarga cada página: sigue la cadena de imports desde
 * el HTML, no sólo lo que el HTML referencia directamente. Una medición previa
 * que contaba sólo lo referenciado dio 42 KB donde en realidad eran 59.
 *
 * Se ejecuta sobre el build, en CI. No reemplaza a Lighthouse: acota lo que se
 * puede acotar de forma determinista y barata, que es el peso.
 */
const RAIZ = 'apps/demo/dist/client';

/** Gzip porque es lo que viaja por la red. */
const PRESUPUESTO = {
  js: 25 * 1024,
  css: 20 * 1024,
};

/**
 * `signals.module` entra por un `import()` dinámico condicionado a
 * `data-preact-signals`, y ninguna island pasa signals: se emite pero nunca se
 * descarga. Contarlo infla el número con bytes que nadie pide.
 */
const NUNCA_SE_DESCARGA = ['signals.module'];

function cierre(html, exts) {
  const patron = new RegExp(`_astro/[A-Za-z0-9._-]+[.](?:${exts})`, 'g');
  const vistos = new Set();
  const pila = [...(html.match(patron) ?? [])];

  while (pila.length > 0) {
    const archivo = pila.pop();
    if (vistos.has(archivo)) continue;
    if (NUNCA_SE_DESCARGA.some((n) => archivo.includes(n))) continue;

    const ruta = join(RAIZ, archivo);
    if (!existsSync(ruta)) continue;
    vistos.add(archivo);

    const src = readFileSync(ruta, 'utf8');
    for (const m of src.match(patron) ?? []) pila.push(m);
    for (const m of src.match(/from"\.\/([A-Za-z0-9._-]+\.js)"/g) ?? []) {
      pila.push('_astro/' + m.slice(7, -1));
    }
  }
  return [...vistos];
}

function pesoGzip(archivos) {
  return archivos.reduce((total, f) => total + gzipSync(readFileSync(join(RAIZ, f))).length, 0);
}

const paginas = globSync('**/*.html', { cwd: RAIZ });
if (paginas.length === 0) {
  console.error(`No hay páginas en ${RAIZ}. ¿Falta construir?`);
  process.exit(1);
}

let excedidas = 0;
console.log('Peso por página (gzip, siguiendo la cadena de imports)\n');
console.log(`  ${'página'.padEnd(44)} ${'JS'.padStart(9)} ${'CSS'.padStart(9)}`);

for (const pagina of paginas.sort()) {
  const html = readFileSync(join(RAIZ, pagina), 'utf8');
  const js = pesoGzip(cierre(html, 'js'));
  const css = pesoGzip(cierre(html, 'css'));

  const malJs = js > PRESUPUESTO.js;
  const malCss = css > PRESUPUESTO.css;
  if (malJs || malCss) excedidas++;

  const fmt = (n, mal) => `${(n / 1024).toFixed(1)} KB${mal ? ' !' : '  '}`;
  console.log(
    `  ${pagina.padEnd(44)} ${fmt(js, malJs).padStart(9)} ${fmt(css, malCss).padStart(9)}`,
  );
}

console.log(
  `\nPresupuesto: JS ${PRESUPUESTO.js / 1024} KB · CSS ${PRESUPUESTO.css / 1024} KB (gzip)`,
);

if (excedidas > 0) {
  console.error(`\n${excedidas} página(s) exceden el presupuesto.`);
  process.exit(1);
}
console.log('Dentro del presupuesto.');
