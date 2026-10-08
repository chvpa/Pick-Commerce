import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, comoServicio, intentar } from './harness.ts';

/**
 * El registro de actividad (ADR-158): qué registra, qué no, y que no se puede
 * reescribir. Lo último se prueba **al revés**: no alcanza con que la pantalla
 * no ofrezca borrar, hay que intentarlo con cada llave y ver que falla.
 */

const TENANT = 'ad000000-0000-4000-8000-000000000000';
const TIENDA = 'ad100000-0000-4000-8000-000000000000';
const SUCURSAL = 'ad200000-0000-4000-8000-000000000000';
const PRODUCTO = 'ad300000-0000-4000-8000-000000000000';
const VARIANTE = 'ad400000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'ae000000-0000-4000-8000-000000000000';

const DUENA = 'fb000000-0000-4000-8000-000000000001';
const PERSONAL = 'fb000000-0000-4000-8000-000000000002';
const FORASTERA = 'fb000000-0000-4000-8000-000000000003';
const EFIMERA = 'fb000000-0000-4000-8000-000000000004';

let db: PGlite;

interface Fila {
  entity: string;
  action: string;
  subject_id: string | null;
  store_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  changes: Record<string, [unknown, unknown]> | null;
  sensitive: boolean;
  metadata: { label?: string };
}

/** Lo registrado después de un id dado, leído sin RLS: el test mira la tabla. */
async function desde(id: number): Promise<Fila[]> {
  const r = await db.query<Fila>(
    `select entity, action, subject_id, store_id, actor_id, actor_role::text as actor_role,
            changes, sensitive, metadata
     from audit_log where id > ${id} order by id`,
  );
  return r.rows;
}

async function ultimoId(): Promise<number> {
  const r = await db.query<{ n: number }>('select coalesce(max(id), 0)::int as n from audit_log');
  return r.rows[0]!.n;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENA}', 'duena@a.test'), ('${PERSONAL}', 'personal@a.test'),
      ('${FORASTERA}', 'forastera@b.test'), ('${EFIMERA}', 'efimera@a.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta', 'a.test', 'PYG');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENA}', 'owner'),
      ('${TENANT}', '${PERSONAL}', 'staff'),
      ('${TENANT}', '${EFIMERA}', 'staff'),
      ('${OTRO_TENANT}', '${FORASTERA}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${PRODUCTO}', '${TENANT}', '${TIENDA}', 'remera', 'Remera', 'active');
    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position) values
      ('${VARIANTE}', '${TENANT}', '${PRODUCTO}', 'REM-1', 'M', 150000, 'PYG', 0);
    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${TENANT}', '${VARIANTE}', '${SUCURSAL}', 100);
  `);
});

after(async () => {
  await db.close();
});

test('un cambio de precio queda con quién, su rol, el producto y el antes y el después', async () => {
  const antes = await ultimoId();
  await comoAdmin(db, DUENA, `update product_variants set price = 175000 where id = '${VARIANTE}'`);

  const [fila, ...resto] = await desde(antes);
  assert.equal(resto.length, 0);
  assert.equal(fila!.entity, 'product_variants');
  assert.equal(fila!.action, 'update');
  assert.equal(fila!.subject_id, PRODUCTO, 'el sujeto de una variante es su producto');
  assert.equal(fila!.store_id, TIENDA);
  assert.equal(fila!.actor_id, DUENA);
  assert.equal(fila!.actor_role, 'owner');
  assert.deepEqual(fila!.changes, { price: [150000, 175000] });
  assert.equal(fila!.sensitive, false);
});

test('guardar sin cambiar nada no es actividad', async () => {
  const antes = await ultimoId();
  await comoAdmin(
    db,
    DUENA,
    `update product_variants set price = price, updated_at = now() where id = '${VARIANTE}'`,
  );
  assert.deepEqual(await desde(antes), []);
});

test('lo que hace el sistema no entra: ni el checkout ni la secret key', async () => {
  const antes = await ultimoId();
  await comoServicio(
    db,
    `update inventory_levels set available = 90 where variant_id = '${VARIANTE}'`,
  );
  await comoServicio(
    db,
    `select create_order('${TIENDA}'::uuid, gen_random_uuid(),
       '{"customer":{"name":"Ana","email":"ana@c.test","phone":"0981123456"},
         "address":{"street":"Calle 1","city":"Asunción"},"paymentMethod":"bank_transfer",
         "lines":[{"variantId":"${VARIANTE}","quantity":1}]}'::jsonb)`,
  );
  assert.deepEqual(await desde(antes), []);
});

test('la cuenta de cobro es sensible, y los ajustes se registran por sección', async () => {
  const antes = await ultimoId();
  await comoAdmin(
    db,
    DUENA,
    `select admin_save_settings('${TIENDA}',
       '{"payments":{"enabled":["bank_transfer"],"bankTransfer":{"instructions":"Cuenta 1"}}}'::jsonb)`,
  );
  await comoAdmin(
    db,
    DUENA,
    `select admin_save_settings('${TIENDA}',
       '{"payments":{"enabled":["bank_transfer"],"bankTransfer":{"instructions":"Cuenta 2"}}}'::jsonb)`,
  );

  const filas = await desde(antes);
  const cambio = filas.find((f) => f.action === 'update')!;
  assert.deepEqual(Object.keys(cambio.changes!), ['settings.payments']);
  assert.equal(cambio.sensitive, true);
  assert.equal(cambio.subject_id, TIENDA);
});

test('anular un pedido es sensible, y la llave del enlace no queda en ningún lado', async () => {
  const pedido = await comoServicio<{ j: { order: { id: string } } }>(
    db,
    `select create_order('${TIENDA}'::uuid, gen_random_uuid(),
       '{"customer":{"name":"Ana","email":"ana@c.test","phone":"0981123456"},
         "address":{"street":"Calle 1","city":"Asunción"},"paymentMethod":"bank_transfer",
         "lines":[{"variantId":"${VARIANTE}","quantity":1}]}'::jsonb) as j`,
  );
  const id = pedido[0]!.j.order.id;
  const llave = (
    await db.query<{ t: string }>(`select access_token as t from orders where id = '${id}'`)
  ).rows[0]!.t;

  const antes = await ultimoId();
  await comoAdmin(db, DUENA, `select admin_set_order_status('${TIENDA}', '${id}', 'cancelled')`);

  const filas = await desde(antes);
  const anulado = filas.find((f) => f.entity === 'orders')!;
  assert.equal(anulado.sensitive, true);
  assert.deepEqual(anulado.changes!.status, ['received', 'cancelled']);
  assert.ok(!JSON.stringify(filas).includes(llave), 'la llave del enlace quedó en el registro');
});

test('el equipo es sensible: cualquier cambio de rol', async () => {
  const antes = await ultimoId();
  await comoAdmin(
    db,
    DUENA,
    `update memberships set role = 'admin' where tenant_id = '${TENANT}' and user_id = '${PERSONAL}'`,
  );
  const [fila] = await desde(antes);
  assert.equal(fila!.entity, 'memberships');
  assert.equal(fila!.sensitive, true);
  assert.deepEqual(fila!.changes!.role, ['staff', 'admin']);
});

test('prender el propio aviso queda registrado, pero no es sensible', async () => {
  const antes = await ultimoId();
  await comoAdmin(db, DUENA, `select set_my_new_order_notice('${TENANT}', true)`);
  const [fila] = await desde(antes);
  assert.deepEqual(fila!.changes, { notify_new_order: [false, true] });
  assert.equal(fila!.sensitive, false);
});

test('nadie escribe ni borra el registro desde la API', async () => {
  for (const sql of [
    `insert into audit_log (tenant_id, action, entity) values ('${TENANT}', 'x', 'y')`,
    `update audit_log set action = 'nada'`,
    `delete from audit_log`,
  ]) {
    const intento = await intentar(db, DUENA, sql);
    assert.equal(intento.ok, false, `la dueña pudo: ${sql}`);
  }
});

test('ni con privilegios: editar, borrar o vaciar falla igual', async () => {
  // La secret key tiene privilegios en PGlite —el harness los concede como el
  // proyecto—, y el dueño de las tablas también: lo que los frena es el trigger.
  await assert.rejects(comoServicio(db, `update audit_log set action = 'nada'`), /no se edita/);
  await assert.rejects(db.exec(`delete from audit_log`), /no se borra/);
  await assert.rejects(db.exec(`truncate audit_log`), /no se vacía/);
});

test('borrar a una persona deja sus filas, sin su nombre', async () => {
  const antes = await ultimoId();
  await comoAdmin(
    db,
    EFIMERA,
    `update products set title = 'Remera lisa' where id = '${PRODUCTO}'`,
  );
  const [fila] = await desde(antes);
  assert.equal(fila!.actor_id, EFIMERA);

  await db.exec(`delete from auth.users where id = '${EFIMERA}'`);
  const despues = await desde(antes);
  assert.equal(despues.length >= 1, true, 'la fila se fue con la persona');
  assert.equal(despues[0]!.actor_id, null);
});

test('una organización que se borra se lleva su registro', async () => {
  await db.exec(`
    insert into audit_log (tenant_id, action, entity) values ('${OTRO_TENANT}', 'prueba', 'nada');
    delete from organizations where id = '${OTRO_TENANT}';
  `);
  const r = await db.query<{ n: number }>(
    `select count(*)::int as n from audit_log where tenant_id = '${OTRO_TENANT}'`,
  );
  assert.equal(r.rows[0]!.n, 0);
});

test('la purga borra lo de más de dos años y nada más', async () => {
  await db.exec(`
    insert into audit_log (tenant_id, action, entity, created_at) values
      ('${TENANT}', 'vieja', 'prueba', now() - interval '2 years 1 day'),
      ('${TENANT}', 'reciente', 'prueba', now() - interval '1 year');
  `);
  const r = await db.query<{ n: number }>('select app.purgar_auditoria() as n');
  assert.equal(r.rows[0]!.n, 1);
  const quedan = await db.query<{ action: string }>(
    `select action from audit_log where entity = 'prueba' order by action`,
  );
  assert.deepEqual(
    quedan.rows.map((f) => f.action),
    ['reciente'],
  );
});

test('lo lee quien administra el equipo; el personal y los de afuera, nada', async () => {
  const deLaDuena = await como<{ n: number }>(
    db,
    DUENA,
    'select count(*)::int as n from audit_log',
  );
  assert.ok(deLaDuena[0]!.n > 0);
  for (const quien of [PERSONAL, FORASTERA]) {
    const filas = await como<{ n: number }>(db, quien, 'select count(*)::int as n from audit_log');
    assert.equal(filas[0]!.n, 0);
  }
});

// --- La historia de un pedido o un producto (ADR-159) ------------------------------

test('el personal ve la historia del producto, sin IP ni navegador', async () => {
  const filas = await como<{ j: { total: number; items: Record<string, unknown>[] } }>(
    db,
    PERSONAL,
    `select admin_subject_activity('${TIENDA}', '${PRODUCTO}') as j`,
  );
  const { total, items } = filas[0]!.j;
  assert.ok(total >= 1);
  const precio = items.find((i) => i.entity === 'product_variants')!;
  assert.equal(precio.actor, 'duena@a.test');
  assert.deepEqual(precio.changes, { price: [150000, 175000] });
  assert.ok(!('ip' in precio) && !('user_agent' in precio));
});

test('ni los ajustes ni el equipo salen por la historia, aunque se pidan', async () => {
  // El sujeto de un ajuste es la tienda: pedirla devuelve nada, también a la dueña.
  const filas = await como<{ j: { total: number } }>(
    db,
    DUENA,
    `select admin_subject_activity('${TIENDA}', '${TIENDA}') as j`,
  );
  assert.equal(filas[0]!.j.total, 0);
});

test('alguien de otro comercio no ve la historia', async () => {
  const filas = await como<{ j: { total: number; items: unknown[] } }>(
    db,
    FORASTERA,
    `select admin_subject_activity('${TIENDA}', '${PRODUCTO}') as j`,
  );
  assert.deepEqual(filas[0]!.j, { total: 0, items: [] });
});
