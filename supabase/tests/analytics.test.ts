import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio, intentar } from './harness.ts';

/**
 * Los eventos del storefront: aislamiento, deduplicación y la conciliación.
 *
 * Lo que más importa es **la conciliación con `orders`**, que es el Definition of
 * Done de la fase. La conversión no cuenta `checkout_completed`: cuenta pedidos
 * no cancelados. Acá se monta el escenario que distingue las dos cosas —un
 * pedido con dos eventos, un evento sin pedido, un pedido cancelado— y se exige
 * el número que sale de `orders`.
 *
 * Los eventos se insertan directo y no por el storefront: lo que se prueba es
 * cómo se agregan, y eso exige sesiones y fechas puestas a mano.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'a5000000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'bb000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b5000000-0000-4000-8000-000000000000';

const DUENO = 'f1000000-0000-4000-8000-000000000000';
const AJENO_USER = 'f1000000-0000-4000-8000-000000000002';

/** Tres sesiones que compran, miran y abandonan, más una del otro comercio. */
const S_COMPRA = '11000000-0000-4000-8000-000000000000';
const S_ABANDONA = '11000000-0000-4000-8000-000000000001';
const S_MIRA = '11000000-0000-4000-8000-000000000002';
const S_AJENA = '11000000-0000-4000-8000-000000000003';

const O_COMPRA = '01000000-0000-4000-8000-000000000000';
const O_CANCELADO = '01000000-0000-4000-8000-000000000001';

const VENTANA = `now() - interval '7 days', now() + interval '1 hour'`;

let db: PGlite;

interface Paso {
  readonly sesiones: number;
  readonly tasa: number;
}

interface Resumen {
  readonly sesiones: number;
  readonly medidoDesde: string | null;
  readonly vistas: number;
  readonly vistasDeProducto: number;
  readonly agregaronAlCarrito: Paso;
  readonly empezaronElCheckout: Paso;
  readonly convirtieron: Paso;
  readonly abandonaron: number;
  readonly terminos: readonly { termino: string; busquedas: number; sinResultados: number }[];
}

async function resumen(usuario = DUENO, tienda = TIENDA): Promise<Resumen> {
  const filas = await como<{ j: Resumen }>(
    db,
    usuario,
    `select admin_analytics('${tienda}'::uuid, ${VENTANA}) as j`,
  );
  return filas[0]!.j;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@a.test'), ('${AJENO_USER}', 'ajeno@b.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta', 'a.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tb', 'b.test', 'PYG');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${OTRO_TENANT}', '${AJENO_USER}', 'owner');

    -- Un pedido que se concretó y uno cancelado. El cancelado tiene su evento de
    -- compra igual: el checkout lo emitió antes de que nadie lo cancelara, que es
    -- exactamente el caso donde los eventos y la facturación se separan.
    insert into orders (
      id, tenant_id, store_id, number, idempotency_key, status, payment_method,
      customer, address, total_amount, currency, created_at
    ) values
      ('${O_COMPRA}', '${TENANT}', '${TIENDA}', 1001, gen_random_uuid(), 'delivered', 'bank_transfer',
       '{"name":"Ana","email":"ana@x.test"}', '{"street":"x","city":"y"}',
       300000, 'PYG', now() - interval '2 days'),
      ('${O_CANCELADO}', '${TENANT}', '${TIENDA}', 1002, gen_random_uuid(), 'cancelled', 'bank_transfer',
       '{"name":"Beto","email":"beto@x.test"}', '{"street":"x","city":"y"}',
       900000, 'PYG', now() - interval '1 day');

    insert into store_events (tenant_id, store_id, session_id, type, path, data, dedupe_key, occurred_at) values
      -- La sesión que compró: recorrido completo.
      ('${TENANT}', '${TIENDA}', '${S_COMPRA}', 'page_view', '/', '{}', null, now() - interval '2 days'),
      ('${TENANT}', '${TIENDA}', '${S_COMPRA}', 'page_view', '/catalogo', '{}', null, now() - interval '2 days'),
      ('${TENANT}', '${TIENDA}', '${S_COMPRA}', 'product_view', '/productos/remera', '{"handle":"remera"}', null, now() - interval '2 days'),
      ('${TENANT}', '${TIENDA}', '${S_COMPRA}', 'add_to_cart', '/api/cart/validate', '{}', null, now() - interval '2 days'),
      ('${TENANT}', '${TIENDA}', '${S_COMPRA}', 'begin_checkout', '/checkout', '{}', null, now() - interval '2 days'),
      ('${TENANT}', '${TIENDA}', '${S_COMPRA}', 'checkout_completed', '/api/checkout', '{"orderId":"${O_COMPRA}"}', '${O_COMPRA}', now() - interval '2 days'),

      -- La que abandonó: llegó al checkout y no compró.
      ('${TENANT}', '${TIENDA}', '${S_ABANDONA}', 'page_view', '/catalogo', '{}', null, now() - interval '1 day'),
      ('${TENANT}', '${TIENDA}', '${S_ABANDONA}', 'add_to_cart', '/api/cart/validate', '{}', null, now() - interval '1 day'),
      ('${TENANT}', '${TIENDA}', '${S_ABANDONA}', 'begin_checkout', '/checkout', '{}', null, now() - interval '1 day'),

      -- La que sólo miró y buscó.
      ('${TENANT}', '${TIENDA}', '${S_MIRA}', 'page_view', '/catalogo', '{}', null, now() - interval '1 day'),
      ('${TENANT}', '${TIENDA}', '${S_MIRA}', 'search', '/catalogo', '{"term":"campera"}', '${S_MIRA}:campera', now() - interval '1 day'),
      ('${TENANT}', '${TIENDA}', '${S_MIRA}', 'search', '/catalogo', '{"term":"paraguas"}', '${S_MIRA}:paraguas', now() - interval '1 day'),
      ('${TENANT}', '${TIENDA}', '${S_MIRA}', 'search_no_results', '/catalogo', '{"term":"paraguas"}', '${S_MIRA}:paraguas', now() - interval '1 day'),

      -- Fuera de la ventana: no tiene que contar en ningún lado.
      ('${TENANT}', '${TIENDA}', '${S_MIRA}', 'page_view', '/', '{}', null, now() - interval '40 days'),

      -- Del otro comercio.
      ('${OTRO_TENANT}', '${OTRA_TIENDA}', '${S_AJENA}', 'page_view', '/', '{}', null, now() - interval '1 day'),
      ('${OTRO_TENANT}', '${OTRA_TIENDA}', '${S_AJENA}', 'checkout_completed', '/api/checkout', '{}', null, now() - interval '1 day');
  `);
});

after(async () => {
  await db.close();
});

// --- Aislamiento -------------------------------------------------------------

test('un comercio no ve los eventos de otro', async () => {
  /*
   * Se afirma sobre **qué sesiones** ve cada uno y no sobre cuántas filas hay:
   * un total exacto ataría este caso al orden en que corran los demás, y hay dos
   * que insertan.
   */
  const mias = await como<{ session_id: string }>(
    db,
    DUENO,
    `select distinct session_id from store_events order by session_id`,
  );
  assert.deepEqual(
    mias.map((f) => f.session_id),
    [S_COMPRA, S_ABANDONA, S_MIRA],
  );

  const ajenas = await como<{ session_id: string }>(
    db,
    AJENO_USER,
    `select distinct session_id from store_events`,
  );
  assert.deepEqual(
    ajenas.map((f) => f.session_id),
    [S_AJENA],
  );
});

test('el resumen de una tienda ajena sale en cero, no en error', async () => {
  // RLS no devuelve filas, así que no hacen falta guardas en la función.
  const r = await resumen(AJENO_USER, TIENDA);
  assert.equal(r.sesiones, 0);
  assert.equal(r.convirtieron.sesiones, 0);
  assert.deepEqual(r.terminos, []);
});

test('el rol del browser ni siquiera puede consultar la tabla', async () => {
  /*
   * No devuelve cero filas: **falla**. El `revoke all from anon` corta antes que
   * RLS, y eso es mejor que una lista vacía — una lista vacía se confunde con
   * «todavía no hay eventos» y esconde un permiso mal puesto.
   */
  const r = await intentar(db, null, `select count(*) from store_events`);
  assert.equal(r.ok, false);
});

test('nadie autenticado puede fabricar un evento', async () => {
  /*
   * Si el panel se pudiera escribir desde el Admin, la conversión dejaría de ser
   * una medición. La única que inserta es la secret key del storefront.
   */
  const r = await intentar(
    db,
    DUENO,
    `insert into store_events (tenant_id, store_id, session_id, type)
     values ('${TENANT}', '${TIENDA}', '${S_MIRA}', 'page_view')`,
  );
  assert.equal(r.ok, false);
});

// --- Deduplicación -----------------------------------------------------------

test('el mismo pedido no se cuenta dos veces aunque el evento llegue repetido', async () => {
  /*
   * Reintentar el checkout con la misma clave de idempotencia devuelve el pedido
   * que ya existe y responde 201 igual. El índice único parcial es lo que hace
   * que eso no sea una segunda conversión.
   */
  await comoServicio(
    db,
    `insert into store_events (tenant_id, store_id, session_id, type, data, dedupe_key)
     values ('${TENANT}', '${TIENDA}', '${S_COMPRA}', 'checkout_completed',
             '{"orderId":"${O_COMPRA}"}', '${O_COMPRA}')
     on conflict do nothing`,
  );

  const filas = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from store_events
     where type = 'checkout_completed' and dedupe_key = '${O_COMPRA}'`,
  );
  assert.equal(filas[0]!.n, 1);
});

test('lo que se repite de verdad sí se guarda dos veces', async () => {
  // Dos vistas son dos vistas. Sin clave, el índice parcial no las agrupa.
  const antes = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from store_events where type = 'page_view'`,
  );
  /*
   * Fuera de la ventana a propósito: este test comprueba el índice, no el
   * resumen, y una fila de más dentro del rango dejaría los conteos de los otros
   * casos dependiendo del orden en que corran.
   */
  await comoServicio(
    db,
    `insert into store_events (tenant_id, store_id, session_id, type, path, occurred_at)
     values ('${TENANT}', '${TIENDA}', '${S_MIRA}', 'page_view', '/', now() - interval '90 days')
     on conflict do nothing`,
  );
  const despues = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from store_events where type = 'page_view'`,
  );
  assert.equal(despues[0]!.n, antes[0]!.n + 1);
});

// --- El resumen --------------------------------------------------------------

test('las sesiones se cuentan una vez, no por petición', async () => {
  const r = await resumen();
  // Tres sesiones del período. La cuarta es del otro comercio.
  assert.equal(r.sesiones, 3);
});

test('lo que quedó fuera de la ventana no cuenta', async () => {
  const r = await resumen();
  // Cuatro `page_view` dentro del rango; el de hace cuarenta días no.
  assert.equal(r.vistas, 4);
  assert.equal(r.vistasDeProducto, 1);
});

test('cada paso del embudo cuenta sesiones distintas', async () => {
  const r = await resumen();
  assert.equal(r.agregaronAlCarrito.sesiones, 2);
  assert.equal(r.empezaronElCheckout.sesiones, 2);
  // 2 de 3.
  assert.equal(r.agregaronAlCarrito.tasa, 0.6667);
});

test('el abandono son las sesiones que llegaron al checkout y no compraron', async () => {
  const r = await resumen();
  assert.equal(r.abandonaron, 1);
});

// --- La conciliación, que es el Definition of Done ---------------------------

test('la conversión sale de los pedidos, no de los eventos', async () => {
  /*
   * Este es el test de la fase.
   *
   * En el escenario hay **dos** pedidos y **un** evento `checkout_completed`
   * dentro de la ventana. Uno de esos pedidos está cancelado, así que la
   * respuesta correcta es 1 — y coincide con el evento por casualidad.
   *
   * Lo que lo hace una prueba y no una coincidencia es el caso de al lado:
   * abajo se agrega un pedido sin evento, y el número tiene que subir.
   */
  const r = await resumen();
  assert.equal(r.convirtieron.sesiones, 1);
  assert.equal(r.convirtieron.tasa, 0.3333);
});

test('un pedido sin evento cuenta igual, porque orders es la fuente de verdad', async () => {
  /*
   * Pasa de verdad: los eventos van con `waitUntil` y pueden perderse —el isolate
   * muere, la base no responde—. Si la conversión contara `checkout_completed`,
   * una escritura perdida sería una venta que el panel no ve, y el operador
   * conciliando contra sus pedidos encontraría la diferencia antes que nosotros.
   *
   * Con el **sabotaje** al revés: cambiar el CTE `pedidos` por un conteo de
   * eventos deja este test en rojo, que es lo único que prueba que la
   * conciliación existe.
   */
  await comoServicio(
    db,
    `insert into orders (
       tenant_id, store_id, number, idempotency_key, status, payment_method,
       customer, address, total_amount, currency, created_at
     ) values (
       '${TENANT}', '${TIENDA}', 1003, gen_random_uuid(), 'received', 'bank_transfer',
       '{"name":"Sin evento","email":"sin@x.test"}', '{"street":"x","city":"y"}',
       50000, 'PYG', now() - interval '1 day'
     )`,
  );

  const r = await resumen();
  assert.equal(r.convirtieron.sesiones, 2, 'el pedido sin evento tiene que contar');

  await comoServicio(db, `delete from orders where number = 1003 and store_id = '${TIENDA}'`);
});

test('los pedidos que informa son los mismos que informa el resumen de ventas', async () => {
  // Las dos pantallas del Admin no pueden decir números distintos sobre la misma
  // ventana: es lo primero que alguien va a comparar.
  const analytics = await resumen();
  const ventas = await como<{ j: { orderCount: number } }>(
    db,
    DUENO,
    `select admin_dashboard('${TIENDA}'::uuid, ${VENTANA}) as j`,
  );
  assert.equal(analytics.convirtieron.sesiones, ventas[0]!.j.orderCount);
});

test('un pedido anterior a la medición no infla la conversión', async () => {
  /*
   * El defecto que este acotado corrige, y que apareció mirando el panel y no el
   * código: decía «Compraron 6 · 600 %».
   *
   * `orders` viene de la Fase 5 y está lleno; `store_events` nace el día que se
   * activa analytics. Pedir «últimos 30 días» el primer día devolvía treinta días
   * de pedidos contra unas horas de sesiones. No era del entorno de prueba: es lo
   * que iba a ver toda tienda que lo activara.
   *
   * Acá el pedido es de hace cinco días, dentro de la ventana de siete, y el
   * primer evento es de hace dos. No tiene que contar.
   */
  const antes = await resumen();

  await comoServicio(
    db,
    `insert into orders (
       tenant_id, store_id, number, idempotency_key, status, payment_method,
       customer, address, total_amount, currency, created_at
     ) values (
       '${TENANT}', '${TIENDA}', 1009, gen_random_uuid(), 'delivered', 'bank_transfer',
       '{"name":"Antes de medir","email":"viejo@x.test"}', '{"street":"x","city":"y"}',
       400000, 'PYG', now() - interval '5 days'
     )`,
  );

  const despues = await resumen();
  assert.equal(
    despues.convirtieron.sesiones,
    antes.convirtieron.sesiones,
    'un pedido anterior al primer evento no puede sumar a la conversión',
  );

  // Y el resumen de ventas **sí** lo cuenta: son preguntas distintas, y por eso
  // la pantalla avisa cuando el período no está medido entero.
  const ventas = await como<{ j: { orderCount: number } }>(
    db,
    DUENO,
    `select admin_dashboard('${TIENDA}'::uuid, ${VENTANA}) as j`,
  );
  assert.equal(ventas[0]!.j.orderCount, despues.convirtieron.sesiones + 1);

  await comoServicio(db, `delete from orders where number = 1009 and store_id = '${TIENDA}'`);
});

test('el resumen declara desde cuándo hay medición', async () => {
  // Es lo que la pantalla usa para avisar. Sin este dato, el acotado sería una
  // corrección silenciosa y el número seguiría sin poder explicarse.
  const r = await resumen();
  assert.ok(r.medidoDesde, 'tiene que decir desde cuándo mide');
  assert.ok(
    new Date(r.medidoDesde).getTime() <= Date.now(),
    'la medición no puede empezar en el futuro',
  );
});

test('sin ningún evento no hay medición que declarar', async () => {
  const r = await resumen(AJENO_USER, TIENDA);
  assert.equal(r.medidoDesde, null);
  assert.equal(r.convirtieron.sesiones, 0);
});

// --- Búsquedas ---------------------------------------------------------------

test('los términos se agrupan y los que no encontraron nada se distinguen', async () => {
  const r = await resumen();
  assert.deepEqual(
    r.terminos.map((t) => [t.termino, t.busquedas, t.sinResultados]),
    [
      ['campera', 1, 0],
      ['paraguas', 1, 1],
    ],
  );
});
