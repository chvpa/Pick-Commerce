import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderStatus } from '@pick/commerce-types';
import {
  ESTADOS_DE_PEDIDO,
  ETIQUETA_ESTADO_PEDIDO,
  describirEvento,
  esTerminal,
  nuevosPorMes,
  resumenDeRecurrencia,
  puedeTransicionar,
} from './orders.ts';

test('todos los estados tienen etiqueta, y no sobra ninguna', () => {
  for (const estado of ESTADOS_DE_PEDIDO) {
    assert.ok(ETIQUETA_ESTADO_PEDIDO[estado], `falta la etiqueta de ${estado}`);
  }
  assert.equal(
    Object.keys(ETIQUETA_ESTADO_PEDIDO).length,
    ESTADOS_DE_PEDIDO.length,
    'hay etiquetas de estados que no existen',
  );
});

test('de cancelado no se sale', () => {
  for (const estado of ESTADOS_DE_PEDIDO) {
    if (estado === 'cancelled') continue;
    assert.equal(puedeTransicionar('cancelled', estado), false, `salió de cancelado a ${estado}`);
  }
  assert.ok(esTerminal('cancelled'));
});

test('el resto se mueve libre, incluso hacia atrás', () => {
  assert.ok(puedeTransicionar('received', 'delivered'));
  assert.ok(
    puedeTransicionar('shipped', 'preparing'),
    'no se puede corregir un estado marcado por error',
  );
  assert.ok(puedeTransicionar('delivered', 'cancelled'));
});

test('quedarse en el mismo estado no es una transición', () => {
  for (const estado of ESTADOS_DE_PEDIDO) {
    assert.equal(puedeTransicionar(estado, estado), false);
  }
});

const evento = (type: string, data: Record<string, unknown>) => ({
  id: 'e1',
  type,
  data,
  createdAt: '2026-08-27T00:00:00Z',
});

test('la timeline se lee en español', () => {
  assert.equal(describirEvento(evento('created', {})), 'Pedido recibido');
  assert.equal(
    describirEvento(evento('status_changed', { from: 'received', to: 'preparing' })),
    'Recibido → En preparación',
  );
  assert.equal(
    describirEvento(
      evento('status_changed', { from: 'received', to: 'preparing', note: 'Con seña' }),
    ),
    'Recibido → En preparación — Con seña',
  );
});

test('un evento con datos inesperados no rompe la pantalla', () => {
  // `data` viene de la base como jsonb: puede traer cualquier cosa.
  assert.equal(describirEvento(evento('otra_cosa', {})), 'otra_cosa');
  assert.equal(describirEvento(evento('status_changed', {})), 'status_changed');
  assert.equal(
    describirEvento(evento('status_changed', { to: 'inventado' as OrderStatus })),
    'inventado',
    'no sobrevivió a un estado que no conoce',
  );
});

// --- La timeline con gateway y correos -----------------------------------------

test('un pago con referencia se distingue de uno marcado a mano', () => {
  // El día que un pago no cuadre, lo primero que se pregunta es si lo informó el
  // proveedor o lo marcó alguien.
  const delGateway = describirEvento({
    id: '1',
    type: 'payment_changed',
    data: { from: 'pending', to: 'paid', reference: 'sim_abc' },
    createdAt: '',
  });
  assert.match(delGateway, /acreditado/i);
  assert.match(delGateway, /sim_abc/);

  const aMano = describirEvento({
    id: '2',
    type: 'payment_changed',
    data: { from: 'pending', to: 'paid' },
    createdAt: '',
  });
  assert.match(aMano, /Marcado como pagado/);
  assert.ok(!aMano.includes('('), 'inventó una referencia que no existía');
});

test('un pago rechazado se lee como rechazado', () => {
  const texto = describirEvento({
    id: '1',
    type: 'payment_changed',
    data: { from: 'pending', to: 'failed', reference: 'sim_no' },
    createdAt: '',
  });
  assert.match(texto, /rechazado/i);
});

test('un correo enviado dice cuál y a quién', () => {
  const texto = describirEvento({
    id: '1',
    type: 'email_sent',
    data: { event: 'order_confirmed', to: 'ana@cliente.test' },
    createdAt: '',
  });
  assert.match(texto, /Correo enviado/);
  assert.match(texto, /pago confirmado/);
  assert.match(texto, /ana@cliente.test/);
});

test('un evento de correo desconocido se muestra sin romper', () => {
  const texto = describirEvento({
    id: '1',
    type: 'email_sent',
    data: { event: 'welcome' },
    createdAt: '',
  });
  assert.match(texto, /welcome/);
});

test('el enlace del pedido lleva número y token, sin barra doble', async () => {
  const { enlaceDelPedido } = await import('./orders.ts');
  const token = 'a'.repeat(64);
  assert.equal(
    enlaceDelPedido('https://sontres.shop/', { number: 41, accessToken: token }),
    `https://sontres.shop/pedido/41?t=${token}`,
  );
});

test('sin token no hay enlace, en vez de uno que lleve a una página vacía', async () => {
  const { enlaceDelPedido } = await import('./orders.ts');
  assert.equal(enlaceDelPedido('https://sontres.shop', { number: 41 }), null);
});

test('una nota se lee tal cual la escribieron', () => {
  assert.equal(
    describirEvento(evento('note', { note: 'Llamó, retira el sábado' })),
    'Llamó, retira el sábado',
  );
});

const segmento = (segment: string, customers: number, amount: number) => ({
  segment: segment as never,
  customers,
  revenue: { amount, currency: 'PYG' },
});

test('la recurrencia separa a los que volvieron de los que compraron una vez', () => {
  const r = resumenDeRecurrencia([
    segmento('champions', 1, 4_000_000),
    segmento('loyal', 1, 2_000_000),
    segmento('promising', 2, 2_000_000),
    segmento('new', 3, 900_000),
    segmento('cooling', 0, 0),
    segmento('at_risk', 1, 1_000_000),
    segmento('dormant', 2, 600_000),
  ]);
  assert.equal(r.clientes, 10);
  assert.equal(r.volvieron, 5);
  assert.equal(r.tasa, 0.5);
  assert.equal(r.gastoDeLosQueVolvieron, 1_800_000);
  assert.equal(r.gastoDeUnaVez, 300_000);
  assert.equal(r.gastoPromedio, 1_050_000);
});

test('sin clientes, la recurrencia es cero y no NaN', () => {
  const r = resumenDeRecurrencia([]);
  assert.equal(r.tasa, 0);
  assert.equal(r.gastoPromedio, 0);
});

test('los nuevos por mes rellenan con cero y cruzan el año', () => {
  const cohortes = [
    { month: '2026-10', customers: 4, active: [4] },
    { month: '2026-07', customers: 2, active: [2] },
    { month: '2025-12', customers: 9, active: [9] },
  ];
  assert.deepEqual(
    nuevosPorMes(cohortes, '2026-10', 6).map((m) => [m.mes, m.nuevos]),
    [
      ['2026-05', 0],
      ['2026-06', 0],
      ['2026-07', 2],
      ['2026-08', 0],
      ['2026-09', 0],
      ['2026-10', 4],
    ],
  );
  assert.deepEqual(
    nuevosPorMes(cohortes, '2026-02', 3).map((m) => m.mes),
    ['2025-12', '2026-01', '2026-02'],
  );
});
