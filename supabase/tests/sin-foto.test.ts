import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio } from './harness.ts';

/**
 * La cola de lo que no se ve (v2 Fase 5).
 *
 * Lo que se defiende es **el orden y las cuentas**: la lista es con la que
 * alguien sale a fotografiar, y si pone primero un producto agotado, la primera
 * hora de trabajo no vende nada. Y las cuentas son lo único que dice si la fase
 * sirvió.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'bb000000-0000-4000-8000-000000000000';
const SUCURSAL = 'cc000000-0000-4000-8000-000000000000';
const DUENO = 'a1000000-0000-4000-8000-000000000000';
const FORASTERO = 'a1000000-0000-4000-8000-0000000000ff';

const OTRO_TENANT = 'af000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'bf000000-0000-4000-8000-000000000000';

const p = (n: number) => `d1${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
const v = (n: number) => `e1${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;

interface Cola {
  items: Array<{ id: string; stock: number; sku?: string }>;
  total: number;
  pageCount: number;
  cuentas: {
    activos: number;
    listables: number;
    sinFotoConStock: number;
    recuperadosSemana: number;
  };
}

let db: PGlite;

/** Un producto con una variante, su stock y, si se pide, una foto. */
async function producto(n: number, stock: number, foto?: string, tienda = TIENDA, tenant = TENANT) {
  await db.exec(`
    insert into products (id, tenant_id, store_id, handle, title, status)
      values ('${p(n)}', '${tenant}', '${tienda}', 'p${n}', 'Producto ${n}', 'active');
    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position)
      values ('${v(n)}', '${tenant}', '${p(n)}', 'SKU-${n}', 'Única', 100, 'PYG', 0);
  `);
  if (tienda === TIENDA) {
    await db.exec(
      `insert into inventory_levels (tenant_id, variant_id, location_id, available)
       values ('${tenant}', '${v(n)}', '${SUCURSAL}', ${stock})`,
    );
  }
  if (foto) {
    await db.exec(
      `insert into product_media (tenant_id, product_id, url, width, height, position)
       values ('${tenant}', '${p(n)}', '${foto}', 800, 1000, 0)`,
    );
  }
}

async function cola(pagina = 1, porPagina = 20, usuario = DUENO): Promise<Cola> {
  const filas = await como<{ j: Cola }>(
    db,
    usuario,
    `select admin_products_without_photo('${TIENDA}'::uuid, ${pagina}, ${porPagina}) as j`,
  );
  return filas[0]!.j;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@x.test'), ('${FORASTERO}', 'forastero@x.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio', 'c'), ('${OTRO_TENANT}', 'Otro', 'o');
    insert into stores (id, tenant_id, name, slug) values
      ('${TIENDA}', '${TENANT}', 'Tienda', 't'), ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Otra', 'o');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');
    insert into memberships (tenant_id, user_id, role) values ('${TENANT}', '${DUENO}', 'owner');
  `);

  // Sin foto: uno agotado, uno con poco stock y uno con mucho, cargados en ese
  // orden para que el orden de alta no coincida con el que se espera.
  await producto(0, 0);
  await producto(1, 2);
  await producto(2, 9);
  // Con foto: uno que se recuperó a mano, y uno que trajo el importador.
  await producto(3, 5, 'https://x.supabase.co/storage/v1/object/public/product-media/t/abc.webp');
  await producto(
    4,
    5,
    'https://x.supabase.co/storage/v1/object/public/product-media/t/camelot/p4-0.webp',
  );
  // Con foto y sin stock: no es listable, y la cuenta tiene que saberlo. Sin él,
  // contar listables sin mirar el stock no ponía ningún caso en rojo (medido).
  await producto(
    5,
    0,
    'https://x.supabase.co/storage/v1/object/public/product-media/t/camelot/p5-0.webp',
  );
  // Y un producto sin foto de otro comercio, que no puede aparecer nunca.
  await producto(9, 0, undefined, OTRA_TIENDA, OTRO_TENANT);
});

after(async () => {
  await db.close();
});

test('la cola trae sólo lo que no tiene foto, primero lo que tiene más stock', async () => {
  const r = await cola();
  assert.deepEqual(
    r.items.map((x) => x.id),
    [p(2), p(1), p(0)],
    'el orden no pone primero lo que se puede vender hoy',
  );
  assert.equal(r.total, 3);
  assert.equal(r.items[0]!.sku, 'SKU-2', 'la tarjeta no trae el SKU para ubicar el producto');
});

test('las cuentas dicen cuánto falta y cuánto se recuperó', async () => {
  const { cuentas } = await cola();
  assert.deepEqual(cuentas, {
    activos: 6,
    listables: 2,
    sinFotoConStock: 2,
    // La foto subida a mano cuenta; la que trajo Camelot, no: no es trabajo de
    // nadie en la tienda.
    recuperadosSemana: 1,
  });
});

test('pagina sin repetir ni perder productos', async () => {
  const primera = await cola(1, 2);
  const segunda = await cola(2, 2);
  assert.equal(primera.pageCount, 2);
  assert.deepEqual(
    [...primera.items, ...segunda.items].map((x) => x.id),
    [p(2), p(1), p(0)],
  );
});

test('una foto nueva saca al producto de la cola y lo suma a los listables', async () => {
  await db.exec(
    `insert into product_media (tenant_id, product_id, url, width, height, position)
     values ('${TENANT}', '${p(2)}', 'https://x.supabase.co/storage/v1/object/public/product-media/t/nueva.webp', 800, 1000, 0)`,
  );
  const r = await cola();
  assert.deepEqual(
    r.items.map((x) => x.id),
    [p(1), p(0)],
  );
  assert.equal(r.cuentas.listables, 3);
  assert.equal(r.cuentas.sinFotoConStock, 1);
  assert.equal(r.cuentas.recuperadosSemana, 2);
});

test('un forastero no ve la cola de nadie', async () => {
  const r = await cola(1, 20, FORASTERO);
  assert.deepEqual(r.items, []);
  assert.equal(r.cuentas.activos, 0);
});

test('la cola no la puede pedir el navegador', async () => {
  const [{ puede }] = await comoServicio<{ puede: boolean }>(
    db,
    `select has_function_privilege('anon', 'public.admin_products_without_photo(uuid, integer, integer)', 'execute') as puede`,
  );
  assert.equal(puede, false);
});
