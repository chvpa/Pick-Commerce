import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuracionDeCatalogo } from './catalog-config.ts';

test('sin configurar, los productos sin stock no se listan', () => {
  const d = { showOutOfStock: false, hideWithoutImage: false };
  assert.deepEqual(configuracionDeCatalogo(undefined), d);
  assert.deepEqual(configuracionDeCatalogo({}), d);
  assert.deepEqual(configuracionDeCatalogo({ catalog: 'roto' }), d);
});

test('los sin foto se muestran salvo que se pida ocultarlos', () => {
  assert.equal(configuracionDeCatalogo({ catalog: {} }).hideWithoutImage, false);
  assert.equal(
    configuracionDeCatalogo({ catalog: { hideWithoutImage: true } }).hideWithoutImage,
    true,
  );
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
