import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cn } from './cn.ts';
import { buttonVariants } from '../recipes/button.ts';
import { badgeVariants } from '../recipes/badge.ts';

/**
 * Estos casos existen por un bug real: una configuración recortada de
 * tailwind-merge clasificaba `border-b` como color de borde y lo descartaba,
 * así que el header, el footer y el cart drawer se desplegaron sin sus bordes.
 * Ninguna prueba falló porque todas usaban combinaciones de las recetas, no las
 * que producían los componentes.
 */
test('conserva el lado del borde junto con su color', () => {
  assert.equal(cn('border-b border-border'), 'border-b border-border');
  assert.equal(cn('border-t border-border'), 'border-t border-border');
  assert.equal(cn('border-l border-border'), 'border-l border-border');
  assert.equal(cn('border border-border'), 'border border-border');
});

test('conserva el radio base junto con el de una esquina', () => {
  assert.equal(cn('rounded-md rounded-t-lg'), 'rounded-md rounded-t-lg');
});

test('resuelve los conflictos que producen las recetas reales', () => {
  // Cada uno existe hoy en el código: CartDrawer y AddToCart.
  assert.equal(
    cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2').match(/px-\d/g)?.length,
    1,
  );
  assert.ok(
    cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'cursor-wait').includes('cursor-wait'),
  );
  assert.ok(!cn(buttonVariants({ size: 'lg' }), 'cursor-wait').includes('cursor-pointer'));
  assert.equal(cn(badgeVariants({ tone: 'sale' }), 'px-3').match(/px-\d/g)?.length, 1);
});

test('el override de quien consume gana', () => {
  const casos: [string, string, string][] = [
    ['p-4', 'p-6', 'p-6'],
    ['px-4', 'px-6', 'px-6'],
    ['w-8', 'w-12', 'w-12'],
    ['text-sm', 'text-lg', 'text-lg'],
    ['text-fg', 'text-fg-muted', 'text-fg-muted'],
    ['bg-surface', 'bg-accent', 'bg-accent'],
    ['rounded-md', 'rounded-full', 'rounded-full'],
    ['cursor-pointer', 'cursor-not-allowed', 'cursor-not-allowed'],
  ];
  for (const [base, override, esperado] of casos) {
    assert.equal(cn(base, override), esperado, `${base} + ${override}`);
  }
});

test('no colapsa clases que no están en conflicto', () => {
  assert.equal(cn('flex', 'gap-2', 'text-sm'), 'flex gap-2 text-sm');
  assert.equal(cn('px-4', 'py-2'), 'px-4 py-2');
});

test('acepta condicionales y descarta valores vacíos', () => {
  const activo = process.argv.length > 0;
  assert.equal(cn('px-4', !activo && 'px-6', undefined, null, ''), 'px-4');
  assert.equal(cn('px-4', activo && 'px-6'), 'px-6');
});
