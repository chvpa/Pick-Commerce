import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * El store del carrito.
 *
 * No tenía un solo test, y la revisión previa a Fase 5 encontró cuatro defectos
 * en él —todos reproducidos en el navegador—. Cada caso de acá es uno de ésos.
 *
 * Corre en Node, así que hay que fabricar `localStorage` y los eventos. Es un
 * doble mínimo a propósito: lo que se prueba es la lógica del store, no el
 * navegador.
 */

const STORAGE_KEY = 'pick:cart:v1';

class StorageFalso {
  datos = new Map<string, string>();
  getItem(k: string): string | null {
    return this.datos.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.datos.set(k, v);
  }
  removeItem(k: string): void {
    this.datos.delete(k);
  }
}

let storage: StorageFalso;
let store: typeof import('./store.ts');

const PYG = (amount: number) => ({ amount, currency: 'PYG' });
const LINEA = { variantId: 'v1', quantity: 1, title: 'Remera', price: PYG(150000) };

beforeEach(async () => {
  storage = new StorageFalso();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  // Módulo nuevo en cada caso: el store cachea en una variable de módulo.
  store = await import(`./store.ts?${Math.random()}`);
});

// --- Lo que se lee del storage -----------------------------------------------

test('una línea bien formada se lee', () => {
  storage.setItem(STORAGE_KEY, JSON.stringify([LINEA]));
  assert.equal(store.getLines().length, 1);
  assert.equal(store.totalQuantity(), 1);
});

test('las líneas mal formadas se descartan y el resto sobrevive', () => {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify([
      LINEA,
      { variantId: 'v2', quantity: '2', title: 'Con cantidad string', price: PYG(1) },
      { variantId: 'v3', quantity: 1, title: 'Sin precio' },
      { variantId: 'v4', quantity: 0, title: 'Cantidad cero', price: PYG(1) },
      'una cadena suelta',
      null,
    ]),
  );

  const lineas = store.getLines();
  assert.deepEqual(
    lineas.map((l) => l.variantId),
    ['v1'],
    'dejó pasar una línea mal formada',
  );
});

test('una cantidad string ya no concatena', () => {
  // Antes: `0 + "2"` daba `"02"`, y tras otro alta `"021"`.
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify([
      { ...LINEA, quantity: '2' },
      { ...LINEA, variantId: 'v2', quantity: 1 },
    ]),
  );
  assert.equal(store.totalQuantity(), 1);
  assert.equal(typeof store.totalQuantity(), 'number');
});

test('un storage corrupto o de otra forma no rompe nada', () => {
  for (const crudo of ['{no es json', 'null', '"texto"', '42', '{"a":1}']) {
    storage.setItem(STORAGE_KEY, crudo);
    const modulo = store;
    assert.deepEqual(modulo.getLines().filter(() => true).length >= 0, true);
  }
  storage.setItem(STORAGE_KEY, '{no es json');
  assert.deepEqual([...store.getLines()], []);
});

test('un carrito de la versión anterior no se lee', () => {
  // La clave vieja no tenía versión. Con la nueva, lo de antes queda ignorado en
  // vez de llegar a los consumidores con otra forma.
  storage.setItem('pick:cart', JSON.stringify([LINEA]));
  assert.deepEqual([...store.getLines()], []);
});

// --- Escrituras ---------------------------------------------------------------

test('agregar la misma variante suma cantidades y conserva el snapshot nuevo', () => {
  store.addLine({ ...LINEA, price: PYG(100), available: 5 });
  store.addLine({ ...LINEA, quantity: 2, price: PYG(150000), available: 3 });

  const lineas = store.getLines();
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0]!.quantity, 3);
  assert.deepEqual(lineas[0]!.price, PYG(150000), 'conservó el precio viejo');
  assert.equal(lineas[0]!.available, 3, 'conservó el stock viejo');
});

test('poner cantidad cero quita la línea', () => {
  store.addLine(LINEA);
  store.setQuantity('v1', 0);
  assert.deepEqual([...store.getLines()], []);
});

test('replaceLines descarta lo mal formado', () => {
  store.replaceLines([LINEA, { variantId: 'x' } as never]);
  assert.equal(store.getLines().length, 1);
});

// --- Entre pestañas -------------------------------------------------------------

test('una escritura no pisa lo que agregó otra pestaña', () => {
  // La otra pestaña ya tenía su línea cargada y escribió la suya.
  store.addLine(LINEA);

  // Simula lo que hizo la otra pestaña: escribió directo en el storage.
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify([LINEA, { ...LINEA, variantId: 'v2', title: 'Mochila' }]),
  );

  // Esta pestaña agrega algo más, con su caché desactualizado.
  store.addLine({ ...LINEA, variantId: 'v3', title: 'Gorra' });

  assert.deepEqual(
    store.getLines().map((l) => l.variantId),
    ['v1', 'v2', 'v3'],
    'la escritura pisó lo que había agregado otra pestaña',
  );
});

// --- La carrera del drawer ------------------------------------------------------

test('la apertura pedida sobrevive aunque nadie esté escuchando todavía', () => {
  // El evento `pick:add-to-cart` es fire-and-forget: si el drawer no montó, se
  // pierde. La solicitud no.
  store.pedirAperturaDelCarrito();
  assert.equal(store.tomarAperturaPendiente(), true, 'la solicitud no sobrevivió');
});

test('la apertura se consume una sola vez', () => {
  store.pedirAperturaDelCarrito();
  store.tomarAperturaPendiente();
  assert.equal(
    store.tomarAperturaPendiente(),
    false,
    'el drawer volvería a abrirse solo en el próximo montaje',
  );
});

test('sin solicitud, no hay apertura', () => {
  assert.equal(store.tomarAperturaPendiente(), false);
});
