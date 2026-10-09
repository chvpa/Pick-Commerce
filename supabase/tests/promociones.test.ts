import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio, intentar } from './harness.ts';
import { aplicarAlCarrito, type LineaParaPromocion, type Promotion } from '@pick/commerce-core';

/**
 * Promociones: aislamiento, paridad con el core, y el dinero del pedido.
 *
 * La parte que más importa es la **paridad**. `cart_promotions` en SQL y
 * `aplicarAlCarrito` en TypeScript calculan lo mismo por caminos distintos, y
 * dos implementaciones del mismo cálculo de dinero que nadie compara son dos
 * precios distintos esperando su momento. Acá se corren los mismos escenarios
 * contra las dos y se exige que coincidan al guaraní.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'a5000000-0000-4000-8000-000000000000';
const SUCURSAL = 'a6000000-0000-4000-8000-000000000000';
const CATEGORIA = 'a7000000-0000-4000-8000-000000000000';
const COLECCION = 'a8000000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'bb000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b5000000-0000-4000-8000-000000000000';

const REMERA = 'd1000000-0000-4000-8000-000000000000';
const GORRA = 'd1000000-0000-4000-8000-000000000001';

const V_REMERA = 'e1000000-0000-4000-8000-000000000000';
const V_GORRA = 'e1000000-0000-4000-8000-000000000001';

const DUENO = 'f1000000-0000-4000-8000-000000000000';
const STAFF = 'f1000000-0000-4000-8000-000000000001';
const AJENO_USER = 'f1000000-0000-4000-8000-000000000002';

/** Precios de lista, para que los escenarios se lean. */
const PRECIO_REMERA = 150_000;
/**
 * Elegido para que el descuento caiga **justo en la mitad**: el 15 % de ₲89.990
 * son 13.498,5. Es el único caso que distingue el redondeo al par de
 * `round(float8)` del que se aleja del cero de `round(numeric)`, que es el que
 * hace `Math.round` en el core. Con un precio cualquiera los dos coinciden y la
 * paridad pasa sin probar nada.
 */
const PRECIO_GORRA = 89_990;

let db: PGlite;

function sql(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

/** Una promoción en la base y su gemela en la forma del core. */
interface Escenario {
  readonly nombre: string;
  readonly promos: readonly Promotion[];
  readonly lineas: readonly LineaParaPromocion[];
  readonly codigo?: string;
  /** La zona de envío, para el envío gratis. */
  readonly zona?: string;
}

function promo(parcial: Partial<Promotion> & Pick<Promotion, 'id'>): Promotion {
  return {
    title: 'Promo',
    kind: 'discount',
    status: 'active',
    priority: 0,
    stackable: false,
    usageCount: 0,
    discountType: 'percentage',
    discountValue: 1500,
    target: { kind: 'all' },
    ...parcial,
  };
}

function linea(parcial: Partial<LineaParaPromocion> = {}): LineaParaPromocion {
  return {
    variantId: V_REMERA,
    productId: REMERA,
    categoryId: CATEGORIA,
    collectionIds: [COLECCION],
    listUnitPrice: { amount: PRECIO_REMERA, currency: 'PYG' },
    quantity: 1,
    ...parcial,
  };
}

/** Una promoción de carrito (ADR-164): sin `discountType`, con lo suyo en `rules`. */
function deCarrito(parcial: Partial<Promotion> & Pick<Promotion, 'id' | 'kind'>): Promotion {
  const { discountType: _t, discountValue: _v, ...base } = promo(parcial);
  return base;
}

function lineaGorra(parcial: Partial<LineaParaPromocion> = {}): LineaParaPromocion {
  return linea({
    variantId: V_GORRA,
    productId: GORRA,
    categoryId: undefined,
    collectionIds: [],
    listUnitPrice: { amount: PRECIO_GORRA, currency: 'PYG' },
    ...parcial,
  });
}

/** Ids de las promociones de los escenarios nuevos, para que se lean en un fallo. */
function ID(n: number): string {
  return `33333333-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** Inserta las promociones del escenario y devuelve lo que calculó el SQL. */
interface ResultadoSql {
  readonly subtotal: number;
  readonly discount: number;
  readonly total: number;
  readonly couponIssue?: string;
  readonly lines: readonly { variantId: string; unitPrice: number; subtotal: number }[];
  readonly gifts: readonly { promotionId: string; variantId: string; quantity: number }[];
  readonly freeShipping: boolean;
  readonly applied: readonly { promotionId: string; kind: string; amount: number }[];
}

async function enSql(e: Escenario): Promise<ResultadoSql> {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);

  for (const p of e.promos) {
    await comoServicio(
      db,
      `insert into promotions (
         id, tenant_id, store_id, title, kind, status, priority, stackable, code,
         starts_at, ends_at, usage_limit, usage_count,
         discount_type, discount_value, rules, target, min_subtotal, min_quantity
       ) values (
         ${sql(p.id)}, ${sql(TENANT)}, ${sql(TIENDA)}, ${sql(p.title)}, ${sql(p.kind)},
         ${sql(p.status)}, ${p.priority}, ${p.stackable},
         ${p.code ? sql(p.code) : 'null'},
         ${p.startsAt ? `${sql(p.startsAt)}::timestamptz` : 'null'},
         ${p.endsAt ? `${sql(p.endsAt)}::timestamptz` : 'null'},
         ${p.usageLimit ?? 'null'}, ${p.usageCount},
         ${p.discountType ? sql(p.discountType) : 'null'}, ${p.discountValue ?? 'null'},
         ${sql(JSON.stringify(p.rules ?? {}))}::jsonb,
         ${sql(JSON.stringify(p.target))}::jsonb,
         ${p.minSubtotal ?? 'null'}, ${p.minQuantity ?? 'null'}
       )`,
    );
  }

  const lineas = e.lineas.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
  const filas = await comoServicio<{ j: ResultadoSql }>(
    db,
    `select cart_promotions(${sql(TIENDA)}::uuid, ${sql(JSON.stringify(lineas))}::jsonb,
                            ${e.codigo ? sql(e.codigo) : 'null'},
                            ${e.zona ? sql(e.zona) : 'null'}) as j`,
  );
  return filas[0]!.j;
}

/**
 * El stock de lo que se regala, leído de la base: el core lo recibe del que
 * llama, y para que la paridad pruebe algo tiene que ser el mismo que ve el SQL.
 */
async function stockDeRegalos(e: Escenario): Promise<Record<string, number>> {
  const ids = e.promos.map((p) => p.rules?.giftVariantId).filter((id) => id !== undefined);
  if (ids.length === 0) return {};
  const filas = await comoServicio<{ variant_id: string; n: number }>(
    db,
    `select variant_id, sum(available)::int as n from inventory_levels
     where variant_id = any(${sql(`{${ids.join(',')}}`)}::uuid[]) group by variant_id`,
  );
  return Object.fromEntries(filas.map((f) => [f.variant_id, f.n]));
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@a.test'), ('${STAFF}', 'staff@a.test'), ('${AJENO_USER}', 'ajeno@b.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta', 'a.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tb', 'b.test', 'PYG');

    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${STAFF}', 'staff'),
      ('${OTRO_TENANT}', '${AJENO_USER}', 'owner');

    insert into categories (id, tenant_id, store_id, name, slug) values
      ('${CATEGORIA}', '${TENANT}', '${TIENDA}', 'Remeras', 'remeras');

    insert into collections (id, tenant_id, store_id, title, handle) values
      ('${COLECCION}', '${TENANT}', '${TIENDA}', 'Ofertas', 'ofertas');

    insert into products (id, tenant_id, store_id, handle, title, status, category_id) values
      ('${REMERA}', '${TENANT}', '${TIENDA}', 'remera', 'Remera lisa', 'active', '${CATEGORIA}'),
      ('${GORRA}', '${TENANT}', '${TIENDA}', 'gorra', 'Gorra', 'active', null);

    insert into collection_products (tenant_id, collection_id, product_id) values
      ('${TENANT}', '${COLECCION}', '${REMERA}');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position) values
      ('${V_REMERA}', '${TENANT}', '${REMERA}', 'REM-M', 'M', ${PRECIO_REMERA}, 'PYG', 0),
      ('${V_GORRA}', '${TENANT}', '${GORRA}', 'GOR-U', 'Única', ${PRECIO_GORRA}, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${TENANT}', '${V_REMERA}', '${SUCURSAL}', 100),
      ('${TENANT}', '${V_GORRA}', '${SUCURSAL}', 100);
  `);
});

after(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------
// Aislamiento y permisos
// ---------------------------------------------------------------------------

test('un comercio no ve las promociones de otro', async () => {
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, discount_type, discount_value)
     values (${sql(OTRO_TENANT)}, ${sql(OTRA_TIENDA)}, 'De B', 'percentage', 1000)`,
  );

  const vistas = await como<{ title: string }>(db, DUENO, `select title from promotions`);
  assert.equal(
    vistas.some((p) => p.title === 'De B'),
    false,
    'se filtró una promoción de otro comercio',
  );

  await comoServicio(db, `delete from promotions where store_id = ${sql(OTRA_TIENDA)}`);
});

test('el rol anónimo no puede leer promociones', async () => {
  const r = await intentar(db, null, `select * from promotions`);
  assert.equal(r.ok, false, 'el rol anónimo pudo leer promociones');
  assert.match(r.error ?? '', /permission denied/);
});

test('el staff no puede crear una promoción, el owner sí', async () => {
  // Una campaña es una decisión de precio, y las de precio ya viven detrás de
  // `settings.write`, que el staff tampoco tiene.
  const delStaff = await intentar(
    db,
    STAFF,
    `insert into promotions (tenant_id, store_id, title, discount_type, discount_value)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Del staff', 'percentage', 1000)`,
  );
  assert.equal(delStaff.ok, false, 'el staff pudo crear una promoción');

  const delDueno = await intentar(
    db,
    DUENO,
    `insert into promotions (tenant_id, store_id, title, discount_type, discount_value)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Del dueño', 'percentage', 1000)`,
  );
  assert.equal(delDueno.ok, true, `el owner no pudo crear una promoción: ${delDueno.error}`);
});

test('dos cupones con el mismo código en la tienda no conviven', async () => {
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, code, discount_type, discount_value)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Uno', 'VERANO', 'percentage', 1000)`,
  );
  const r = await intentar(
    db,
    DUENO,
    `insert into promotions (tenant_id, store_id, title, code, discount_type, discount_value)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Otro', 'verano', 'percentage', 2000)`,
  );
  assert.equal(r.ok, false, 'entraron dos cupones con el mismo código en la tienda');
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
});

// ---------------------------------------------------------------------------
// Paridad entre el SQL y el core
// ---------------------------------------------------------------------------

const ESCENARIOS: readonly Escenario[] = [
  {
    nombre: 'sin promociones',
    promos: [],
    lineas: [linea({ quantity: 2 })],
  },
  {
    nombre: 'porcentaje sobre toda la tienda',
    promos: [promo({ id: '11111111-0000-4000-8000-000000000001', discountValue: 2000 })],
    lineas: [linea({ quantity: 2 })],
  },
  {
    nombre: 'el redondeo del porcentaje cuando cae justo en la mitad',
    // 15 % de ₲89.990 son 13.498,5. Los dos tienen que decir 13.499.
    promos: [promo({ id: '11111111-0000-4000-8000-000000000002', discountValue: 1500 })],
    lineas: [
      linea({
        variantId: V_GORRA,
        productId: GORRA,
        categoryId: undefined,
        collectionIds: [],
        listUnitPrice: { amount: PRECIO_GORRA, currency: 'PYG' },
        quantity: 3,
      }),
    ],
  },
  {
    nombre: 'monto fijo mayor que el precio, topado en cero',
    promos: [
      promo({
        id: '11111111-0000-4000-8000-000000000003',
        discountType: 'fixed',
        discountValue: 999_999,
      }),
    ],
    lineas: [linea()],
  },
  {
    nombre: 'dos que combinan se encadenan',
    promos: [
      promo({
        id: '11111111-0000-4000-8000-000000000004',
        priority: 10,
        stackable: true,
        discountValue: 1000,
      }),
      promo({
        id: '11111111-0000-4000-8000-000000000005',
        priority: 5,
        stackable: true,
        discountValue: 1000,
      }),
    ],
    lineas: [linea()],
  },
  {
    nombre: 'la que no combina corta la cadena',
    promos: [
      promo({ id: '11111111-0000-4000-8000-000000000006', priority: 10, discountValue: 1000 }),
      promo({
        id: '11111111-0000-4000-8000-000000000007',
        priority: 5,
        stackable: true,
        discountValue: 5000,
      }),
    ],
    lineas: [linea()],
  },
  {
    nombre: 'por categoría, y la gorra no la tiene',
    promos: [
      promo({
        id: '11111111-0000-4000-8000-000000000008',
        discountValue: 2000,
        target: { kind: 'category', ids: [CATEGORIA] },
      }),
    ],
    lineas: [
      linea(),
      linea({
        variantId: V_GORRA,
        productId: GORRA,
        categoryId: undefined,
        collectionIds: [],
        listUnitPrice: { amount: PRECIO_GORRA, currency: 'PYG' },
      }),
    ],
  },
  {
    nombre: 'por colección',
    promos: [
      promo({
        id: '11111111-0000-4000-8000-000000000009',
        discountValue: 2500,
        target: { kind: 'collection', ids: [COLECCION] },
      }),
    ],
    lineas: [linea()],
  },
  {
    nombre: 'mínimo de compra que no se alcanza',
    promos: [
      promo({
        id: '11111111-0000-4000-8000-00000000000a',
        discountType: 'fixed',
        discountValue: 20_000,
        minSubtotal: 999_999,
      }),
    ],
    lineas: [linea()],
  },
  {
    nombre: 'mínimo de cantidad que sí se alcanza',
    promos: [
      promo({
        id: '11111111-0000-4000-8000-00000000000b',
        discountType: 'fixed',
        discountValue: 20_000,
        minQuantity: 3,
      }),
    ],
    lineas: [linea({ quantity: 3 })],
  },
  {
    nombre: 'cupón sobre una promoción de catálogo',
    promos: [
      promo({ id: '11111111-0000-4000-8000-00000000000c', discountValue: 1000 }),
      promo({
        id: '11111111-0000-4000-8000-00000000000d',
        code: 'EXTRA',
        discountType: 'fixed',
        discountValue: 10_000,
      }),
    ],
    lineas: [linea()],
    codigo: 'EXTRA',
  },
  {
    nombre: 'cupón agotado',
    promos: [
      promo({
        id: '11111111-0000-4000-8000-00000000000e',
        code: 'AGOTADO',
        usageLimit: 3,
        usageCount: 3,
        discountType: 'fixed',
        discountValue: 10_000,
      }),
    ],
    lineas: [linea()],
    codigo: 'AGOTADO',
  },
  {
    nombre: 'cupón inexistente',
    promos: [],
    lineas: [linea()],
    codigo: 'NOEXISTE',
  },
  {
    nombre: 'una promoción en borrador no aplica',
    promos: [
      promo({ id: '11111111-0000-4000-8000-00000000000f', status: 'draft', discountValue: 5000 }),
    ],
    lineas: [linea()],
  },

  // Los tipos de carrito (ADR-164).
  {
    nombre: '3x2 sobre el mismo producto, y la gorra no completa el grupo',
    promos: [deCarrito({ id: ID(1), kind: 'buy_x_pay_y', rules: { buy: 3, pay: 2 } })],
    lineas: [linea({ quantity: 4 }), lineaGorra({ quantity: 2 })],
  },
  {
    nombre: '3x2 sobre el precio que ya rebajó el catálogo',
    promos: [
      promo({ id: ID(2), discountValue: 1000, stackable: true }),
      deCarrito({ id: ID(3), kind: 'buy_x_pay_y', rules: { buy: 3, pay: 2 } }),
    ],
    lineas: [linea({ quantity: 3 })],
  },
  {
    nombre: 'segunda unidad con el redondeo justo en la mitad',
    promos: [deCarrito({ id: ID(4), kind: 'second_unit', rules: { percent: 1500 } })],
    lineas: [lineaGorra({ quantity: 3 })],
  },
  {
    nombre: 'por cantidad, cada producto por su lado',
    promos: [
      deCarrito({
        id: ID(5),
        kind: 'quantity',
        rules: {
          tiers: [
            { minQuantity: 2, percent: 1000 },
            { minQuantity: 4, percent: 2000 },
          ],
        },
      }),
    ],
    lineas: [linea({ quantity: 4 }), lineaGorra({ quantity: 3 })],
  },
  {
    nombre: 'por cantidad mezclando productos, la más cara entera',
    promos: [
      deCarrito({
        id: ID(6),
        kind: 'quantity',
        rules: { mix: true, tiers: [{ minQuantity: 3, percent: 1500 }] },
      }),
    ],
    lineas: [linea(), lineaGorra({ quantity: 2 })],
  },
  {
    nombre: 'por monto, en el último escalón',
    promos: [
      deCarrito({
        id: ID(7),
        kind: 'tiered',
        rules: {
          tiers: [
            { upTo: 200_000, percent: 0 },
            { upTo: 400_000, percent: 1000 },
            { percent: 1500 },
          ],
        },
      }),
    ],
    lineas: [linea({ quantity: 3 })],
  },
  {
    nombre: 'por monto, justo en el tope de un escalón',
    promos: [
      deCarrito({
        id: ID(8),
        kind: 'tiered',
        rules: { tiers: [{ upTo: 300_000, percent: 1000 }, { percent: 2000 }] },
      }),
    ],
    lineas: [linea({ quantity: 2 })],
  },
  {
    nombre: 'regalo al comprar dos remeras',
    promos: [
      deCarrito({
        id: ID(9),
        kind: 'gift',
        target: { kind: 'product', ids: [REMERA] },
        rules: { buy: 2, giftVariantId: V_GORRA, giftQuantity: 1 },
      }),
    ],
    lineas: [linea({ quantity: 2 })],
  },
  {
    nombre: 'regalo que no llega al mínimo',
    promos: [
      deCarrito({
        id: ID(10),
        kind: 'gift',
        rules: { buy: 3, giftVariantId: V_GORRA, giftQuantity: 1 },
      }),
    ],
    lineas: [linea({ quantity: 2 })],
  },
  {
    nombre: 'regalo pedido en más unidades de las que hay',
    promos: [
      deCarrito({
        id: ID(11),
        kind: 'gift',
        rules: { buy: 1, giftVariantId: V_GORRA, giftQuantity: 1 },
      }),
    ],
    // La tienda tiene 100 gorras y el carrito ya compra las 100.
    lineas: [linea(), lineaGorra({ quantity: 100 })],
  },
  {
    nombre: 'bundle de dos productos distintos con porcentaje',
    promos: [
      deCarrito({
        id: ID(12),
        kind: 'bundle',
        target: { kind: 'product', ids: [REMERA, GORRA] },
        rules: { count: 2, benefit: 'percent', value: 1500 },
      }),
    ],
    lineas: [linea(), lineaGorra()],
  },
  {
    nombre: 'un bundle no se arma con un solo producto',
    promos: [
      deCarrito({
        id: ID(13),
        kind: 'bundle',
        target: { kind: 'product', ids: [REMERA, GORRA] },
        rules: { count: 2, benefit: 'fixed', value: 20_000 },
      }),
    ],
    lineas: [linea({ quantity: 3 })],
  },
  {
    nombre: 'bundle con envío gratis',
    promos: [
      deCarrito({
        id: ID(14),
        kind: 'bundle',
        target: { kind: 'product', ids: [REMERA, GORRA] },
        rules: { count: 2, benefit: 'free_shipping' },
      }),
    ],
    lineas: [linea(), lineaGorra()],
  },
  {
    nombre: 'envío gratis en su zona',
    promos: [deCarrito({ id: ID(15), kind: 'free_shipping', rules: { zones: ['Central'] } })],
    lineas: [linea()],
    zona: ' central',
  },
  {
    nombre: 'envío gratis fuera de su zona',
    promos: [deCarrito({ id: ID(16), kind: 'free_shipping', rules: { zones: ['Central'] } })],
    lineas: [linea()],
    zona: 'Itapúa',
  },
  {
    nombre: 'cupón de envío gratis fuera de su zona',
    promos: [
      deCarrito({
        id: ID(17),
        kind: 'free_shipping',
        code: 'ENVIO',
        rules: { zones: ['Central'] },
      }),
    ],
    lineas: [linea()],
    codigo: 'envio',
    zona: 'Itapúa',
  },
  {
    nombre: 'un 3x2 que combina deja pasar un descuento con mínimo',
    promos: [
      deCarrito({
        id: ID(18),
        kind: 'buy_x_pay_y',
        priority: 5,
        stackable: true,
        rules: { buy: 3, pay: 2 },
      }),
      promo({ id: ID(19), priority: 1, stackable: true, minQuantity: 2, discountValue: 1000 }),
    ],
    lineas: [linea({ quantity: 3 })],
  },
  {
    nombre: 'un 3x2 que no combina corta la cadena',
    promos: [
      deCarrito({ id: ID(20), kind: 'buy_x_pay_y', priority: 5, rules: { buy: 3, pay: 2 } }),
      promo({ id: ID(21), priority: 1, stackable: true, minQuantity: 2, discountValue: 1000 }),
    ],
    lineas: [linea({ quantity: 3 })],
  },
  {
    nombre: 'un 3x2 mal configurado no regala nada',
    promos: [deCarrito({ id: ID(22), kind: 'buy_x_pay_y', rules: { buy: 3, pay: 3 } })],
    lineas: [linea({ quantity: 6 })],
  },
];

for (const e of ESCENARIOS) {
  test(`paridad SQL/core: ${e.nombre}`, async () => {
    const sqlR = await enSql(e);
    const coreR = aplicarAlCarrito(e.lineas, e.promos, new Date(), e.codigo, {
      ...(e.zona ? { zona: e.zona } : {}),
      stockDeRegalos: await stockDeRegalos(e),
    });

    assert.equal(sqlR.subtotal, coreR.subtotal.amount, 'el subtotal difiere');
    assert.equal(sqlR.discount, coreR.discount.amount, 'el descuento difiere');
    assert.equal(sqlR.total, coreR.total.amount, 'el total difiere');
    assert.equal(sqlR.couponIssue, coreR.couponIssue, 'el motivo de rechazo del cupón difiere');
    assert.equal(sqlR.freeShipping, coreR.freeShipping, 'el envío gratis difiere');
    assert.deepEqual(sqlR.gifts, coreR.gifts, 'los regalos difieren');
    assert.deepEqual(
      sqlR.applied.map((a) => [a.promotionId, a.kind, a.amount]),
      coreR.applied.map((a) => [a.promotionId, a.kind, a.amount.amount]),
      'lo aplicado difiere',
    );

    // También por línea: es el precio que ve el comprador en el carrito, y si
    // difiere del que cobra el pedido son dos números para lo mismo.
    assert.deepEqual(
      sqlR.lines.map((l) => [l.variantId, l.unitPrice, l.subtotal]),
      coreR.lines.map((l) => [l.variantId, l.unitPrice.amount, l.subtotal.amount]),
      'las líneas difieren',
    );
  });
}

// ---------------------------------------------------------------------------
// El dinero del pedido
// ---------------------------------------------------------------------------

interface Pedido {
  readonly id: string;
  readonly subtotal: { amount: number };
  readonly discount: { amount: number };
  readonly total: { amount: number };
  readonly appliedPromotions?: readonly { promotionId: string; amount: number }[];
  readonly items: readonly {
    variantId: string;
    unitPrice: { amount: number };
    quantity: number;
    isGift?: boolean;
  }[];
  readonly shipping: { amount: number };
}

async function crear(
  lineas: readonly { variantId: string; quantity: number }[],
  extra: Record<string, unknown> = {},
): Promise<{ order?: Pedido; error?: string }> {
  const payload = {
    customer: { name: 'Ana', email: 'ana@cliente.test', phone: '0981123456' },
    address: { street: 'Siempre Viva 742', city: 'Asunción' },
    paymentMethod: 'bank_transfer',
    lines: lineas,
    ...extra,
  };
  const filas = await comoServicio<{ j: { order?: Pedido; error?: string } }>(
    db,
    `select create_order(${sql(TIENDA)}::uuid, ${sql(crypto.randomUUID())}::uuid,
                         ${sql(JSON.stringify(payload))}::jsonb) as j`,
  );
  return filas[0]!.j;
}

test('el pedido guarda el descuento, su snapshot y los totales cuadran', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (id, tenant_id, store_id, title, status, discount_type, discount_value)
     values ('22222222-0000-4000-8000-000000000001', ${sql(TENANT)}, ${sql(TIENDA)},
             'Veinte por ciento', 'active', 'percentage', 2000)`,
  );

  const r = await crear([{ variantId: V_REMERA, quantity: 2 }]);
  const o = r.order!;

  assert.equal(o.subtotal.amount, 300_000, 'el subtotal no es el de lista');
  assert.equal(o.discount.amount, 60_000);
  assert.equal(o.total.amount, 240_000);
  // La invariante, comprobada sobre el pedido devuelto y no sólo en la base.
  assert.equal(o.total.amount, o.subtotal.amount - o.discount.amount);

  // El precio de lista se conserva en la línea: es el «precio original» de
  // PROJECT.md §13, y lo descontado vive aparte.
  assert.equal(o.items[0]!.unitPrice.amount, 150_000);

  assert.equal(o.appliedPromotions?.length, 1);
  assert.equal(o.appliedPromotions![0]!.promotionId, '22222222-0000-4000-8000-000000000001');
  assert.equal(o.appliedPromotions![0]!.amount, 60_000, 'el snapshot guardó el monto por unidad');
});

test('un pedido sin promociones no trae el campo y no descuenta nada', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  const o = (await crear([{ variantId: V_REMERA, quantity: 1 }])).order!;

  assert.equal(o.discount.amount, 0);
  assert.equal(o.total.amount, 150_000);
  assert.equal(o.subtotal.amount, 150_000);
  assert.equal(o.appliedPromotions, undefined, 'un array vacío en vez de ausente');
});

test('el descuento no se puede inyectar desde el payload', async () => {
  // La regla del encabezado de `create_order` —«el payload dice qué y cuánto,
  // jamás a qué precio»— extendida al descuento. Si esto se rompiera, cualquiera
  // se regala la tienda editando un fetch.
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);

  const o = (
    await crear([{ variantId: V_REMERA, quantity: 1 }], {
      discount: 149_000,
      discountAmount: 149_000,
      appliedPromotions: [{ promotionId: 'inventada', amount: 149_000 }],
      total: 1000,
    })
  ).order!;

  assert.equal(o.discount.amount, 0, 'el payload logró inyectar un descuento');
  assert.equal(o.total.amount, 150_000, 'el payload logró cambiar el total');
  assert.equal(o.appliedPromotions, undefined);
});

test('un cupón con tope de uso lo consume una sola vez', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (id, tenant_id, store_id, title, status, code,
                             usage_limit, discount_type, discount_value)
     values ('22222222-0000-4000-8000-000000000002', ${sql(TENANT)}, ${sql(TIENDA)},
             'Última unidad', 'active', 'ULTIMO', 1, 'fixed', 50000)`,
  );

  const primero = await crear([{ variantId: V_REMERA, quantity: 1 }], { couponCode: 'ULTIMO' });
  assert.equal(primero.order!.discount.amount, 50_000, 'el primero no aprovechó el cupón');

  // El segundo ya no lo encuentra vigente: el tope está consumido.
  const segundo = await crear([{ variantId: V_REMERA, quantity: 1 }], { couponCode: 'ULTIMO' });
  assert.equal(segundo.order!.discount.amount, 0, 'el cupón se usó dos veces con tope de uno');

  const filas = await comoServicio<{ usage_count: number }>(
    db,
    `select usage_count from promotions where code = 'ULTIMO'`,
  );
  assert.equal(filas[0]!.usage_count, 1, 'el contador no quedó en uno');
});

// ---------------------------------------------------------------------------
// El catálogo
// ---------------------------------------------------------------------------

interface Catalogo {
  readonly items: readonly {
    readonly handle: string;
    readonly variants: readonly {
      readonly price: { amount: number };
      readonly compareAtPrice?: { amount: number };
    }[];
  }[];
  readonly priceMin: number;
  readonly priceMax: number;
}

/**
 * Sin cambiar de rol, igual que `catalogo.test.ts`: `catalog_search` tiene grant
 * a `authenticated` y en la base de prueba `service_role` no hereda los
 * privilegios que sí tiene en Supabase.
 */
async function catalogo(opciones: { sort?: string; precioMax?: number } = {}): Promise<Catalogo> {
  const r = await db.query<{ j: Catalogo }>(
    `select catalog_search($1::uuid, '{}'::jsonb, '', $2, 1, 24, null, $3) as j`,
    [TIENDA, opciones.sort ?? 'relevance', opciones.precioMax ?? null],
  );
  return r.rows[0]!.j;
}

function porHandle(c: Catalogo, handle: string) {
  const p = c.items.find((i) => i.handle === handle);
  assert.ok(p, `no vino el producto ${handle}`);
  return p.variants[0]!;
}

test('el catálogo devuelve el precio con descuento y tacha el de lista', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, discount_type, discount_value, target)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Veinte', 'active', 'percentage', 2000,
             '{"kind":"category","ids":["${CATEGORIA}"]}'::jsonb)`,
  );

  const c = await catalogo();
  const remera = porHandle(c, 'remera');
  assert.equal(remera.price.amount, 120_000, 'la PLP no muestra el precio rebajado');
  assert.equal(remera.compareAtPrice?.amount, 150_000, 'no tachó el precio de lista');

  // La gorra no está en esa categoría: no se toca.
  const gorra = porHandle(c, 'gorra');
  assert.equal(gorra.price.amount, PRECIO_GORRA);
  assert.equal(gorra.compareAtPrice, undefined);
});

test('una promoción con condición de carrito no baja el precio del catálogo', async () => {
  // Sin carrito no hay subtotal contra el que evaluarla. Es la regla que parte
  // el modelo en dos y se rompe sin hacer ruido.
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, discount_type, discount_value, min_subtotal)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Con mínimo', 'active', 'percentage', 5000, 10000)`,
  );

  const c = await catalogo();
  assert.equal(porHandle(c, 'remera').price.amount, PRECIO_REMERA);
});

test('un cupón tampoco baja el precio del catálogo', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, code, discount_type, discount_value)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Cupón', 'active', 'SECRETO', 'percentage', 5000)`,
  );

  const c = await catalogo();
  assert.equal(porHandle(c, 'remera').price.amount, PRECIO_REMERA);
});

test('el orden por precio usa el efectivo, no el de lista', async () => {
  // El bug que parece que funciona: la grilla muestra bien y ordena mal. La
  // remera vale más que la gorra de lista (150.000 contra 89.990) y menos con un
  // 60 % encima (60.000), así que el orden tiene que darse vuelta.
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);

  const sinPromo = await catalogo({ sort: 'price-asc' });
  assert.deepEqual(
    sinPromo.items.map((i) => i.handle),
    ['gorra', 'remera'],
    'el orden de partida no es el esperado',
  );

  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, discount_type, discount_value, target)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Sesenta', 'active', 'percentage', 6000,
             '{"kind":"product","ids":["${REMERA}"]}'::jsonb)`,
  );

  const conPromo = await catalogo({ sort: 'price-asc' });
  assert.deepEqual(
    conPromo.items.map((i) => i.handle),
    ['remera', 'gorra'],
    'ordenó por el precio de lista y no por el que se muestra',
  );
});

test('el filtro de precio y los extremos de la barra siguen al descuento', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);

  // Sin descuento la remera queda fuera de un techo de 100.000.
  const sinPromo = await catalogo({ precioMax: 100_000 });
  assert.deepEqual(
    sinPromo.items.map((i) => i.handle),
    ['gorra'],
  );

  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, discount_type, discount_value, target)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Sesenta', 'active', 'percentage', 6000,
             '{"kind":"product","ids":["${REMERA}"]}'::jsonb)`,
  );

  // Con 60 % sale 60.000 y tiene que entrar: si no, el filtro esconde algo que
  // el comprador sí puede pagar.
  const conPromo = await catalogo({ precioMax: 100_000 });
  assert.deepEqual([...conPromo.items.map((i) => i.handle)].sort(), ['gorra', 'remera']);

  const todo = await catalogo();
  assert.equal(todo.priceMin, 60_000, 'el extremo inferior de la barra no bajó');
});

test('una promoción vencida no toca el catálogo', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, discount_type, discount_value, ends_at)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Vencida', 'active', 'percentage', 5000,
             now() - interval '1 day')`,
  );

  const c = await catalogo();
  assert.equal(porHandle(c, 'remera').price.amount, PRECIO_REMERA);
});

test('el catálogo y el pedido cobran lo mismo', async () => {
  // La comprobación que cierra el círculo: lo que el comprador vio en la grilla
  // es lo que termina pagando.
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, discount_type, discount_value)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Quince', 'active', 'percentage', 1500)`,
  );

  const enLaGrilla = porHandle(await catalogo(), 'gorra').price.amount;
  const o = (await crear([{ variantId: V_GORRA, quantity: 3 }])).order!;

  assert.equal(o.total.amount, enLaGrilla * 3, 'el pedido no cobra lo que mostraba la grilla');
});

test('un carrito inválido no consume el tope de uso', async () => {
  // Las promociones se resuelven después de la revalidación justamente por esto.
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, code,
                             usage_limit, discount_type, discount_value)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Con tope', 'active', 'TOPE', 5, 'fixed', 10000)`,
  );

  const r = await crear([{ variantId: V_REMERA, quantity: 99_999 }], { couponCode: 'TOPE' });
  assert.equal(r.error, 'invalid_cart', 'el carrito inválido no fue rechazado');

  const filas = await comoServicio<{ usage_count: number }>(
    db,
    `select usage_count from promotions where code = 'TOPE'`,
  );
  assert.equal(filas[0]!.usage_count, 0, 'un carrito rechazado consumió el cupón');
});

// ---------------------------------------------------------------------------
// Los tipos de carrito en el pedido (ADR-164)
// ---------------------------------------------------------------------------

async function stockDe(variante: string): Promise<number> {
  const filas = await comoServicio<{ n: number }>(
    db,
    `select coalesce(sum(available), 0)::int as n from inventory_levels
     where variant_id = ${sql(variante)}`,
  );
  return filas[0]!.n;
}

async function ponerStock(variante: string, n: number): Promise<void> {
  await comoServicio(
    db,
    `update inventory_levels set available = ${n} where variant_id = ${sql(variante)}`,
  );
}

async function promoDeRegalo(): Promise<void> {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, kind, rules, target)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Gorra de regalo', 'active', 'gift',
             ${sql(JSON.stringify({ buy: 2, giftVariantId: V_GORRA, giftQuantity: 1 }))}::jsonb,
             ${sql(JSON.stringify({ kind: 'product', ids: [REMERA] }))}::jsonb)`,
  );
}

test('el regalo entra al pedido a precio cero y descuenta su stock', async () => {
  await promoDeRegalo();
  await ponerStock(V_GORRA, 5);

  const o = (await crear([{ variantId: V_REMERA, quantity: 2 }])).order!;
  const regalo = o.items.find((i) => i.isGift);

  assert.ok(regalo, 'el pedido no trae la línea de regalo');
  assert.equal(regalo.variantId, V_GORRA);
  assert.equal(regalo.unitPrice.amount, 0);
  assert.equal(regalo.quantity, 1);
  assert.equal(o.items.filter((i) => !i.isGift).length, 1, 'la remera dejó de ser una línea paga');
  assert.equal(o.total.amount, 300_000, 'el regalo cambió lo que se cobra');
  assert.equal(o.subtotal.amount, 300_000, 'el regalo entró al subtotal');
  assert.equal(await stockDe(V_GORRA), 4, 'el regalo no descontó stock');

  await ponerStock(V_GORRA, 100);
});

test('sin stock del regalo, la promoción se pausa y el pedido se crea igual', async () => {
  await promoDeRegalo();
  await ponerStock(V_GORRA, 0);

  const r = await crear([{ variantId: V_REMERA, quantity: 2 }]);
  assert.ok(r.order, `el pedido no se creó: ${r.error}`);
  assert.equal(r.order.items.length, 1, 'se regaló algo que no hay');
  assert.equal(r.order.appliedPromotions, undefined, 'la promoción figura aplicada sin regalo');
  assert.equal(await stockDe(V_GORRA), 0, 'el stock quedó negativo');

  await ponerStock(V_GORRA, 100);
});

test('el envío gratis por zona deja el envío en cero sólo en su zona', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, kind, rules)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Envío gratis a Central', 'active',
             'free_shipping', '{"zones": ["Central"]}'::jsonb)`,
  );
  await comoServicio(
    db,
    `insert into store_settings (store_id, tenant_id, settings)
     values (${sql(TIENDA)}, ${sql(TENANT)},
             '{"shipping": {"mode": "flat", "amount": 30000}}'::jsonb)
     on conflict (store_id) do update set settings = excluded.settings`,
  );

  try {
    const direccion = (zone: string) => ({
      address: { street: 'Siempre Viva 742', city: 'Asunción', zone },
    });
    const enCentral = (await crear([{ variantId: V_REMERA, quantity: 1 }], direccion('Central')))
      .order!;
    assert.equal(enCentral.shipping.amount, 0);
    assert.equal(enCentral.total.amount, 150_000);

    const afuera = (await crear([{ variantId: V_REMERA, quantity: 1 }], direccion('Itapúa')))
      .order!;
    assert.equal(afuera.shipping.amount, 30_000, 'regaló el envío fuera de su zona');
    assert.equal(afuera.total.amount, 180_000);
  } finally {
    await comoServicio(db, `delete from store_settings where store_id = ${sql(TIENDA)}`);
  }
});

test('un 3x2 cobra en el pedido lo mismo que dijo el carrito', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, kind, rules)
     values (${sql(TENANT)}, ${sql(TIENDA)}, '3x2', 'active', 'buy_x_pay_y',
             '{"buy": 3, "pay": 2}'::jsonb)`,
  );
  const o = (await crear([{ variantId: V_REMERA, quantity: 3 }])).order!;
  assert.equal(o.discount.amount, 150_000);
  assert.equal(o.total.amount, 300_000);
  assert.equal(o.total.amount, o.subtotal.amount - o.discount.amount);
});

test('ni un 3x2 ni un regalo cambian el precio del catálogo', async () => {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);
  await comoServicio(
    db,
    `insert into promotions (tenant_id, store_id, title, status, kind, rules)
     values (${sql(TENANT)}, ${sql(TIENDA)}, '3x2', 'active', 'buy_x_pay_y',
             '{"buy": 3, "pay": 2}'::jsonb),
            (${sql(TENANT)}, ${sql(TIENDA)}, 'Envío', 'active', 'free_shipping', '{}'::jsonb)`,
  );
  const remera = porHandle(await catalogo(), 'remera');
  assert.equal(remera.price.amount, PRECIO_REMERA);
  assert.equal(remera.compareAtPrice, undefined);
});

test('la base rechaza un 3x2 con cupón y un descuento sin valor', async () => {
  const cupon = await intentar(
    db,
    DUENO,
    `insert into promotions (tenant_id, store_id, title, kind, code, rules)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'X', 'buy_x_pay_y', 'TRES', '{"buy":3,"pay":2}')`,
  );
  assert.equal(cupon.ok, false, 'entró un 3x2 con código');

  const sinValor = await intentar(
    db,
    DUENO,
    `insert into promotions (tenant_id, store_id, title, kind)
     values (${sql(TENANT)}, ${sql(TIENDA)}, 'Y', 'discount')`,
  );
  assert.equal(sinValor.ok, false, 'entró un descuento sin tipo ni valor');
});
