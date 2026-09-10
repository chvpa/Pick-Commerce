import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuracionDeCatalogo } from './catalog-config.ts';

test('sin configurar, los productos sin stock no se listan', () => {
  assert.deepEqual(configuracionDeCatalogo(undefined), { showOutOfStock: false });
  assert.deepEqual(configuracionDeCatalogo({}), { showOutOfStock: false });
  assert.deepEqual(configuracionDeCatalogo({ catalog: 'roto' }), { showOutOfStock: false });
});

test('sólo un `true` de verdad los muestra', () => {
  assert.equal(configuracionDeCatalogo({ catalog: { showOutOfStock: true } }).showOutOfStock, true);
  // Un texto que dice «true» no es un booleano: la base compara texto, el core
  // exige el tipo, y los dos caen del mismo lado cuando el dato es raro.
  assert.equal(
    configuracionDeCatalogo({ catalog: { showOutOfStock: 'true' } }).showOutOfStock,
    false,
  );
});
