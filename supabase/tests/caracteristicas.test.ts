import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, intentar } from './harness.ts';

/**
 * Las características (ADR-161): quién las escribe, qué admite la tabla y
 * cuántos productos usan cada una.
 */

const TENANT = 'b1000000-0000-4000-8000-000000000000';
const TIENDA = 'b1100000-0000-4000-8000-000000000000';
const OTRO = 'b2000000-0000-4000-8000-000000000000';
const DUENA = 'fc000000-0000-4000-8000-000000000001';
const PERSONAL = 'fc000000-0000-4000-8000-000000000002';
const VISOR = 'fc000000-0000-4000-8000-000000000003';
const FORASTERA = 'fc000000-0000-4000-8000-000000000004';

let db: PGlite;

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENA}', 'd@a.test'), ('${PERSONAL}', 'p@a.test'), ('${VISOR}', 'v@a.test'), ('${FORASTERA}', 'f@b.test');
    insert into organizations (id, name, slug) values ('${TENANT}', 'A', 'a'), ('${OTRO}', 'B', 'b');
    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'A', 'a', 'a.test', 'PYG');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENA}', 'owner'), ('${TENANT}', '${PERSONAL}', 'staff'),
      ('${TENANT}', '${VISOR}', 'viewer'), ('${OTRO}', '${FORASTERA}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('b1300000-0000-4000-8000-000000000001', '${TENANT}', '${TIENDA}', 'a', 'A', 'active'),
      ('b1300000-0000-4000-8000-000000000002', '${TENANT}', '${TIENDA}', 'b', 'B', 'active');
    insert into product_variants (tenant_id, product_id, sku, title, price, currency, position, attributes) values
      ('${TENANT}', 'b1300000-0000-4000-8000-000000000001', 'A-M', 'M', 1, 'PYG', 0, '{"talle":"M","color":"Azul"}'),
      ('${TENANT}', 'b1300000-0000-4000-8000-000000000001', 'A-L', 'L', 1, 'PYG', 1, '{"talle":"L","color":"Azul"}'),
      ('${TENANT}', 'b1300000-0000-4000-8000-000000000002', 'B-U', 'U', 1, 'PYG', 0, '{"color":"Rojo"}');
  `);
});

after(async () => {
  await db.close();
});

const insertar = (nombre: string, extra = '') =>
  `insert into attribute_definitions (tenant_id, store_id, name, label${extra ? ', ' + extra.split('=')[0] : ''})
   values ('${TENANT}', '${TIENDA}', '${nombre}', '${nombre}'${extra ? ', ' + extra.split('=')[1] : ''})`;

test('el personal del catálogo crea una característica con su tipo y sus opciones', async () => {
  await comoAdmin(
    db,
    PERSONAL,
    `insert into attribute_definitions (tenant_id, store_id, name, label, kind, options, for_variants, required)
     values ('${TENANT}', '${TIENDA}', 'material', 'Material', 'options', '["Algodón","Lino"]', false, true)`,
  );
  const r = await db.query<{ kind: string; options: string[]; required: boolean }>(
    `select kind, options, required from attribute_definitions where name = 'material'`,
  );
  assert.deepEqual(r.rows[0], { kind: 'options', options: ['Algodón', 'Lino'], required: true });
});

test('un tipo que no existe o unas opciones que no son lista se rechazan', async () => {
  for (const sql of [
    `insert into attribute_definitions (tenant_id, store_id, name, label, kind) values ('${TENANT}', '${TIENDA}', 'x', 'X', 'numero')`,
    `insert into attribute_definitions (tenant_id, store_id, name, label, options) values ('${TENANT}', '${TIENDA}', 'y', 'Y', '{"a":1}')`,
  ]) {
    const intento = await intentar(db, DUENA, sql);
    assert.equal(intento.ok, false, sql);
  }
});

test('quien sólo mira, o es de otro comercio, no escribe', async () => {
  for (const quien of [VISOR, FORASTERA]) {
    const intento = await intentar(db, quien, insertar('prohibida'));
    assert.ok(!intento.ok || intento.filas === 0, `pudo escribir ${quien}`);
  }
});

test('el uso cuenta productos, no variantes, y sólo de la tienda', async () => {
  const uso = await como<{ j: Record<string, number> }>(
    db,
    PERSONAL,
    `select admin_attribute_usage('${TIENDA}') as j`,
  );
  assert.deepEqual(uso[0]!.j, { color: 2, talle: 1 });

  const ajeno = await como<{ j: Record<string, number> }>(
    db,
    FORASTERA,
    `select admin_attribute_usage('${TIENDA}') as j`,
  );
  assert.deepEqual(ajeno[0]!.j, {});
});

test('un producto no se publica sin sus características obligatorias, y sí como borrador', async () => {
  // «material» es obligatoria desde el primer test.
  const producto = (status: string, material?: string) =>
    JSON.stringify({
      handle: `con-material-${status}-${material ?? 'nada'}`,
      title: 'Con material',
      status,
      variants: [
        {
          sku: `CM-${status}-${material ?? 'nada'}`,
          title: 'Única',
          price: 1000,
          currency: 'PYG',
          attributes: material ? { material } : {},
        },
      ],
    });

  const publicado = await intentar(
    db,
    DUENA,
    `select admin_save_product('${TIENDA}', '${producto('active')}'::jsonb)`,
  );
  assert.equal(publicado.ok, false);
  assert.match(publicado.error ?? '', /falta completar: Material/);

  const borrador = await intentar(
    db,
    DUENA,
    `select admin_save_product('${TIENDA}', '${producto('draft')}'::jsonb)`,
  );
  assert.equal(borrador.ok, true, borrador.error);

  const completo = await intentar(
    db,
    DUENA,
    `select admin_save_product('${TIENDA}', '${producto('active', 'Lino')}'::jsonb)`,
  );
  assert.equal(completo.ok, true, completo.error);
});
