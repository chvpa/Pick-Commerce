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
