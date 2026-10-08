import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como } from './harness.ts';

/**
 * La lista de pedidos por bandeja (v3 Fase 2).
 *
 * Las bandejas cruzan estado y pago, así que un pedido puede estar en dos: uno
 * enviado y sin cobrar está «por cobrar» y «en camino» a la vez. Lo que se prueba
 * es que cada pestaña trae exactamente los suyos, que el conteo de las pestañas
 * dice lo mismo que la lista, y que los filtros nuevos —ciudad, pago, fechas y
 * orden— y el corte de página hacen lo que dicen.
 */

const TENANT = 'ad000000-0000-4000-8000-000000000000';
const TIENDA = 'ad100000-0000-4000-8000-000000000000';
const OTRO_TENANT = 'ae000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'ae100000-0000-4000-8000-000000000000';
const DUENO = 'fb000000-0000-4000-8000-000000000000';
const AJENO = 'fb000000-0000-4000-8000-000000000001';

let db: PGlite;

interface Pagina {
  readonly items: readonly { number: number; city?: string }[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
}

type Conteos = Record<
  'todos' | 'cobrar' | 'preparar' | 'camino' | 'entregados' | 'cancelados',
  number
>;

async function lista(
  opciones: {
    bandeja?: string;
    query?: string;
    pago?: string;
    desde?: string;
    page?: number;
    perPage?: number;
    antiguos?: boolean;
    usuario?: string;
  } = {},
): Promise<Pagina> {
  const texto = (v: string | undefined) => (v === undefined ? 'null' : `'${v}'`);
  const filas = await como<{ j: Pagina }>(
    db,
    opciones.usuario ?? DUENO,
    `select admin_orders(
       '${TIENDA}'::uuid,
       ${texto(opciones.query ?? '')},
       null,
       ${opciones.page ?? 1},
       ${opciones.perPage ?? 20},
       ${texto(opciones.bandeja)},
       ${texto(opciones.pago)},
       ${opciones.desde ? `${opciones.desde}` : 'null'},
       null,
       ${opciones.antiguos ?? false}
     ) as j`,
  );
  return filas[0]!.j;
}

const numeros = (p: Pagina) => p.items.map((i) => i.number);

before(async () => {
  db = await baseDePrueba();
  const pedido = (n: number, status: string, pago: string, ciudad: string, dias: number) =>
    `('${TENANT}', '${TIENDA}', ${n}, gen_random_uuid(), '${status}', '${pago}', 'bank_transfer',
      '{"name":"Cliente ${n}"}', '{"city":"${ciudad}"}', ${n * 1000}, 'PYG',
      now() - interval '${dias} days')`;
  await db.exec(`
    insert into auth.users (id, email) values ('${DUENO}', 'd@a.test'), ('${AJENO}', 'x@b.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'A', 'pa'), ('${OTRO_TENANT}', 'B', 'pb');
    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'tpa', 'pa.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tpb', 'pb.test', 'PYG');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'), ('${OTRO_TENANT}', '${AJENO}', 'owner');

    insert into orders (
      tenant_id, store_id, number, idempotency_key, status, payment_status, payment_method,
      customer, address, total_amount, currency, created_at
    ) values
      ${pedido(1, 'received', 'pending', 'Asunción', 1)},
      ${pedido(2, 'received', 'paid', 'Luque', 2)},
      -- Enviado y sin cobrar: está en dos bandejas.
      ${pedido(3, 'shipped', 'pending', 'Luque', 3)},
      ${pedido(4, 'in_transit', 'paid', 'Asunción', 4)},
      ${pedido(5, 'delivered', 'paid', 'Asunción', 5)},
      -- Cancelado y sin cobrar: no se cobra.
      ${pedido(6, 'cancelled', 'pending', 'Encarnación', 6)},
      -- Entregado y todavía sin cobrar: se cobra igual.
      ${pedido(7, 'delivered', 'pending', 'San Lorenzo', 10)};

    insert into orders (
      tenant_id, store_id, number, idempotency_key, status, payment_status, payment_method,
      customer, address, total_amount, currency, created_at
    ) values
      ('${OTRO_TENANT}', '${OTRA_TIENDA}', 1, gen_random_uuid(), 'received', 'pending',
       'bank_transfer', '{"name":"Otro"}', '{"city":"Luque"}', 1000, 'PYG', now());
  `);
});

after(async () => {
  await db.close();
});

test('cada pestaña trae exactamente los suyos', async () => {
  // El orden por defecto es el más reciente primero.
  assert.deepEqual(numeros(await lista()), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(numeros(await lista({ bandeja: 'cobrar' })), [1, 3, 7]);
  assert.deepEqual(numeros(await lista({ bandeja: 'preparar' })), [2]);
  assert.deepEqual(numeros(await lista({ bandeja: 'camino' })), [3, 4]);
  assert.deepEqual(numeros(await lista({ bandeja: 'entregados' })), [5, 7]);
  assert.deepEqual(numeros(await lista({ bandeja: 'cancelados' })), [6]);
});

test('el conteo de las pestañas dice lo mismo que la lista', async () => {
  const filas = await como<{ j: Conteos }>(
    db,
    DUENO,
    `select admin_order_counts('${TIENDA}'::uuid) as j`,
  );
  assert.deepEqual(filas[0]!.j, {
    todos: 7,
    cobrar: 3,
    preparar: 1,
    camino: 2,
    entregados: 2,
    cancelados: 1,
  });
});

test('se busca también por ciudad, y la ciudad viene en la fila', async () => {
  const p = await lista({ query: 'luque' });
  assert.deepEqual(numeros(p), [2, 3]);
  assert.equal(p.items[0]!.city, 'Luque');
});

test('los filtros de pago y de fecha se suman a la pestaña', async () => {
  assert.deepEqual(numeros(await lista({ pago: 'paid' })), [2, 4, 5]);
  assert.deepEqual(
    numeros(await lista({ desde: `now() - interval '3 days 12 hours'` })),
    [1, 2, 3],
  );
  assert.deepEqual(numeros(await lista({ bandeja: 'cobrar', pago: 'pending' })), [1, 3, 7]);
});

test('se puede ordenar del más antiguo al más nuevo', async () => {
  assert.deepEqual(numeros(await lista({ antiguos: true })), [7, 6, 5, 4, 3, 2, 1]);
});

test('el corte de página trae las filas de esa página y el total de todas', async () => {
  const p = await lista({ page: 2, perPage: 2 });
  assert.deepEqual(numeros(p), [3, 4]);
  assert.equal(p.total, 7);
  assert.equal(p.page, 2);
  assert.equal(p.pageCount, 4);
});

test('otro comercio no ve ni cuenta los pedidos ajenos', async () => {
  const p = await lista({ usuario: AJENO });
  assert.equal(p.total, 0);

  const filas = await como<{ j: Conteos }>(
    db,
    AJENO,
    `select admin_order_counts('${TIENDA}'::uuid) as j`,
  );
  assert.equal(filas[0]!.j.todos, 0);
});
