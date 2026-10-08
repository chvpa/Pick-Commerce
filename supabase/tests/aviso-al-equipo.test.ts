import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, comoAdmin, comoServicio, intentar } from './harness.ts';

/**
 * El correo de pedido nuevo al equipo (ADR-156).
 *
 * Se afirma lo que se encola, no lo que se envía —enviar es de la aplicación—:
 * a quién, que cada persona decide lo suyo y sólo lo suyo, que un pedido de
 * demostración no le escribe a nadie, y que un aviso al equipo no se mezcla con
 * los avisos al comprador que el Admin muestra en el pedido.
 */

const TENANT = 'ab000000-0000-4000-8000-000000000000';
const TIENDA = 'ab100000-0000-4000-8000-000000000000';
const SUCURSAL = 'ab200000-0000-4000-8000-000000000000';
const PRODUCTO = 'ab300000-0000-4000-8000-000000000000';
const VARIANTE = 'ab400000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'ac000000-0000-4000-8000-000000000000';

const DUENA = 'fa000000-0000-4000-8000-000000000001';
const PERSONAL = 'fa000000-0000-4000-8000-000000000002';
const AJENA = 'fa000000-0000-4000-8000-000000000003';

let db: PGlite;

function sql(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

async function crearPedido(email = 'ana@cliente.test'): Promise<string> {
  const payload = {
    customer: { name: 'Ana López', email, phone: '0981123456' },
    address: { street: 'Calle 1', city: 'Asunción' },
    paymentMethod: 'bank_transfer',
    lines: [{ variantId: VARIANTE, quantity: 1 }],
  };
  const filas = await comoServicio<{ j: { order: { id: string } } }>(
    db,
    `select create_order(${sql(TIENDA)}::uuid, gen_random_uuid(),
                         ${sql(JSON.stringify(payload))}::jsonb) as j`,
  );
  return filas[0]!.j.order.id;
}

/** Los avisos al equipo de un pedido: van sin `order_id`, con el pedido en el payload. */
async function alEquipo(orderId: string): Promise<string[]> {
  const filas = await comoServicio<{ recipient: string }>(
    db,
    `select recipient from notification_outbox
     where event = 'team_new_order' and payload->'order'->>'id' = ${sql(orderId)}
     order by recipient`,
  );
  return filas.map((f) => f.recipient);
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENA}', 'duena@a.test'), ('${PERSONAL}', 'personal@a.test'), ('${AJENA}', 'ajena@b.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta', 'a.test', 'PYG');

    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENA}', 'owner'),
      ('${TENANT}', '${PERSONAL}', 'staff'),
      ('${OTRO_TENANT}', '${AJENA}', 'owner');

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

test('apagado por defecto: un pedido no le escribe al equipo hasta que alguien lo pida', async () => {
  assert.deepEqual(await alEquipo(await crearPedido()), []);
});

test('cada persona prende el suyo, y le llega sólo a quien lo prendió', async () => {
  await comoAdmin(db, PERSONAL, `select set_my_new_order_notice('${TENANT}', true)`);

  assert.deepEqual(await alEquipo(await crearPedido()), ['personal@a.test']);

  await comoAdmin(db, PERSONAL, `select set_my_new_order_notice('${TENANT}', false)`);
  assert.deepEqual(await alEquipo(await crearPedido()), []);
});

test('nadie prende el aviso de otra organización', async () => {
  const intento = await intentar(db, AJENA, `select set_my_new_order_notice('${TENANT}', true)`);
  assert.equal(intento.ok, false);
  assert.match(intento.error ?? '', /No sos parte/);
});

test('le llega al equipo aunque el comprador no haya dejado correo', async () => {
  await comoAdmin(db, DUENA, `select set_my_new_order_notice('${TENANT}', true)`);
  try {
    assert.deepEqual(await alEquipo(await crearPedido('')), ['duena@a.test']);
  } finally {
    await comoAdmin(db, DUENA, `select set_my_new_order_notice('${TENANT}', false)`);
  }
});

test('un pedido de demostración no le escribe a nadie, tampoco al equipo', async () => {
  await comoAdmin(db, DUENA, `select set_my_new_order_notice('${TENANT}', true)`);
  await comoServicio(
    db,
    `insert into store_settings (store_id, tenant_id, settings)
     values ('${TIENDA}', '${TENANT}', '{"demo": true}'::jsonb)
     on conflict (store_id) do update set settings = excluded.settings`,
  );
  try {
    assert.deepEqual(await alEquipo(await crearPedido()), []);
  } finally {
    await comoServicio(db, `delete from store_settings where store_id = '${TIENDA}'`);
    await comoAdmin(db, DUENA, `select set_my_new_order_notice('${TENANT}', false)`);
  }
});

test('el aviso al equipo no aparece entre los avisos del pedido', async () => {
  await comoAdmin(db, DUENA, `select set_my_new_order_notice('${TENANT}', true)`);
  try {
    const id = await crearPedido();
    assert.deepEqual(await alEquipo(id), ['duena@a.test']);

    // Los avisos del pedido son los del comprador: un correo al equipo que no
    // salió no es un comprador sin aviso.
    const avisos = await comoAdmin<{ j: { event: string }[] }>(
      db,
      DUENA,
      `select admin_order_notifications('${TIENDA}', '${id}') as j`,
    );
    assert.deepEqual(
      avisos[0]!.j.map((a) => a.event),
      ['order_received'],
    );
  } finally {
    await comoAdmin(db, DUENA, `select set_my_new_order_notice('${TENANT}', false)`);
  }
});
