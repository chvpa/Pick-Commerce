import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertEditable, esEditable, origenDe } from './field-sources.ts';

test('la ausencia de una clave significa COMMERCE', () => {
  assert.equal(origenDe({}, 'price'), 'COMMERCE');
  assert.equal(origenDe(null, 'price'), 'COMMERCE');
  assert.equal(origenDe(undefined, 'price'), 'COMMERCE');
  assert.equal(origenDe({ stock: 'ERP' }, 'price'), 'COMMERCE');
});

test('un valor desconocido no concede autoridad al ERP', () => {
  // Si el dato viene corrupto, el default seguro es que el comercio pueda editar.
  assert.equal(origenDe({ price: 'cualquiera' }, 'price'), 'COMMERCE');
  assert.equal(origenDe({ price: 'ERP' }, 'price'), 'ERP');
});

test('assertEditable corta la edición de un campo del ERP', () => {
  assert.doesNotThrow(() => assertEditable({ stock: 'ERP' }, 'description'));
  assert.throws(() => assertEditable({ price: 'ERP' }, 'price'), /ERP/);
  assert.equal(esEditable({ price: 'ERP' }, 'price'), false);
});
