import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTE_UNICA, variantesDelAlta } from './alta.ts';

test('sin talles queda una sola variante, con el SKU tal cual', () => {
  assert.deepEqual(variantesDelAlta({ sku: 'VD-449', talles: [], precio: 250000, stock: 1 }), [
    { sku: 'VD-449', title: VARIANTE_UNICA, precio: 250000, stock: 1, atributos: {} },
  ]);
});

test('un talle por variante, con el SKU derivado y el talle como atributo', () => {
  const variantes = variantesDelAlta({
    sku: 'VD-449',
    talles: ['S', 'M', 'L'],
    precio: 250000,
    costo: 120000,
    stock: 1,
  });

  assert.deepEqual(
    variantes.map((v) => [v.sku, v.title, v.atributos.Talle]),
    [
      ['VD-449-S', 'S', 'S'],
      ['VD-449-M', 'M', 'M'],
      ['VD-449-L', 'L', 'L'],
    ],
  );
  assert.ok(variantes.every((v) => v.precio === 250000 && v.costo === 120000 && v.stock === 1));
});

test('un talle repetido no crea dos variantes con el mismo SKU', () => {
  // El catálogo tiene índice único por SKU: guardar esto fallaría entero, y lo
  // que el operador vería es que «no se pudo guardar».
  const variantes = variantesDelAlta({ sku: 'VD', talles: ['M', 'M', ' M '], precio: 1 });
  assert.equal(variantes.length, 1);
});

test('el código de barras leído va sólo si hay una única variante', () => {
  const una = variantesDelAlta({
    sku: 'VD',
    talles: ['M'],
    precio: 1,
    barcode: '9780306406157',
  });
  assert.equal(una[0]!.barcode, '9780306406157');

  // Con tres talles, el código leído es el del talle que se fotografió: copiarlo
  // a los otros dos sería inventarlo.
  const varias = variantesDelAlta({
    sku: 'VD',
    talles: ['S', 'M', 'L'],
    precio: 1,
    barcode: '9780306406157',
  });
  assert.ok(varias.every((v) => v.barcode === undefined));
});

test('el costo y el stock se omiten cuando no se cargaron', () => {
  const [variante] = variantesDelAlta({ sku: 'VD', talles: [], precio: 1 });
  assert.ok(!('costo' in variante!));
  assert.ok(!('stock' in variante!));
});
