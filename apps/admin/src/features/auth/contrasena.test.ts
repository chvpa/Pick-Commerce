import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS_DE_CONTRASENA, contrasenaValida } from './contrasena.ts';

test('una contraseña nueva pide largo, un número y una mayúscula', () => {
  assert.equal(contrasenaValida('Tienda2026'), true);
  assert.equal(contrasenaValida('tienda2026'), false, 'sin mayúscula');
  assert.equal(contrasenaValida('TiendaNueva'), false, 'sin número');
  assert.equal(contrasenaValida('Ti3'), false, 'corta');
  // Una mayúscula con tilde también es una mayúscula.
  assert.equal(contrasenaValida('Ñandutí2026'), true);
});

test('cada regla se puede mostrar por separado', () => {
  const cumplidas = REGLAS_DE_CONTRASENA.filter((r) => r.cumple('abcdefgh1')).map(
    (r) => r.etiqueta,
  );
  assert.deepEqual(cumplidas, ['Al menos 8 caracteres', 'Un número']);
});
