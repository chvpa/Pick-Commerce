import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twMerge as twMergeCompleto } from 'tailwind-merge';
import { cn } from './cn.ts';
import { buttonVariants } from '../recipes/button.ts';
import { badgeVariants } from '../recipes/badge.ts';

/**
 * `cn` usa una config recortada de tailwind-merge para no enviar 27 KB al
 * browser. El riesgo es que un grupo faltante deje de resolver conflictos sin
 * avisar, así que se compara contra el tailwind-merge completo: si ambos
 * coinciden, el recorte no perdió nada en los casos que el design system usa.
 */
function coincideConElCompleto(...inputs: string[]): void {
  const recortado = cn(...inputs);
  const completo = twMergeCompleto(...inputs);
  assert.equal(
    recortado,
    completo,
    `cn recortado difiere del completo.\n  entrada:  ${inputs.join(' ')}\n  recortado: ${recortado}\n  completo:  ${completo}`,
  );
}

test('resuelve los conflictos que producen las recetas reales', () => {
  // Cada uno de estos existe hoy en el código: CartDrawer y AddToCart.
  coincideConElCompleto(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2');
  coincideConElCompleto(
    buttonVariants({ variant: 'secondary', size: 'lg' }),
    'cursor-not-allowed text-fg-subtle',
  );
  coincideConElCompleto(buttonVariants({ variant: 'primary', size: 'lg' }), 'cursor-wait');
  coincideConElCompleto(badgeVariants({ tone: 'sale' }), 'px-3 text-sm');
});

test('resuelve los overrides que el escape hatch habilita', () => {
  const casos: string[][] = [
    ['p-4', 'p-6'],
    ['px-4', 'px-6'],
    ['p-4', 'px-6'],
    ['w-8', 'w-12'],
    ['h-9', 'h-11'],
    ['size-4', 'size-6'],
    ['text-sm', 'text-lg'],
    ['text-fg', 'text-fg-muted'],
    ['text-sm text-fg', 'text-lg'],
    ['bg-surface', 'bg-accent'],
    ['rounded-md', 'rounded-full'],
    ['gap-2', 'gap-4'],
    ['cursor-pointer', 'cursor-not-allowed'],
    ['border-border', 'border-fg'],
    ['font-medium', 'font-semibold'],
    ['opacity-60', 'opacity-100'],
    ['max-w-md', 'max-w-lg'],
    ['min-w-11', 'min-w-16'],
  ];
  for (const caso of casos) coincideConElCompleto(...caso);
});

test('no colapsa clases que no están en conflicto', () => {
  assert.equal(cn('flex', 'gap-2', 'text-sm'), 'flex gap-2 text-sm');
  assert.equal(cn('px-4', 'py-2'), 'px-4 py-2');
});

test('acepta condicionales y descarta valores vacíos', () => {
  const activo = process.argv.length > 0; // true, pero no constante para el linter
  const inactivo = !activo;
  assert.equal(cn('px-4', inactivo && 'px-6', undefined, null, ''), 'px-4');
  assert.equal(cn('px-4', activo && 'px-6'), 'px-6');
});
