import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agregarPorVariante,
  agruparEnProductos,
  discrimina,
  stockVisible,
  type ERPItem,
} from './erp.ts';

/**
 * El puerto del ERP.
 *
 * Lo que se prueba es lo que puede perder plata: que dos filas de la misma
 * variante se sumen en vez de pisarse, que agrupar no mezcle modelos, y sobre
 * todo que **ningún código se dé por único cuando no lo es**. Los tres viven en
 * niveles distintos y confundirlos manda stock a la variante equivocada:
 *
 *   sku           código del modelo. Lo comparten todas las tallas.
 *   internalCode  código del ERP. Puede repetirse por modelo o no.
 *   barcode       código de la caja. Puede repetirse por modelo o no.
 */

function item(parcial: Partial<ERPItem> & Pick<ERPItem, 'erpSize'>): ERPItem {
  return {
    sku: 'MOD-01',
    internalCode: '11042',
    barcode: '7000000000001',
    title: 'CALZADO DE PRUEBA',
    size: parcial.erpSize,
    available: 1,
    price: { amount: 240000, currency: 'PYG' },
    ...parcial,
  };
}

test('suma las unidades de la misma variante en vez de pisarlas', () => {
  // El bug de junio de 2026: 1 + 2 quedaba en 1 porque la última fila ganaba.
  const { items: agregado } = agregarPorVariante([
    item({ erpSize: '42', available: 1 }),
    item({ erpSize: '42', available: 2 }),
  ]);

  assert.equal(agregado.length, 1, 'dejó dos filas para la misma variante');
  assert.equal(agregado[0]!.available, 3, 'no sumó: la última fila pisó a la primera');
});

test('un modelo con un solo código de barras conserva sus tallas', () => {
  /*
   * El caso que rompía la versión anterior, que agregaba por código de barras:
   * estas cuatro tallas se fundían en UNA variante con la suma del stock. El
   * catálogo ofrecía un solo talle y cuatro veces las unidades.
   */
  const { items: agregado } = agregarPorVariante(
    ['40', '41', '42', '43'].map((t) => item({ erpSize: t, barcode: 'UNO-PARA-TODAS' })),
  );

  assert.equal(agregado.length, 4, 'fundió tallas que comparten el código de barras');
  assert.deepEqual(
    agregado.map((i) => i.erpSize),
    ['40', '41', '42', '43'],
  );
});

test('un modelo con un solo código de ERP también conserva sus tallas', () => {
  const { items: agregado } = agregarPorVariante(
    ['S', 'M', 'L'].map((t) => item({ erpSize: t, internalCode: 'MISMO-ERP' })),
  );
  assert.equal(agregado.length, 3);
});

test('variantes de modelos distintos no se mezclan aunque compartan talla', () => {
  const { items: agregado } = agregarPorVariante([
    item({ sku: 'MOD-A', erpSize: '42', available: 4 }),
    item({ sku: 'MOD-B', erpSize: '42', available: 7 }),
  ]);

  assert.equal(agregado.length, 2);
  assert.deepEqual(
    agregado.map((i) => i.available).sort((a, b) => a - b),
    [4, 7],
  );
});

test('el negativo del ERP se conserva, y sólo se recorta al mostrarlo', () => {
  // Un negativo es un descuadre real. Recortarlo al guardar lo vuelve invisible.
  const { items: agregado } = agregarPorVariante([item({ erpSize: '42', available: -3 })]);
  assert.equal(agregado[0]!.available, -3, 'recortó el negativo al normalizar');
  assert.equal(stockVisible(agregado[0]!.available), 0);
  assert.equal(stockVisible(5), 5);
});

// ---------------------------------------------------------------------------
// Agrupar en productos
// ---------------------------------------------------------------------------

test('agrupa por el código de modelo, no por el del ERP', () => {
  /*
   * Con un ERP que codifica por variante, agrupar por su código daría un
   * producto por talla. El modelo es lo único estable a nivel producto.
   */
  const productos = agruparEnProductos([
    item({ sku: 'MOD-A', erpSize: '40', internalCode: 'erp-1' }),
    item({ sku: 'MOD-A', erpSize: '41', internalCode: 'erp-2' }),
    item({ sku: 'MOD-B', erpSize: 'M', internalCode: 'erp-3' }),
  ]);

  assert.equal(productos.length, 2, 'partió un modelo en varios productos');
  assert.equal(productos[0]!.sku, 'MOD-A');
  assert.equal(productos[0]!.items.length, 2);
  assert.equal(productos[1]!.sku, 'MOD-B');
});

test('el orden de aparición se preserva', () => {
  // Un import acotado se queda con los primeros N productos: si el orden
  // cambiara entre corridas, cada una importaría un catálogo distinto.
  const productos = agruparEnProductos([
    item({ sku: 'c', erpSize: '1' }),
    item({ sku: 'a', erpSize: '1' }),
    item({ sku: 'b', erpSize: '1' }),
    item({ sku: 'a', erpSize: '2' }),
  ]);

  assert.deepEqual(
    productos.map((p) => p.sku),
    ['c', 'a', 'b'],
  );
});

test('el producto hereda título, familia y marca de su primera variante', () => {
  const productos = agruparEnProductos([
    item({ erpSize: '40', family: 'CALZADOS', brand: 'MARCA UNO' }),
    item({ erpSize: '41', family: 'CALZADOS', brand: 'MARCA UNO' }),
  ]);

  assert.equal(productos[0]!.title, 'CALZADO DE PRUEBA');
  assert.equal(productos[0]!.family, 'CALZADOS');
  assert.equal(productos[0]!.brand, 'MARCA UNO');
});

// ---------------------------------------------------------------------------
// Qué código sirve para cruzar
// ---------------------------------------------------------------------------

test('un código distinto en cada talla sirve para cruzar', () => {
  const items = ['40', '41'].map((t, i) => item({ erpSize: t, barcode: `b${i}` }));
  assert.equal(discrimina(items, 'barcode'), true);
});

test('un código repetido en todo el modelo no sirve para cruzar', () => {
  const items = ['40', '41'].map((t) => item({ erpSize: t, barcode: 'IGUAL' }));
  assert.equal(discrimina(items, 'barcode'), false);
});

test('un código ausente en alguna variante tampoco sirve', () => {
  // Media tabla vacía es peor que ninguna: cruzaría bien unas y mal el resto.
  const items = [item({ erpSize: '40', barcode: 'b0' }), item({ erpSize: '41', barcode: '' })];
  assert.equal(discrimina(items, 'barcode'), false);
});

test('lo mismo vale para el código del ERP', () => {
  const propios = ['40', '41'].map((t, i) => item({ erpSize: t, internalCode: `e${i}` }));
  const compartido = ['40', '41'].map((t) => item({ erpSize: t, internalCode: 'IGUAL' }));
  assert.equal(discrimina(propios, 'internalCode'), true);
  assert.equal(discrimina(compartido, 'internalCode'), false);
});

// ---------------------------------------------------------------------------
// Repetido por lote contra repetido por error de carga
// ---------------------------------------------------------------------------

test('el mismo artículo en varias filas se suma: son lotes', () => {
  const { items, duplicados } = agregarPorVariante([
    item({ erpSize: '42', barcode: 'MISMO', available: 1 }),
    item({ erpSize: '42', barcode: 'MISMO', available: 2 }),
  ]);
  assert.equal(items[0]!.available, 3);
  assert.equal(duplicados.length, 0, 'tomó un lote por un duplicado');
});

test('la misma variante con dos códigos distintos NO se suma', () => {
  /*
   * En el catálogo real son 7, y las dos filas traen el mismo número de
   * unidades: son la misma mercadería cargada dos veces, no dos lotes. Sumarlas
   * publicaría el doble del stock que existe.
   */
  const { items, duplicados } = agregarPorVariante([
    item({ erpSize: '1', barcode: 'CCOB001', available: 27 }),
    item({ erpSize: '1', barcode: 'ccob001', available: 27 }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]!.available, 27, 'duplicó el stock sumando un artículo repetido');
  assert.equal(items[0]!.barcode, 'CCOB001', 'no ganó la primera fila');
  assert.equal(duplicados.length, 1, 'se tragó el duplicado sin reportarlo');
  assert.equal(duplicados[0]!.barcode, 'ccob001');
});

test('un duplicado no impide que otras variantes se agreguen bien', () => {
  const { items, duplicados } = agregarPorVariante([
    item({ erpSize: '40', barcode: 'a1', available: 5 }),
    item({ erpSize: '41', barcode: 'b1', available: 3 }),
    item({ erpSize: '41', barcode: 'b2', available: 3 }),
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.available),
    [5, 3],
  );
  assert.equal(duplicados.length, 1);
});
