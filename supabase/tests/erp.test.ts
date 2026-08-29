import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio, intentar } from './harness.ts';

/**
 * Lo que la Fase 8 agregó al schema.
 *
 * Dos cosas que importan: que una corrida de sincronización no se vea desde otra
 * organización, y que el stock que posee el ERP no se pueda pisar desde el
 * Admin. Lo segundo es un no-negociable del repo que hasta ahora se cumplía para
 * el precio y no para el stock, que es lo único que un ERP posee de verdad.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const STORE = 'bb000000-0000-4000-8000-000000000000';
const LOCATION = 'cc000000-0000-4000-8000-000000000000';
const DUENO = 'a1000000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'af000000-0000-4000-8000-000000000000';
const OTRO_STORE = 'bf000000-0000-4000-8000-000000000000';
const AJENO = 'a3000000-0000-4000-8000-000000000000';

let db: PGlite;

function json(valor: unknown): string {
  return `'${JSON.stringify(valor).replace(/'/g, "''")}'::jsonb`;
}

async function guardar(producto: unknown): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select admin_save_product('${STORE}'::uuid, ${json(producto)}) as id`,
  );
  return r.rows[0]!.id;
}

async function stockDe(productId: string): Promise<number> {
  const r = await db.query<{ available: number }>(
    `select il.available from inventory_levels il
     join product_variants v on v.id = il.variant_id
     where v.product_id = '${productId}'`,
  );
  return r.rows[0]!.available;
}

async function precioDe(productId: string): Promise<number> {
  const r = await db.query<{ price: string }>(
    `select price from product_variants where product_id = '${productId}'`,
  );
  return Number(r.rows[0]!.price);
}

/**
 * El producto tal como lo manda el Admin: con el stock y el precio de todas las
 * variantes en cada guardado, que es lo que hace el formulario.
 *
 * Cada test usa su propio handle porque `products` es único por (tienda, handle)
 * y las escrituras de `admin_save_product` persisten entre tests.
 */
function conStockYPrecio(handle: string, stock: number, price: number) {
  return {
    handle,
    title: 'Zapatilla',
    status: 'active',
    variants: [
      {
        sku: `ZAP-${handle}`,
        title: '10.5',
        price,
        currency: 'PYG',
        attributes: { talla: '10.5' },
        stock,
      },
    ],
  };
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@x.test'), ('${AJENO}', 'ajeno@x.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Estilo', 'estilo'), ('${OTRO_TENANT}', 'Otra', 'otra');
    insert into stores (id, tenant_id, name, slug) values
      ('${STORE}', '${TENANT}', 'Principal', 'principal'),
      ('${OTRO_STORE}', '${OTRO_TENANT}', 'Ajena', 'ajena');
    insert into locations (id, tenant_id, store_id, name) values
      ('${LOCATION}', '${TENANT}', '${STORE}', 'Depósito');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${OTRO_TENANT}', '${AJENO}', 'owner');
  `);
});

after(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// Identificadores del ERP
// ---------------------------------------------------------------------------

test('el producto guarda el código del ERP y la variante su talla nativa', async () => {
  const id = await guardar(conStockYPrecio('erp-codigos', 4, 250000));
  await db.exec(`
    update products set internal_code = '11042' where id = '${id}';
    update product_variants set erp_size = '105' where product_id = '${id}';
  `);

  const r = await db.query<{ internal_code: string; erp_size: string }>(
    `select p.internal_code, v.erp_size
     from products p join product_variants v on v.product_id = p.id
     where p.id = '${id}'`,
  );
  assert.equal(r.rows[0]!.internal_code, '11042');
  // La talla nativa se guarda sin punto aunque la de Pick lo tenga: el campo del
  // ORDS tiene tres caracteres y reconstruirla después es adivinar.
  assert.equal(r.rows[0]!.erp_size, '105');
});

// ---------------------------------------------------------------------------
// El stock del ERP no se pisa desde el Admin
// ---------------------------------------------------------------------------

test('sin dueño declarado, el Admin escribe el stock como siempre', async () => {
  const id = await guardar(conStockYPrecio('erp-propio', 4, 250000));
  assert.equal(await stockDe(id), 4);

  await guardar({ ...conStockYPrecio('erp-propio', 9, 250000), id });
  assert.equal(await stockDe(id), 9, 'dejó de poder editar el stock de un producto propio');
});

test('con el stock en manos del ERP, el Admin no lo pisa', async () => {
  const id = await guardar(conStockYPrecio('erp-stock', 4, 250000));
  await db.exec(`update products set field_sources = '{"stock":"ERP"}'::jsonb where id = '${id}'`);

  // El formulario manda el stock de todas las variantes en cada guardado, así
  // que esto es lo que pasa al editar cualquier otro campo del producto.
  await guardar({
    ...conStockYPrecio('erp-stock', 999, 250000),
    id,
    title: 'Zapatilla renombrada',
  });

  assert.equal(await stockDe(id), 4, 'el Admin pisó el stock que administra el ERP');

  const r = await db.query<{ title: string }>(`select title from products where id = '${id}'`);
  assert.equal(
    r.rows[0]!.title,
    'Zapatilla renombrada',
    'bloquear el stock dejó sin poder editar el resto del producto',
  );
});

test('el precio del ERP sigue protegido', async () => {
  // Regresión: la función se reemplazó entera, así que lo que ya andaba tiene
  // que seguir andando.
  const id = await guardar(conStockYPrecio('erp-precio', 4, 250000));
  await db.exec(`update products set field_sources = '{"price":"ERP"}'::jsonb where id = '${id}'`);

  await guardar({ ...conStockYPrecio('erp-precio', 4, 111111), id });
  assert.equal(await precioDe(id), 250000, 'el Admin pisó el precio que administra el ERP');
});

test('bloquear el stock no bloquea el precio, ni al revés', async () => {
  const id = await guardar(conStockYPrecio('erp-ambos', 4, 250000));
  await db.exec(`update products set field_sources = '{"stock":"ERP"}'::jsonb where id = '${id}'`);

  await guardar({ ...conStockYPrecio('erp-ambos', 999, 333000), id });
  assert.equal(await stockDe(id), 4);
  assert.equal(await precioDe(id), 333000, 'bloqueó el precio sin que nadie lo pidiera');
});

// ---------------------------------------------------------------------------
// Auditoría de las corridas
// ---------------------------------------------------------------------------

async function corrida(tenant: string, store: string, mode = 'real'): Promise<void> {
  await comoServicio(
    db,
    `insert into erp_sync_runs (tenant_id, store_id, adapter, mode, items_received)
     values ('${tenant}', '${store}', 'estilosport-ords', '${mode}', 9032)`,
  );
}

test('una corrida sólo se ve desde su propia organización', async () => {
  await corrida(TENANT, STORE);
  await corrida(OTRO_TENANT, OTRO_STORE);

  // Se afirma sobre qué organizaciones se ven y no sobre cuántas filas hay: un
  // conteo dependería de lo que hayan dejado los tests anteriores.
  const propias = await como<{ tenant_id: string }>(
    db,
    DUENO,
    'select distinct tenant_id from erp_sync_runs',
  );
  assert.deepEqual(
    propias.map((f) => f.tenant_id),
    [TENANT],
    'un miembro vio corridas que no son de su organización',
  );

  const ajenas = await como<{ tenant_id: string }>(
    db,
    AJENO,
    'select distinct tenant_id from erp_sync_runs',
  );
  assert.deepEqual(
    ajenas.map((f) => f.tenant_id),
    [OTRO_TENANT],
  );
});

test('un anónimo ni siquiera puede consultar la tabla', async () => {
  // No es que RLS le devuelva vacío: `anon` no tiene el privilegio, que es una
  // capa más afuera y falla antes de evaluar ninguna política.
  const r = await intentar(db, null, 'select count(*) from erp_sync_runs');
  assert.equal(r.ok, false, 'el rol del browser pudo consultar el registro de sincronizaciones');
  assert.match(r.error ?? '', /permission denied/);
});

test('nadie edita una corrida pasada desde el Admin', async () => {
  const r = await intentar(
    db,
    DUENO,
    `update erp_sync_runs set items_received = 0 where tenant_id = '${TENANT}'`,
  );
  assert.equal(r.filas, 0, 'un usuario del Admin pudo reescribir el registro de una corrida');
});

test('un modo que no existe se rechaza', async () => {
  await assert.rejects(
    corrida(TENANT, STORE, 'lo_que_sea'),
    /erp_sync_runs_mode_check|check constraint/,
  );
});

test('borrar la tienda se lleva sus corridas', async () => {
  // La cascada lleva el tenant en la clave compuesta (ADR-063): sin eso, borrar
  // una tienda dejaría filas huérfanas apuntando a otra organización.
  await comoServicio(
    db,
    `insert into stores (id, tenant_id, name, slug)
    values ('bb000000-0000-4000-8000-0000000000ff', '${TENANT}', 'Temporal', 'temporal')`,
  );
  await corrida(TENANT, 'bb000000-0000-4000-8000-0000000000ff');
  await comoServicio(db, `delete from stores where id = 'bb000000-0000-4000-8000-0000000000ff'`);

  const r = await db.query<{ n: string }>(
    `select count(*) as n from erp_sync_runs where store_id = 'bb000000-0000-4000-8000-0000000000ff'`,
  );
  assert.equal(Number(r.rows[0]!.n), 0);
});
