import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProductVariant } from '@pick/commerce-types';
import {
  ATRIBUTO_VARIANTE,
  buildVariantOptions,
  defaultSelection,
  findVariant,
} from './variants.ts';
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

/*
 * Productos sin atributos.
 *
 * El Admin permite crear una variante con título y stock pero sin atributos, y
 * ese producto quedaba invendible: sin atributos no había opciones, `findVariant`
 * devolvía `undefined` y el PDP mostraba «Sin stock» sobre un producto con
 * stock. Ninguna variante del seed tiene atributos vacíos, así que el caso nunca
 * se ejercitó hasta que alguien cargó un producto a mano.
 */
const SIN_ATRIBUTOS: ProductVariant[] = [
  {
    id: 'sa1',
    sku: 'SA-L',
    title: 'L',
    price: { amount: 20000, currency: 'PYG' },
    attributes: {},
    availableQuantity: 3,
  },
  {
    id: 'sa2',
    sku: 'SA-XL',
    title: 'XL',
    price: { amount: 20000, currency: 'PYG' },
    attributes: {},
    availableQuantity: 4,
  },
];

test('sin atributos, la variante misma es la dimensión por la que se elige', () => {
  const opciones = buildVariantOptions(SIN_ATRIBUTOS);
  assert.equal(opciones.length, 1, 'no se ofreció ninguna opción');
  assert.equal(opciones[0]!.name, ATRIBUTO_VARIANTE);
  assert.deepEqual(
    opciones[0]!.values.map((v) => v.value),
    ['L', 'XL'],
  );
});

test('sin atributos, la selección por defecto resuelve a una variante real', () => {
  const seleccion = defaultSelection(SIN_ATRIBUTOS);
  const variante = findVariant(SIN_ATRIBUTOS, seleccion);
  assert.ok(variante, 'el producto quedó sin variante seleccionada, o sea invendible');
  assert.equal(variante.availableQuantity, 3);
});

test('sin atributos, se puede elegir la otra variante', () => {
  const variante = findVariant(SIN_ATRIBUTOS, { [ATRIBUTO_VARIANTE]: 'XL' });
  assert.equal(variante?.sku, 'SA-XL');
});

test('una sola variante sin atributos también es comprable', () => {
  const una = [SIN_ATRIBUTOS[0]!];
  const variante = findVariant(una, defaultSelection(una));
  assert.equal(variante?.sku, 'SA-L');
});

test('sin atributos, una variante agotada se marca agotada', () => {
  const agotada = [{ ...SIN_ATRIBUTOS[0]!, availableQuantity: 0 }, SIN_ATRIBUTOS[1]!];
  const opciones = buildVariantOptions(agotada);
  assert.deepEqual(
    opciones[0]!.values.map((v) => [v.value, v.available]),
    [
      ['L', false],
      ['XL', true],
    ],
  );
  // Y la selección por defecto va a la que sí tiene stock.
  assert.equal(defaultSelection(agotada)[ATRIBUTO_VARIANTE], 'XL');
});
