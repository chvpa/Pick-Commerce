import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnasDe, moverEn, tipoDe } from './content.ts';

test('mover cambia el orden sin tocar la lista original', () => {
  const original = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moverEn(original, 2, 0), ['c', 'a', 'b', 'd']);
  assert.deepEqual(moverEn(original, 0, 3), ['b', 'c', 'd', 'a']);
  assert.deepEqual(original, ['a', 'b', 'c', 'd'], 'se mutó la lista de entrada');
});

test('subir el primero o bajar el último no hace nada, y no lanza', () => {
  // Es lo que pasa cuando alguien insiste con la flecha: tiene que ser inofensivo.
  const lista = ['a', 'b', 'c'];
  assert.deepEqual(moverEn(lista, 0, -1), lista);
  assert.deepEqual(moverEn(lista, 2, 3), lista);
  assert.deepEqual(moverEn(lista, 1, 1), lista);
  assert.deepEqual(moverEn(lista, 9, 0), lista);
});

test('mover en una lista de uno la deja igual', () => {
  assert.deepEqual(moverEn(['solo'], 0, 0), ['solo']);
});

test('las columnas fuera de rango caen al defecto', () => {
  // El dato viene de un jsonb: un `columns: 97` dibujaría mosaicos de dos píxeles.
  assert.equal(columnasDe({ columns: 3 }), 3);
  assert.equal(columnasDe({ columns: 97 }), 2);
  assert.equal(columnasDe({ columns: 0 }), 2);
  assert.equal(columnasDe({ columns: 2.5 }), 2);
  assert.equal(columnasDe({}), 2);
  assert.equal(columnasDe({ columns: '3' }), 3);
});

test('una colección con reglas es dinámica', () => {
  assert.equal(tipoDe({ rules: { color: ['Negro'] } }), 'dinamica');
  assert.equal(tipoDe({}), 'manual');
  // Sin reglas, aunque el objeto exista vacío, sigue siendo manual: `{}` como
  // regla no acota nada y una colección que no acota nada es todo el catálogo.
  assert.equal(tipoDe({ rules: undefined }), 'manual');
});
