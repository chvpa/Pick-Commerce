import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PROJECT.md §17 exige que todo componente sea customizable por composición,
 * variants, slots, tokens, props y `className` como escape hatch.
 *
 * Este test fija la parte mecánica de ese contrato: que ningún componente se
 * agregue sin su escape hatch. Es el tipo de regla que se cumple sola las
 * primeras diez veces y se olvida en la once — de hecho `CartDrawer` ya se
 * había colado sin `className`.
 */
function archivos(dir: string, ext: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, ext));
    else if (entrada.endsWith(ext) && !entrada.includes('.test.')) salida.push(ruta);
  }
  return salida;
}

// `fileURLToPath` y no `.pathname`: con un espacio en la ruta del repo,
// `.pathname` devuelve "Pick%20commerce" y readdirSync no lo encuentra.
const RAIZ_UI = dirname(fileURLToPath(import.meta.url));
const RAIZ_ASTRO = join(RAIZ_UI, '..', '..', 'commerce-astro', 'src');

test('toda island Preact acepta className', () => {
  const sinEscape = archivos(RAIZ_UI, '.tsx').filter(
    (f) => !readFileSync(f, 'utf8').includes('className?: string'),
  );
  assert.deepEqual(
    sinEscape,
    [],
    `Componentes sin el escape hatch className:\n${sinEscape.join('\n')}`,
  );
});

/**
 * Componentes que no renderizan nada visible: emiten `<meta>`, `<link>` o
 * `<script>` dentro del `<head>`. No hay superficie que estilar, así que
 * exigirles `className` sería exigir una prop muerta.
 */
const SIN_SUPERFICIE_VISIBLE = ['seo'];

test('todo componente .astro acepta class y lo combina con cn', () => {
  const problemas: string[] = [];
  for (const f of archivos(RAIZ_ASTRO, '.astro')) {
    if (SIN_SUPERFICIE_VISIBLE.some((dir) => f.includes(`${dir}${sep}`))) continue;
    const src = readFileSync(f, 'utf8');
    if (!src.includes('class?: string')) problemas.push(`${f}: no declara class`);
    // `cn` resuelve el conflicto; sin él el override del consumidor es incierto.
    else if (!/\b(cn|buttonVariants|badgeVariants)\(/.test(src)) problemas.push(`${f}: no usa cn`);
    else if (!src.includes('className')) problemas.push(`${f}: no propaga la clase recibida`);
  }
  assert.deepEqual(problemas, [], `\n${problemas.join('\n')}`);
});

/**
 * Un preset redefine variables, nunca clases de componentes (ADR-110, ADR-139).
 *
 * Es la regla que hace que una mejora de un componente llegue a todas las tiendas
 * sin pelearse con la marca, y la que se rompe sola: pisar una clase «esta única
 * vez» funciona hasta el día en que el componente cambia y la tienda se queda con
 * el estilo viejo encima. Acá se comprueba mecánicamente: dentro de un preset sólo
 * puede haber un bloque `@theme` con declaraciones de variables.
 *
 * Se mide sobre el archivo y no sobre el CSS compilado a propósito: lo que hay que
 * impedir es que alguien **escriba** un selector, no que Tailwind genere uno.
 */
test('los presets sólo redefinen variables', () => {
  const problemas: string[] = [];
  const dir = join(RAIZ_UI, 'styles', 'presets');

  for (const ruta of archivos(dir, '.css')) {
    // Sin comentarios: adentro hay ejemplos de uso con `@import`, que es lo que se
    // documenta, y no queremos que un ejemplo dispare el test.
    const css = readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    for (const prohibido of ['@utility', '@apply', '@layer', '@source', '@import']) {
      if (css.includes(prohibido)) problemas.push(`${ruta}: usa ${prohibido}`);
    }

    // Fuera del `@theme` no puede quedar nada, y adentro sólo `--variable: valor`.
    const bloques = [...css.matchAll(/@theme\s*\{([\s\S]*?)\n\}/g)];
    const afuera = css.replace(/@theme\s*\{[\s\S]*?\n\}/g, '').trim();
    if (afuera !== '') problemas.push(`${ruta}: hay CSS fuera de @theme: ${afuera.slice(0, 60)}`);

    for (const bloque of bloques) {
      for (const linea of bloque[1]!.split('\n')) {
        const limpia = linea.trim();
        if (limpia === '') continue;
        if (!/^--[a-z0-9-]+:\s*.+;$/.test(limpia)) {
          problemas.push(`${ruta}: «${limpia}» no es una declaración de variable`);
        }
      }
    }
  }

  assert.notEqual(archivos(dir, '.css').length, 0, 'no se encontró ningún preset');
  assert.deepEqual(problemas, [], `\n${problemas.join('\n')}`);
});
