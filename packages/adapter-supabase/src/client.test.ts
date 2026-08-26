import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteDeServidor, clienteDeUsuario } from './client.ts';

const CONEXION = {
  url: 'https://proyecto.supabase.co',
  publishableKey: 'sb_publishable_x',
  secretKey: 'sb_secret_x',
};

test('el cliente de usuario se crea con la publishable key', () => {
  assert.doesNotThrow(() => clienteDeUsuario(CONEXION, 'jwt-del-usuario'));
});

test('el cliente de servidor se niega a crearse en el browser', () => {
  // Basta un import mal ubicado para que un bundler meta la secret key en el
  // bundle del cliente, y eso no lo detecta el typecheck ni el lint.
  const original = globalThis.window;
  try {
    (globalThis as { window?: unknown }).window = {};
    assert.throws(() => clienteDeServidor(CONEXION), /secret key/i);
  } finally {
    if (original === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = original;
  }
});

test('fuera del browser el cliente de servidor sí se crea', () => {
  assert.doesNotThrow(() => clienteDeServidor(CONEXION));
});
