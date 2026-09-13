import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Order } from '@pick/commerce-types';
import {
  esEventoConocido,
  plantillaDeCodigo,
  plantillaDeCorreo,
  type EventoDeNotificacion,
} from './notifications.ts';

/**
 * Las plantillas de correo.
 *
 * Lo que se prueba es lo que un cliente de correo no perdona: que el asunto
 * identifique el pedido, que el texto plano exista y diga lo mismo que el HTML,
 * y que las instrucciones de pago aparezcan **sólo** donde tienen sentido.
 */

const PEDIDO: Order = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 1042,
  status: 'received',
  paymentMethod: 'bank_transfer',
  paymentStatus: 'pending',
  customer: { name: 'Ana López', email: 'ana@cliente.test', phone: '0981123456' },
  address: { street: 'Avda. Siempre Viva 742', city: 'Asunción', reference: 'Casa verde' },
  subtotal: { amount: 450000, currency: 'PYG' },
  discount: { amount: 0, currency: 'PYG' },
  shipping: { amount: 0, currency: 'PYG' },
  total: { amount: 450000, currency: 'PYG' },
  items: [
    {
      variantId: 'v1',
      title: 'Campera cortaviento',
      variantTitle: 'Azul / M',
      sku: 'CAM-AZ-M',
      unitPrice: { amount: 150000, currency: 'PYG' },
      quantity: 3,
    },
  ],
  createdAt: '2026-08-29T12:00:00.000Z',
};

const CTX = {
  tiendaNombre: 'Pick Demo',
  order: PEDIDO,
  instrucciones: 'Cuenta 123-456 del Banco Demo',
};

test('el asunto identifica el pedido y la tienda', () => {
  for (const evento of [
    'order_received',
    'order_confirmed',
    'order_shipped',
    'order_delivered',
  ] as const) {
    const m = plantillaDeCorreo(evento, CTX);
    assert.match(m.asunto, /#1042/, `${evento} no nombra el pedido en el asunto`);
    assert.match(m.asunto, /Pick Demo/, `${evento} no nombra la tienda`);
  }
});

test('cada correo lleva el detalle y el total en las dos versiones', () => {
  const m = plantillaDeCorreo('order_shipped', CTX);

  for (const [donde, cuerpo] of [
    ['html', m.html],
    ['texto', m.texto],
  ] as const) {
    assert.match(cuerpo, /Campera cortaviento/, `el ${donde} no lista el producto`);
    assert.match(cuerpo, /Azul \/ M/, `el ${donde} no dice la variante`);
    assert.ok(cuerpo.includes('450.000'), `el ${donde} no muestra el total`);
    assert.match(cuerpo, /Siempre Viva 742/, `el ${donde} no dice a dónde va`);
  }
});

test('el texto plano no lleva etiquetas', () => {
  // Un correo transaccional sin versión de texto legible termina en spam.
  const m = plantillaDeCorreo('order_delivered', CTX);
  assert.ok(!m.texto.includes('<'), 'el texto plano tiene HTML adentro');
  assert.ok(m.texto.length > 60);
});

test('las instrucciones de pago sólo salen al recibir el pedido', () => {
  const recibido = plantillaDeCorreo('order_received', CTX);
  assert.match(recibido.texto, /Cuenta 123-456/, 'no explicó cómo pagar al recibir el pedido');

  for (const evento of ['order_confirmed', 'order_shipped', 'order_delivered'] as const) {
    const m = plantillaDeCorreo(evento, CTX);
    assert.ok(
      !m.texto.includes('Cuenta 123-456'),
      `${evento} explica cómo pagar algo que ya se pagó`,
    );
  }
});

test('con otro medio de pago no se explica la transferencia', () => {
  const conTarjeta = plantillaDeCorreo('order_received', {
    ...CTX,
    order: { ...PEDIDO, paymentMethod: 'simulated_card' },
  });
  assert.ok(
    !conTarjeta.texto.includes('Cuenta 123-456'),
    'le pidió una transferencia a quien pagó con tarjeta',
  );
});

test('un pedido ya pago no dice que falta pagarlo', () => {
  const pago = plantillaDeCorreo('order_received', {
    ...CTX,
    order: { ...PEDIDO, paymentStatus: 'paid', paymentMethod: 'simulated_card' },
  });
  assert.match(pago.texto, /Ya está pago/);
});

test('el HTML escapa lo que viene de afuera', () => {
  // El nombre del producto lo escribe el comercio, y la dirección el comprador.
  const m = plantillaDeCorreo('order_shipped', {
    ...CTX,
    order: {
      ...PEDIDO,
      address: { ...PEDIDO.address, street: '<script>alert(1)</script>' },
    },
  });
  assert.ok(!m.html.includes('<script>'), 'inyectó HTML del comprador en el correo');
  assert.match(m.html, /&lt;script&gt;/);
});

test('un evento sin plantilla se corta nombrándolo', () => {
  assert.throws(
    () => plantillaDeCorreo('order_preparing' as EventoDeNotificacion, CTX),
    /order_preparing/,
  );
});

test('esEventoConocido distingue los cuatro que se saben redactar', () => {
  assert.equal(esEventoConocido('order_received'), true);
  assert.equal(esEventoConocido('order_delivered'), true);
  assert.equal(esEventoConocido('order_preparing'), false);
  assert.equal(esEventoConocido('email_sent'), false);
});

test('el correo muestra el envío cuando se cobró, y no cuando no', () => {
  // Sin el renglón, el total del correo no cierra con la suma de las líneas y el
  // comprador escribe para preguntar por qué le cobraron de más.
  const conEnvio = plantillaDeCorreo('order_received', {
    ...CTX,
    order: { ...PEDIDO, shipping: { amount: 35000, currency: 'PYG' } },
  });

  assert.match(conEnvio.texto, /Envío: /);
  assert.match(conEnvio.html, /Envío/);

  const sinEnvio = plantillaDeCorreo('order_received', CTX);
  assert.ok(!sinEnvio.texto.includes('Envío:'), 'sin envío cobrado no va el renglón');
});

test('el correo del código dice de qué tienda es, cuánto vale y qué hacer si no lo pediste', () => {
  // Las tres cosas que un correo con un código tiene que hacer y son fáciles de
  // olvidar: quien lo recibe puede tener cuenta en varias tiendas, no sabe que
  // vence, y si no lo pidió necesita saber que ignorarlo alcanza.
  const m = plantillaDeCodigo({ tiendaNombre: 'Treeshop', codigo: '12345678', minutos: 15 });

  assert.match(m.asunto, /12345678/, 'el código no está en el asunto');
  assert.match(m.asunto, /Treeshop/);
  for (const cuerpo of [m.texto, m.html]) {
    assert.match(cuerpo, /12345678/);
    assert.match(cuerpo, /Treeshop/);
    assert.match(cuerpo, /15 minutos/);
    assert.match(cuerpo, /no pediste/i);
  }
});

test('el código va como texto, nunca como enlace', () => {
  // Un enlace en un correo se preclickea solo: los escáneres de las casillas
  // corporativas abren todo lo que llega, y consumirían el token antes de que
  // la persona lo toque.
  const m = plantillaDeCodigo({ tiendaNombre: 'Treeshop', codigo: '12345678', minutos: 15 });
  assert.ok(!m.html.includes('<a '), 'la plantilla del código tiene un enlace');
  assert.ok(!/https?:\/\//.test(m.texto), 'la versión de texto tiene una URL');
});
