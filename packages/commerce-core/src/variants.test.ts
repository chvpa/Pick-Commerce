import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProductVariant } from '@pick/commerce-types';
import { buildVariantOptions, defaultSelection, findVariant } from './variants.ts';
import { money } from './money.ts';

function variant(
  id: string,
  attributes: Record<string, string>,
  availableQuantity: number,
): ProductVariant {
  return {
    id,
    sku: `SKU-${id}`,
    title: id,
    price: money(100000, 'PYG'),
    availableQuantity,
    attributes,
  };
}

// Negro: M con stock, L agotada. Blanco: sólo M, con stock.
const variants: ProductVariant[] = [
  variant('v1', { color: 'Negro', size: 'M' }, 3),
  variant('v2', { color: 'Negro', size: 'L' }, 0),
  variant('v3', { color: 'Blanco', size: 'M' }, 5),
];

test('buildVariantOptions proyecta atributos en orden de aparición', () => {
  const options = buildVariantOptions(variants);
  assert.deepEqual(
    options.map((o) => o.name),
    ['color', 'size'],
  );
  assert.deepEqual(
    options[0]?.values.map((v) => v.value),
    ['Negro', 'Blanco'],
  );
});

test('la disponibilidad depende del resto de la selección', () => {
  const enNegro = buildVariantOptions(variants, { color: 'Negro' });
  const sizes = enNegro.find((o) => o.name === 'size')?.values;
  // En negro, L está agotada.
  assert.deepEqual(sizes, [
    { value: 'M', available: true },
    { value: 'L', available: false },
  ]);

  const enBlanco = buildVariantOptions(variants, { color: 'Blanco' });
  const sizesBlanco = enBlanco.find((o) => o.name === 'size')?.values;
  // En blanco no existe L: se ofrece pero como no disponible.
  assert.deepEqual(sizesBlanco, [
    { value: 'M', available: true },
    { value: 'L', available: false },
  ]);
});

test('findVariant sólo acepta coincidencia exacta', () => {
  assert.equal(findVariant(variants, { color: 'Negro', size: 'L' })?.id, 'v2');
  assert.equal(findVariant(variants, { color: 'Blanco', size: 'L' }), undefined);
  assert.equal(findVariant(variants, {}), undefined);
});

test('defaultSelection prefiere una variante con stock', () => {
  // v1 tiene stock y va primera.
  assert.deepEqual(defaultSelection(variants), { color: 'Negro', size: 'M' });

  // Si la primera está agotada, elige la siguiente con stock.
  const agotadaPrimero = [variants[1]!, variants[2]!];
  assert.deepEqual(defaultSelection(agotadaPrimero), { color: 'Blanco', size: 'M' });

  // Todo agotado: igual devuelve algo, para poder mostrar el producto.
  assert.deepEqual(defaultSelection([variants[1]!]), { color: 'Negro', size: 'L' });
  assert.deepEqual(defaultSelection([]), {});
});
