import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarPorVariante, agruparEnProductos, stockVisible, type ERPItem } from './erp.ts';

/**
 * El puerto del ERP.
 *
 * Lo que se prueba acá es lo único que puede perder plata: que dos filas de la
 * misma variante se sumen en vez de pisarse, y que agrupar en productos no
 * mezcle variantes de códigos distintos.
 */

function item(parcial: Partial<ERPItem> & Pick<ERPItem, 'barcode'>): ERPItem {
  return {
    internalCode: '11042',
    title: 'CALZADO DE PRUEBA',
    size: '10.5',
    erpSize: '105',
    available: 1,
    price: { amount: 240000, currency: 'PYG' },
    ...parcial,
  };
}

test('suma las unidades de la misma variante en vez de pisarlas', () => {
  // El bug de junio de 2026: 1 + 2 quedaba en 1 porque la última fila ganaba.
  const agregado = agregarPorVariante([
    item({ barcode: '191448738768', available: 1 }),
    item({ barcode: '191448738768', available: 2 }),
  ]);

  assert.equal(agregado.length, 1, 'dejó dos filas para la misma variante');
  assert.equal(agregado[0]!.available, 3, 'no sumó: la última fila pisó a la primera');
});

test('variantes distintas no se mezclan al agregar', () => {
  const agregado = agregarPorVariante([
    item({ barcode: 'A', available: 4 }),
    item({ barcode: 'B', available: 7 }),
  ]);

  assert.equal(agregado.length, 2);
  assert.deepEqual(
    agregado.map((i) => i.available).sort((a, b) => a - b),
    [4, 7],
  );
});

test('al agregar, el resto de los campos es de la variante y no del lote', () => {
  const agregado = agregarPorVariante([
    item({ barcode: 'A', available: 1, size: '10.5', erpSize: '105' }),
    item({ barcode: 'A', available: 1, size: '10.5', erpSize: '105' }),
  ]);

  assert.equal(agregado[0]!.size, '10.5');
  assert.equal(agregado[0]!.erpSize, '105');
  assert.equal(agregado[0]!.price.amount, 240000);
});

test('el negativo del ERP se conserva, y sólo se recorta al mostrarlo', () => {
  // Un negativo es un descuadre real. Recortarlo al guardar lo vuelve invisible.
  const agregado = agregarPorVariante([item({ barcode: 'A', available: -3 })]);
  assert.equal(agregado[0]!.available, -3, 'recortó el negativo al normalizar');
  assert.equal(stockVisible(agregado[0]!.available), 0);
  assert.equal(stockVisible(5), 5);
});

test('agrupa por código interno sin mezclar productos', () => {
  const productos = agruparEnProductos([
    item({ barcode: 'A', internalCode: '11042', title: 'CALZADO DE PRUEBA' }),
    item({ barcode: 'B', internalCode: '11042', title: 'CALZADO DE PRUEBA' }),
    item({ barcode: 'C', internalCode: '100', title: 'PELOTA DE PRUEBA' }),
  ]);

  assert.equal(productos.length, 2);
  assert.equal(productos[0]!.internalCode, '11042');
  assert.equal(productos[0]!.items.length, 2);
  assert.equal(productos[1]!.internalCode, '100');
  assert.equal(productos[1]!.items.length, 1);
});

test('el orden de aparición se preserva', () => {
  // Un import acotado se queda con los primeros N productos: si el orden
  // cambiara entre corridas, cada una importaría un catálogo distinto.
  const productos = agruparEnProductos([
    item({ barcode: 'A', internalCode: 'c' }),
    item({ barcode: 'B', internalCode: 'a' }),
    item({ barcode: 'C', internalCode: 'b' }),
    item({ barcode: 'D', internalCode: 'a' }),
  ]);

  assert.deepEqual(
    productos.map((p) => p.internalCode),
    ['c', 'a', 'b'],
  );
});

test('el producto hereda título, familia y marca de su primera variante', () => {
  const productos = agruparEnProductos([
    item({ barcode: 'A', family: 'CALZADOS', brand: 'MARCA UNO' }),
    item({ barcode: 'B', family: 'CALZADOS', brand: 'MARCA UNO' }),
  ]);

  assert.equal(productos[0]!.title, 'CALZADO DE PRUEBA');
  assert.equal(productos[0]!.family, 'CALZADOS');
  assert.equal(productos[0]!.brand, 'MARCA UNO');
});
