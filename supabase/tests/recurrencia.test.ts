import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, intentar } from './harness.ts';

/**
 * Cohortes y RFM (v2 Fase 8, ADR-134).
 *
 * Los pedidos se insertan directo, como en `dashboard-clientes.test.ts`: lo que
 * se prueba es cómo se agregan, y eso exige fechas puestas a mano.
 *
 * Dos tiendas del mismo comercio, una por función, para que las fechas de una
 * no muevan los escalones de la otra: la recencia de RFM es relativa a toda la
 * tienda.
 */

const TENANT = 'ab000000-0000-4000-8000-000000000000';
const COHORTES = 'ab100000-0000-4000-8000-000000000000';
const RFM = 'ab200000-0000-4000-8000-000000000000';
const OTRO_TENANT = 'ac000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'ac100000-0000-4000-8000-000000000000';

const DUENO = 'fa000000-0000-4000-8000-000000000000';
const VIEWER = 'fa000000-0000-4000-8000-000000000001';
const AJENO = 'fa000000-0000-4000-8000-000000000002';

/** El primer instante del mes actual menos `n` meses, más `extra`, en UTC. */
const mes = (n: number, extra = '12 hours') =>
  `((date_trunc('month', now() at time zone 'UTC') - interval '${n} months' + interval '${extra}') at time zone 'UTC')`;

const hace = (dias: number) => `now() - interval '${dias} days'`;

let numero = 1000;
function pedido(
  tienda: string,
  cliente: string,
  cuando: string,
  monto: number,
  estado = 'delivered',
): string {
  numero++;
  const tenant = tienda === OTRA_TIENDA ? OTRO_TENANT : TENANT;
  return `('${tenant}', '${tienda}', ${numero}, gen_random_uuid(), '${estado}', 'bank_transfer',
    '${cliente}', '{"name":"x","email":"x@x.test"}', '{"street":"x","city":"y"}', ${monto}, 'PYG', ${cuando})`;
}

const cliente = (id: string, tienda: string, email: string) =>
  `('${id}', '${tienda === OTRA_TIENDA ? OTRO_TENANT : TENANT}', '${tienda}', '${email}', '${email}', '0981')`;

// Cohortes.
const C1 = 'cb000000-0000-4000-8000-000000000001';
const C2 = 'cb000000-0000-4000-8000-000000000002';
const C3 = 'cb000000-0000-4000-8000-000000000003';
const C4 = 'cb000000-0000-4000-8000-000000000004';
const C5 = 'cb000000-0000-4000-8000-000000000005';
const C_AJENO = 'cb000000-0000-4000-8000-000000000006';

// RFM: uno por segmento, más uno con sólo un pedido cancelado.
const R = {
  campeon: 'cc000000-0000-4000-8000-000000000001',
  leal: 'cc000000-0000-4000-8000-000000000002',
  enRiesgo: 'cc000000-0000-4000-8000-000000000003',
  prometedor: 'cc000000-0000-4000-8000-000000000004',
  nuevo: 'cc000000-0000-4000-8000-000000000005',
  dormido: 'cc000000-0000-4000-8000-000000000006',
  enfriandose: 'cc000000-0000-4000-8000-000000000007',
  soloCancelado: 'cc000000-0000-4000-8000-000000000008',
};

let db: PGlite;

interface Cohortes {
  readonly timeZone: string;
  readonly cohorts: readonly { month: string; customers: number; active: number[] }[];
}

interface Segmentos {
  readonly segments: readonly {
    segment: string;
    customers: number;
    revenue: { amount: number; currency: string };
  }[];
  readonly items: readonly {
    id: string;
    orderCount: number;
    totalSpent: { amount: number };
    recency: number;
    segment: string;
  }[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
}

async function cohortes(tz: string, usuario = DUENO, tienda = COHORTES): Promise<Cohortes> {
  const filas = await como<{ j: Cohortes }>(
    db,
    usuario,
    `select admin_customer_cohorts('${tienda}'::uuid, '${tz}', 12) as j`,
  );
  return filas[0]!.j;
}

async function segmentos(
  opciones: { segmento?: string; page?: number; perPage?: number; usuario?: string } = {},
): Promise<Segmentos> {
  const filas = await como<{ j: Segmentos }>(
    db,
    opciones.usuario ?? DUENO,
    `select admin_customer_segments(
       '${RFM}'::uuid,
       ${opciones.segmento ? `'${opciones.segmento}'` : 'null'},
       ${opciones.page ?? 1},
       ${opciones.perPage ?? 20}
     ) as j`,
  );
  return filas[0]!.j;
}

/** El mes `n` meses atrás, como lo devuelve la función: `YYYY-MM`. */
function etiqueta(n: number): string {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@r.test'), ('${VIEWER}', 'viewer@r.test'), ('${AJENO}', 'ajeno@r.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio R', 'r'), ('${OTRO_TENANT}', 'Comercio S', 's');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${COHORTES}', '${TENANT}', 'Cohortes', 'co', 'co.test', 'PYG'),
      ('${RFM}', '${TENANT}', 'RFM', 'rf', 'rf.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Otra', 'ot', 'ot.test', 'PYG');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      ('${OTRO_TENANT}', '${AJENO}', 'owner');

    insert into customers (id, tenant_id, store_id, email, name, phone) values
      ${[
        cliente(C1, COHORTES, 'c1@r.test'),
        cliente(C2, COHORTES, 'c2@r.test'),
        cliente(C3, COHORTES, 'c3@r.test'),
        cliente(C4, COHORTES, 'c4@r.test'),
        cliente(C5, COHORTES, 'c5@r.test'),
        cliente(C_AJENO, OTRA_TIENDA, 'c1@r.test'),
        ...Object.values(R).map((id, i) => cliente(id, RFM, `r${i}@r.test`)),
      ].join(',\n')};

    insert into orders (
      tenant_id, store_id, number, idempotency_key, status, payment_method,
      customer_id, customer, address, total_amount, currency, created_at
    ) values
      ${[
        // C1: primera compra hace tres meses, vuelve al mes siguiente y este mes.
        pedido(COHORTES, C1, mes(3), 100),
        pedido(COHORTES, C1, mes(2), 100),
        pedido(COHORTES, C1, mes(0), 100),
        // C2: misma cohorte, no vuelve.
        pedido(COHORTES, C2, mes(3, '5 days'), 100),
        // C3: cohorte del mes pasado; lo de este mes está cancelado y no cuenta.
        pedido(COHORTES, C3, mes(1), 100),
        pedido(COHORTES, C3, mes(0), 100, 'cancelled'),
        // C4: el 1 del mes a las 2 de la mañana UTC. En UTC-3 todavía es el mes
        // pasado: es el caso que decide en qué zona se corta el mes.
        pedido(COHORTES, C4, mes(0, '2 hours'), 100),
        // C5: sólo un pedido cancelado. No es cliente de ninguna cohorte.
        pedido(COHORTES, C5, mes(1), 100, 'cancelled'),
        // Otra organización, con el mismo correo que C1.
        pedido(OTRA_TIENDA, C_AJENO, mes(3), 100),
        pedido(OTRA_TIENDA, C_AJENO, mes(1), 100),

        // RFM. La recencia se reparte así, ordenada por última compra:
        //   dormido 300 d → 1, enRiesgo 200 d → 2, enfriandose 60 d → 3,
        //   leal 10 d → 3, prometedor 5 d → 4, nuevo 2 d → 5, campeon 1 d → 5.
        ...[400, 300, 200, 100].map((d) => pedido(RFM, R.campeon, hace(d), 1000)),
        pedido(RFM, R.campeon, hace(1), 1000),
        // Caro y cancelado: si entrara, el campeón facturaría 1.005.000.
        pedido(RFM, R.campeon, hace(1), 1000000, 'cancelled'),
        pedido(RFM, R.leal, hace(90), 500),
        pedido(RFM, R.leal, hace(40), 500),
        pedido(RFM, R.leal, hace(10), 500),
        pedido(RFM, R.enRiesgo, hace(250), 700),
        pedido(RFM, R.enRiesgo, hace(200), 700),
        pedido(RFM, R.prometedor, hace(20), 300),
        pedido(RFM, R.prometedor, hace(5), 300),
        pedido(RFM, R.nuevo, hace(2), 200),
        pedido(RFM, R.dormido, hace(300), 100),
        pedido(RFM, R.enfriandose, hace(60), 150),
        pedido(RFM, R.soloCancelado, hace(3), 9999, 'cancelled'),
      ].join(',\n')};
  `);
});

after(async () => {
  await db.close();
});

// --- Cohortes ------------------------------------------------------------------

test('cada cohorte cuenta a sus clientes y a los que volvieron cada mes', async () => {
  const r = await cohortes('UTC');
  assert.equal(r.timeZone, 'UTC');
  assert.deepEqual(r.cohorts, [
    // C1 y C2. Al mes siguiente volvió C1; al otro, nadie; este mes, C1.
    { month: etiqueta(3), customers: 2, active: [2, 1, 0, 1] },
    // C3. Lo que compró este mes está cancelado: la celda queda en cero.
    { month: etiqueta(1), customers: 1, active: [1, 0] },
    // C4, en UTC, es de este mes.
    { month: etiqueta(0), customers: 1, active: [1] },
  ]);
});

test('el mes se corta en la zona de quien mira', async () => {
  const r = await cohortes('America/Sao_Paulo');
  assert.equal(r.timeZone, 'America/Sao_Paulo');
  // En UTC-3 el pedido de C4 es del mes pasado, así que se suma a la cohorte de
  // C3 y este mes no abre ninguna.
  assert.deepEqual(
    r.cohorts.map((c) => [c.month, c.customers]),
    [
      [etiqueta(3), 2],
      [etiqueta(1), 2],
    ],
  );
});

test('una zona que Postgres no conoce cae en UTC en vez de fallar', async () => {
  const r = await cohortes('Marte/Olympus');
  assert.equal(r.timeZone, 'UTC');
  assert.equal(r.cohorts.length, 3);
});

test('las cohortes no ven los pedidos de otra organización', async () => {
  // El ajeno del otro comercio no ve nada de éste...
  const ajeno = await cohortes('UTC', AJENO);
  assert.deepEqual(ajeno.cohorts, []);
  // ...y el viewer, que es de acá, ve lo mismo que el dueño: leer es operativo.
  assert.deepEqual((await cohortes('UTC', VIEWER)).cohorts, (await cohortes('UTC')).cohorts);
});

// --- RFM -----------------------------------------------------------------------

test('cada cliente cae en su segmento, y los siete salen aunque estén vacíos', async () => {
  const r = await segmentos();
  assert.deepEqual(
    r.segments.map((s) => [s.segment, s.customers]),
    [
      ['champions', 1],
      ['loyal', 1],
      ['promising', 1],
      ['new', 1],
      ['cooling', 1],
      ['at_risk', 1],
      ['dormant', 1],
    ],
  );
  const esperado: Record<string, string> = {
    [R.campeon]: 'champions',
    [R.leal]: 'loyal',
    [R.prometedor]: 'promising',
    [R.nuevo]: 'new',
    [R.enfriandose]: 'cooling',
    [R.enRiesgo]: 'at_risk',
    [R.dormido]: 'dormant',
  };
  for (const c of r.items) assert.equal(c.segment, esperado[c.id], c.id);
  assert.equal(r.total, 7, 'el cliente con sólo un cancelado entró al RFM');
});

test('el monto y la frecuencia no cuentan lo cancelado', async () => {
  const r = await segmentos({ segmento: 'champions' });
  assert.equal(r.items[0]!.orderCount, 5);
  assert.equal(r.items[0]!.totalSpent.amount, 5000);
  assert.equal(r.segments[0]!.revenue.amount, 5000);
});

test('filtrar por segmento pagina del lado del servidor, los que más facturaron primero', async () => {
  const nuevos = await segmentos({ segmento: 'new' });
  assert.deepEqual(
    nuevos.items.map((c) => c.id),
    [R.nuevo],
  );
  assert.equal(nuevos.total, 1);

  const pagina2 = await segmentos({ page: 2, perPage: 2 });
  assert.equal(pagina2.pageCount, 4);
  // Por monto: campeón 5000, leal 1500 | enRiesgo 1400, prometedor 600 | …
  assert.deepEqual(
    pagina2.items.map((c) => c.id),
    [R.enRiesgo, R.prometedor],
  );
});

test('otro comercio no ve a nadie, y anon no puede llamarlas', async () => {
  const ajeno = await segmentos({ usuario: AJENO });
  assert.equal(ajeno.total, 0);
  assert.ok(ajeno.segments.every((s) => s.customers === 0));

  for (const sql of [
    `select admin_customer_cohorts('${COHORTES}'::uuid)`,
    `select admin_customer_segments('${RFM}'::uuid)`,
  ]) {
    const r = await intentar(db, null, sql);
    assert.equal(r.ok, false, `anon pudo: ${sql}`);
  }
});
