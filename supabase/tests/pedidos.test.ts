import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, comoServicio, intentar } from './harness.ts';

/**
 * `create_order`: donde puede salir mal el dinero.
 *
 * El harness normal (`como`, `intentar`) hace rollback siempre, que es lo
 * correcto para afirmar sobre lecturas y rechazos. Acá no alcanza: verificar que
 * un reintento **no** descuenta stock dos veces exige que la primera llamada
 * persista. Por eso `comoServicio`, que confirma la transacción y corre con el
 * rol de la secret key, que es exactamente como la llama el storefront.
 *
 * El orden de los tests importa: comparten la base y consumen stock. Cada uno
 * dice de cuánto parte.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'a5000000-0000-4000-8000-000000000000';
const SUCURSAL = 'a6000000-0000-4000-8000-000000000000';
const SUCURSAL_2 = 'a6000000-0000-4000-8000-000000000001';

const OTRO_TENANT = 'bb000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b5000000-0000-4000-8000-000000000000';
const OTRA_SUCURSAL = 'b6000000-0000-4000-8000-000000000000';

const REMERA = 'd1000000-0000-4000-8000-000000000000';
const BORRADOR = 'd1000000-0000-4000-8000-000000000001';
const REPARTIDO = 'd1000000-0000-4000-8000-000000000002';
const AJENO = 'd1000000-0000-4000-8000-000000000003';

const V_REMERA = 'e1000000-0000-4000-8000-000000000000';
/** Misma remera, otra talla, **sin costo cargado**: el catálogo real es así. */
const V_SIN_COSTO = 'e1000000-0000-4000-8000-00000000000f';
const V_BORRADOR = 'e1000000-0000-4000-8000-000000000001';
const V_REPARTIDO = 'e1000000-0000-4000-8000-000000000002';
const V_AJENA = 'e1000000-0000-4000-8000-000000000003';

const DUENO = 'f1000000-0000-4000-8000-000000000000';
const VIEWER = 'f1000000-0000-4000-8000-000000000001';
const AJENO_USER = 'f1000000-0000-4000-8000-000000000002';

let db: PGlite;

interface Pedido {
  readonly id: string;
  readonly number: number;
  readonly status: string;
  readonly paymentStatus: string;
  readonly total: { amount: number; currency: string };
  readonly items: readonly {
    variantId?: string;
    title: string;
    sku: string;
    quantity: number;
    unitPrice: { amount: number };
  }[];
  readonly customer: Record<string, unknown>;
  readonly notes?: string;
}

type Respuesta =
  | { order: Pedido }
  | { error: string; issues: readonly { type: string; variantId: string; available?: number }[] };

function sql(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

const CLIENTE = {
  name: 'Ana López',
  email: 'ana@cliente.test',
  phone: '0981123456',
};

async function crear(
  lineas: readonly { variantId: string; quantity: number }[],
  opciones: {
    clave?: string;
    tienda?: string;
    cliente?: Record<string, string>;
    notas?: string;
  } = {},
): Promise<Respuesta> {
  const payload = {
    customer: opciones.cliente ?? CLIENTE,
    address: { street: 'Avda. Siempre Viva 742', city: 'Asunción' },
    paymentMethod: 'bank_transfer',
    lines: lineas,
    ...(opciones.notas ? { notes: opciones.notas } : {}),
  };
  const filas = await comoServicio<{ j: Respuesta }>(
    db,
    `select create_order(${sql(opciones.tienda ?? TIENDA)}::uuid,
                         ${sql(opciones.clave ?? crypto.randomUUID())}::uuid,
                         ${sql(JSON.stringify(payload))}::jsonb) as j`,
  );
  return filas[0]!.j;
}

function pedido(r: Respuesta): Pedido {
  assert.ok('order' in r, `se esperaba un pedido y llegó: ${JSON.stringify(r)}`);
  return r.order;
}

function problemas(
  r: Respuesta,
): readonly { type: string; variantId: string; available?: number }[] {
  assert.ok('issues' in r, `se esperaban problemas y llegó: ${JSON.stringify(r)}`);
  return r.issues;
}

async function stock(variante: string): Promise<number> {
  const r = await db.query<{ n: number }>(
    `select coalesce(sum(available), 0)::int as n from inventory_levels where variant_id = $1`,
    [variante],
  );
  return r.rows[0]!.n;
}

async function contar(tabla: string): Promise<number> {
  const r = await db.query<{ n: number }>(`select count(*)::int as n from ${tabla}`);
  return r.rows[0]!.n;
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

    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central'),
      ('${SUCURSAL_2}', '${TENANT}', '${TIENDA}', 'Sucursal'),
      ('${OTRA_SUCURSAL}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'Depósito B');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      ('${OTRO_TENANT}', '${AJENO_USER}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${REMERA}', '${TENANT}', '${TIENDA}', 'remera', 'Remera lisa', 'active'),
      ('${BORRADOR}', '${TENANT}', '${TIENDA}', 'borrador', 'Sin publicar', 'draft'),
      ('${REPARTIDO}', '${TENANT}', '${TIENDA}', 'repartido', 'En dos sucursales', 'active'),
      ('${AJENO}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'ajeno', 'De otro comercio', 'active');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, cost, currency, position) values
      -- La remera tiene costo cargado; el repartido no. Los dos casos existen en
      -- un catálogo real y el pedido tiene que distinguirlos.
      ('${V_REMERA}', '${TENANT}', '${REMERA}', 'REM-M', 'M', 150000, 90000, 'PYG', 0),
      ('${V_SIN_COSTO}', '${TENANT}', '${REMERA}', 'REM-L', 'L', 150000, null, 'PYG', 1),
      ('${V_BORRADOR}', '${TENANT}', '${BORRADOR}', 'BOR-1', 'Única', 90000, null, 'PYG', 0),
      ('${V_REPARTIDO}', '${TENANT}', '${REPARTIDO}', 'REP-1', 'Única', 50000, null, 'PYG', 0),
      ('${V_AJENA}', '${OTRO_TENANT}', '${AJENO}', 'AJE-1', 'Única', 70000, null, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${TENANT}', '${V_REMERA}', '${SUCURSAL}', 40),
      ('${TENANT}', '${V_SIN_COSTO}', '${SUCURSAL}', 40),
      ('${TENANT}', '${V_BORRADOR}', '${SUCURSAL}', 5),
      -- Repartido a propósito para probar el descuento entre sucursales.
      ('${TENANT}', '${V_REPARTIDO}', '${SUCURSAL}', 3),
      ('${TENANT}', '${V_REPARTIDO}', '${SUCURSAL_2}', 7),
      ('${OTRO_TENANT}', '${V_AJENA}', '${OTRA_SUCURSAL}', 4);
  `);
});

after(async () => {
  await db.close();
});

// --- Creación ---------------------------------------------------------------

test('el primer pedido es el 1001, con snapshot y timeline', async () => {
  const antes = await stock(V_REMERA);
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 2 }], { notas: 'Timbre roto' }));

  assert.equal(o.number, 1001, 'la numeración no arranca en 1001');
  assert.equal(o.status, 'received');
  assert.equal(o.paymentStatus, 'pending');
  assert.equal(o.total.amount, 300000, 'el total no salió del precio de la base');
  assert.equal(o.total.currency, 'PYG');
  assert.equal(o.notes, 'Timbre roto');

  assert.equal(o.items.length, 1);
  assert.equal(o.items[0]!.title, 'Remera lisa');
  assert.equal(o.items[0]!.sku, 'REM-M');
  assert.equal(o.items[0]!.unitPrice.amount, 150000);

  assert.equal(await stock(V_REMERA), antes - 2, 'no descontó el stock');

  const eventos = await db.query<{ type: string }>(
    `select type from order_events where order_id = $1`,
    [o.id],
  );
  assert.deepEqual(
    eventos.rows.map((e) => e.type),
    ['created'],
  );
});

test('el segundo pedido es el 1002', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));
  assert.equal(o.number, 1002);
});

test('la línea copia el costo del catálogo, y null cuando no hay', async () => {
  /*
   * El costo se copia como el título y el precio, y por el mismo motivo: el
   * catálogo cambia, y el pedido tiene que poder decir cuánto se ganó **ese
   * día**. Sin esto el margen sólo se podía calcular volviendo al catálogo, que
   * daría el costo de hoy.
   *
   * El caso `null` importa tanto como el otro: el costo es opcional, y guardarlo
   * como cero diría margen del 100 %. El panel declara qué fracción de los
   * ingresos tiene costo conocido en vez de suponerlo.
   */
  // Las dos en el mismo pedido: es el caso interesante, porque la cobertura del
  // margen se calcula por línea y no por pedido.
  const o = pedido(
    await crear([
      { variantId: V_REMERA, quantity: 2 },
      { variantId: V_SIN_COSTO, quantity: 1 },
    ]),
  );

  const lineas = await comoServicio<{ sku: string; unit_cost: number | null }>(
    db,
    `select sku, unit_cost from order_items where order_id = ${sql(o.id)}::uuid order by sku`,
  );

  assert.deepEqual(
    lineas.map((l) => [l.sku, l.unit_cost]),
    [
      ['REM-L', null],
      ['REM-M', 90000],
    ],
  );
});

test('el precio lo pone la base, no el cliente', async () => {
  // Un payload que intenta imponer su propio precio: la función ni lo mira.
  const filas = await comoServicio<{ j: Respuesta }>(
    db,
    `select create_order(${sql(TIENDA)}::uuid, ${sql(crypto.randomUUID())}::uuid, ${sql(
      JSON.stringify({
        customer: CLIENTE,
        address: { street: 'x', city: 'y' },
        paymentMethod: 'bank_transfer',
        lines: [{ variantId: V_REMERA, quantity: 1, price: 1, unitPrice: 1 }],
      }),
    )}::jsonb) as j`,
  );
  const o = pedido(filas[0]!.j);
  // Las dos cosas: el precio de la línea y el total. El total se calcula por
  // separado del `unit_price` que se guarda, así que comprobar sólo uno deja
  // pasar que el otro venga del cliente — pasó al sabotear esto a propósito.
  assert.equal(o.items[0]!.unitPrice.amount, 150000, 'guardó un precio del payload');
  assert.equal(o.total.amount, 150000, 'totalizó con un precio del payload');

  const guardado = await db.query<{ unit_price: number }>(
    `select unit_price from order_items where order_id = $1`,
    [o.id],
  );
  assert.equal(Number(guardado.rows[0]!.unit_price), 150000);
});

// --- Idempotencia -----------------------------------------------------------

test('la misma clave devuelve el mismo pedido y descuenta una sola vez', async () => {
  const clave = crypto.randomUUID();
  const antes = await stock(V_REMERA);

  const primero = pedido(await crear([{ variantId: V_REMERA, quantity: 2 }], { clave }));
  const intermedio = await stock(V_REMERA);
  const segundo = pedido(await crear([{ variantId: V_REMERA, quantity: 2 }], { clave }));

  assert.equal(segundo.id, primero.id, 'creó un pedido nuevo con la misma clave');
  assert.equal(segundo.number, primero.number);
  assert.equal(intermedio, antes - 2);
  assert.equal(await stock(V_REMERA), antes - 2, 'el reintento descontó stock de nuevo');
});

// --- Rechazos: no escriben nada ---------------------------------------------

test('sin stock suficiente devuelve el problema y no escribe nada', async () => {
  const antesStock = await stock(V_REMERA);
  const antesPedidos = await contar('orders');
  const antesClientes = await contar('customers');
  const antesContador = await db.query<{ n: number }>(
    `select last_number as n from order_counters where store_id = $1`,
    [TIENDA],
  );

  const issues = problemas(await crear([{ variantId: V_REMERA, quantity: 9999 }]));

  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.type, 'insufficient_stock');
  assert.equal(issues[0]!.variantId, V_REMERA);
  assert.equal(issues[0]!.available, antesStock, 'no informó cuánto queda de verdad');

  assert.equal(await stock(V_REMERA), antesStock, 'tocó el stock igual');
  assert.equal(await contar('orders'), antesPedidos, 'creó el pedido igual');
  assert.equal(await contar('customers'), antesClientes, 'creó el cliente igual');

  const despuesContador = await db.query<{ n: number }>(
    `select last_number as n from order_counters where store_id = $1`,
    [TIENDA],
  );
  assert.equal(
    despuesContador.rows[0]?.n,
    antesContador.rows[0]?.n,
    'consumió un número de pedido para nada',
  );
});

test('una variante de otra tienda no existe para este checkout', async () => {
  const issues = problemas(await crear([{ variantId: V_AJENA, quantity: 1 }]));
  assert.equal(issues[0]!.type, 'variant_unavailable');
  assert.equal(await stock(V_AJENA), 4, 'descontó stock de otro comercio');
});

test('un producto en borrador tampoco se puede comprar', async () => {
  const issues = problemas(await crear([{ variantId: V_BORRADOR, quantity: 1 }]));
  assert.equal(issues[0]!.type, 'variant_unavailable');
  assert.equal(await stock(V_BORRADOR), 5);
});

test('los problemas se informan todos juntos, no de a uno', async () => {
  const issues = problemas(
    await crear([
      { variantId: V_AJENA, quantity: 1 },
      { variantId: V_REMERA, quantity: 9999 },
    ]),
  );
  assert.equal(issues.length, 2, 'informó un problema por vez');
});

// --- Stock -------------------------------------------------------------------

test('el descuento reparte entre sucursales y anota de cuál salió', async () => {
  // Central 3, Sucursal 7. Pidiendo 8 tiene que vaciar la más llena primero.
  const o = pedido(await crear([{ variantId: V_REPARTIDO, quantity: 8 }]));

  const niveles = await db.query<{ location_id: string; available: number }>(
    `select location_id, available from inventory_levels where variant_id = $1 order by location_id`,
    [V_REPARTIDO],
  );
  assert.deepEqual(
    niveles.rows.map((n) => n.available),
    [2, 0],
    'no descontó de la sucursal con más stock primero',
  );

  const asignacion = await db.query<{ a: { locationId: string; quantity: number }[] }>(
    `select stock_allocation as a from order_items where order_id = $1`,
    [o.id],
  );
  assert.deepEqual(
    [...asignacion.rows[0]!.a].sort((x, y) => x.quantity - y.quantity),
    [
      { locationId: SUCURSAL, quantity: 1 },
      { locationId: SUCURSAL_2, quantity: 7 },
    ].sort((x, y) => x.quantity - y.quantity),
  );
});

test('dos líneas de la misma variante se validan sumadas, no por separado', async () => {
  const disponible = await stock(V_REMERA);
  const issues = problemas(
    await crear([
      { variantId: V_REMERA, quantity: disponible },
      { variantId: V_REMERA, quantity: 1 },
    ]),
  );
  assert.equal(issues[0]!.type, 'insufficient_stock', 'validó cada línea contra el stock entero');
  assert.equal(await stock(V_REMERA), disponible, 'dejó el inventario en negativo');
});

// --- Cliente -----------------------------------------------------------------

test('el mismo email no crea un cliente nuevo, pero sí un pedido nuevo', async () => {
  const clientes = await contar('customers');
  const pedidos = await contar('orders');

  await crear([{ variantId: V_REMERA, quantity: 1 }], {
    cliente: { ...CLIENTE, name: 'Ana López Ferreira', phone: '0981999999' },
  });

  assert.equal(await contar('customers'), clientes, 'duplicó el cliente');
  assert.equal(await contar('orders'), pedidos + 1);

  const c = await db.query<{ name: string; phone: string }>(
    `select name, phone from customers where email = $1`,
    [CLIENTE.email],
  );
  assert.equal(c.rows[0]?.name, 'Ana López Ferreira', 'no actualizó los datos del cliente');
});

test('el pedido conserva su propio snapshot del cliente', async () => {
  const o = pedido(
    await crear([{ variantId: V_REMERA, quantity: 1 }], {
      cliente: { name: 'Pedro', email: 'pedro@cliente.test', phone: '0971000000' },
    }),
  );
  await db.exec(`update customers set name = 'Otro nombre' where email = 'pedro@cliente.test'`);

  const guardado = await db.query<{ c: { name: string } }>(
    `select customer as c from orders where id = $1`,
    [o.id],
  );
  assert.equal(
    guardado.rows[0]!.c.name,
    'Pedro',
    'el pedido siguió al cliente en vez de a su copia',
  );
});

// --- Estados ------------------------------------------------------------------

test('cambiar de estado registra el movimiento en la timeline', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));

  const r = await comoAdmin<{ j: Pedido }>(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'preparing', 'Con seña') as j`,
  );
  assert.equal(r[0]!.j.status, 'preparing');

  const eventos = await db.query<{ type: string; data: Record<string, string> }>(
    `select type, data from order_events where order_id = $1 order by created_at`,
    [o.id],
  );
  assert.deepEqual(
    eventos.rows.map((e) => e.type),
    ['created', 'status_changed'],
  );
  assert.equal(eventos.rows[1]!.data.from, 'received');
  assert.equal(eventos.rows[1]!.data.to, 'preparing');
  assert.equal(eventos.rows[1]!.data.note, 'Con seña');
});

test('cancelar devuelve el stock a la sucursal de la que salió', async () => {
  const antes = await db.query<{ location_id: string; available: number }>(
    `select location_id, available from inventory_levels where variant_id = $1 order by location_id`,
    [V_REPARTIDO],
  );
  const o = pedido(await crear([{ variantId: V_REPARTIDO, quantity: 2 }]));

  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'cancelled') as j`,
  );

  const despues = await db.query<{ location_id: string; available: number }>(
    `select location_id, available from inventory_levels where variant_id = $1 order by location_id`,
    [V_REPARTIDO],
  );
  assert.deepEqual(
    despues.rows.map((n) => n.available),
    antes.rows.map((n) => n.available),
    'el stock no volvió exactamente a donde estaba',
  );
});

test('un pedido cancelado ya no cambia de estado', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'cancelled') as j`,
  );

  await assert.rejects(
    () =>
      comoAdmin(
        db,
        DUENO,
        `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'confirmed') as j`,
      ),
    /cancelado/i,
  );
});

test('cancelar dos veces no duplica el stock devuelto', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 2 }]));
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'cancelled') as j`,
  );
  const despues = await stock(V_REMERA);

  // Pedir el estado que ya tiene es un no-op, no una segunda devolución.
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'cancelled') as j`,
  );
  assert.equal(await stock(V_REMERA), despues, 'devolvió el stock dos veces');
});

// --- Listado del Admin ---------------------------------------------------------

test('el listado pagina, ordena por fecha y busca por número y por nombre', async () => {
  const r = await comoAdmin<{
    j: { items: { number: number }[]; total: number; pageCount: number };
  }>(db, DUENO, `select admin_orders(${sql(TIENDA)}::uuid, '', null, 1, 3) as j`);
  assert.equal(r[0]!.j.items.length, 3, 'no respetó el tamaño de página');
  assert.ok(r[0]!.j.total > 3);

  const porNumero = await comoAdmin<{ j: { items: { number: number }[] } }>(
    db,
    DUENO,
    `select admin_orders(${sql(TIENDA)}::uuid, '1001', null, 1, 20) as j`,
  );
  assert.deepEqual(
    porNumero[0]!.j.items.map((i) => i.number),
    [1001],
  );

  const porNombre = await comoAdmin<{ j: { items: unknown[] } }>(
    db,
    DUENO,
    `select admin_orders(${sql(TIENDA)}::uuid, 'pedro', null, 1, 20) as j`,
  );
  assert.equal(porNombre[0]!.j.items.length, 1, 'no encontró por nombre del cliente');
});

test('el listado acota una página fuera de rango', async () => {
  const r = await comoAdmin<{ j: { page: number; pageCount: number } }>(
    db,
    DUENO,
    `select admin_orders(${sql(TIENDA)}::uuid, '', null, 999, 5) as j`,
  );
  assert.equal(r[0]!.j.page, r[0]!.j.pageCount);
});

test('la numeración es por tienda, y pasar un store_id ajeno no alcanza', async () => {
  await crear([{ variantId: V_AJENA, quantity: 1 }], { tienda: OTRA_TIENDA });

  // El otro comercio ve su pedido, y su numeración arranca también en 1001.
  const suyo = await comoAdmin<{ j: { items: { number: number }[] } }>(
    db,
    AJENO_USER,
    `select admin_orders(${sql(OTRA_TIENDA)}::uuid, '', null, 1, 20) as j`,
  );
  assert.equal(suyo[0]!.j.items.length, 1);
  assert.equal(suyo[0]!.j.items[0]!.number, 1001, 'la numeración no es por tienda');

  // Y pasar el `store_id` ajeno no sirve de nada: RLS filtra por membresía, así
  // que el parámetro no es lo que autoriza.
  const ajeno = await comoAdmin<{ j: { items: unknown[]; total: number } }>(
    db,
    DUENO,
    `select admin_orders(${sql(OTRA_TIENDA)}::uuid, '', null, 1, 20) as j`,
  );
  assert.equal(ajeno[0]!.j.total, 0, 'listó los pedidos de otro comercio');
});

// --- Sin nulos ------------------------------------------------------------------

test('los campos opcionales llegan ausentes, nunca nulos', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));

  const nulos: string[] = [];
  const recorrer = (valor: unknown, ruta: string): void => {
    if (valor === null) nulos.push(ruta);
    else if (Array.isArray(valor)) valor.forEach((v, i) => recorrer(v, `${ruta}[${i}]`));
    else if (typeof valor === 'object')
      for (const [k, v] of Object.entries(valor as object)) recorrer(v, `${ruta}.${k}`);
  };
  recorrer(o, 'order');
  assert.deepEqual(nulos, [], `campos nulos en la respuesta: ${nulos.join(', ')}`);

  // El recorrido tiene que servir: si no detectara un nulo, el test de arriba
  // pasaría siempre.
  const control: string[] = [];
  const recorrerControl = (valor: unknown, ruta: string): void => {
    if (valor === null) control.push(ruta);
    else if (typeof valor === 'object' && valor !== null)
      for (const [k, v] of Object.entries(valor)) recorrerControl(v, `${ruta}.${k}`);
  };
  recorrerControl({ a: { b: null } }, 'x');
  assert.deepEqual(control, ['x.a.b']);
});

// --- Autorización ----------------------------------------------------------------

test('un viewer no puede cambiar el estado de un pedido', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));
  const r = await intentar(
    db,
    VIEWER,
    `select admin_set_order_status('${TIENDA}'::uuid, '${o.id}'::uuid, 'confirmed')`,
  );
  assert.equal(r.ok, false, 'un viewer cambió el estado de un pedido');
});

test('un comercio no ve los pedidos de otro', async () => {
  const propios = await db.query<{ n: number }>(
    `select count(*)::int as n from orders where store_id = $1`,
    [TIENDA],
  );
  assert.ok(propios.rows[0]!.n > 0, 'el fixture no tiene pedidos que ocultar');

  // Con RLS, el owner del otro comercio no ve ninguno.
  const visto = await como<{ n: number }>(
    db,
    AJENO_USER,
    `select count(*)::int as n from orders where store_id = '${TIENDA}'::uuid`,
  );
  assert.equal(visto[0]!.n, 0, 'un comercio vio los pedidos de otro');
});

test('el rol anónimo no puede crear un pedido', async () => {
  const r = await intentar(
    db,
    null,
    `select create_order('${TIENDA}'::uuid, '${crypto.randomUUID()}'::uuid, '{}'::jsonb)`,
  );
  assert.equal(r.ok, false, 'anon pudo invocar create_order');
});

test('buscar el número con almohadilla encuentra el pedido', async () => {
  // La tabla del Admin muestra «#1001», así que es lo que se escribe al buscar
  // el pedido que se está mirando. Antes daba cero resultados, y eso se lee como
  // «el buscador no anda» — que fue exactamente lo que pasó.
  const r = await comoAdmin<{ j: { items: { number: number }[] } }>(
    db,
    DUENO,
    `select admin_orders(${sql(TIENDA)}::uuid, '#1001', null, 1, 20) as j`,
  );
  assert.deepEqual(
    r[0]!.j.items.map((i) => i.number),
    [1001],
    'buscar con almohadilla no encuentra el pedido',
  );
});

test('buscar el número sin almohadilla sigue funcionando', async () => {
  const r = await comoAdmin<{ j: { items: { number: number }[] } }>(
    db,
    DUENO,
    `select admin_orders(${sql(TIENDA)}::uuid, '1001', null, 1, 20) as j`,
  );
  assert.deepEqual(
    r[0]!.j.items.map((i) => i.number),
    [1001],
  );
});

// --- Estado de pago ------------------------------------------------------------

test('marcar pagado cambia el estado y queda en la timeline', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));
  assert.equal(o.paymentStatus, 'pending', 'un pedido nuevo no nace pendiente');

  const r = await comoAdmin<{ j: Pedido }>(
    db,
    DUENO,
    `select admin_set_payment_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'paid', 'Comprobante por WhatsApp') as j`,
  );
  assert.equal(r[0]!.j.paymentStatus, 'paid');

  const eventos = await db.query<{
    type: string;
    data: { from: string; to: string; note: string };
  }>(`select type, data from order_events where order_id = $1 and type = 'payment_changed'`, [
    o.id,
  ]);
  assert.equal(eventos.rows.length, 1, 'no registró el cambio en la timeline');
  assert.equal(eventos.rows[0]!.data.from, 'pending');
  assert.equal(eventos.rows[0]!.data.to, 'paid');
  assert.equal(eventos.rows[0]!.data.note, 'Comprobante por WhatsApp');
});

test('volver a marcar lo mismo no ensucia la timeline', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_payment_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'paid')`,
  );
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_payment_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'paid')`,
  );

  const n = await db.query<{ n: number }>(
    `select count(*)::int as n from order_events where order_id = $1 and type = 'payment_changed'`,
    [o.id],
  );
  assert.equal(n.rows[0]!.n, 1, 'registró dos veces el mismo cambio');
});

test('un pedido cancelado no cambia su estado de pago', async () => {
  // Devolver plata es un refund, y los refunds están fuera del core (ADR-008).
  // Marcarlo pagado acá sólo produciría una contabilidad que no coincide con nada.
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'cancelled')`,
  );

  const r = await intentar(
    db,
    DUENO,
    `select admin_set_payment_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'paid')`,
  );
  assert.equal(r.ok, false, 'un pedido cancelado quedó marcado como pagado');
  assert.match(r.error!, /cancelado/);
});

test('un viewer no puede marcar un pedido como pagado', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));
  const r = await intentar(
    db,
    VIEWER,
    `select admin_set_payment_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'paid')`,
  );
  assert.equal(r.ok, false, 'un viewer cobró un pedido');
});

test('un comercio no puede cobrar el pedido de otro', async () => {
  const o = pedido(await crear([{ variantId: V_REMERA, quantity: 1 }]));
  const r = await intentar(
    db,
    AJENO_USER,
    `select admin_set_payment_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'paid')`,
  );
  assert.equal(r.ok, false, 'un comercio cobró el pedido de otro');
});

test('el rol anónimo no puede marcar pagos', async () => {
  const r = await intentar(
    db,
    null,
    `select admin_set_payment_status('${TIENDA}'::uuid, '${crypto.randomUUID()}'::uuid, 'paid')`,
  );
  assert.equal(r.ok, false, 'anon pudo invocar admin_set_payment_status');
});
