import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { PESOS_DE_AFINIDAD, puntajeDeAfinidad } from '@pick/commerce-core';
import { baseDePrueba, comoServicio } from './harness.ts';

/**
 * Lo que se mira junto, lo que se está moviendo, y quién tiene el turno de
 * recalcularlo (ADR-127, v2 Fase 4).
 *
 * Tres cosas que sólo se pueden comprobar acá, con Postgres de verdad: que el
 * aislamiento entre comercios aguanta aunque el job esté mal escrito, que el
 * candado del recálculo deja pasar a uno solo, y que los topes existen. Las tres
 * fallan en silencio: una recomendación cruzada se ve como un producto raro, un
 * recálculo doble se ve como lentitud, y un tope que falta se ve recién con un
 * bot encima.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'bb000000-0000-4000-8000-000000000000';
const SUCURSAL = 'cc000000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'af000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'bf000000-0000-4000-8000-000000000000';

/** Productos de la tienda A: `p(0)`, `p(1)`… y el de la tienda B, `AJENO`. */
const p = (n: number) => `d1${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
const AJENO = 'df000000-0000-4000-8000-000000000000';
const PRODUCTOS = 4;

let db: PGlite;

/** Una vista de producto, atada a una visita. */
function vista(sesion: string, producto: string, haceDias = 0): string {
  return `insert into store_events (tenant_id, store_id, session_id, type, data, occurred_at)
          values ('${TENANT}', '${TIENDA}', '${sesion}', 'product_view',
                  '{"productId": "${producto}"}'::jsonb, now() - interval '${haceDias} days')`;
}

const sesion = (n: number) => `5e${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;

before(async () => {
  db = await baseDePrueba();

  await db.exec(`
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');
    insert into stores (id, tenant_id, name, slug) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tb');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');
  `);

  for (let i = 0; i < PRODUCTOS; i++) {
    await db.exec(
      `insert into products (id, tenant_id, store_id, handle, title, status)
       values ('${p(i)}', '${TENANT}', '${TIENDA}', 'p${i}', 'Producto ${i}', 'active')`,
    );
  }

  await db.exec(
    `insert into products (id, tenant_id, store_id, handle, title, status)
     values ('${AJENO}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'ajeno', 'Ajeno', 'active')`,
  );
});

after(async () => {
  await db.close();
});

/** Corre el recálculo como el servicio, sin ventana: siempre le toca. */
async function recalcular(tienda = TIENDA, cada = '0 seconds'): Promise<number> {
  const filas = await comoServicio<{ n: number }>(
    db,
    `select recompute_affinity('${tienda}'::uuid, interval '${cada}') as n`,
  );
  return filas[0]!.n;
}

async function afinidad(): Promise<Array<{ a: string; b: string; score: number }>> {
  return comoServicio(
    db,
    `select product_id as a, related_id as b, score::float8 as score
       from product_affinity order by product_id, score desc, related_id`,
  );
}

test('dos productos mirados en la misma visita quedan relacionados, con su puntaje', async () => {
  await db.exec(vista(sesion(1), p(0)));
  await db.exec(vista(sesion(1), p(1)));
  // La misma visita, el mismo producto otra vez: una sola señal, no dos.
  await db.exec(vista(sesion(1), p(0)));

  assert.equal(await recalcular(), 2, 'la relación tiene que quedar en los dos sentidos');

  const pares = await afinidad();
  assert.deepEqual(
    pares.map((x) => [x.a, x.b, x.score]),
    [
      [p(0), p(1), puntajeDeAfinidad(1, 0)],
      [p(1), p(0), puntajeDeAfinidad(1, 0)],
    ],
  );
});

test('una compra junta pesa más que una mirada junta, y los pesos son los del core', async () => {
  // p0–p2 se compran juntos una vez; p0–p1 se miraron juntos una vez.
  await db.exec(`
    insert into orders (id, tenant_id, store_id, number, idempotency_key, status,
                        payment_method, customer, address, total_amount, currency)
    values ('a0000000-0000-4000-8000-000000000000', '${TENANT}', '${TIENDA}', 1001,
            gen_random_uuid(), 'received', 'bank_transfer', '{}'::jsonb, '{}'::jsonb, 100, 'PYG');
  `);
  for (const [i, producto] of [p(0), p(2)].entries()) {
    await db.exec(`
      insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position)
        values ('e1${String(i).padStart(6, '0')}-0000-4000-8000-000000000000', '${TENANT}',
                '${producto}', 'SKU-${i}', 'Única', 100, 'PYG', 0);
      insert into order_items (tenant_id, order_id, variant_id, title, sku, unit_price,
                               currency, quantity, position)
        values ('${TENANT}', 'a0000000-0000-4000-8000-000000000000',
                'e1${String(i).padStart(6, '0')}-0000-4000-8000-000000000000',
                'Producto', 'SKU-${i}', 100, 'PYG', 1, ${i});
    `);
  }

  await recalcular();
  const pares = await afinidad();
  const deP0 = pares.filter((x) => x.a === p(0));

  assert.deepEqual(
    deP0.map((x) => [x.b, x.score]),
    [
      [p(2), puntajeDeAfinidad(0, 1)],
      [p(1), puntajeDeAfinidad(1, 0)],
    ],
    'lo comprado junto tiene que salir antes que lo mirado junto',
  );

  // Y el default del SQL es el peso del core: si alguien cambia uno solo, esto cae.
  const [fila] = await comoServicio<{ score: number }>(
    db,
    `select score::float8 as score from product_affinity
      where product_id = '${p(0)}' and related_id = '${p(2)}'`,
  );
  assert.equal(fila!.score, PESOS_DE_AFINIDAD.coCompra);
});

test('lo que no se vio ni se compró junto no aparece', async () => {
  const pares = await afinidad();
  assert.equal(
    pares.some((x) => x.a === p(3) || x.b === p(3)),
    false,
    'un producto sin ninguna señal entró a la tabla',
  );
});

test('una vista de hace más de treinta días ya no cuenta', async () => {
  await db.exec(vista(sesion(9), p(3), 40));
  await db.exec(vista(sesion(9), p(0), 40));
  await recalcular();

  const pares = await afinidad();
  assert.equal(
    pares.some((x) => x.a === p(3)),
    false,
    'la ventana de treinta días no se está aplicando',
  );
});

test('la tabla no cruza comercios, ni siquiera con eventos cruzados', async () => {
  /*
   * El evento nombra un producto **de otra tienda** dentro de la sesión de ésta.
   * Es el bug que un job mal escrito produce, y la defensa no es el `where`: son
   * las FK compuestas por `(id, tenant_id)` (ADR-063). Si el filtro se cayera, la
   * inserción fallaría en vez de recomendar el producto de otro comercio.
   */
  await db.exec(vista(sesion(2), p(0)));
  await db.exec(vista(sesion(2), AJENO));
  await recalcular();

  const pares = await afinidad();
  assert.equal(
    pares.some((x) => x.a === AJENO || x.b === AJENO),
    false,
    'una recomendación cruzó de comercio',
  );

  // Y la tienda B, que no tiene eventos propios, queda sin nada.
  await recalcular(OTRA_TIENDA);
  const [{ n }] = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from product_affinity where store_id = '${OTRA_TIENDA}'`,
  );
  assert.equal(n, 0);
});

test('sólo recalcula uno: el segundo que llega dentro de la ventana se va con las manos vacías', async () => {
  // Con la ventana real, el turno lo reclama el primero y el segundo no toca nada.
  assert.ok((await recalcular(TIENDA, '6 hours')) >= 0);
  const antes = await comoServicio<{ computed_at: string }>(
    db,
    `select computed_at from affinity_runs where store_id = '${TIENDA}'`,
  );

  assert.equal(await recalcular(TIENDA, '6 hours'), 0, 'dos isolates recalcularon a la vez');

  const despues = await comoServicio<{ computed_at: string }>(
    db,
    `select computed_at from affinity_runs where store_id = '${TIENDA}'`,
  );
  assert.deepEqual(despues, antes, 'el segundo reescribió igual');
});

test('una visita con doscientos productos no genera más pares que el tope', async () => {
  /*
   * Un bot que recorre el catálogo entero es una sola sesión con cientos de
   * vistas, y los pares crecen al cuadrado: 900 productos son 810.000 pares de
   * una sola visita. El tope de 50 por sesión es lo que lo acota, y el de 12
   * relacionados por producto lo que acota la tabla.
   */
  await db.exec(`
    insert into products (id, tenant_id, store_id, handle, title, status)
    select ('d9' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000000')::uuid,
           '${TENANT}', '${TIENDA}', 'bot-' || i, 'Bot ' || i, 'active'
    from generate_series(1, 200) i;
  `);
  await db.exec(`
    insert into store_events (tenant_id, store_id, session_id, type, data, occurred_at)
    select '${TENANT}', '${TIENDA}', '${sesion(3)}', 'product_view',
           jsonb_build_object('productId', 'd9' || lpad(i::text, 6, '0') || '-0000-4000-8000-000000000000'),
           now() - (i || ' seconds')::interval
    from generate_series(1, 200) i;
  `);

  await recalcular();

  const [{ n }] = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from product_affinity where store_id = '${TIENDA}'`,
  );
  // 50 productos por visita × 49 relacionados, topeados a 12 por producto.
  assert.ok(n <= 50 * 12 + 20, `la tabla creció sin tope: ${n} pares`);

  const [{ maximo }] = await comoServicio<{ maximo: number }>(
    db,
    `select max(c)::int as maximo from (
       select count(*) as c from product_affinity where store_id = '${TIENDA}' group by product_id
     ) x`,
  );
  assert.ok(maximo <= 12, `un producto quedó con ${maximo} relacionados`);
});

test('la tendencia sale de la semana, no de los treinta días', async () => {
  const [antiguo] = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from product_trending
      where store_id = '${TIENDA}' and product_id = '${p(3)}'`,
  );
  assert.equal(antiguo!.n, 0, 'un producto visto hace cuarenta días entró a tendencia');

  const [reciente] = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from product_trending
      where store_id = '${TIENDA}' and product_id = '${p(0)}'`,
  );
  assert.equal(reciente!.n, 1, 'un producto visto esta semana no entró a tendencia');
});

test('el recálculo y sus tablas no están al alcance del navegador', async () => {
  for (const rol of ['anon', 'authenticated']) {
    const [{ puede }] = await comoServicio<{ puede: boolean }>(
      db,
      `select has_function_privilege('${rol}', 'public.recompute_affinity(uuid, interval, numeric, numeric)', 'execute') as puede`,
    );
    assert.equal(puede, false, `${rol} puede disparar el recálculo`);

    for (const tabla of ['product_affinity', 'product_trending']) {
      const [{ lee }] = await comoServicio<{ lee: boolean }>(
        db,
        `select has_table_privilege('${rol}', '${tabla}', 'select') as lee`,
      );
      assert.equal(lee, false, `${rol} puede leer ${tabla}`);
    }
  }

  // `affinity_runs` sí la lee el Admin, y RLS la acota a su organización.
  const [{ lee }] = await comoServicio<{ lee: boolean }>(
    db,
    `select has_table_privilege('authenticated', 'affinity_runs', 'select') as lee`,
  );
  assert.equal(lee, true, 'el Admin no puede ver cuándo se recalculó');
});
