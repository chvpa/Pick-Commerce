import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, comoAdmin, comoServicio, intentar } from './harness.ts';

/**
 * El pago que informa el gateway y la cola de correos.
 *
 * Dos garantías del Definition of Done de la fase se afirman acá y no en el
 * navegador, porque acá son deterministas:
 *
 * - **Un webhook repetido no duplica efectos.** No alcanza con mirar el estado
 *   del pedido: hay que contar los eventos y las filas de la cola, que es donde
 *   se vería el correo duplicado.
 * - **Un pedido genera la notificación esperada.** Lo que se prueba es que se
 *   encola, no que se envíe: enviar es de la aplicación.
 *
 * El caso del ciclo merece atención. Marcar un correo como enviado inserta un
 * evento `email_sent`, y ese insert vuelve a disparar el trigger que encola. Si
 * el trigger tratara `email_sent` como cualquier otro, cada correo enviado
 * encolaría otro correo, para siempre.
 */

const TENANT = 'aa000000-0000-4000-8000-000000000000';
const TIENDA = 'a5000000-0000-4000-8000-000000000000';
const SUCURSAL = 'a6000000-0000-4000-8000-000000000000';

const OTRO_TENANT = 'bb000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'b5000000-0000-4000-8000-000000000000';
const OTRA_SUCURSAL = 'b6000000-0000-4000-8000-000000000000';

const REMERA = 'd1000000-0000-4000-8000-000000000000';
const V_REMERA = 'e1000000-0000-4000-8000-000000000000';
const AJENO = 'd1000000-0000-4000-8000-000000000001';
const V_AJENA = 'e1000000-0000-4000-8000-000000000001';

const DUENO = 'f1000000-0000-4000-8000-000000000000';
const VIEWER = 'f1000000-0000-4000-8000-000000000001';
const AJENO_USER = 'f1000000-0000-4000-8000-000000000002';

let db: PGlite;

interface Pedido {
  readonly id: string;
  readonly number: number;
  readonly paymentStatus: string;
  readonly status: string;
}

function sql(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

/** Crea un pedido por el camino real: la secret key, como el storefront. */
async function crearPedido(opciones: { tienda?: string; variante?: string; email?: string } = {}) {
  const payload = {
    customer: {
      name: 'Ana López',
      email: opciones.email ?? 'ana@cliente.test',
      phone: '0981123456',
    },
    address: { street: 'Avda. Siempre Viva 742', city: 'Asunción' },
    paymentMethod: 'simulated_card',
    lines: [{ variantId: opciones.variante ?? V_REMERA, quantity: 1 }],
  };
  const filas = await comoServicio<{ j: { order?: Pedido } }>(
    db,
    `select create_order(${sql(opciones.tienda ?? TIENDA)}::uuid,
                         ${sql(crypto.randomUUID())}::uuid,
                         ${sql(JSON.stringify(payload))}::jsonb) as j`,
  );
  const orden = filas[0]!.j.order;
  assert.ok(orden, 'el fixture no pudo crear el pedido');
  return orden;
}

async function registrarPago(
  orden: Pedido,
  estado: 'paid' | 'failed',
  referencia = 'sim_ref_1',
): Promise<void> {
  await comoServicio(
    db,
    `select record_payment(${sql(TIENDA)}::uuid, ${sql(orden.id)}::uuid,
                           ${sql(estado)}, ${sql(referencia)})`,
  );
}

async function eventosDe(
  orderId: string,
  tipo?: string,
): Promise<{ type: string; data: Record<string, string> }[]> {
  const r = await db.query<{ type: string; data: Record<string, string> }>(
    tipo
      ? `select type, data from order_events where order_id = $1 and type = $2 order by created_at`
      : `select type, data from order_events where order_id = $1 order by created_at`,
    tipo ? [orderId, tipo] : [orderId],
  );
  return r.rows;
}

async function colaDe(
  orderId: string,
): Promise<
  {
    event: string;
    recipient: string;
    attempts: number;
    sent_at: string | null;
    payload: { order: { number: number } };
  }[]
> {
  const r = await db.query<{
    event: string;
    recipient: string;
    attempts: number;
    sent_at: string | null;
    payload: { order: { number: number } };
  }>(
    `select event, recipient, attempts, sent_at, payload from notification_outbox
      where order_id = $1 order by created_at`,
    [orderId],
  );
  return r.rows;
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
      ('${OTRA_SUCURSAL}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'Depósito B');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${TENANT}', '${VIEWER}', 'viewer'),
      ('${OTRO_TENANT}', '${AJENO_USER}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${REMERA}', '${TENANT}', '${TIENDA}', 'remera', 'Remera lisa', 'active'),
      ('${AJENO}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 'ajeno', 'De otro comercio', 'active');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position) values
      ('${V_REMERA}', '${TENANT}', '${REMERA}', 'REM-M', 'M', 150000, 'PYG', 0),
      ('${V_AJENA}', '${OTRO_TENANT}', '${AJENO}', 'AJE-1', 'Única', 70000, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${TENANT}', '${V_REMERA}', '${SUCURSAL}', 500),
      ('${OTRO_TENANT}', '${V_AJENA}', '${OTRA_SUCURSAL}', 50);
  `);
});

after(async () => {
  await db.close();
});

// --- El enum ------------------------------------------------------------------

test('el estado de pago admite failed, y no admite refunded', async () => {
  const r = await db.query<{ v: string }>(`select 'failed'::payment_status::text as v`);
  assert.equal(r.rows[0]!.v, 'failed');

  // Los refunds están fuera del core (ADR-008): un estado que nada sabe producir
  // sería una promesa vacía.
  await assert.rejects(() => db.query(`select 'refunded'::payment_status`));
});

// --- record_payment -------------------------------------------------------------

test('el gateway registra un pago con su referencia', async () => {
  const o = await crearPedido();
  assert.equal(o.paymentStatus, 'pending');

  await registrarPago(o, 'paid', 'sim_abc123');

  const estado = await db.query<{ payment_status: string }>(
    `select payment_status from orders where id = $1`,
    [o.id],
  );
  assert.equal(estado.rows[0]!.payment_status, 'paid');

  const eventos = await eventosDe(o.id, 'payment_changed');
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0]!.data.from, 'pending');
  assert.equal(eventos[0]!.data.to, 'paid');
  assert.equal(eventos[0]!.data.reference, 'sim_abc123', 'no guardó la referencia del proveedor');
});

test('el webhook repetido no duplica ni el evento ni el correo', async () => {
  // Es la garantía del Definition of Done, y mirar sólo el estado del pedido no
  // alcanza: el daño visible sería un segundo correo al comprador.
  const o = await crearPedido();
  await registrarPago(o, 'paid', 'sim_repetido');

  const eventosAntes = (await eventosDe(o.id, 'payment_changed')).length;
  const colaAntes = (await colaDe(o.id)).filter((f) => f.event === 'order_confirmed').length;

  await registrarPago(o, 'paid', 'sim_repetido');
  await registrarPago(o, 'paid', 'sim_repetido');

  assert.equal(
    (await eventosDe(o.id, 'payment_changed')).length,
    eventosAntes,
    'duplicó el evento',
  );
  assert.equal(
    (await colaDe(o.id)).filter((f) => f.event === 'order_confirmed').length,
    colaAntes,
    'encoló un segundo correo de confirmación',
  );
});

test('un pago rechazado puede reintentarse y salir bien', async () => {
  const o = await crearPedido();
  await registrarPago(o, 'failed', 'sim_rechazo');

  const tras = await db.query<{ payment_status: string }>(
    `select payment_status from orders where id = $1`,
    [o.id],
  );
  assert.equal(tras.rows[0]!.payment_status, 'failed');

  await registrarPago(o, 'paid', 'sim_segundo_intento');
  const final = await db.query<{ payment_status: string }>(
    `select payment_status from orders where id = $1`,
    [o.id],
  );
  assert.equal(final.rows[0]!.payment_status, 'paid');
  assert.equal((await eventosDe(o.id, 'payment_changed')).length, 2);
});

test('un pago no se registra como pendiente', async () => {
  // «Descobrar» un pedido no es algo que un gateway sepa decir.
  const o = await crearPedido();
  const r = await intentar(
    db,
    null,
    `select record_payment('${TIENDA}'::uuid, '${o.id}'::uuid, 'pending', 'x')`,
  );
  assert.equal(r.ok, false);
});

test('un pedido cancelado no cambia su estado de pago', async () => {
  const o = await crearPedido();
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'cancelled')`,
  );

  await assert.rejects(
    () => registrarPago(o, 'paid', 'sim_tarde'),
    /cancelado/,
    'cobró un pedido cancelado',
  );
});

test('el store_id de otra tienda no alcanza para cobrar un pedido', async () => {
  const ajeno = await crearPedido({ tienda: OTRA_TIENDA, variante: V_AJENA });
  await assert.rejects(
    () =>
      comoServicio(
        db,
        `select record_payment(${sql(TIENDA)}::uuid, ${sql(ajeno.id)}::uuid, 'paid', 'x')`,
      ),
    /no existe en esta tienda/,
  );
});

test('sólo la secret key puede registrar pagos', async () => {
  const o = await crearPedido();
  for (const [quien, usuario] of [
    ['el rol anónimo', null],
    ['un propietario del Admin', DUENO],
    ['un viewer', VIEWER],
  ] as const) {
    const r = await intentar(
      db,
      usuario,
      `select record_payment('${TIENDA}'::uuid, '${o.id}'::uuid, 'paid', 'x')`,
    );
    assert.equal(r.ok, false, `${quien} pudo registrar un pago`);
  }
});

// --- La cola de correos ----------------------------------------------------------

test('crear un pedido encola el aviso de recibido, con el pedido adentro', async () => {
  const o = await crearPedido({ email: 'destinatario@cliente.test' });

  const cola = await colaDe(o.id);
  assert.equal(cola.length, 1);
  assert.equal(cola[0]!.event, 'order_received');
  assert.equal(cola[0]!.recipient, 'destinatario@cliente.test');
  assert.equal(
    cola[0]!.payload.order.number,
    o.number,
    'el correo no lleva el pedido serializado al encolar',
  );
  assert.equal(cola[0]!.sent_at, null);
});

test('cobrar encola la confirmación', async () => {
  const o = await crearPedido();
  await registrarPago(o, 'paid');

  const eventos = (await colaDe(o.id)).map((f) => f.event);
  assert.deepEqual(eventos, ['order_received', 'order_confirmed']);
});

test('marcar pagado desde el Admin también encola la confirmación', async () => {
  // Los dos caminos —gateway y operador— tienen que producir el mismo correo.
  const o = await crearPedido();
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_payment_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'paid')`,
  );
  assert.deepEqual(
    (await colaDe(o.id)).map((f) => f.event),
    ['order_received', 'order_confirmed'],
  );
});

test('sólo enviado y entregado encolan; los estados intermedios no', async () => {
  const o = await crearPedido();
  for (const estado of ['confirmed', 'preparing', 'ready']) {
    await comoAdmin(
      db,
      DUENO,
      `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, ${sql(estado)})`,
    );
  }
  assert.deepEqual(
    (await colaDe(o.id)).map((f) => f.event),
    ['order_received'],
    'un estado intermedio encoló un correo que nadie pidió',
  );

  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'shipped')`,
  );
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'delivered')`,
  );
  assert.deepEqual(
    (await colaDe(o.id)).map((f) => f.event),
    ['order_received', 'order_shipped', 'order_delivered'],
  );
});

test('un pedido sin correo del comprador no encola nada, y no falla', async () => {
  const o = await crearPedido();
  await comoServicio(db, `update orders set customer = customer - 'email' where id = ${sql(o.id)}`);
  await comoAdmin(
    db,
    DUENO,
    `select admin_set_order_status(${sql(TIENDA)}::uuid, ${sql(o.id)}::uuid, 'shipped')`,
  );

  assert.deepEqual(
    (await colaDe(o.id)).map((f) => f.event),
    ['order_received'],
    'encoló un correo sin destinatario',
  );
});

test('nadie fuera de la secret key lee la cola', async () => {
  // Una fila pendiente lleva el pedido entero, con la dirección del comprador.
  for (const usuario of [null, DUENO, VIEWER]) {
    const r = await intentar(db, usuario, `select * from notification_outbox`);
    assert.equal(r.ok, false, 'la cola de correos es legible desde el Admin');
  }
});

// --- Reclamar y marcar ------------------------------------------------------------

test('reclamar cuenta el intento y respeta el límite', async () => {
  const o = await crearPedido();

  const primera = await comoServicio<{ id: string; attempts: number; event: string }>(
    db,
    `select * from claim_notifications(${sql(TIENDA)}::uuid, 1)`,
  );
  assert.equal(primera.length, 1, 'no respetó el límite');
  assert.equal(primera[0]!.attempts, 1, 'no contó el intento al reclamar');

  const otraVez = await comoServicio<{ id: string; attempts: number }>(
    db,
    `select * from claim_notifications(${sql(TIENDA)}::uuid, 1)`,
  );
  // Puede volver la misma fila —no hay lock— pero el intento tiene que subir.
  if (otraVez[0]?.id === primera[0]!.id) {
    assert.equal(otraVez[0]!.attempts, 2);
  }
  assert.ok(o.id);
});

test('una tienda no reclama los correos de otra', async () => {
  const ajeno = await crearPedido({ tienda: OTRA_TIENDA, variante: V_AJENA });
  const reclamadas = await comoServicio<{ order_id: string }>(
    db,
    `select * from claim_notifications(${sql(TIENDA)}::uuid, 50)`,
  );
  assert.ok(!reclamadas.some((f) => f.order_id === ajeno.id), 'reclamó un correo de otro comercio');
});

/**
 * La fila pendiente **de este pedido**.
 *
 * `claim_notifications` devuelve la más vieja de la tienda, y los tests
 * comparten la base: reclamar sin más devolvía la de otro caso y marcaba el
 * envío en el pedido equivocado.
 */
async function filaDe(orderId: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select id from notification_outbox where order_id = $1 and sent_at is null
      order by created_at limit 1`,
    [orderId],
  );
  assert.ok(r.rows[0], 'el pedido no tiene correos pendientes');
  return r.rows[0].id;
}

test('marcar enviada la saca de la cola y la deja en la timeline', async () => {
  const o = await crearPedido();
  const fila = { id: await filaDe(o.id) };

  await comoServicio(
    db,
    `select mark_notification_sent(${sql(TIENDA)}::uuid, ${sql(fila!.id)}::uuid)`,
  );

  const r = await db.query<{ sent_at: string | null }>(
    `select sent_at from notification_outbox where id = $1`,
    [fila!.id],
  );
  assert.ok(r.rows[0]!.sent_at, 'no la marcó como enviada');

  const enviados = await eventosDe(o.id, 'email_sent');
  assert.ok(enviados.length >= 1, 'no dejó rastro en la timeline');

  // Repetir no registra el envío dos veces.
  const antes = enviados.length;
  await comoServicio(
    db,
    `select mark_notification_sent(${sql(TIENDA)}::uuid, ${sql(fila!.id)}::uuid)`,
  );
  assert.equal((await eventosDe(o.id, 'email_sent')).length, antes);
});

test('registrar un correo enviado no encola otro correo', async () => {
  // El ciclo: `mark_notification_sent` inserta `email_sent`, y ese insert vuelve
  // a disparar el trigger que encola. Sin el corte, cada correo enviado
  // encolaría el siguiente, para siempre.
  const o = await crearPedido();
  const antes = (await colaDe(o.id)).length;

  const fila = await filaDe(o.id);
  await comoServicio(db, `select mark_notification_sent(${sql(TIENDA)}::uuid, ${sql(fila)}::uuid)`);

  assert.equal((await colaDe(o.id)).length, antes, 'enviar un correo encoló otro correo');
});

test('una fila que agotó los intentos deja de reclamarse', async () => {
  const o = await crearPedido();
  await comoServicio(
    db,
    `update notification_outbox set attempts = 5 where order_id = ${sql(o.id)}`,
  );

  const reclamadas = await comoServicio<{ order_id: string }>(
    db,
    `select * from claim_notifications(${sql(TIENDA)}::uuid, 50)`,
  );
  assert.ok(!reclamadas.some((f) => f.order_id === o.id), 'siguió reintentando una fila agotada');
});

test('sólo la secret key reclama y marca', async () => {
  for (const usuario of [null, DUENO]) {
    assert.equal(
      (await intentar(db, usuario, `select * from claim_notifications('${TIENDA}'::uuid)`)).ok,
      false,
    );
    assert.equal(
      (
        await intentar(
          db,
          usuario,
          `select mark_notification_sent('${TIENDA}'::uuid, '${crypto.randomUUID()}'::uuid)`,
        )
      ).ok,
      false,
    );
  }
});

// --- Lo que la cola le debe al resto ---------------------------------------------

test('borrar un pedido se lleva sus correos pendientes', async () => {
  // Es lo que hace que el teardown del e2e no necesite saber que esta tabla
  // existe: borra pedidos de prueba y la cola se limpia sola.
  const o = await crearPedido();
  assert.ok((await colaDe(o.id)).length > 0);

  await comoServicio(db, `delete from orders where id = ${sql(o.id)}`);
  assert.deepEqual(await colaDe(o.id), []);
});

test('el rol anónimo no ve la tabla ni con un select de una columna', async () => {
  const r = await intentar(db, null, `select count(*) from notification_outbox`);
  assert.equal(r.ok, false);
});
