import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, intentar } from './harness.ts';

/** Los modelos (ADR-162): quién arma uno, en qué orden, y que no cruce tiendas. */

const TENANT = 'b3000000-0000-4000-8000-000000000000';
const TIENDA = 'b3100000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b3200000-0000-4000-8000-000000000000';
const SUCURSAL = 'b3300000-0000-4000-8000-000000000000';
const OTRO = 'b4000000-0000-4000-8000-000000000000';
const GRUPO = 'b3400000-0000-4000-8000-000000000000';
const NEGRA = 'b3500000-0000-4000-8000-000000000001';
const AZUL = 'b3500000-0000-4000-8000-000000000002';
const ROJA = 'b3500000-0000-4000-8000-000000000003';
const DE_OTRA = 'b3500000-0000-4000-8000-000000000004';
const DUENA = 'fd000000-0000-4000-8000-000000000001';
const VISOR = 'fd000000-0000-4000-8000-000000000002';
const FORASTERA = 'fd000000-0000-4000-8000-000000000003';

let db: PGlite;

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values ('${DUENA}', 'd@a.test'), ('${VISOR}', 'v@a.test'), ('${FORASTERA}', 'f@b.test');
    insert into organizations (id, name, slug) values ('${TENANT}', 'A', 'a'), ('${OTRO}', 'B', 'b');
    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'A', 'a', 'a.test', 'PYG'),
      ('${OTRA_TIENDA}', '${TENANT}', 'A2', 'a2', 'a2.test', 'PYG');
    insert into locations (id, tenant_id, store_id, name) values ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'C');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENA}', 'owner'), ('${TENANT}', '${VISOR}', 'viewer'), ('${OTRO}', '${FORASTERA}', 'owner');
    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${NEGRA}', '${TENANT}', '${TIENDA}', 'mochila-negra', 'Mochila negra', 'active'),
      ('${AZUL}', '${TENANT}', '${TIENDA}', 'mochila-azul', 'Mochila azul', 'active'),
      ('${ROJA}', '${TENANT}', '${TIENDA}', 'mochila-roja', 'Mochila roja', 'active'),
      ('${DE_OTRA}', '${TENANT}', '${OTRA_TIENDA}', 'mochila-otra', 'Mochila de otra tienda', 'active');
    insert into product_variants (tenant_id, product_id, sku, title, price, currency, position, attributes) values
      ('${TENANT}', '${NEGRA}', 'M-N', 'U', 1, 'PYG', 0, '{"color":"Negro"}'),
      ('${TENANT}', '${AZUL}', 'M-A', 'U', 1, 'PYG', 0, '{"color":"Azul"}'),
      ('${TENANT}', '${ROJA}', 'M-R', 'U', 1, 'PYG', 0, '{"color":"Rojo"}');
    insert into inventory_levels (tenant_id, variant_id, location_id, available)
      select '${TENANT}', id, '${SUCURSAL}', 5 from product_variants;
  `);
  await comoAdmin(
    db,
    DUENA,
    `insert into product_groups (id, tenant_id, store_id, name, axis, display)
     values ('${GRUPO}', '${TENANT}', '${TIENDA}', 'Mochila urbana', 'color', 'swatch')`,
  );
});

after(async () => {
  await db.close();
});

test('el modelo se arma de una vez, en el orden en que viene', async () => {
  await comoAdmin(
    db,
    DUENA,
    `select admin_set_group_products('${GRUPO}', array['${AZUL}', '${NEGRA}']::uuid[])`,
  );
  const items = await como<{ j: { id: string; value: string; stock: number }[] }>(
    db,
    DUENA,
    `select admin_group_products('${GRUPO}') as j`,
  );
  assert.deepEqual(
    items[0]!.j.map((p) => [p.id, p.value, p.stock]),
    [
      [AZUL, 'Azul', 5],
      [NEGRA, 'Negro', 5],
    ],
  );
});

test('lo que ya no viene se suelta, y el nuevo primero va al catálogo', async () => {
  await comoAdmin(
    db,
    DUENA,
    `select admin_set_group_products('${GRUPO}', array['${ROJA}', '${AZUL}']::uuid[])`,
  );
  const r = await db.query<{ id: string; product_group_id: string | null; group_position: number }>(
    `select id, product_group_id, group_position from products where id in ('${NEGRA}', '${AZUL}', '${ROJA}') order by group_position, title`,
  );
  const negra = r.rows.find((p) => p.id === NEGRA)!;
  assert.equal(negra.product_group_id, null);
  assert.equal(r.rows.find((p) => p.id === ROJA)!.group_position, 0);
  assert.equal(r.rows.find((p) => p.id === AZUL)!.group_position, 1);
});

test('un producto de otra tienda no entra, aunque sea de la misma organización', async () => {
  const intento = await intentar(
    db,
    DUENA,
    `select admin_set_group_products('${GRUPO}', array['${ROJA}', '${DE_OTRA}']::uuid[])`,
  );
  assert.equal(intento.ok, false);
  assert.match(intento.error ?? '', /no es de esta tienda/);
});

test('la lista trae cuántos son y una vista previa con su valor', async () => {
  const r = await como<{
    j: { total: number; items: { count: number; preview: { value?: string }[] }[] };
  }>(db, DUENA, `select admin_product_groups('${TIENDA}') as j`);
  assert.equal(r[0]!.j.total, 1);
  assert.equal(r[0]!.j.items[0]!.count, 2);
  assert.deepEqual(
    r[0]!.j.items[0]!.preview.map((p) => p.value),
    ['Rojo', 'Azul'],
  );
});

test('quien sólo mira no arma modelos, y alguien de afuera no los ve', async () => {
  const visor = await intentar(
    db,
    VISOR,
    `select admin_set_group_products('${GRUPO}', array['${NEGRA}']::uuid[])`,
  );
  // RLS no deja ver el grupo para escribir: o falla, o no cambia nada.
  const r = await db.query<{ n: number }>(
    `select count(*)::int as n from products where product_group_id = '${GRUPO}' and id = '${NEGRA}'`,
  );
  assert.ok(!visor.ok || r.rows[0]!.n === 0);

  const ajeno = await como<{ j: { total: number } }>(
    db,
    FORASTERA,
    `select admin_product_groups('${TIENDA}') as j`,
  );
  assert.equal(ajeno[0]!.j.total, 0);
});
