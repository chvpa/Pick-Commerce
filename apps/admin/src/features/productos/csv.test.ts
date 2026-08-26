import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filasDe, prepararImport, type Fila } from './csv.ts';

/**
 * El import de CSV es el camino por el que un comercio carga su catálogo entero
 * de una vez. Un error de mapeo acá no rompe nada visible: publica precios
 * equivocados. Por eso se verifica el mapeo, no sólo que "parsea".
 */

const CATEGORIAS = new Map([
  ['camperas', 'cat-1'],
  ['calzado', 'cat-2'],
]);

const OPCIONES = { categorias: CATEGORIAS, existentes: new Set(['ya-existe']), moneda: 'PYG' };

function fila(extra: Partial<Fila>): Partial<Fila> {
  return {
    handle: 'campera',
    titulo: 'Campera',
    descripcion: '',
    marca: 'Norte',
    categoria: 'camperas',
    estado: 'publicado',
    sku: 'CAM-1',
    variante: 'Azul / M',
    precio: '389000',
    precio_anterior: '',
    costo: '',
    stock: '4',
    atributos: 'color: Azul | size: M',
    codigo_barras: '',
    ...extra,
  };
}

test('agrupa las filas de un mismo handle en un producto con varias variantes', () => {
  const r = prepararImport(
    [fila({}), fila({ sku: 'CAM-2', variante: 'Negro / M', precio: '410000', stock: '2' })],
    OPCIONES,
  );

  assert.equal(r.errores.length, 0);
  assert.equal(r.productos.length, 1);
  const p = r.productos[0]!;
  assert.equal(p.title, 'Campera');
  assert.equal(p.status, 'active');
  assert.equal(p.categoryId, 'cat-1');
  assert.deepEqual(
    p.variants.map((v) => [v.sku, v.price, v.stock]),
    [
      ['CAM-1', 389000, 4],
      ['CAM-2', 410000, 2],
    ],
  );
  assert.deepEqual(p.variants[0]?.attributes, { color: 'Azul', size: 'M' });
});

test('el producto no trae la clave media: importar no toca las imágenes', () => {
  // Un CSV no puede llevar el ancho y el alto, que son obligatorios. Si el
  // payload trajera `media: []`, importar sobre un producto existente le
  // borraría las fotos.
  const r = prepararImport([fila({})], OPCIONES);
  assert.equal('media' in r.productos[0]!, false);
});

test('una fila inválida se rechaza sola y el resto entra', () => {
  const r = prepararImport(
    [fila({ handle: 'buena' }), fila({ handle: 'mala', precio: 'gratis' })],
    OPCIONES,
  );

  assert.deepEqual(
    r.productos.map((p) => p.handle),
    ['buena'],
  );
  assert.equal(r.errores.length, 1);
  assert.equal(r.errores[0]?.linea, 3);
  assert.match(r.errores[0]!.motivo, /precio/);
});

test('una categoría que no existe es un error de la fila, no un silencio', () => {
  const r = prepararImport([fila({ categoria: 'inexistente' })], OPCIONES);
  assert.equal(r.productos.length, 0);
  assert.match(r.errores[0]!.motivo, /no existe/);
});

test('un handle con mayúsculas o espacios se rechaza', () => {
  // Es la URL pública del producto: aceptarlo y corregirlo en silencio dejaría
  // al operador con una dirección distinta de la que escribió.
  const r = prepararImport([fila({ handle: 'Campera Linda' })], OPCIONES);
  assert.equal(r.productos.length, 0);
  assert.match(r.errores[0]!.motivo, /minúsculas/);
});

test('un SKU repetido dentro del mismo producto se marca', () => {
  const r = prepararImport([fila({}), fila({ variante: 'otra' })], OPCIONES);
  assert.equal(r.productos[0]?.variants.length, 1);
  assert.match(r.errores[0]!.motivo, /repetido/);
});

test('distingue lo que se crea de lo que se actualiza', () => {
  const r = prepararImport([fila({ handle: 'ya-existe' }), fila({ handle: 'nuevo' })], OPCIONES);
  assert.equal(r.existentes, 1);
  assert.equal(r.nuevos, 1);
});

test('las filas vacías del final no son errores', () => {
  const r = prepararImport([fila({}), {}, { handle: '', sku: '' }], OPCIONES);
  assert.equal(r.errores.length, 0);
  assert.equal(r.productos.length, 1);
});

test('el estado acepta la etiqueta en español y el valor interno', () => {
  assert.equal(prepararImport([fila({ estado: 'borrador' })], OPCIONES).productos[0]?.status, 'draft');
  assert.equal(prepararImport([fila({ estado: 'ACTIVE' })], OPCIONES).productos[0]?.status, 'active');
  assert.equal(prepararImport([fila({ estado: '' })], OPCIONES).productos[0]?.status, 'draft');
  assert.match(prepararImport([fila({ estado: 'vendido' })], OPCIONES).errores[0]!.motivo, /estado/);
});

test('exportar e importar dan el mismo producto', () => {
  // Es la garantía que hace usable el flujo: exportar, editar en una planilla y
  // volver a importar no puede cambiar nada que no se haya tocado.
  const original = prepararImport(
    [fila({}), fila({ sku: 'CAM-2', variante: 'Negro / M', precio: '410000', stock: '2' })],
    OPCIONES,
  ).productos;

  const porId = new Map([['cat-1', 'camperas']]);
  const ida = filasDe(original, porId);
  const vuelta = prepararImport(ida, OPCIONES).productos;

  assert.deepEqual(vuelta, original);
});
