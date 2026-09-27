import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoDeCambio } from './loyalty.ts';

/*
 * El tipo de cambio implícito (ADR-141).
 *
 * Es la única cuenta de este módulo, y existe para evitar un error concreto: publicar
 * un premio que sale más barato que la compra que lo genera, o sea un descuento
 * permanente disfrazado de recompensa.
 */

test('un premio más barato que una compra dice para cuántos canjes alcanza', () => {
  // 20 por compra, 10 el premio: cada compra paga dos canjes. Ahí es donde el
  // programa se convierte en un 12 % permanente sin que nadie lo note.
  assert.match(tipoDeCambio(20, 10), /alcanza para 2 canjes/);
  // Y en el borde exacto —el premio cuesta lo que da una compra— la frase que sirve
  // es la otra: «hace falta una compra» dice lo mismo sin sonar a regalo.
  assert.match(tipoDeCambio(20, 20), /hacen falta 1 compra para un canje/);
});

test('un premio más caro dice cuántas compras hacen falta', () => {
  assert.match(tipoDeCambio(20, 100), /hacen falta 5 compras/);
});

test('redondea hacia arriba: «una compra» por 1,2 compras sería mentir por poco', () => {
  // Y ese poco es justo el que hace que el premio salga gratis.
  assert.match(tipoDeCambio(20, 24), /hacen falta 2 compras/);
});

test('sin regla o sin costo no dice nada, en vez de dividir por cero', () => {
  assert.equal(tipoDeCambio(0, 10), '');
  assert.equal(tipoDeCambio(20, 0), '');
  assert.equal(tipoDeCambio(-5, 10), '');
});
