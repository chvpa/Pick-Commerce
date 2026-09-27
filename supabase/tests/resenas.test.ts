import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, comoServicio, intentar } from './harness.ts';

/**
 * Reseñas verificadas contra la compra (ADR-140).
 *
 * Lo que se prueba es la única cosa que le da valor a una estrella: **que no la
 * pueda escribir cualquiera**. Tres formas de colarse, y las tres tienen su caso:
 * sin haber comprado, con el pedido todavía sin entregar, y colgado de la ficha de
 * otro comprador. Más la que no es de seguridad y arruinaría el promedio igual:
 * dos reseñas de la misma persona sobre el mismo producto.
 *
 * Y una que es de contrato: el Admin **no** puede editar el texto ni la estrella,
 * porque poder corregir una reseña es poder escribirla.
 */

const ORG = 'e1000000-0000-4000-8000-000000000000';
const TIENDA = 'e2000000-0000-4000-8000-000000000000';
const SUCURSAL = 'e3000000-0000-4000-8000-000000000000';
const PRODUCTO = 'e4000000-0000-4000-8000-000000000001';
const OTRO_PRODUCTO = 'e4000000-0000-4000-8000-000000000002';
const VARIANTE = 'e5000000-0000-4000-8000-000000000001';
const OTRA_VARIANTE = 'e5000000-0000-4000-8000-000000000002';

/** Ana compró y recibió; Beto compró y no le llegó; Caro nunca compró. */
const ANA = 'e6000000-0000-4000-8000-000000000001';
const BETO = 'e6000000-0000-4000-8000-000000000002';
const CARO = 'e6000000-0000-4000-8000-000000000003';
const DUENO = 'e6000000-0000-4000-8000-00000000000d';

let db: PGlite;
const pedidos = new Map<string, string>();

async function comprar(email: string, variante: string): Promise<string> {
  const filas = await comoServicio<{ j: { order?: { id: string } } }>(
    db,
    `select create_order('${TIENDA}'::uuid, gen_random_uuid(),
       '{"customer":{"name":"${email}","email":"${email}","phone":"0981123456"},
         "address":{"street":"Calle 1","city":"Asuncion"},
         "paymentMethod":"bank_transfer",
         "lines":[{"variantId":"${variante}","quantity":1}]}'::jsonb) as j`,
  );
  const id = filas[0]!.j.order?.id;
  assert.ok(id, `no se pudo comprar para ${email}`);
  return id;
}

async function vincular(user: string, email: string): Promise<void> {
  await comoServicio(
    db,
    `insert into customer_accounts (user_id, tenant_id, store_id, customer_id)
     select '${user}', '${ORG}', '${TIENDA}', c.id
     from customers c where c.store_id = '${TIENDA}' and c.email = '${email}'`,
  );
}

/**
 * La ficha del cliente, leída con la secret key y puesta como literal.
 *
 * Mismo motivo que en `cuentas-de-comprador.test.ts`: una subconsulta a
 * `customer_accounts` desde la sesión de otro devuelve cero filas por RLS, el
 * insert no inserta nada y el caso pasaría aunque la política no existiera.
 */
/** Deja la tabla vacía: `comoServicio` confirma, así que una corrida a medias deja filas. */
async function limpiar(): Promise<void> {
  await comoServicio(db, `delete from product_reviews where store_id = '${TIENDA}'`);
}

async function fichaDe(user: string): Promise<string> {
  const r = await comoServicio<{ customer_id: string }>(
    db,
    `select customer_id from customer_accounts where user_id = '${user}'`,
  );
  assert.ok(r[0], `${user} no tiene cuenta`);
  return r[0].customer_id;
}

function inserta(
  cliente: string,
  pedido: string,
  producto: string,
  rating = 5,
  body = 'Anda bien.',
) {
  return `insert into product_reviews (tenant_id, store_id, product_id, customer_id, order_id, rating, body)
          values ('${ORG}', '${TIENDA}', '${producto}', '${cliente}', '${pedido}', ${rating}, '${body}')`;
}

before(async () => {
  db = await baseDePrueba();

  await db.exec(`
    insert into auth.users (id, email) values
      ('${ANA}', 'ana@r.test'), ('${BETO}', 'beto@r.test'),
      ('${CARO}', 'caro@r.test'), ('${DUENO}', 'dueno@r.test');

    insert into organizations (id, name, slug) values ('${ORG}', 'Reseñas', 'resenas');
    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${ORG}', 'Tienda', 'principal', 'r.test', 'PYG');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${ORG}', '${TIENDA}', 'Central');
    insert into memberships (tenant_id, user_id, role) values ('${ORG}', '${DUENO}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${PRODUCTO}', '${ORG}', '${TIENDA}', 'p1', 'Producto reseñado', 'active'),
      ('${OTRO_PRODUCTO}', '${ORG}', '${TIENDA}', 'p2', 'Producto sin comprar', 'active');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position) values
      ('${VARIANTE}', '${ORG}', '${PRODUCTO}', 'SKU-1', 'U', 100000, 'PYG', 0),
      ('${OTRA_VARIANTE}', '${ORG}', '${OTRO_PRODUCTO}', 'SKU-2', 'U', 100000, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${ORG}', '${VARIANTE}', '${SUCURSAL}', 100),
      ('${ORG}', '${OTRA_VARIANTE}', '${SUCURSAL}', 100);
  `);

  pedidos.set('ana', await comprar('ana@r.test', VARIANTE));
  pedidos.set('beto', await comprar('beto@r.test', VARIANTE));

  await vincular(ANA, 'ana@r.test');
  await vincular(BETO, 'beto@r.test');

  // Caro tiene cuenta y ninguna compra: es el caso de quien entra y quiere opinar.
  await comoServicio(
    db,
    `insert into customers (tenant_id, store_id, name, email, phone)
     values ('${ORG}', '${TIENDA}', 'Caro', 'caro@r.test', '0981000000')`,
  );
  await vincular(CARO, 'caro@r.test');

  // Sólo el pedido de Ana llega. El de Beto se queda en el camino.
  await comoServicio(
    db,
    `update orders set status = 'delivered' where id = '${pedidos.get('ana')}'`,
  );
});

after(async () => {
  await db.close();
});

test('quien compró y recibió puede reseñar', async () => {
  await limpiar();
  const r = await intentar(db, ANA, inserta(await fichaDe(ANA), pedidos.get('ana')!, PRODUCTO));
  assert.ok(r.ok, r.error);
  assert.equal(r.filas, 1);
});

test('con el pedido sin entregar todavía no se puede', async () => {
  // No es un detalle de flujo: opinar de algo que no llegó es opinar de la espera.
  const r = await intentar(db, BETO, inserta(await fichaDe(BETO), pedidos.get('beto')!, PRODUCTO));
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /row-level security/);
});

test('quien no compró no puede reseñar', async () => {
  const r = await intentar(db, CARO, inserta(await fichaDe(CARO), pedidos.get('ana')!, PRODUCTO));
  assert.equal(r.ok, false);
});

test('un producto que no estaba en el pedido tampoco', async () => {
  // El pedido de Ana existe y está entregado, pero es de otro producto.
  const r = await intentar(
    db,
    ANA,
    inserta(await fichaDe(ANA), pedidos.get('ana')!, OTRO_PRODUCTO),
  );
  assert.equal(r.ok, false);
});

test('no se puede reseñar colgado de la ficha de otro', async () => {
  const r = await intentar(db, CARO, inserta(await fichaDe(ANA), pedidos.get('ana')!, PRODUCTO));
  assert.equal(r.ok, false);
});

test('la reseña entra pendiente, y quien escribe no elige el estado', async () => {
  const cliente = await fichaDe(ANA);
  const conEstado = `${inserta(cliente, pedidos.get('ana')!, PRODUCTO).slice(0, -1)}`;
  const r = await intentar(
    db,
    ANA,
    `insert into product_reviews (tenant_id, store_id, product_id, customer_id, order_id, rating, status)
     values ('${ORG}', '${TIENDA}', '${PRODUCTO}', '${cliente}', '${pedidos.get('ana')}', 5, 'published')`,
  );
  assert.equal(r.ok, false, 'una reseña no puede nacer publicada');
  assert.ok(conEstado.length > 0);
});

test('una sola reseña por persona y por producto', async () => {
  await limpiar();
  const cliente = await fichaDe(ANA);
  await comoServicio(db, inserta(cliente, pedidos.get('ana')!, PRODUCTO, 5, 'La primera.'));

  const r = await intentar(
    db,
    ANA,
    inserta(cliente, pedidos.get('ana')!, PRODUCTO, 1, 'Otra vez.'),
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /duplicate key|unique/i);

  await limpiar();
});

test('la vitrina sólo muestra las publicadas, con promedio y sin nombres', async () => {
  await limpiar();
  const cliente = await fichaDe(ANA);
  const otro = await fichaDe(BETO);
  await comoServicio(db, inserta(cliente, pedidos.get('ana')!, PRODUCTO, 4, 'Buena.'));
  await comoServicio(
    db,
    `insert into product_reviews (tenant_id, store_id, product_id, customer_id, order_id, rating, body, status)
     values ('${ORG}', '${TIENDA}', '${PRODUCTO}', '${otro}', '${pedidos.get('beto')}', 2, 'No me gustó.', 'pending')`,
  );

  const [{ j }] = await comoServicio<{
    j: {
      total: number;
      promedio: string | null;
      items: { rating: number; body: string; inicial: string | null }[];
    };
  }>(db, `select product_reviews_publicas('${TIENDA}'::uuid, '${PRODUCTO}'::uuid) as j`);

  // La pendiente no está: ni en el total, ni en el promedio, ni en la lista.
  assert.equal(j.total, 0);
  assert.equal(j.items.length, 0);

  await comoServicio(
    db,
    `update product_reviews set status = 'published' where customer_id = '${cliente}'`,
  );

  const [{ j: publicada }] = await comoServicio<{
    j: { total: number; promedio: string; items: { inicial: string | null; body: string }[] };
  }>(db, `select product_reviews_publicas('${TIENDA}'::uuid, '${PRODUCTO}'::uuid) as j`);

  assert.equal(publicada.total, 1);
  assert.equal(Number(publicada.promedio), 4);
  assert.equal(publicada.items.length, 1);
  assert.equal(publicada.items[0]!.body, 'Buena.');
  // La inicial, nunca el nombre: nadie aceptó publicarlo al comprar.
  assert.equal(publicada.items[0]!.inicial, 'A');
  assert.doesNotMatch(JSON.stringify(publicada), /ana@r\.test/);

  await limpiar();
});

test('el Admin publica, y no puede tocar el texto ni la estrella', async () => {
  await limpiar();
  const cliente = await fichaDe(ANA);
  const [{ id }] = await comoServicio<{ id: string }>(
    db,
    `${inserta(cliente, pedidos.get('ana')!, PRODUCTO, 3, 'Va bien.')} returning id`,
  );

  // `comoAdmin` confirma la transacción: se quiere ver el efecto del cambio.
  const cuantas = await comoAdmin<{ n: number }>(
    db,
    DUENO,
    `select admin_moderate_reviews('${TIENDA}'::uuid, array['${id}']::uuid[], 'published') as n`,
  );
  assert.equal(cuantas[0]!.n, 1);

  const [{ status }] = await comoServicio<{ status: string }>(
    db,
    `select status from product_reviews where id = '${id}'`,
  );
  assert.equal(status, 'published');

  // Y lo que no se puede: no hay `update` concedido sobre la tabla.
  const pisar = await intentar(
    db,
    DUENO,
    `update product_reviews set body = 'Otra cosa', rating = 5 where id = '${id}'`,
  );
  assert.equal(pisar.ok, false, 'el texto de una reseña no se edita');

  await limpiar();
});

test('la cola del Admin no le dice nada a un comprador', async () => {
  const filas = await como<{ j: { total: number } }>(
    db,
    ANA,
    `select admin_product_reviews('${TIENDA}'::uuid) as j`,
  );
  // `definer` con el filtro de membresía escrito a mano: un comprador no es staff.
  assert.equal(filas[0]!.j.total, 0);
});
