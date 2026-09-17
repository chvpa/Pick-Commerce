import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PESOS_DE_AFINIDAD, puntajeDeAfinidad } from './recommendations.ts';

test('una co-compra pesa más que una co-vista', () => {
  // Es la única propiedad que hay que defender: si se invirtiera, una tira
  // ordenaría por curiosidad y no por lo que la gente terminó comprando.
  assert.ok(PESOS_DE_AFINIDAD.coCompra > PESOS_DE_AFINIDAD.coVista);
  assert.ok(puntajeDeAfinidad(0, 1) > puntajeDeAfinidad(1, 0));
});

test('el puntaje es la suma de los dos conteos con su peso', () => {
  assert.equal(puntajeDeAfinidad(0, 0), 0);
  assert.equal(puntajeDeAfinidad(3, 0), 3);
  assert.equal(puntajeDeAfinidad(0, 2), 10);
  assert.equal(puntajeDeAfinidad(3, 2), 13);
});

test('cuatro co-vistas no alcanzan una co-compra, y seis sí', () => {
  // El umbral se escribe en un test porque es la pregunta que va a hacer un
  // comercio: cuántas miradas valen una venta.
  assert.ok(puntajeDeAfinidad(4, 0) < puntajeDeAfinidad(0, 1));
  assert.ok(puntajeDeAfinidad(6, 0) > puntajeDeAfinidad(0, 1));
});
