import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio } from './harness.ts';

/**
 * Si una sección de la portada sirvió: clics, pedidos e importe.
 *
 * Lo que se prueba acá es **la atribución**, que es donde un número equivocado
 * no rompe nada y se cree igual: contar de más un pedido que la sección no
 * trajo, o contar dos veces la misma línea porque alguien entró dos veces.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'bb000000-0000-4000-8000-000000000000';
const SUCURSAL = 'cc000000-0000-4000-8000-000000000000';
const DUENO = 'a1000000-0000-4000-8000-000000000000';

const COLECCION = 'c0000000-0000-4000-8000-000000000001';
const SECCION = '50000000-0000-4000-8000-000000000001';
const OTRA_SECCION = '50000000-0000-4000-8000-000000000002';

const p = (n: number) => `d1${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
const v = (n: number) => `e1${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;
const sesion = (n: number) => `5e${String(n).padStart(6, '0')}-0000-4000-8000-000000000000`;

interface Resultado {
  clicks: number;
  orders: number;
  revenue: number;
}

let db: PGlite;

/** Un click desde una sección, tal como lo anota el PDP al ver `?s=`. */
function click(ses: string, seccion: string, producto: string, haceMinutos = 10): string {
  return `insert into store_events (tenant_id, store_id, session_id, type, data, occurred_at)
          values ('${TENANT}', '${TIENDA}', '${ses}', 'section_click',
                  '{"sectionId": "${seccion}", "productId": "${producto}"}'::jsonb,
                  now() - interval '${haceMinutos} minutes')`;
}

/** Un pedido con una línea, y el evento que lo ata a la visita. */
async function comprar(
  ses: string,
  pedido: string,
  numero: number,
  producto: number,
  importe: number,
): Promise<void> {
  await db.exec(`
    insert into orders (id, tenant_id, store_id, number, idempotency_key, status,
                        payment_method, customer, address, total_amount, currency)
      values ('${pedido}', '${TENANT}', '${TIENDA}', ${numero}, gen_random_uuid(), 'received',
              'bank_transfer', '{}'::jsonb, '{}'::jsonb, ${importe}, 'PYG');
    insert into order_items (tenant_id, order_id, variant_id, title, sku, unit_price, currency,
                             quantity, position)
      values ('${TENANT}', '${pedido}', '${v(producto)}', 'Producto', 'SKU-${producto}',
              ${importe}, 'PYG', 1, 0);
    insert into store_events (tenant_id, store_id, session_id, type, data, occurred_at)
      values ('${TENANT}', '${TIENDA}', '${ses}', 'checkout_completed',
              '{"orderId": "${pedido}"}'::jsonb, now());
  `);
}

async function resultado(dias = 30): Promise<Record<string, Resultado>> {
  const filas = await comoServicio<{ j: Record<string, Resultado> }>(
    db,
    `select admin_section_performance('${TIENDA}'::uuid, ${dias}) as j`,
  );
  return filas[0]!.j;
}

before(async () => {
  db = await baseDePrueba();

  await db.exec(`
    insert into auth.users (id, email) values ('${DUENO}', 'dueno@x.test');
    insert into organizations (id, name, slug) values ('${TENANT}', 'Comercio', 'c');
    insert into stores (id, tenant_id, name, slug) values ('${TIENDA}', '${TENANT}', 'Tienda', 't');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');
    insert into memberships (tenant_id, user_id, role) values ('${TENANT}', '${DUENO}', 'owner');
    insert into collections (id, tenant_id, store_id, title, handle, published)
      values ('${COLECCION}', '${TENANT}', '${TIENDA}', 'Destacados', 'destacados', true);
    insert into home_sections (id, tenant_id, store_id, type, title, layout, collection_id,
                              position, published)
      values ('${SECCION}', '${TENANT}', '${TIENDA}', 'products', 'Destacados', 'slider',
              '${COLECCION}', 0, true),
             ('${OTRA_SECCION}', '${TENANT}', '${TIENDA}', 'products', 'Otros', 'slider',
              '${COLECCION}', 1, true);
  `);

  for (let i = 0; i < 2; i++) {
    await db.exec(`
      insert into products (id, tenant_id, store_id, handle, title, status)
        values ('${p(i)}', '${TENANT}', '${TIENDA}', 'p${i}', 'Producto ${i}', 'active');
      insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position)
        values ('${v(i)}', '${TENANT}', '${p(i)}', 'SKU-${i}', 'Única', 100, 'PYG', 0);
    `);
  }
});

after(async () => {
  await db.close();
});

test('una sección sin tráfico da ceros, no desaparece del tablero', async () => {
  const r = await resultado();
  assert.deepEqual(r[SECCION], { clicks: 0, orders: 0, revenue: 0 });
  assert.deepEqual(r[OTRA_SECCION], { clicks: 0, orders: 0, revenue: 0 });
});

test('un click cuenta, y la compra de esa visita se le atribuye con su importe', async () => {
  await db.exec(click(sesion(1), SECCION, p(0)));
  await comprar(sesion(1), 'a0000000-0000-4000-8000-000000000001', 1001, 0, 350);

  const r = await resultado();
  assert.deepEqual(r[SECCION], { clicks: 1, orders: 1, revenue: 350 });
});

test('entrar dos veces desde la misma sección no duplica la venta', async () => {
  /*
   * El click sí se cuenta dos veces —son dos entradas— pero la línea comprada es
   * una sola: sin el `distinct on`, la sección se atribuiría el doble de lo que
   * trajo, y un tablero que exagera es peor que uno que no existe.
   */
  await db.exec(click(sesion(1), SECCION, p(0), 5));

  const r = await resultado();
  assert.equal(r[SECCION]!.orders, 1, 'se contó dos veces el mismo pedido');
  assert.equal(r[SECCION]!.revenue, 350, 'se atribuyó el doble de lo que se vendió');
});

test('lo que se compró sin pasar por la sección no se le atribuye', async () => {
  await comprar(sesion(2), 'a0000000-0000-4000-8000-000000000002', 1002, 1, 900);

  const r = await resultado();
  assert.equal(r[SECCION]!.revenue, 350, 'la sección se llevó una venta que no trajo');
  assert.equal(r[OTRA_SECCION]!.orders, 0);
});

test('un pedido cancelado no le suma a nadie', async () => {
  await db.exec(click(sesion(3), OTRA_SECCION, p(1)));
  await comprar(sesion(3), 'a0000000-0000-4000-8000-000000000003', 1003, 1, 500);
  await db.exec(
    `update orders set status = 'cancelled' where id = 'a0000000-0000-4000-8000-000000000003'`,
  );

  const r = await resultado();
  assert.equal(r[OTRA_SECCION]!.clicks, 1, 'el click existió igual');
  assert.deepEqual([r[OTRA_SECCION]!.orders, r[OTRA_SECCION]!.revenue], [0, 0]);
});

test('comprar otro producto en la misma visita no es mérito de la sección', async () => {
  /*
   * La sección trajo a alguien a ver `p0`; esa persona terminó comprando `p1`,
   * que encontró por su cuenta. Sin el filtro por producto, la sección se lleva
   * una venta que no trajo, y es el error que más infla un tablero de
   * atribución: medido, ningún otro caso lo detectaba.
   */
  await db.exec(click(sesion(9), OTRA_SECCION, p(0)));
  await comprar(sesion(9), 'a0000000-0000-4000-8000-000000000009', 1009, 1, 1200);

  const r = await resultado();
  assert.equal(r[OTRA_SECCION]!.orders, 0, 'se atribuyó la compra de otro producto');
  assert.equal(r[OTRA_SECCION]!.revenue, 0);
});

test('comprar antes de ver la sección no cuenta: la atribución mira el orden', async () => {
  // El click llega **después** del pedido: no lo trajo esa sección.
  await comprar(sesion(4), 'a0000000-0000-4000-8000-000000000004', 1004, 0, 700);
  await db.exec(click(sesion(4), OTRA_SECCION, p(0), 0));

  const r = await resultado();
  assert.equal(r[OTRA_SECCION]!.orders, 0, 'se atribuyó un pedido anterior al click');
});

test('fuera de la ventana no se cuenta', async () => {
  await db.exec(click(sesion(5), SECCION, p(1), 60 * 24 * 45));

  assert.equal(
    (await resultado(30))[SECCION]!.clicks,
    2,
    'entró un click de hace cuarenta y cinco días',
  );
  assert.equal((await resultado(60))[SECCION]!.clicks, 3);
});

test('el dueño puede pedirlo, el navegador no', async () => {
  const suyo = await como<{ j: Record<string, unknown> }>(
    db,
    DUENO,
    `select admin_section_performance('${TIENDA}'::uuid, 30) as j`,
  );
  assert.ok(
    Object.keys(suyo[0]!.j).length > 0,
    'el dueño no puede ver el resultado de sus secciones',
  );

  const [{ puede }] = await comoServicio<{ puede: boolean }>(
    db,
    `select has_function_privilege('anon', 'public.admin_section_performance(uuid, integer)', 'execute') as puede`,
  );
  assert.equal(puede, false);
});
