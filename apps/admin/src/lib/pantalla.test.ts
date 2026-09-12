import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargar } from './pantalla.ts';

function entorno() {
  const guardado = new Map<string, string>();
  let recargas = 0;
  Object.assign(globalThis, {
    sessionStorage: {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => void guardado.set(k, v),
      removeItem: (k: string) => void guardado.delete(k),
    },
    location: { reload: () => void (recargas += 1) },
  });
  return { recargas: () => recargas };
}

const tick = () => new Promise((r) => setImmediate(r));
const Pantalla = () => null;

test('un chunk que no se puede traer recarga la página una vez', async () => {
  const e = entorno();
  let rechazado = false;
  cargar(
    () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
    'Pantalla',
  ).catch(() => (rechazado = true));
  await tick();
  assert.equal(e.recargas(), 1);
  assert.equal(rechazado, false, 'mientras recarga no llega al límite de errores');

  // La pestaña recargó y el chunk sigue sin venir: esta vez el error se ve.
  await assert.rejects(
    cargar(() => Promise.reject(new Error('otra vez')), 'Pantalla'),
    /otra vez/,
  );
  assert.equal(e.recargas(), 1);
});

test('cargar bien limpia la marca, así que un fallo posterior vuelve a recargar', async () => {
  const e = entorno();
  cargar(() => Promise.reject(new Error('x')), 'Pantalla').catch(() => undefined);
  await tick();
  assert.equal(e.recargas(), 1);

  const modulo = await cargar(() => Promise.resolve({ Pantalla }), 'Pantalla');
  assert.equal(modulo.default, Pantalla);

  cargar(() => Promise.reject(new Error('x')), 'Pantalla').catch(() => undefined);
  await tick();
  assert.equal(e.recargas(), 2);
});
