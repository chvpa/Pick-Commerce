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
/** Un segundo producto de A, que **ningún** caso guarda: ver `fichaDe`. */
const PRODUCTO_A2 = 'a3000000-0000-4000-8000-000000000002';
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
/** Dina compra como invitada y se hace cuenta después; Elías y Fran nunca compraron. */
const DINA = 'c1000000-0000-4000-8000-000000000004';
const ELIAS = 'c1000000-0000-4000-8000-000000000005';
const FRAN = 'c1000000-0000-4000-8000-000000000006';
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

/**
 * La ficha de cliente de un usuario, leída con la secret key.
 *
 * **Existe por un falso verde que encontró un sabotaje**, no por comodidad. Los
 * casos de «escribir colgado de la cuenta de otro» hacían
 * `select ... from customer_accounts where user_id = <el otro>`, y
 * `customer_accounts` tiene RLS: esa subconsulta devuelve **cero filas** para
 * quien no es su dueño, así que el insert no insertaba nada y el caso pasaba
 * aunque la política no existiera. Medido: con `with check (true)` la suite
 * seguía entera en verde.
 *
 * Con el id como literal, lo único que puede rechazar la fila es la política.
 */
async function fichaDe(user: string): Promise<string> {
  const r = await comoServicio<{ customer_id: string }>(
    db,
    `select customer_id from customer_accounts where user_id = '${user}'`,
  );
  assert.ok(r[0], `el usuario ${user} no tiene cuenta de comprador`);
  return r[0].customer_id;
}

before(async () => {
  db = await baseDePrueba();

  await db.exec(`
    insert into auth.users (id, email) values
      ('${ANA}', 'ana@compra.test'),
      ('${BETO}', 'beto@compra.test'),
      ('${CARLA}', 'carla@compra.test'),
      ('${DINA}', 'dina@compra.test'),
      ('${ELIAS}', 'elias@compra.test'),
      ('${FRAN}', 'fran@compra.test'),
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
      ('${PRODUCTO_A2}', '${ORG_A}', '${TIENDA_A}', 'p-a2', 'Otro producto de A', 'active'),
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

// --- El vínculo con el historial de invitado ---------------------------------

test('`link_customer_account` engancha la ficha que ya existía', async () => {
  // Dina compró como invitada y recién después se hizo cuenta. Su pedido tiene
  // que aparecer sin mover una fila: `customers` es único por (tienda, email) y
  // `create_order` hace upsert por ahí desde la Fase 5.
  const pedido = await comprar(TIENDA_A, VARIANTE_A, 'dina@compra.test');

  const antes = await comoServicio<{ id: string; name: string }>(
    db,
    `select id, name from customers where store_id = '${TIENDA_A}' and email = 'dina@compra.test'`,
  );

  const r = await comoServicio<{ id: string | null }>(
    db,
    `select link_customer_account('${TIENDA_A}', '${DINA}', 'dina@compra.test') as id`,
  );

  assert.equal(r[0]!.id, antes[0]!.id, 'creó una ficha nueva en vez de enganchar la que estaba');

  const despues = await comoServicio<{ n: number; name: string }>(
    db,
    `select count(*)::int as n, max(name) as name from customers
     where store_id = '${TIENDA_A}' and email = 'dina@compra.test'`,
  );
  assert.equal(despues[0]!.n, 1, 'duplicó el cliente');
  assert.equal(despues[0]!.name, antes[0]!.name, 'le pisó el nombre a la ficha que ya estaba');

  // Y con eso Dina ve su pedido.
  const suyos = await como<{ id: string }>(db, DINA, 'select id from orders');
  assert.deepEqual(
    suyos.map((o) => o.id),
    [pedido],
  );
});

test('`link_customer_account` es idempotente', async () => {
  // Se llama en cada login, así que entrar dos veces no puede fallar ni
  // multiplicar vínculos.
  for (let i = 0; i < 2; i++) {
    await comoServicio(
      db,
      `select link_customer_account('${TIENDA_A}', '${DINA}', 'dina@compra.test')`,
    );
  }

  const r = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from customer_accounts
     where store_id = '${TIENDA_A}' and user_id = '${DINA}'`,
  );
  assert.equal(r[0]!.n, 1);
});

test('`link_customer_account` no entrega una ficha que ya es de otra cuenta', async () => {
  /*
   * El caso real: un usuario de Auth borrado y vuelto a crear con el mismo
   * correo llega con otro `user_id`, y la ficha sigue enganchada al viejo.
   * `unique (store_id, customer_id)` impide el segundo vínculo, y lo que se
   * comprueba acá es que la función **no devuelva igual el customer**: si lo
   * hiciera, esta persona vería los pedidos de aquella.
   */
  const r = await comoServicio<{ id: string | null }>(
    db,
    `select link_customer_account('${TIENDA_A}', '${ELIAS}', 'ana@compra.test') as id`,
  );
  assert.equal(r[0]!.id, null, 'le entregó a Elías la ficha de Ana');

  const ve = await como<{ n: number }>(db, ELIAS, 'select count(*)::int as n from orders');
  assert.equal(ve[0]!.n, 0, 'Elías terminó viendo pedidos ajenos');
});

test('`link_customer_account` le crea la ficha a quien nunca compró', async () => {
  const r = await comoServicio<{ id: string | null }>(
    db,
    `select link_customer_account('${TIENDA_A}', '${FRAN}', 'FRAN@Compra.Test') as id`,
  );
  assert.ok(r[0]!.id, 'no creó la ficha, así que la cuenta no existiría');

  // En minúsculas: `customers` es único por (tienda, email) y `create_order`
  // guarda así. Con mayúsculas, la primera compra crearía una ficha aparte.
  const ficha = await comoServicio<{ email: string; name: string }>(
    db,
    `select email, name from customers where id = '${r[0]!.id}'`,
  );
  assert.equal(ficha[0]!.email, 'fran@compra.test');
  assert.equal(ficha[0]!.name, '', 'el nombre lo llena la primera compra, no esto');
});

test('sólo la secret key puede vincular', async () => {
  // Si `authenticated` pudiera llamarla, cualquiera se colgaría de la ficha de
  // otro pasando su email: es la función que decide de quién son los pedidos.
  const r = await intentar(
    db,
    ELIAS,
    `select link_customer_account('${TIENDA_A}', '${ELIAS}', 'ana@compra.test')`,
  );
  assert.equal(r.ok, false, 'un usuario autenticado puede vincularse a la ficha que quiera');
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
  //
  // El id va como literal y no por subconsulta: ver `fichaDe`.
  const deBeto = await fichaDe(BETO);
  const ajena = await intentar(
    db,
    ANA,
    `insert into customer_addresses (tenant_id, store_id, customer_id, address)
     values ('${ORG_A}', '${TIENDA_A}', '${deBeto}', '{"street":"Casa de Beto"}'::jsonb)`,
  );
  assert.equal(ajena.ok, false, 'Ana guardó una dirección colgada de la cuenta de Beto');
});

// --- La wishlist -------------------------------------------------------------

test('un comprador guarda un producto y lo vuelve a ver', async () => {
  const guardado = await intentar(
    db,
    ANA,
    `insert into wishlist_items (tenant_id, store_id, customer_id, product_id)
     select '${ORG_A}', '${TIENDA_A}', app.current_customer('${TIENDA_A}'), '${PRODUCTO_A}'`,
  );
  assert.ok(guardado.ok, `Ana no pudo guardar un producto: ${guardado.error}`);

  // Persistido aparte, porque `intentar` hace rollback: lo que se comprueba acá
  // es la lectura, no la escritura de arriba.
  await comoServicio(
    db,
    `insert into wishlist_items (tenant_id, store_id, customer_id, product_id)
     select '${ORG_A}', '${TIENDA_A}', ca.customer_id, '${PRODUCTO_A}'
     from customer_accounts ca where ca.user_id = '${ANA}'
     on conflict do nothing`,
  );

  const suyos = await como<{ product_id: string }>(
    db,
    ANA,
    'select product_id from wishlist_items',
  );
  assert.deepEqual(
    suyos.map((f) => f.product_id),
    [PRODUCTO_A],
  );
});

test('guardar dos veces el mismo producto no lo duplica', async () => {
  /*
   * Es lo que hace la fusión idempotente por construcción: al entrar, la
   * wishlist de `localStorage` se vuelca con un `on conflict do nothing`, así
   * que volcar dos veces —o volcar algo que ya estaba— no duplica nada y no hay
   * lógica de «¿ya lo tenía?» que escribir ni que equivocar.
   */
  await comoServicio(
    db,
    `insert into wishlist_items (tenant_id, store_id, customer_id, product_id)
     select '${ORG_A}', '${TIENDA_A}', ca.customer_id, '${PRODUCTO_A}'
     from customer_accounts ca where ca.user_id = '${ANA}'
     on conflict do nothing`,
  );

  const n = await como<{ n: number }>(db, ANA, 'select count(*)::int as n from wishlist_items');
  assert.equal(n[0]!.n, 1);
});

test('un comprador no ve ni borra la wishlist de otro', async () => {
  // Beto compra en la misma tienda que Ana: el caso que se rompe solo si alguien
  // acota por tienda en vez de por cuenta.
  const deBeto = await como<{ n: number }>(
    db,
    BETO,
    'select count(*)::int as n from wishlist_items',
  );
  assert.equal(deBeto[0]!.n, 0, 'Beto ve lo que guardó Ana');

  const borrado = await intentar(db, BETO, 'delete from wishlist_items');
  assert.equal(borrado.filas, 0, 'Beto borró un guardado de Ana');
});

test('no se puede guardar colgado de la cuenta de otro', async () => {
  // Sin el `with check` de la política, `using` solo deja pasar esto.
  /*
   * `PRODUCTO_A2` y no `PRODUCTO_A`, y es el segundo falso verde que encontró el
   * mismo sabotaje: con el producto que otro caso ya había guardado, lo que
   * rechazaba la fila era el `unique (store_id, customer_id, product_id)` y no
   * la política. El caso pasaba con `with check (true)`.
   */
  const deAna = await fichaDe(ANA);
  const ajena = await intentar(
    db,
    BETO,
    `insert into wishlist_items (tenant_id, store_id, customer_id, product_id)
     values ('${ORG_A}', '${TIENDA_A}', '${deAna}', '${PRODUCTO_A2}')`,
  );
  assert.equal(ajena.ok, false, 'Beto guardó un producto en la wishlist de Ana');
});

test('no se puede guardar el producto de otro comercio', async () => {
  /*
   * Dos defensas distintas y las dos tienen que estar: la política acota la
   * cuenta, y la clave foránea compuesta `(product_id, tenant_id)` acota el
   * producto. Sin la segunda, una cuenta legítima podría guardar el catálogo de
   * otro comercio — y el `using` de la política no se enteraría.
   */
  const ajeno = await intentar(
    db,
    ANA,
    `insert into wishlist_items (tenant_id, store_id, customer_id, product_id)
     select '${ORG_A}', '${TIENDA_A}', app.current_customer('${TIENDA_A}'), '${PRODUCTO_B}'`,
  );
  assert.equal(ajeno.ok, false, 'Ana guardó un producto del comercio B');
});

test('la wishlist es del comprador y el staff no la toca', async () => {
  // El dueño del comercio ve todos los pedidos de su tienda, pero la wishlist no
  // tiene política de staff: es de quien la escribió y de nadie más.
  const delDueno = await como<{ n: number }>(
    db,
    DUENO_A,
    'select count(*)::int as n from wishlist_items',
  );
  assert.equal(delDueno[0]!.n, 0, 'el dueño de A ve lo que guardaron sus clientes');
});

// --- El vínculo entre sesión y persona ---------------------------------------

test('`session_identities` no está al alcance de nadie autenticado', async () => {
  /*
   * Es el mapa de qué sesión anónima resultó ser qué cliente, y la promesa del
   * texto de privacidad es que lo que mirás no se cruza con tu cuenta. La
   * escribe y la lee sólo la secret key del storefront; dársela al Admin sería
   * darle a un operador el historial de navegación de cada cliente, y esa
   * decisión no se tomó.
   */
  for (const usuario of [null, ANA, DUENO_A]) {
    const lectura = await intentar(db, usuario, 'select * from session_identities');
    assert.equal(lectura.filas, 0, `${usuario ?? 'anon'} leyó session_identities`);

    const escritura = await intentar(
      db,
      usuario,
      `insert into session_identities (session_id, tenant_id, store_id, customer_id)
       values (gen_random_uuid(), '${ORG_A}', '${TIENDA_A}', '${PRODUCTO_A}')`,
    );
    assert.equal(escritura.ok, false, `${usuario ?? 'anon'} escribió session_identities`);
  }
});

// --- Y el comercio sigue viendo lo suyo --------------------------------------

test('el staff del comercio sigue viendo los pedidos de su tienda', async () => {
  // Las políticas de comprador se **suman** a las del staff: dos `for select`
  // sobre la misma tabla se combinan con OR. Si alguien las reemplazara en vez
  // de agregarlas, el Admin se quedaría sin pedidos y esto lo caza.
  const delDueno = await como<{ n: number }>(db, DUENO_A, 'select count(*)::int as n from orders');

  // Contra lo que hay de verdad y no contra un número escrito: cualquier caso
  // que agregue una compra a la tienda A movería un literal, y el test pasaría a
  // fallar por el motivo equivocado.
  const deLaTienda = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from orders where store_id = '${TIENDA_A}'`,
  );

  assert.equal(
    delDueno[0]!.n,
    deLaTienda[0]!.n,
    'el dueño de A dejó de ver todos los pedidos de su tienda',
  );
  assert.ok(deLaTienda[0]!.n >= 2, 'el seed dejó menos de dos pedidos: el caso no prueba nada');
});
