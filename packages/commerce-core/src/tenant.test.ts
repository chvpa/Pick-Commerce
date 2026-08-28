import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarDominio, resolverTenant, type RepositorioTiendas } from './tenant.ts';

test('normaliza a la forma guardada en stores.domain', () => {
  assert.equal(normalizarDominio('Tienda.com'), 'tienda.com');
  assert.equal(normalizarDominio('tienda.com:4321'), 'tienda.com');
  assert.equal(normalizarDominio('www.tienda.com'), 'tienda.com');
  assert.equal(normalizarDominio('  WWW.Tienda.com:443  '), 'tienda.com');
});

test('no descarta subdominios que no sean www', () => {
  // `tienda.cliente.com` y `cliente.com` son tiendas distintas: colapsarlos
  // resolvería al tenant equivocado, que es peor que no resolver ninguno.
  assert.equal(normalizarDominio('tienda.cliente.com'), 'tienda.cliente.com');
  assert.equal(normalizarDominio('www2.tienda.com'), 'www2.tienda.com');
});

const repo: RepositorioTiendas = {
  async porDominio(dominio) {
    return dominio === 'tienda.com'
      ? { tenantId: 't1', storeId: 's1', currency: 'PYG', locale: 'es-PY', name: 'Tienda' }
      : null;
  },
  // `resolverTenant` no la usa; existe para cumplir el contrato del puerto.
  async mias() {
    return [];
  },
};

test('resuelve el tenant desde el host de la petición', async () => {
  assert.equal((await resolverTenant(repo, 'www.Tienda.com:443'))?.tenantId, 't1');
});

test('un dominio desconocido o vacío devuelve null, no un error', async () => {
  // Es un 404 del storefront, no una falla del servidor.
  assert.equal(await resolverTenant(repo, 'otra.com'), null);
  assert.equal(await resolverTenant(repo, ''), null);
  assert.equal(await resolverTenant(repo, '   '), null);
});
