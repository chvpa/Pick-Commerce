import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ProblemaDeStock, addToCart, mensajeDeStock } from './add-to-cart.ts';
import { clear, getLines } from './store.ts';

/**
 * El alta al carrito.
 *
 * El caso que originó estos tests apareció en producción: un producto con stock
 * 1 se podía agregar dos veces —cerrando y volviendo a abrir el carrito— y el
 * checkout lo sacaba entero. La causa es de una línea: se preguntaba «¿entra 1?»
 * en vez de «¿entra lo que va a quedar?».
 *
 * Corre en Node, así que hay dobles mínimos de `localStorage` y de `fetch`.
 */

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

const PYG = (amount: number) => ({ amount, currency: 'PYG' });
const LINEA = { variantId: 'v1', quantity: 1, title: 'Vestido', price: PYG(250000) };

/** Lo que el servidor recibió en la última llamada. */
let pedido: { lines: { variantId: string; quantity: number }[]; intent?: string } | null = null;

function servidor(respuesta: unknown, ok = true) {
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    pedido = JSON.parse(init.body as string) as typeof pedido;
    return new Response(JSON.stringify(respuesta), { status: ok ? 200 : 500 });
  }) as typeof fetch;
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new StorageFalso();
  clear();
  pedido = null;
});

test('lo que se pregunta es la cantidad que va a quedar, no la que se agrega', async () => {
  servidor({ lines: [{ ...LINEA, available: 1, variantTitle: '' }], issues: [] });
  await addToCart({ ...LINEA, available: 1 });
  assert.deepEqual(pedido?.lines, [{ variantId: 'v1', quantity: 1 }]);

  // Segundo clic con uno ya guardado: la pregunta tiene que ser por dos.
  servidor({ lines: [], issues: [{ type: 'insufficient_stock', variantId: 'v1', available: 1 }] });
  await assert.rejects(() => addToCart({ ...LINEA, available: 1 }), ProblemaDeStock);
  assert.deepEqual(pedido?.lines, [{ variantId: 'v1', quantity: 2 }]);
});

test('el rechazo no toca el carrito: queda lo que ya había', async () => {
  servidor({ lines: [{ ...LINEA, available: 1, variantTitle: '' }], issues: [] });
  await addToCart({ ...LINEA, available: 1 });

  servidor({ lines: [], issues: [{ type: 'insufficient_stock', variantId: 'v1', available: 1 }] });
  await assert.rejects(() => addToCart({ ...LINEA, available: 1 }));

  assert.equal(getLines().length, 1);
  assert.equal(getLines()[0]!.quantity, 1, 'el carrito quedó por encima del stock');
});

test('un fallo del servidor no impide comprar: el checkout revalida', async () => {
  // La degradación de ADR-009: un 500 no dice nada del producto.
  servidor({}, false);
  await addToCart({ ...LINEA, available: 1 });
  assert.equal(getLines()[0]!.quantity, 1);
});

test('el mensaje cuenta lo que ya está en el carrito', () => {
  assert.equal(mensajeDeStock(0, 0), 'Se agotó mientras mirabas.');
  assert.equal(mensajeDeStock(1, 0), 'Queda uno solo.');
  assert.equal(mensajeDeStock(3, 0), 'Quedan 3 unidades.');
  // El caso que confundía: «Quedan 1 unidades» con uno ya guardado.
  assert.equal(mensajeDeStock(1, 1), 'Queda uno solo y ya lo tenés en el carrito.');
  assert.equal(mensajeDeStock(2, 2), 'Quedan 2 y ya los tenés en el carrito.');
  assert.equal(mensajeDeStock(5, 2), 'Quedan 5 en total y ya tenés 2: podés sumar 3.');
});
