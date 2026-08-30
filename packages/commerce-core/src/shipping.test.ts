import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anuncioDeEnvio,
  calcularEnvio,
  configuracionDeEnvio,
  esTiendaDemo,
  type ConfiguracionDeEnvio,
} from './shipping.ts';
import { money } from './money.ts';

/**
 * El envío es plata que se le cobra a alguien, así que lo que se prueba acá es
 * sobre todo **cuándo no cobrar**: una tienda sin configurar, un umbral mal
 * escrito y un importe negativo tienen que terminar todos en cero, y no en un
 * cargo que el comercio no puso.
 */

const PYG = 'PYG' as const;

// --- Leer la configuración --------------------------------------------------

test('sin configuración no se cobra envío', () => {
  // El silencio se resuelve hacia el lado que no cobra de más.
  for (const settings of [null, {}, { shipping: null }, { shipping: 'gratis' }]) {
    assert.deepEqual(configuracionDeEnvio(settings), { mode: 'none', amount: 0 });
  }
});

test('una tarifa plana se lee con su umbral', () => {
  assert.deepEqual(configuracionDeEnvio({ shipping: { mode: 'flat', amount: 35000, freeFrom: 500000 } }), {
    mode: 'flat',
    amount: 35000,
    freeFrom: 500000,
  });
});

test('un importe que no es un entero no negativo se descarta entero', () => {
  // Un importe negativo restaría del total: es la forma de que un pedido salga
  // más barato que sus productos.
  for (const amount of [-1, 1.5, '35000', null, undefined]) {
    assert.equal(configuracionDeEnvio({ shipping: { mode: 'flat', amount } }).mode, 'none');
  }
});

test('un umbral de cero no es «siempre gratis»', () => {
  // Eso se escribe con `none`. Aceptarlo acá dejaría dos formas de decir lo
  // mismo y una de ellas cobrando en algunos casos.
  const config = configuracionDeEnvio({ shipping: { mode: 'flat', amount: 35000, freeFrom: 0 } });
  assert.equal(config.freeFrom, undefined);
  assert.equal(config.amount, 35000);
});

// --- Calcular ---------------------------------------------------------------

const PLANA: ConfiguracionDeEnvio = { mode: 'flat', amount: 35000, freeFrom: 500000 };

test('se cobra la tarifa por debajo del umbral', () => {
  assert.deepEqual(calcularEnvio(PLANA, money(499999, PYG)), { amount: 35000, currency: PYG });
});

test('desde el umbral, exacto, es gratis', () => {
  // «Desde» incluye el borde. Es la lectura que espera quien compra justo por
  // el monto que dice el anuncio.
  assert.deepEqual(calcularEnvio(PLANA, money(500000, PYG)), { amount: 0, currency: PYG });
});

test('sin umbral se cobra siempre', () => {
  const sinUmbral: ConfiguracionDeEnvio = { mode: 'flat', amount: 35000 };
  assert.equal(calcularEnvio(sinUmbral, money(99999999, PYG)).amount, 35000);
});

test('una tienda sin envío no cobra nunca, y conserva la moneda', () => {
  const cero = calcularEnvio({ mode: 'none', amount: 0 }, money(10000, 'USD'));
  assert.deepEqual(cero, { amount: 0, currency: 'USD' });
});

test('el envío sale en la moneda del pedido, no en una fija', () => {
  assert.equal(calcularEnvio(PLANA, money(1000, 'USD')).currency, 'USD');
});

// --- El anuncio -------------------------------------------------------------

test('el anuncio sale del mismo número que se cobra', () => {
  // Antes era un texto fijo en el código que prometía envío gratis desde
  // 500.000 en toda tienda que se sirviera. Derivarlo es lo que impide que
  // prometa algo que la caja no vaya a cumplir.
  const texto = anuncioDeEnvio(PLANA, PYG, 'es-PY');
  assert.match(texto!, /500\.000/);
});

test('sin umbral no hay anuncio', () => {
  assert.equal(anuncioDeEnvio({ mode: 'flat', amount: 35000 }, PYG, 'es-PY'), null);
  assert.equal(anuncioDeEnvio({ mode: 'none', amount: 0 }, PYG, 'es-PY'), null);
});

// --- Modo demo --------------------------------------------------------------

test('el modo demo se activa sólo con el booleano', () => {
  assert.equal(esTiendaDemo({ demo: true }), true);
  // Nada de valores «parecidos a verdadero»: una tienda real que guarde
  // `demo: "no"` dejaría de mandar correos sin que nadie entienda por qué.
  for (const settings of [{ demo: 'true' }, { demo: 1 }, {}, null]) {
    assert.equal(esTiendaDemo(settings), false);
  }
});
