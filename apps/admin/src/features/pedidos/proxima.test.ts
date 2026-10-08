import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Order } from '@pick/commerce-types';
import { pasosDelPedido, proximaAccion } from './proxima.ts';

type Pedido = Parameters<typeof proximaAccion>[0];

const PAGADO: Pedido = {
  status: 'received',
  paymentStatus: 'paid',
  paymentMethod: 'bank_transfer',
  total: { amount: 478000, currency: 'PYG' },
};

const con = (cambios: Partial<Order>): Pedido => ({ ...PAGADO, ...cambios });

test('sin cobrar, lo próximo es cobrar, y dice cuánto mirar en el banco', () => {
  const a = proximaAccion(con({ paymentStatus: 'pending' }), 'es-PY');
  assert.equal(a.clave, 'cobrar');
  assert.equal(a.titulo, 'Esperando la transferencia');
  assert.match(a.detalle, /^Confirmalo cuando veas los Gs\.\s478\.000 en el banco\.$/);
  assert.equal(a.boton, 'Marcar como pagado');
  assert.equal(a.hacia, undefined);
});

test('con otro medio de pago no habla de transferencia', () => {
  const a = proximaAccion(con({ paymentStatus: 'pending', paymentMethod: 'simulated_card' }), 'es');
  assert.equal(a.titulo, 'Esperando el pago');
});

test('un pago rechazado se dice como tal, y se puede cobrar igual', () => {
  const a = proximaAccion(con({ paymentStatus: 'failed' }), 'es');
  assert.equal(a.clave, 'rechazado');
  assert.equal(a.boton, 'Marcar como pagado');
});

test('cobrado, avanza un paso por vez', () => {
  const pasos = (
    ['received', 'confirmed', 'preparing', 'ready', 'shipped', 'in_transit'] as const
  ).map((status) => {
    const a = proximaAccion(con({ status }), 'es');
    return [status, a.hacia, a.boton];
  });
  assert.deepEqual(pasos, [
    ['received', 'confirmed', 'Confirmar pedido'],
    ['confirmed', 'preparing', 'Empezar a preparar'],
    ['preparing', 'ready', 'Marcar como listo'],
    ['ready', 'shipped', 'Marcar como enviado'],
    ['shipped', 'delivered', 'Marcar como entregado'],
    ['in_transit', 'delivered', 'Marcar como entregado'],
  ]);
});

test('promete un correo sólo en los pasos que lo mandan', () => {
  assert.equal(
    proximaAccion(con({ status: 'received' }), 'es').detalle,
    'Este paso no le escribe al cliente.',
  );
  assert.equal(
    proximaAccion(con({ status: 'ready' }), 'es').detalle,
    'Al hacerlo, se le avisa al cliente por correo.',
  );
  // Un pedido de demostración no le escribe a nadie (ADR-108).
  assert.equal(
    proximaAccion(con({ status: 'ready', isDemo: true }), 'es').detalle,
    'Es un pedido de demostración: no se le escribe a nadie.',
  );
});

test('entregado y cancelado no ofrecen botón', () => {
  assert.equal(proximaAccion(con({ status: 'delivered' }), 'es').boton, undefined);
  const cancelado = proximaAccion(con({ status: 'cancelled', paymentStatus: 'pending' }), 'es');
  assert.equal(cancelado.clave, 'cancelado');
  assert.equal(cancelado.boton, undefined);
});

test('los pasos dicen dónde está el pedido', () => {
  assert.equal(pasosDelPedido('preparing').resumen, 'En preparación · paso 3 de 6');
  assert.deepEqual(
    pasosDelPedido('preparing').pasos.map((p) => [p.hecho, p.actual]),
    [
      [true, false],
      [true, false],
      [false, true],
      [false, false],
      [false, false],
      [false, false],
    ],
  );
  // En tránsito ocupa el paso de enviado, con su nombre.
  const enCamino = pasosDelPedido('in_transit');
  assert.equal(enCamino.resumen, 'En tránsito · paso 5 de 6');
  assert.equal(enCamino.pasos[4]!.etiqueta, 'En tránsito');

  assert.equal(pasosDelPedido('delivered').resumen, 'Completado');
  assert.ok(pasosDelPedido('delivered').pasos.every((p) => p.hecho && !p.actual));
  assert.equal(pasosDelPedido('cancelled').resumen, 'Cancelado');
  assert.ok(pasosDelPedido('cancelled').pasos.every((p) => !p.hecho && !p.actual));
});
