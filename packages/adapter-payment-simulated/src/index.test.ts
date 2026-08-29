import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  METODO_SIMULADO,
  firmarResultado,
  firmarToken,
  proveedorSimulado,
  verificarToken,
  type DatosDelPago,
} from './index.ts';

/**
 * La firma del gateway simulado.
 *
 * Es lo único de este paquete que vale la pena probar: si la verificación
 * aceptara un token adulterado, cualquiera podría marcar sus pedidos como
 * pagados con un POST. El resto —armar una URL, devolver `null`— se lee.
 */

const SECRETO = 'secreto-de-prueba-largo-y-aburrido';

const DATOS: DatosDelPago = {
  orderId: '11111111-1111-4111-8111-111111111111',
  storeId: '22222222-2222-4222-8222-222222222222',
  orderNumber: 1042,
  amount: 450000,
  currency: 'PYG',
  returnUrl: 'https://tienda.test/checkout/confirmacion?pago=aprobado',
  failureUrl: 'https://tienda.test/checkout/confirmacion?pago=rechazado',
  webhookUrl: 'https://tienda.test/api/webhooks/pago',
  reference: 'sim_abc',
};

test('un token firmado se vuelve a leer entero', async () => {
  const token = await firmarToken(DATOS, SECRETO);
  assert.deepEqual(await verificarToken(token, SECRETO), DATOS);
});

test('cambiar un solo carácter del payload lo invalida', async () => {
  // Es el ataque obvio: subir el monto, o cambiar el pedido por otro.
  const token = await firmarToken(DATOS, SECRETO);
  const [payload, firma] = token.split('.');
  const alterado = `${payload!.slice(0, -1)}${payload!.at(-1) === 'A' ? 'B' : 'A'}.${firma}`;

  assert.equal(await verificarToken(alterado, SECRETO), null);
});

test('la firma de otro secreto no sirve', async () => {
  const token = await firmarToken(DATOS, 'otro-secreto-distinto');
  assert.equal(await verificarToken(token, SECRETO), null);
});

test('un token con forma rara no rompe: devuelve null', async () => {
  for (const basura of ['', '.', 'sinpunto', 'a.b', '%%%.%%%', 'e30.zzz']) {
    assert.equal(await verificarToken(basura, SECRETO), null, `«${basura}» no fue rechazado`);
  }
});

// --- El proveedor ---------------------------------------------------------------

test('crear un pago devuelve una URL del propio storefront y una referencia', async () => {
  const p = proveedorSimulado({ secret: SECRETO });
  const r = await p.createPayment({
    storeId: DATOS.storeId,
    orderId: DATOS.orderId,
    orderNumber: DATOS.orderNumber,
    amount: { amount: DATOS.amount, currency: 'PYG' },
    returnUrl: DATOS.returnUrl,
    failureUrl: DATOS.failureUrl,
    webhookUrl: DATOS.webhookUrl,
  });

  const url = new URL(r.url);
  assert.equal(url.origin, 'https://tienda.test');
  assert.equal(url.pathname, '/pago/simulado');
  assert.ok(url.searchParams.get('token'), 'la URL de pago no lleva token');
  assert.match(r.reference, /^sim_/);

  // El token de la URL tiene que abrirse con el mismo secreto y traer el pedido.
  const datos = await verificarToken(url.searchParams.get('token')!, SECRETO);
  assert.equal(datos?.orderId, DATOS.orderId);
  assert.equal(datos?.amount, 450000);
  assert.equal(datos?.status, undefined, 'el token de ida ya venía con un resultado');
});

test('el webhook acepta el resultado firmado, como JSON y como formulario', async () => {
  const p = proveedorSimulado({ secret: SECRETO });
  const token = await firmarResultado(DATOS, 'paid', SECRETO);

  for (const body of [JSON.stringify({ token }), new URLSearchParams({ token }).toString()]) {
    const r = await p.verifyWebhook({ body, headers: {} });
    assert.ok(r.ok, 'rechazó un aviso legítimo');
    assert.equal(r.orderId, DATOS.orderId);
    assert.equal(r.storeId, DATOS.storeId);
    assert.equal(r.status, 'paid');
    assert.equal(r.reference, 'sim_abc');
  }
});

test('el webhook distingue un rechazo de una aprobación', async () => {
  const p = proveedorSimulado({ secret: SECRETO });
  const r = await p.verifyWebhook({
    body: JSON.stringify({ token: await firmarResultado(DATOS, 'failed', SECRETO) }),
    headers: {},
  });
  assert.ok(r.ok);
  assert.equal(r.status, 'failed');
});

test('el webhook rechaza lo que no puede verificar', async () => {
  const p = proveedorSimulado({ secret: SECRETO });

  for (const [caso, body] of [
    ['cuerpo vacío', ''],
    ['sin token', JSON.stringify({ otra: 'cosa' })],
    ['JSON roto', '{no es json'],
    ['token inventado', JSON.stringify({ token: 'aaa.bbb' })],
    [
      'firmado con otro secreto',
      JSON.stringify({ token: await firmarResultado(DATOS, 'paid', 'otro') }),
    ],
  ] as const) {
    const r = await p.verifyWebhook({ body, headers: {} });
    assert.equal(r.ok, false, `aceptó un aviso con ${caso}`);
  }
});

test('un token de ida no sirve como aviso: no dice cómo terminó', async () => {
  // El token que recibe la página de pago no lleva resultado. Si el webhook lo
  // aceptara, abrir la página de pago equivaldría a cobrar.
  const p = proveedorSimulado({ secret: SECRETO });
  const r = await p.verifyWebhook({
    body: JSON.stringify({ token: await firmarToken(DATOS, SECRETO) }),
    headers: {},
  });
  assert.equal(r.ok, false);
});

test('el estado a demanda es null, no una suposición', async () => {
  const p = proveedorSimulado({ secret: SECRETO });
  assert.equal(await p.getPaymentStatus('sim_abc'), null);
});

test('sin secreto el proveedor se declara caído', async () => {
  assert.equal(await proveedorSimulado({ secret: '' }).healthCheck(), false);
  assert.equal(await proveedorSimulado({ secret: SECRETO }).healthCheck(), true);
});

test('el id coincide con el método que se habilita en la tienda', () => {
  assert.equal(proveedorSimulado({ secret: SECRETO }).id, METODO_SIMULADO);
  assert.equal(METODO_SIMULADO, 'simulated_card');
});
