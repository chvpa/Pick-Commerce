import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio, intentar } from './harness.ts';

/**
 * Lo que ve un comprador, y lo que no.
 *
 * `auth.users` es del proyecto entero y lo comparten todos los comercios, así
 * que «el usuario está autenticado» no dice nada sobre qué puede leer. Lo que lo
 * dice es `customer_accounts`, y estas pruebas son las que impiden que alguien
 * lo resuelva copiando el patrón del Admin —`app.current_tenants()`, que
 * significa «staff»— y le entregue a un comprador la tienda entera.
 *
 * Tres formas de fallar, y las tres tienen su caso: ver pedidos de otro
 * comercio, ver los de otro comprador del mismo comercio, y escribir colgado de
 * la cuenta de otro.
 */

const ORG_A = 'aa000000-0000-4000-8000-000000000000';
const TIENDA_A = 'a5000000-0000-4000-8000-000000000000';
const SUCURSAL_A = 'a6000000-0000-4000-8000-000000000000';
const PRODUCTO_A = 'a3000000-0000-4000-8000-000000000000';
const VARIANTE_A = 'a4000000-0000-4000-8000-000000000000';

const ORG_B = 'bb000000-0000-4000-8000-000000000000';
const TIENDA_B = 'b5000000-0000-4000-8000-000000000000';
const SUCURSAL_B = 'b6000000-0000-4000-8000-000000000000';
const PRODUCTO_B = 'b3000000-0000-4000-8000-000000000000';
const VARIANTE_B = 'b4000000-0000-4000-8000-000000000000';

/** Compradores. Ana y Beto compran en A; Carla compra en B. */
const ANA = 'c1000000-0000-4000-8000-000000000001';
const BETO = 'c1000000-0000-4000-8000-000000000002';
const CARLA = 'c1000000-0000-4000-8000-000000000003';
/** Y el dueño del comercio A, para comprobar que no le rompimos nada. */
const DUENO_A = 'd1000000-0000-4000-8000-000000000001';

let db: PGlite;
const pedidoDe = new Map<string, string>();

interface Pagina {
  readonly items: readonly { id: string; number: number }[];
  readonly total: number;
  readonly pageCount: number;
}

/** Crea un pedido como lo crea el storefront: con la secret key, sin RLS. */
async function comprar(tienda: string, variante: string, email: string): Promise<string> {
  const filas = await comoServicio<{ j: { order?: { id: string } } }>(
    db,
    `select create_order('${tienda}'::uuid, gen_random_uuid(),
       '{"customer":{"name":"${email}","email":"${email}","phone":"0981123456"},
         "address":{"street":"Calle 1","city":"Asuncion"},
         "paymentMethod":"bank_transfer",
         "lines":[{"variantId":"${variante}","quantity":1}]}'::jsonb) as j`,
  );
  const id = filas[0]!.j.order?.id;
  assert.ok(id, `no se pudo crear el pedido de ${email}: ${JSON.stringify(filas[0]!.j)}`);
  return id;
}

/** Vincula un usuario de `auth.users` con la ficha de cliente que ya existe. */
async function vincular(user: string, tienda: string, org: string, email: string): Promise<void> {
  await comoServicio(
    db,
    `insert into customer_accounts (user_id, tenant_id, store_id, customer_id)
     select '${user}', '${org}', '${tienda}', c.id
     from customers c where c.store_id = '${tienda}' and c.email = '${email}'`,
  );
}

before(async () => {
  db = await baseDePrueba();

  await db.exec(`
    insert into auth.users (id, email) values
      ('${ANA}', 'ana@compra.test'),
      ('${BETO}', 'beto@compra.test'),
      ('${CARLA}', 'carla@compra.test'),
      ('${DUENO_A}', 'dueno@a.test');

    insert into organizations (id, name, slug) values
      ('${ORG_A}', 'Comercio A', 'a'), ('${ORG_B}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA_A}', '${ORG_A}', 'Tienda A', 'ta', 'a.test', 'PYG'),
      ('${TIENDA_B}', '${ORG_B}', 'Tienda B', 'tb', 'b.test', 'PYG');

    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL_A}', '${ORG_A}', '${TIENDA_A}', 'Central'),
      ('${SUCURSAL_B}', '${ORG_B}', '${TIENDA_B}', 'Central');

    -- El dueño es staff de A. Ninguno de los compradores es miembro de nada.
    insert into memberships (tenant_id, user_id, role) values ('${ORG_A}', '${DUENO_A}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${PRODUCTO_A}', '${ORG_A}', '${TIENDA_A}', 'p-a', 'Producto de A', 'active'),
      ('${PRODUCTO_B}', '${ORG_B}', '${TIENDA_B}', 'p-b', 'Producto de B', 'active');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position) values
      ('${VARIANTE_A}', '${ORG_A}', '${PRODUCTO_A}', 'SKU-A', 'U', 100000, 'PYG', 0),
      ('${VARIANTE_B}', '${ORG_B}', '${PRODUCTO_B}', 'SKU-B', 'U', 100000, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${ORG_A}', '${VARIANTE_A}', '${SUCURSAL_A}', 100),
      ('${ORG_B}', '${VARIANTE_B}', '${SUCURSAL_B}', 100);
  `);

  pedidoDe.set('ana', await comprar(TIENDA_A, VARIANTE_A, 'ana@compra.test'));
  pedidoDe.set('beto', await comprar(TIENDA_A, VARIANTE_A, 'beto@compra.test'));
  pedidoDe.set('carla', await comprar(TIENDA_B, VARIANTE_B, 'carla@compra.test'));

  await vincular(ANA, TIENDA_A, ORG_A, 'ana@compra.test');
  await vincular(BETO, TIENDA_A, ORG_A, 'beto@compra.test');
  await vincular(CARLA, TIENDA_B, ORG_B, 'carla@compra.test');
});

after(async () => {
  await db.close();
});

// --- Lo que ve cada uno ------------------------------------------------------

test('un comprador ve su pedido, y sólo el suyo', async () => {
  const suyos = await como<{ id: string }>(db, ANA, 'select id from orders');
  assert.deepEqual(
    suyos.map((o) => o.id),
    [pedidoDe.get('ana')],
    'Ana ve pedidos que no son suyos, o dejó de ver el propio',
  );
});

test('un comprador no ve los pedidos de otro comprador del mismo comercio', async () => {
  // El caso que se rompe solo si alguien acota por tienda en vez de por cuenta:
  // Beto compra en la misma tienda que Ana.
  const deBeto = await como<{ id: string }>(db, BETO, 'select id from orders');
  assert.deepEqual(
    deBeto.map((o) => o.id),
    [pedidoDe.get('beto')],
  );
});

test('un comprador no ve nada de otro comercio', async () => {
  const deCarla = await como<{ id: string }>(db, CARLA, 'select id from orders');
  assert.deepEqual(
    deCarla.map((o) => o.id),
    [pedidoDe.get('carla')],
  );
});

test('las líneas y la timeline siguen al pedido', async () => {
  const items = await como<{ n: number }>(db, ANA, 'select count(*)::int as n from order_items');
  assert.equal(items[0]!.n, 1, 'Ana ve líneas de pedidos ajenos, o ninguna de las suyas');

  const eventos = await como<{ n: number }>(db, ANA, 'select count(*)::int as n from order_events');
  assert.ok(eventos[0]!.n > 0, 'Ana no ve la timeline de su propio pedido');

  const todos = await comoServicio<{ n: number }>(db, 'select count(*)::int as n from order_items');
  assert.equal(todos[0]!.n, 3, 'el seed no dejó tres pedidos: el test no probaría aislamiento');
});

// --- Las funciones -----------------------------------------------------------

test('`order_json` de un pedido ajeno no devuelve el pedido', async () => {
  // No hace falta una función nueva para «mi pedido»: `order_json` es security
  // invoker, así que RLS ya lo filtra. Esto lo afirma.
  const propio = await como<{ j: { number?: number } | null }>(
    db,
    ANA,
    `select order_json('${pedidoDe.get('ana')}') as j`,
  );
  assert.ok(propio[0]!.j?.number, 'Ana no puede leer su propio pedido');

  const ajeno = await como<{ j: { number?: number } | null }>(
    db,
    ANA,
    `select order_json('${pedidoDe.get('beto')}') as j`,
  );
  assert.equal(ajeno[0]!.j?.number, undefined, 'Ana leyó el pedido de Beto por su id');
});

test('`customer_orders` devuelve una página con lo propio', async () => {
  const r = await como<{ j: Pagina }>(db, ANA, `select customer_orders('${TIENDA_A}', 1, 10) as j`);
  const pagina = r[0]!.j;
  assert.equal(pagina.total, 1);
  assert.equal(pagina.items.length, 1);
  assert.equal(pagina.items[0]!.id, pedidoDe.get('ana'));
});

test('`customer_orders` de la tienda ajena viene vacía aunque se pase su id', async () => {
  const r = await como<{ j: Pagina }>(db, ANA, `select customer_orders('${TIENDA_B}', 1, 10) as j`);
  assert.equal(r[0]!.j.total, 0);
  assert.deepEqual(r[0]!.j.items, []);
});

test('`customer_orders` tiene techo de página', async () => {
  // Como todo listado del repo: pedir mil no trae mil.
  const r = await como<{ j: { perPage: number } }>(
    db,
    ANA,
    `select customer_orders('${TIENDA_A}', 1, 1000) as j`,
  );
  assert.equal(r[0]!.j.perPage, 50);
});

// --- Las direcciones ---------------------------------------------------------

test('una dirección se guarda en la cuenta propia y no en la de otro', async () => {
  const mia = await intentar(
    db,
    ANA,
    `insert into customer_addresses (tenant_id, store_id, customer_id, address)
     select '${ORG_A}', '${TIENDA_A}', app.current_customer('${TIENDA_A}'), '{"street":"Mi casa"}'::jsonb`,
  );
  assert.ok(mia.ok, `Ana no pudo guardar su propia dirección: ${mia.error}`);

  // La misma inserción, colgada de la ficha de Beto. Es lo que impide el
  // `with check` de la política; sin él, `using` solo no alcanza.
  const ajena = await intentar(
    db,
    ANA,
    `insert into customer_addresses (tenant_id, store_id, customer_id, address)
     select '${ORG_A}', '${TIENDA_A}', ca.customer_id, '{"street":"Casa de Beto"}'::jsonb
     from customer_accounts ca where ca.user_id = '${BETO}'`,
  );
  assert.equal(ajena.filas, 0, 'Ana guardó una dirección colgada de la cuenta de Beto');
});

// --- Y el comercio sigue viendo lo suyo --------------------------------------

test('el staff del comercio sigue viendo los pedidos de su tienda', async () => {
  // Las políticas de comprador se **suman** a las del staff: dos `for select`
  // sobre la misma tabla se combinan con OR. Si alguien las reemplazara en vez
  // de agregarlas, el Admin se quedaría sin pedidos y esto lo caza.
  const delDueno = await como<{ n: number }>(db, DUENO_A, 'select count(*)::int as n from orders');
  assert.equal(delDueno[0]!.n, 2, 'el dueño de A dejó de ver los dos pedidos de su tienda');
});
