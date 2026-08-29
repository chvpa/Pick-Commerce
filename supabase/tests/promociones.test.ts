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
}

function promo(parcial: Partial<Promotion> & Pick<Promotion, 'id'>): Promotion {
  return {
    title: 'Promo',
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

/** Inserta las promociones del escenario y devuelve lo que calculó el SQL. */
async function enSql(
  e: Escenario,
): Promise<{ subtotal: number; discount: number; total: number; couponIssue?: string }> {
  await comoServicio(db, `delete from promotions where store_id = ${sql(TIENDA)}`);

  for (const p of e.promos) {
    await comoServicio(
      db,
      `insert into promotions (
         id, tenant_id, store_id, title, status, priority, stackable, code,
         starts_at, ends_at, usage_limit, usage_count,
         discount_type, discount_value, target, min_subtotal, min_quantity
       ) values (
         ${sql(p.id)}, ${sql(TENANT)}, ${sql(TIENDA)}, ${sql(p.title)},
         ${sql(p.status)}, ${p.priority}, ${p.stackable},
         ${p.code ? sql(p.code) : 'null'},
         ${p.startsAt ? `${sql(p.startsAt)}::timestamptz` : 'null'},
         ${p.endsAt ? `${sql(p.endsAt)}::timestamptz` : 'null'},
         ${p.usageLimit ?? 'null'}, ${p.usageCount},
         ${sql(p.discountType)}, ${p.discountValue},
         ${sql(JSON.stringify(p.target))}::jsonb,
         ${p.minSubtotal ?? 'null'}, ${p.minQuantity ?? 'null'}
       )`,
    );
  }

  const lineas = e.lineas.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
  const filas = await comoServicio<{ j: Record<string, number | string> }>(
    db,
    `select cart_promotions(${sql(TIENDA)}::uuid, ${sql(JSON.stringify(lineas))}::jsonb,
                            ${e.codigo ? sql(e.codigo) : 'null'}) as j`,
  );
  return filas[0]!.j as never;
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
];

for (const e of ESCENARIOS) {
  test(`paridad SQL/core: ${e.nombre}`, async () => {
    const sqlR = await enSql(e);
    const coreR = aplicarAlCarrito(e.lineas, e.promos, new Date(), e.codigo);

    assert.equal(sqlR.subtotal, coreR.subtotal.amount, 'el subtotal difiere');
    assert.equal(sqlR.discount, coreR.discount.amount, 'el descuento difiere');
    assert.equal(sqlR.total, coreR.total.amount, 'el total difiere');
    assert.equal(sqlR.couponIssue, coreR.couponIssue, 'el motivo de rechazo del cupón difiere');
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
  readonly items: readonly { unitPrice: { amount: number }; quantity: number }[];
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
