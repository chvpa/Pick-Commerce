import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, intentar } from './harness.ts';

/**
 * Antigüedad del stock (v2 Fase 8, ADR-135).
 *
 * Una variante por caso, con fechas puestas a mano: cada una cae en un tramo
 * distinto por un motivo distinto, y el test dice cuál.
 */

const TENANT = 'ad000000-0000-4000-8000-000000000000';
const TIENDA = 'ad100000-0000-4000-8000-000000000000';
const SUC_1 = 'ad200000-0000-4000-8000-000000000001';
const SUC_2 = 'ad200000-0000-4000-8000-000000000002';
const OTRO_TENANT = 'ae000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'ae100000-0000-4000-8000-000000000000';
const OTRA_SUC = 'ae200000-0000-4000-8000-000000000000';

const DUENO = 'fb000000-0000-4000-8000-000000000000';
const AJENO = 'fb000000-0000-4000-8000-000000000001';
const CLIENTE = 'cd000000-0000-4000-8000-000000000000';

const P = (n: number) => `d2000000-0000-4000-8000-00000000000${n}`;
const V = (n: number) => `e2000000-0000-4000-8000-00000000000${n}`;

let db: PGlite;

interface Aging {
  readonly buckets: readonly {
    bucket: string;
    variants: number;
    units: number;
    priceValue: { amount: number };
    costValue: { amount: number };
    costCoverage: number;
  }[];
  readonly items: readonly {
    variantId: string;
    stock: number;
    days: number;
    bucket: string;
    lastSoldAt?: string;
    costValue?: { amount: number };
    priceValue: { amount: number };
  }[];
  readonly total: number;
  readonly pageCount: number;
}

async function aging(
  opciones: { tramo?: string; usuario?: string; page?: number; perPage?: number } = {},
): Promise<Aging> {
  const filas = await como<{ j: Aging }>(
    db,
    opciones.usuario ?? DUENO,
    `select admin_inventory_aging('${TIENDA}'::uuid, ${opciones.tramo ? `'${opciones.tramo}'` : 'null'},
       ${opciones.page ?? 1}, ${opciones.perPage ?? 20}) as j`,
  );
  return filas[0]!.j;
}

let numero = 2000;
/** Un pedido con una línea de la variante, hace `dias` días. */
function venta(variante: number, dias: number, estado = 'delivered'): string {
  const id = `0d000000-0000-4000-8000-${String(numero++).padStart(12, '0')}`;
  return `
    insert into orders (id, tenant_id, store_id, number, idempotency_key, status, payment_method,
      customer_id, customer, address, total_amount, currency, created_at)
    values ('${id}', '${TENANT}', '${TIENDA}', ${numero}, gen_random_uuid(), '${estado}', 'bank_transfer',
      '${CLIENTE}', '{"name":"x","email":"x@x.test"}', '{"street":"x","city":"y"}', 100, 'PYG',
      now() - interval '${dias} days');
    insert into order_items (tenant_id, order_id, variant_id, title, sku, unit_price, currency, quantity, position)
    values ('${TENANT}', '${id}', '${V(variante)}', 'x', 'SKU-${variante}', 100, 'PYG', 1, 0);`;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values ('${DUENO}', 'd@a.test'), ('${AJENO}', 'a@b.test');
    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio', 'c'), ('${OTRO_TENANT}', 'Otro', 'o');
    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda', 't', 't.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Otra', 'o', 'o.test', 'PYG');
    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'), ('${OTRO_TENANT}', '${AJENO}', 'owner');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUC_1}', '${TENANT}', '${TIENDA}', 'Uno'), ('${SUC_2}', '${TENANT}', '${TIENDA}', 'Dos'),
      ('${OTRA_SUC}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'Otra');
    insert into customers (id, tenant_id, store_id, email, name, phone) values
      ('${CLIENTE}', '${TENANT}', '${TIENDA}', 'x@x.test', 'X', '0981');

    insert into products (id, tenant_id, store_id, handle, title, status, created_at) values
      ('${P(1)}', '${TENANT}', '${TIENDA}', 'p1', 'Vendida hace poco', 'active', now() - interval '300 days'),
      ('${P(2)}', '${TENANT}', '${TIENDA}', 'p2', 'Sin costo', 'active', now() - interval '300 days'),
      ('${P(3)}', '${TENANT}', '${TIENDA}', 'p3', 'Nunca vendida', 'inactive', now() - interval '120 days'),
      ('${P(4)}', '${TENANT}', '${TIENDA}', 'p4', 'Quieta hace mucho', 'active', now() - interval '400 days'),
      ('${P(5)}', '${TENANT}', '${TIENDA}', 'p5', 'Sin stock', 'active', now() - interval '400 days'),
      ('${P(6)}', '${TENANT}', '${TIENDA}', 'p6', 'Archivada', 'archived', now() - interval '400 days'),
      ('${P(7)}', '${TENANT}', '${TIENDA}', 'p7', 'En dos sucursales', 'active', now() - interval '300 days'),
      ('${P(8)}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'p8', 'Ajena', 'active', now() - interval '400 days');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, cost, currency) values
      ('${V(1)}', '${TENANT}', '${P(1)}', 'SKU-1', 'M', 100, 60, 'PYG'),
      ('${V(2)}', '${TENANT}', '${P(2)}', 'SKU-2', '', 500, null, 'PYG'),
      ('${V(3)}', '${TENANT}', '${P(3)}', 'SKU-3', '', 200, 100, 'PYG'),
      ('${V(4)}', '${TENANT}', '${P(4)}', 'SKU-4', '', 1000, 400, 'PYG'),
      ('${V(5)}', '${TENANT}', '${P(5)}', 'SKU-5', '', 100, 50, 'PYG'),
      ('${V(6)}', '${TENANT}', '${P(6)}', 'SKU-6', '', 100, 50, 'PYG'),
      ('${V(7)}', '${TENANT}', '${P(7)}', 'SKU-7', '', 300, 100, 'PYG'),
      ('${V(8)}', '${OTRO_TENANT}', '${P(8)}', 'SKU-8', '', 100, 50, 'PYG');

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${TENANT}', '${V(1)}', '${SUC_1}', 5),
      ('${TENANT}', '${V(2)}', '${SUC_1}', 2),
      ('${TENANT}', '${V(3)}', '${SUC_1}', 3),
      ('${TENANT}', '${V(4)}', '${SUC_1}', 1),
      ('${TENANT}', '${V(5)}', '${SUC_1}', 0),
      ('${TENANT}', '${V(6)}', '${SUC_1}', 9),
      ('${TENANT}', '${V(7)}', '${SUC_1}', 2),
      ('${TENANT}', '${V(7)}', '${SUC_2}', 3),
      ('${OTRO_TENANT}', '${V(8)}', '${OTRA_SUC}', 7);

    ${venta(1, 10)}
    ${venta(2, 60)}
    ${venta(4, 200)}
    ${venta(4, 5, 'cancelled')}
    ${venta(5, 1)}
    ${venta(7, 5)}
  `);
});

after(async () => {
  await db.close();
});

test('cada variante cae en el tramo de su última venta, o de su alta si nunca se vendió', async () => {
  const r = await aging();
  const tramo = new Map(r.items.map((i) => [i.variantId, i.bucket]));
  // Vendida hace 10 días.
  assert.equal(tramo.get(V(1)), '0_30');
  // Hace 60.
  assert.equal(tramo.get(V(2)), '31_90');
  // Nunca se vendió: cuenta desde el alta, hace 120. Y está inactiva, pero es
  // plata en el depósito igual.
  assert.equal(tramo.get(V(3)), '91_180');
  // Su venta de hace 5 días está cancelada: la última de verdad es de hace 200.
  assert.equal(tramo.get(V(4)), '180_plus');
  // En dos sucursales, vendida hace 5.
  assert.equal(tramo.get(V(7)), '0_30');
});

test('fuera: sin stock, archivada y de otra tienda', async () => {
  const r = await aging();
  const ids = r.items.map((i) => i.variantId);
  for (const n of [5, 6, 8]) assert.ok(!ids.includes(V(n)), `entró la variante ${n}`);
  assert.equal(r.total, 5);
});

test('el stock suma las sucursales, y los tramos suman unidades y valor', async () => {
  const r = await aging();
  assert.equal(r.items.find((i) => i.variantId === V(7))!.stock, 5);

  const t = Object.fromEntries(r.buckets.map((b) => [b.bucket, b]));
  assert.deepEqual(
    r.buckets.map((b) => b.bucket),
    ['0_30', '31_90', '91_180', '180_plus'],
  );
  // 5 × 100 y 5 × 300.
  assert.equal(t['0_30']!.units, 10);
  assert.equal(t['0_30']!.priceValue.amount, 2000);
  assert.equal(t['0_30']!.costValue.amount, 5 * 60 + 5 * 100);
  assert.equal(t['180_plus']!.priceValue.amount, 1000);
});

test('sin costo cargado, el valor a costo no es cero: es cobertura cero', async () => {
  const r = await aging();
  const sinCosto = r.buckets.find((b) => b.bucket === '31_90')!;
  assert.equal(sinCosto.costCoverage, 0);
  assert.equal(sinCosto.priceValue.amount, 1000);
  assert.equal(r.items.find((i) => i.variantId === V(2))!.costValue, undefined);
  assert.equal(r.buckets.find((b) => b.bucket === '0_30')!.costCoverage, 1);
});

test('lo más viejo primero, y filtrar por tramo pagina en el servidor', async () => {
  const r = await aging();
  assert.deepEqual(
    r.items.map((i) => i.variantId),
    [V(4), V(3), V(2), V(1), V(7)],
  );

  const recientes = await aging({ tramo: '0_30', perPage: 1 });
  assert.equal(recientes.total, 2);
  assert.equal(recientes.pageCount, 2);
  // V1 lleva 10 días y V7 5: la más vieja primero, aunque V7 tenga más plata
  // parada (1500 contra 500).
  assert.deepEqual(
    recientes.items.map((i) => i.variantId),
    [V(1)],
  );
});

test('otro comercio no ve nada, y anon no puede llamarla', async () => {
  const ajeno = await aging({ usuario: AJENO });
  assert.equal(ajeno.total, 0);
  const r = await intentar(db, null, `select admin_inventory_aging('${TIENDA}'::uuid)`);
  assert.equal(r.ok, false);
});
