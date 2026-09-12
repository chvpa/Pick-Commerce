/*
 * La compuerta de los documentos.
 *
 * Existe porque el harness pedía documentos verdaderos y no había nada que lo
 * comprobara: una auditoría del 2026-09-12 encontró 70 correcciones a mano, y
 * la mitad eran mecánicas —una ruta que ya no existe, un comando que se
 * retiró, un porcentaje escrito en dos lugares que dejaron de coincidir—. Todo
 * lo demás de este repo tiene compuerta: `lint`, `typecheck`, `test`, `e2e`.
 * Los documentos tenían una regla, y una regla sin compuerta se cumple
 * mientras la atención está alta y se cae cuando no.
 *
 * No comprueba que un documento diga la verdad: eso no se puede automatizar.
 * Comprueba las siete formas de mentir que **sí** son mecánicas, y las corta.
 *
 * Correr: `pnpm docs:check`
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const fallas = [];
const anotar = (documento, detalle) => fallas.push({ documento, detalle });

const documentos = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const texto = new Map(documentos.map((d) => [d, readFileSync(d, 'utf8')]));

/**
 * Las líneas que no son prosa afirmativa: los bloques de código de ejemplo y
 * las citas. Un bloque ```bash que muestra un comando de ejemplo no está
 * afirmando que ese comando exista, y una cita reproduce lo que alguien dijo.
 */
function lineasAfirmativas(contenido) {
  const fuera = [];
  let enBloque = false;
  for (const [i, linea] of contenido.split('\n').entries()) {
    if (linea.trimStart().startsWith('```')) {
      enBloque = !enBloque;
      continue;
    }
    if (!enBloque) fuera.push([i + 1, linea]);
  }
  return fuera;
}

// ---------------------------------------------------------------------------
// 1. Un hecho, una casa: el avance de las fases vive sólo en el ROADMAP
// ---------------------------------------------------------------------------

const DUEÑO_DEL_AVANCE = 'ROADMAP.md';

for (const [documento, contenido] of texto) {
  if (documento === DUEÑO_DEL_AVANCE) continue;
  for (const [n, linea] of lineasAfirmativas(contenido)) {
    if (/\*\*Avance[:\s]/.test(linea) || /\bAvance:\s*\d+\s*%/.test(linea)) {
      anotar(
        documento,
        `${n}: el avance de una fase se declara acá y su única casa es ${DUEÑO_DEL_AVANCE} — enlazá en vez de repetir`,
      );
    }
    if (/\b(IN PROGRESS|TODO|DONE)\b/.test(linea) && /\bv[123]\b/.test(linea)) {
      anotar(
        documento,
        `${n}: el estado de una versión se declara acá y su única casa es ${DUEÑO_DEL_AVANCE}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Todo comando citado existe
// ---------------------------------------------------------------------------

/** Los built-in de pnpm, que no son scripts de este repo. */
const DE_PNPM = new Set([
  'install',
  'add',
  'remove',
  'update',
  'why',
  'exec',
  'dlx',
  'run',
  'list',
  'outdated',
  'audit',
  'publish',
  'pack',
  'link',
  'store',
  'config',
  'init',
  'import',
  'rebuild',
  'prune',
  'setup',
  'env',
  'licenses',
  'patch',
  'deploy',
  'create',
  // No son comandos: es el nombre de la función de pnpm, que se cita en prosa.
  'workspaces',
  'workspace',
]);

/**
 * Un documento que registra el pasado no miente al nombrar algo que ya no
 * existe: `DECISIONS.md` es historia por definición, y las filas de tabla del
 * ROADMAP son su changelog y su backlog. Lo que se comprueba es la prosa que
 * afirma el presente.
 */
const HISTORIA = new Set(['DECISIONS.md']);

/**
 * Y una frase que **dice** que algo se retiró tampoco miente: «`pnpm budget` se
 * retiró» es justamente la corrección, no el error. Lo que se busca es la
 * promesa: el comando ofrecido como si funcionara.
 */
const SE_RETIRO =
  /se retiró|ya no existe|ya no está|dejó de|se descartó|se quitó|se reemplazó|se mudó|en su lugar/;

const esRegistro = (documento, linea) =>
  HISTORIA.has(documento) || linea.trimStart().startsWith('|') || SE_RETIRO.test(linea);

const scripts = new Set();
for (const paquete of execFileSync('git', ['ls-files', '*package.json'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)) {
  const json = JSON.parse(readFileSync(paquete, 'utf8'));
  for (const nombre of Object.keys(json.scripts ?? {})) scripts.add(nombre);
}

for (const [documento, contenido] of texto) {
  for (const [n, linea] of lineasAfirmativas(contenido)) {
    if (esRegistro(documento, linea)) continue;
    for (const m of linea.matchAll(/`pnpm ([^`]+)`/g)) {
      if (/[<>]/.test(m[1])) continue; // `pnpm --filter <app> run deploy`: un molde
      const partes = m[1].trim().split(/\s+/);
      // `pnpm --filter X run Y` y `pnpm -r test`: el script es el último token
      // que no sea una opción ni un valor de `--filter`.
      const candidato = partes.includes('run')
        ? partes[partes.indexOf('run') + 1]
        : partes.find((t) => !t.startsWith('-') && !t.startsWith('@') && !DE_PNPM.has(t));
      if (!candidato) continue;
      const limpio = candidato.replace(/[.,;:)]+$/, '');
      if (!scripts.has(limpio) && !DE_PNPM.has(limpio)) {
        anotar(documento, `${n}: cita \`pnpm ${limpio}\` y ningún package.json tiene ese script`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Toda ruta citada existe
// ---------------------------------------------------------------------------

const RAICES = ['apps/', 'packages/', 'scripts/', 'supabase/', 'e2e/', '.github/'];

/**
 * Las rutas que faltan se juntan y se consultan a git de una sola vez: una que
 * git ignora —`.dev.vars`, cualquier cosa bajo `dist/`— no está versionada, así
 * que nombrarla no es una afirmación falsa sino una instrucción para crearla.
 */
const candidatas = [];

for (const [documento, contenido] of texto) {
  for (const [n, linea] of lineasAfirmativas(contenido)) {
    for (const m of linea.matchAll(/`([^`\s]+)`/g)) {
      const crudo = m[1];
      if (!RAICES.some((r) => crudo.startsWith(r))) continue;
      // Se le quita la referencia de línea (`archivo.ts:120`), el rango
      // (`:120-130`) y la puntuación de la oración.
      const ruta = crudo.replace(/:[\d-]+$/, '').replace(/[.,;:)]+$/, '');
      // Un glob, un comodín o un molde no es una ruta: describe un conjunto.
      if (/[*?{}<>]/.test(ruta)) continue;
      if (!existsSync(ruta)) candidatas.push({ documento, n, ruta });
    }
  }
}

if (candidatas.length > 0) {
  let ignoradas = new Set();
  try {
    const salida = execFileSync('git', ['check-ignore', '--stdin'], {
      input: candidatas.map((c) => c.ruta).join('\n'),
      encoding: 'utf8',
    });
    ignoradas = new Set(salida.split('\n').filter(Boolean));
  } catch {
    // `git check-ignore` sale con 1 cuando ninguna está ignorada: no es un error.
  }
  for (const c of candidatas) {
    if (!ignoradas.has(c.ruta)) {
      anotar(c.documento, `${c.n}: nombra \`${c.ruta}\` y no existe en el disco`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Todo enlace relativo resuelve
// ---------------------------------------------------------------------------

for (const [documento, contenido] of texto) {
  for (const [n, linea] of lineasAfirmativas(contenido)) {
    for (const m of linea.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const destino = m[1];
      if (/^(https?:|mailto:|#)/.test(destino)) continue;
      const ruta = destino.split('#')[0];
      if (ruta && !existsSync(ruta)) {
        anotar(documento, `${n}: enlaza a \`${ruta}\` y no existe`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Todo ADR citado existe, y 6. el rango que se cita es el real
// ---------------------------------------------------------------------------

const decisiones = texto.get('DECISIONS.md') ?? '';
const existentes = new Set(
  [...decisiones.matchAll(/^#{2,3} ADR-(\d+)/gm)].map((m) => Number(m[1])),
);
const ultimo = Math.max(...existentes);

for (const [documento, contenido] of texto) {
  for (const [n, linea] of lineasAfirmativas(contenido)) {
    for (const m of linea.matchAll(/ADR-(\d+)/g)) {
      const numero = Number(m[1]);
      // Un rango escrito `ADR-001..114` se comprueba abajo, no acá.
      if (/ADR-\d+\.\./.test(linea)) continue;
      if (!existentes.has(numero)) {
        anotar(documento, `${n}: cita ADR-${m[1]} y DECISIONS.md no lo tiene`);
      }
    }
    for (const m of linea.matchAll(/ADR-(\d+)\.\.(\d+)/g)) {
      if (Number(m[2]) !== ultimo) {
        anotar(
          documento,
          `${n}: dice que los ADR llegan al ${m[2]} y el último de DECISIONS.md es el ${ultimo}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Lo que se retiró no se sigue prometiendo, y no hay documentos duplicados
// ---------------------------------------------------------------------------

/** Cosas que existieron, se retiraron, y quedaron citadas. */
const RETIRADO = [['pnpm budget', 'el presupuesto de peso se mudó al e2e (ADR-106)']];

for (const [documento, contenido] of texto) {
  for (const [n, linea] of lineasAfirmativas(contenido)) {
    if (esRegistro(documento, linea)) continue;
    for (const [que, por] of RETIRADO) {
      if (linea.includes(que))
        anotar(documento, `${n}: promete «${que}», que ya no existe — ${por}`);
    }
  }
}

/**
 * Un segundo documento con las instrucciones del proyecto garantiza que uno de
 * los dos quede viejo: pasó con `AGENTS.md`, que era una copia byte a byte de
 * CLAUDE.md congelada catorce días atrás. La única casa es CLAUDE.md.
 */
for (const gemelo of ['AGENTS.md', 'GEMINI.md', 'CONVENTIONS.md', '.cursorrules']) {
  if (existsSync(gemelo)) {
    anotar(
      gemelo,
      'un segundo documento de instrucciones siempre queda viejo: la única casa es CLAUDE.md',
    );
  }
}

// ---------------------------------------------------------------------------

if (fallas.length === 0) {
  console.log(`docs:check — ${documentos.length} documentos, sin contradicciones mecánicas.`);
  process.exit(0);
}

const porDocumento = new Map();
for (const f of fallas) {
  porDocumento.set(f.documento, [...(porDocumento.get(f.documento) ?? []), f.detalle]);
}

console.error(`docs:check — ${fallas.length} problemas en ${porDocumento.size} documentos:\n`);
for (const [documento, detalles] of porDocumento) {
  console.error(`  ${basename(documento) === documento ? documento : documento}`);
  for (const d of detalles) console.error(`    ${d}`);
  console.error('');
}
process.exit(1);
