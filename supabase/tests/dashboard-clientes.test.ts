import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, intentar } from './harness.ts';

/**
 * El resumen del Admin y la lista de clientes.
 *
 * Los pedidos se insertan directo en vez de por `create_order`: acá lo que se
 * prueba es cómo se agregan, y eso exige fechas y estados puestos a mano —un
 * pedido de hace cuarenta días no se crea llamando al checkout—. Que crear un
 * pedido funcione ya lo cubre `pedidos.test.ts`.
 *
 * Las dos funciones son `security invoker`, así que las lecturas van con `como`,
 * que hace rollback: ninguna escribe nada.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'a5000000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'bb000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b5000000-0000-4000-8000-000000000000';

const DUENO = 'f1000000-0000-4000-8000-000000000000';
const VIEWER = 'f1000000-0000-4000-8000-000000000001';
const AJENO_USER = 'f1000000-0000-4000-8000-000000000002';

const ANA = 'c1000000-0000-4000-8000-000000000000';
const BETO = 'c1000000-0000-4000-8000-000000000001';
const CARLA = 'c1000000-0000-4000-8000-000000000002';
const CLIENTE_AJENO = 'c1000000-0000-4000-8000-000000000003';

const O_ANA_VIEJO = '01000000-0000-4000-8000-000000000000';
const O_ANA = '01000000-0000-4000-8000-000000000001';
const O_ANA_CANCELADO = '01000000-0000-4000-8000-000000000002';
const O_BETO = '01000000-0000-4000-8000-000000000003';
const O_AJENO = '01000000-0000-4000-8000-000000000004';

/*
 * Un catálogo mínimo, para el modo «sin movimiento».
 *
 * Lo que no se vendió no tiene líneas de pedido, así que sale del catálogo: sin
 * productos sembrados ese modo devolvería vacío y el test pasaría sin probar
 * nada.
 */
const SUCURSAL = 'a6000000-0000-4000-8000-000000000000';
const P_REMERA = 'd1000000-0000-4000-8000-000000000000';
const P_MOCHILA = 'd1000000-0000-4000-8000-000000000001';
const P_BORRADOR = 'd1000000-0000-4000-8000-000000000002';

/** La ventana que usan casi todos los casos: los últimos 7 días. */
const VENTANA = `now() - interval '7 days', now() + interval '1 hour'`;

let db: PGlite;

interface Resumen {
  readonly sales: { amount: number; currency: string };
  readonly orderCount: number;
  readonly units: number;
  readonly margin: { amount: number; currency: string } | null;
  readonly marginCoverage: number;
  readonly aov: { amount: number; currency: string };
  readonly byStatus: Record<string, number>;
  readonly topProducts: readonly {
    title: string;
    variantTitle?: string;
    sku: string;
    quantity: number;
    revenue: { amount: number };
  }[];
  readonly recent: readonly { number: number; customerName: string; itemCount: number }[];
}

interface Cliente {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly taxId?: string;
  readonly orderCount: number;
  readonly totalSpent: { amount: number; currency: string };
  readonly lastOrderAt?: string;
}

interface PaginaClientes {
  readonly items: readonly Cliente[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

async function resumen(usuario = DUENO, tienda = TIENDA): Promise<Resumen> {
  const filas = await como<{ j: Resumen }>(
    db,
    usuario,
    `select admin_dashboard('${tienda}'::uuid, ${VENTANA}) as j`,
  );
  return filas[0]!.j;
}

async function clientes(
  opciones: { usuario?: string; tienda?: string; query?: string; id?: string; page?: number } = {},
): Promise<PaginaClientes> {
  const filas = await como<{ j: PaginaClientes }>(
    db,
    opciones.usuario ?? DUENO,
    `select admin_customers(
       '${opciones.tienda ?? TIENDA}'::uuid,
       '${(opciones.query ?? '').replace(/'/g, "''")}',
       ${opciones.id ? `'${opciones.id}'::uuid` : 'null'},
       ${opciones.page ?? 1},
       20
     ) as j`,
  );
  return filas[0]!.j;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@a.test'), ('${VIEWER}', 'viewer@a.test'), ('${AJENO_USER}', 'ajeno@b.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'a'), ('${OTRO_TENANT}', 'Comercio B', 'b');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta', 'a.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tb', 'b.test', 'PYG');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      ('${OTRO_TENANT}', '${AJENO_USER}', 'owner');

    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Depósito');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${P_REMERA}', '${TENANT}', '${TIENDA}', 'remera', 'Remera lisa', 'active'),
      ('${P_MOCHILA}', '${TENANT}', '${TIENDA}', 'mochila', 'Mochila técnica', 'active'),
      -- Sin publicar: no se vendió, pero tampoco está a la venta. No es un
      -- producto que no se mueve, es uno que todavía no salió.
      ('${P_BORRADOR}', '${TENANT}', '${TIENDA}', 'borrador', 'Sin publicar', 'draft');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, cost, currency, position) values
      ('e1000000-0000-4000-8000-000000000000', '${TENANT}', '${P_REMERA}', 'REM-M', 'M', 150000, 90000, 'PYG', 0),
      ('e1000000-0000-4000-8000-000000000001', '${TENANT}', '${P_MOCHILA}', 'MOC-1', 'Única', 480000, 300000, 'PYG', 0),
      ('e1000000-0000-4000-8000-000000000002', '${TENANT}', '${P_BORRADOR}', 'BOR-1', 'Única', 90000, null, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${TENANT}', 'e1000000-0000-4000-8000-000000000000', '${SUCURSAL}', 20),
      ('${TENANT}', 'e1000000-0000-4000-8000-000000000001', '${SUCURSAL}', 14),
      ('${TENANT}', 'e1000000-0000-4000-8000-000000000002', '${SUCURSAL}', 5);

    insert into customers (id, tenant_id, store_id, email, name, phone, tax_id) values
      ('${ANA}', '${TENANT}', '${TIENDA}', 'ana@cliente.test', 'Ana López', '0981111111', '80012345-6'),
      ('${BETO}', '${TENANT}', '${TIENDA}', 'beto@cliente.test', 'Beto Gómez', '0982222222', null),
      -- Existe sin haber comprado: el checkout crea al cliente antes de que el
      -- pedido pueda cancelarse, así que este caso es alcanzable.
      ('${CARLA}', '${TENANT}', '${TIENDA}', 'carla@cliente.test', 'Carla Ruiz', '0983333333', null),
      ('${CLIENTE_AJENO}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'ana@cliente.test', 'Ana del otro', '0984444444', null);

    insert into orders (
      id, tenant_id, store_id, number, idempotency_key, status, payment_method,
      customer_id, customer, address, total_amount, currency, created_at
    ) values
      -- Fuera de la ventana de 7 días, pero de Ana igual.
      ('${O_ANA_VIEJO}', '${TENANT}', '${TIENDA}', 1001, gen_random_uuid(), 'delivered', 'bank_transfer',
       '${ANA}', '{"name":"Ana López","email":"ana@cliente.test"}', '{"street":"x","city":"y"}',
       200000, 'PYG', now() - interval '40 days'),

      ('${O_ANA}', '${TENANT}', '${TIENDA}', 1002, gen_random_uuid(), 'delivered', 'bank_transfer',
       '${ANA}', '{"name":"Ana López","email":"ana@cliente.test"}', '{"street":"x","city":"y"}',
       300000, 'PYG', now() - interval '5 days'),

      -- Cancelado y caro: si se colara, se notaría en todas las métricas.
      ('${O_ANA_CANCELADO}', '${TENANT}', '${TIENDA}', 1003, gen_random_uuid(), 'cancelled', 'bank_transfer',
       '${ANA}', '{"name":"Ana López","email":"ana@cliente.test"}', '{"street":"x","city":"y"}',
       900000, 'PYG', now() - interval '3 days'),

      ('${O_BETO}', '${TENANT}', '${TIENDA}', 1004, gen_random_uuid(), 'received', 'bank_transfer',
       '${BETO}', '{"name":"Beto Gómez","email":"beto@cliente.test"}', '{"street":"x","city":"y"}',
       100000, 'PYG', now() - interval '1 day'),

      ('${O_AJENO}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 1001, gen_random_uuid(), 'delivered', 'bank_transfer',
       '${CLIENTE_AJENO}', '{"name":"Ana del otro","email":"ana@cliente.test"}', '{"street":"x","city":"y"}',
       750000, 'PYG', now() - interval '2 days');

    insert into order_items (tenant_id, order_id, title, variant_title, sku, unit_price, unit_cost, currency, quantity, position) values
      ('${TENANT}', '${O_ANA_VIEJO}', 'Remera lisa', 'M', 'REM-M', 100000, 60000, 'PYG', 2, 0),
      -- Dentro de la ventana: la remera tiene costo y la gorra no. Así la
      -- cobertura del margen es parcial, que es el caso real de un catálogo a
      -- medio cargar y el único que distingue un margen honesto de uno inflado.
      ('${TENANT}', '${O_ANA}', 'Remera lisa', 'M', 'REM-M', 150000, 90000, 'PYG', 2, 0),
      ('${TENANT}', '${O_ANA_CANCELADO}', 'Campera', 'L', 'CAM-L', 900000, 100000, 'PYG', 1, 0),
      ('${TENANT}', '${O_BETO}', 'Gorra', null, 'GOR-1', 100000, null, 'PYG', 1, 0),
      ('${OTRO_TENANT}', '${O_AJENO}', 'Zapatilla', '42', 'ZAP-42', 750000, 300000, 'PYG', 1, 0);
  `);
});

after(async () => {
  await db.close();
});

// --- Resumen -----------------------------------------------------------------

test('las ventas del período excluyen lo cancelado y lo que quedó fuera del rango', async () => {
  const r = await resumen();
  // 300.000 de Ana + 100.000 de Beto. Ni los 900.000 cancelados ni los 200.000
  // de hace cuarenta días.
  assert.equal(r.sales.amount, 400000);
  assert.equal(r.sales.currency, 'PYG');
  assert.equal(r.orderCount, 2);
  assert.equal(r.aov.amount, 200000);
});

test('el desglose por estado sí cuenta los cancelados', async () => {
  const r = await resumen();
  assert.deepEqual(r.byStatus, { delivered: 1, cancelled: 1, received: 1 });
});

test('lo más vendido agrupa por el snapshot y deja fuera lo cancelado', async () => {
  const r = await resumen();
  assert.deepEqual(
    r.topProducts.map((p) => [p.sku, p.quantity, p.revenue.amount]),
    [
      ['REM-M', 2, 300000],
      ['GOR-1', 1, 100000],
    ],
    'la campera cancelada llegó al top, o el orden no es por cantidad',
  );
  assert.equal(r.topProducts[0]!.variantTitle, 'M');
  assert.equal(r.topProducts[1]!.variantTitle, undefined, 'un opcional llegó nulo (ADR-059)');
});

test('las unidades del período son las líneas de lo vendido', async () => {
  const r = await resumen();
  // 2 remeras de Ana + 1 gorra de Beto. Ni la campera cancelada ni las 2 de hace
  // cuarenta días.
  assert.equal(r.units, 3);
});

test('el margen suma sólo lo que tiene costo, y dice cuánto cubre', async () => {
  /*
   * Es la métrica que más fácil miente. Con la mitad del catálogo sin costo
   * cargado, sumar sólo lo que tiene costo y presentarlo como «el margen» da el
   * doble de lo real y parece excelente.
   *
   * Acá: la remera aporta (150.000 − 90.000) × 2 = 120.000, y la gorra no aporta
   * nada porque no tiene costo. La cobertura es 300.000 de 400.000 de ingresos.
   */
  const r = await resumen();
  assert.equal(r.margin?.amount, 120000);
  assert.equal(r.margin?.currency, 'PYG');
  assert.equal(r.marginCoverage, 0.75);
});

// --- Ventas por producto -----------------------------------------------------

interface Fila {
  readonly sku: string;
  readonly title: string;
  readonly variantTitle?: string;
  readonly unidades: number;
  readonly ingresos: { amount: number };
  readonly margen?: { amount: number };
  readonly stock?: number;
}

interface Pagina {
  readonly items: readonly Fila[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
}

async function rendimiento(
  modo: 'vendidos' | 'sin_movimiento',
  opciones: { usuario?: string; page?: number; perPage?: number } = {},
): Promise<Pagina> {
  const filas = await como<{ j: Pagina }>(
    db,
    opciones.usuario ?? DUENO,
    `select admin_product_performance('${TIENDA}'::uuid, ${VENTANA}, '${modo}',
       ${opciones.page ?? 1}, ${opciones.perPage ?? 20}) as j`,
  );
  return filas[0]!.j;
}

test('lo vendido se agrupa por sku, de mayor a menor, con su margen', async () => {
  const p = await rendimiento('vendidos');
  assert.deepEqual(
    p.items.map((f) => [f.sku, f.unidades, f.ingresos.amount, f.margen?.amount ?? null]),
    [
      ['REM-M', 2, 300000, 120000],
      // Sin costo cargado: el margen va `null` y no cero. Cero es un margen;
      // «no sé» no lo es.
      ['GOR-1', 1, 100000, null],
    ],
  );
  assert.equal(p.total, 2);
});

test('sin movimiento son las variantes publicadas que no vendieron, con su stock', async () => {
  /*
   * Sale del catálogo y no de los pedidos: lo que no se vendió no tiene líneas.
   *
   * Trae el stock porque sin él «no se vendió» es una curiosidad, y con él es
   * cuánta plata está quieta — que es lo que hace accionable el dato.
   */
  const p = await rendimiento('sin_movimiento');
  assert.deepEqual(
    p.items.map((f) => [f.sku, f.stock]),
    [['MOC-1', 14]],
    'entró un borrador, o faltó la mochila',
  );
  // La remera vendió, así que no está. El borrador no está a la venta: no es un
  // producto que no se mueve, es uno que todavía no salió.
  assert.equal(p.total, 1);
});

test('un comercio ajeno no ve el rendimiento de esta tienda', async () => {
  const p = await rendimiento('vendidos', { usuario: AJENO_USER });
  assert.deepEqual(p.items, []);
  assert.equal(p.total, 0);
});

test('pedir una página que no existe devuelve la última, no una lista vacía', async () => {
  // Una lista vacía se confunde con «no hay nada», que es lo contrario de lo que
  // pasa. Mismo criterio que el resto de las listas del Admin.
  const p = await rendimiento('vendidos', { page: 99, perPage: 1 });
  assert.equal(p.page, 2);
  assert.equal(p.pageCount, 2);
  assert.equal(p.items.length, 1);
});

test('los pedidos recientes ignoran el período', async () => {
  const r = await resumen();
  // Los cuatro de la tienda, del más nuevo al más viejo. El de hace cuarenta
  // días está: es la bandeja de entrada, no una métrica.
  assert.deepEqual(
    r.recent.map((o) => o.number),
    [1004, 1003, 1002, 1001],
  );
  assert.equal(r.recent[0]!.customerName, 'Beto Gómez');
  assert.equal(r.recent[0]!.itemCount, 1);
});

test('sin pedidos en el período no hay división por cero', async () => {
  const filas = await como<{ j: Resumen }>(
    db,
    DUENO,
    `select admin_dashboard('${TIENDA}'::uuid,
                            now() - interval '400 days',
                            now() - interval '300 days') as j`,
  );
  const r = filas[0]!.j;
  assert.equal(r.sales.amount, 0);
  assert.equal(r.orderCount, 0);
  assert.equal(r.aov.amount, 0);
  assert.deepEqual(r.byStatus, {});
  assert.deepEqual([...r.topProducts], []);
});

test('un viewer ve el resumen', async () => {
  // Leer no exige permiso: alcanza con ser miembro. Lo que un viewer no puede
  // es escribir, y eso lo cubren las políticas.
  const r = await resumen(VIEWER);
  assert.equal(r.sales.amount, 400000);
});

test('el resumen de otro comercio sale en cero', async () => {
  const r = await resumen(AJENO_USER);
  assert.equal(r.sales.amount, 0, 'un comercio vio las ventas de otro');
  assert.equal(r.orderCount, 0);
  assert.deepEqual([...r.recent], [], 'un comercio vio los pedidos de otro');
});

test('el rol anónimo no puede pedir el resumen', async () => {
  const r = await intentar(db, null, `select admin_dashboard('${TIENDA}'::uuid, ${VENTANA})`);
  assert.equal(r.ok, false, 'anon pudo invocar admin_dashboard');
});

// --- Clientes -----------------------------------------------------------------

test('los agregados de cada cliente descuentan lo cancelado', async () => {
  const p = await clientes();
  assert.equal(p.total, 3);

  const ana = p.items.find((c) => c.id === ANA)!;
  // Dos pedidos: el de hace cuarenta días y el de hace cinco. El cancelado no.
  assert.equal(ana.orderCount, 2);
  assert.equal(ana.totalSpent.amount, 500000, 'sumó el pedido cancelado');
  assert.equal(ana.totalSpent.currency, 'PYG');
  assert.ok(ana.lastOrderAt, 'no trajo la fecha del último pedido');
  assert.equal(ana.taxId, '80012345-6');

  const carla = p.items.find((c) => c.id === CARLA)!;
  assert.equal(carla.orderCount, 0);
  assert.equal(carla.totalSpent.amount, 0);
  assert.equal(carla.lastOrderAt, undefined, 'un opcional llegó nulo (ADR-059)');
  assert.equal(carla.taxId, undefined);
});

test('los que compraron hace poco van primero, y los que nunca compraron al final', async () => {
  const p = await clientes();
  assert.deepEqual(
    p.items.map((c) => c.id),
    [BETO, ANA, CARLA],
  );
});

test('la búsqueda funciona por nombre, correo y teléfono', async () => {
  for (const [query, esperado] of [
    ['beto', BETO],
    ['carla@cliente.test', CARLA],
    ['0981111111', ANA],
  ] as const) {
    const p = await clientes({ query });
    assert.deepEqual(
      p.items.map((c) => c.id),
      [esperado],
      `la búsqueda "${query}" no encontró a quien debía`,
    );
  }
});

test('la búsqueda exige todos los términos', async () => {
  assert.equal((await clientes({ query: 'ana lópez' })).total, 1);
  assert.equal(
    (await clientes({ query: 'ana gómez' })).total,
    0,
    'alcanzó con que coincidiera un término',
  );
});

test('p_customer_id devuelve exactamente ese cliente', async () => {
  const p = await clientes({ id: BETO });
  assert.equal(p.total, 1);
  assert.equal(p.items[0]!.id, BETO);
});

test('una página fuera de rango se acota a la última', async () => {
  const p = await clientes({ page: 99 });
  assert.equal(p.page, 1);
  assert.equal(p.pageCount, 1);
  assert.equal(p.items.length, 3);
});

test('un comercio no ve los clientes de otro', async () => {
  // El fixture le puso al otro comercio un cliente con el **mismo** correo, que
  // es como se detectaría un filtro por email en vez de por tienda.
  const p = await clientes({ usuario: AJENO_USER });
  assert.deepEqual([...p.items], [], 'un comercio vio los clientes de otro');
  assert.equal(p.total, 0);
});

test('el rol anónimo no puede listar clientes', async () => {
  const r = await intentar(db, null, `select admin_customers('${TIENDA}'::uuid)`);
  assert.equal(r.ok, false, 'anon pudo invocar admin_customers');
});
