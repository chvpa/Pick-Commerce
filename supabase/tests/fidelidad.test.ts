import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoAdmin, comoServicio } from './harness.ts';

/**
 * El libro de puntos (ADR-141).
 *
 * Lo que se prueba es lo que no se puede arreglar después: **que el libro no
 * pueda mentir**. Acreditar dos veces la misma compra, perder el rastro de una
 * cancelación, o restar dos veces unos puntos vencidos que ya se habían gastado
 * son las tres formas de que un saldo deje de explicarse, y las tres tienen su
 * caso.
 *
 * Y una que es de producto: **el programa arranca apagado**. Una tienda que no lo
 * pidió no empieza a emitir un pasivo porque se desplegó una migración.
 */

const ORG = 'f1000000-0000-4000-8000-000000000000';
const TIENDA = 'f2000000-0000-4000-8000-000000000000';
const APAGADA = 'f2000000-0000-4000-8000-00000000000a';
const SUCURSAL = 'f3000000-0000-4000-8000-000000000000';
const SUCURSAL_B = 'f3000000-0000-4000-8000-00000000000a';
const PRODUCTO = 'f4000000-0000-4000-8000-000000000000';
const VARIANTE = 'f5000000-0000-4000-8000-000000000000';
const VARIANTE_B = 'f5000000-0000-4000-8000-00000000000a';

const ANA = 'f6000000-0000-4000-8000-000000000001';
const DUENO = 'f6000000-0000-4000-8000-00000000000d';

let db: PGlite;

async function comprar(tienda: string, variante: string, email: string): Promise<string> {
  const filas = await comoServicio<{ j: { order?: { id: string } } }>(
    db,
    `select create_order('${tienda}'::uuid, gen_random_uuid(),
       '{"customer":{"name":"${email}","email":"${email}","phone":"0981123456"},
         "address":{"street":"Calle 1","city":"Asuncion"},
         "paymentMethod":"bank_transfer",
         "lines":[{"variantId":"${variante}","quantity":1}]}'::jsonb) as j`,
  );
  const id = filas[0]!.j.order?.id;
  assert.ok(id, 'no se pudo comprar');
  return id;
}

async function saldo(tienda = TIENDA): Promise<number> {
  const r = await comoServicio<{ n: number }>(
    db,
    `select coalesce(sum(points), 0)::int as n from loyalty_ledger where store_id = '${tienda}'`,
  );
  return r[0]!.n;
}

async function movimientos(tienda = TIENDA): Promise<[string, number][]> {
  const r = await comoServicio<{ source: string; points: number }>(
    db,
    `select source::text as source, points from loyalty_ledger
     where store_id = '${tienda}' order by created_at, source`,
  );
  return r.map((f) => [f.source, f.points]);
}

/** Enciende o apaga el programa de una tienda. */
async function programa(tienda: string, encendido: boolean, extra = ''): Promise<void> {
  await comoServicio(
    db,
    `insert into store_settings (store_id, tenant_id, settings)
     values ('${tienda}', '${ORG}', '{"loyalty":{"enabled":${encendido}${extra}}}'::jsonb)
     on conflict (store_id) do update set settings = excluded.settings`,
  );
}

before(async () => {
  db = await baseDePrueba();

  await db.exec(`
    insert into auth.users (id, email) values ('${ANA}', 'ana@f.test'), ('${DUENO}', 'd@f.test');
    insert into organizations (id, name, slug) values ('${ORG}', 'Fidelidad', 'fidelidad');
    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${ORG}', 'Con programa', 'principal', 'f.test', 'PYG'),
      ('${APAGADA}', '${ORG}', 'Sin programa', 'sin', 'sin.test', 'PYG');
    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${ORG}', '${TIENDA}', 'Central'),
      ('${SUCURSAL_B}', '${ORG}', '${APAGADA}', 'Central');
    insert into memberships (tenant_id, user_id, role) values ('${ORG}', '${DUENO}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${PRODUCTO}', '${ORG}', '${TIENDA}', 'p', 'Producto', 'active');

    insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position)
      values ('${VARIANTE}', '${ORG}', '${PRODUCTO}', 'SKU-1', 'U', 100000, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${ORG}', '${VARIANTE}', '${SUCURSAL}', 100);
  `);

  // La tienda apagada necesita su propio producto para poder comprar en ella.
  await comoServicio(
    db,
    `insert into products (tenant_id, store_id, handle, title, status)
     values ('${ORG}', '${APAGADA}', 'p-b', 'Producto B', 'active')`,
  );
  await comoServicio(
    db,
    `insert into product_variants (id, tenant_id, product_id, sku, title, price, currency, position)
     select '${VARIANTE_B}', '${ORG}', p.id, 'SKU-B', 'U', 100000, 'PYG', 0
     from products p where p.store_id = '${APAGADA}'`,
  );
  await comoServicio(
    db,
    `insert into inventory_levels (tenant_id, variant_id, location_id, available)
     values ('${ORG}', '${VARIANTE_B}', '${SUCURSAL_B}', 100)`,
  );

  await programa(TIENDA, true);
  await programa(APAGADA, false);
});

after(async () => {
  await db.close();
});

async function limpiar(): Promise<void> {
  await comoServicio(db, `delete from loyalty_ledger`);
}

test('una tienda sin programa no emite nada', async () => {
  await limpiar();
  const pedido = await comprar(APAGADA, VARIANTE_B, 'ana@f.test');
  await comoServicio(db, `update orders set payment_status = 'paid' where id = '${pedido}'`);

  assert.equal(await saldo(APAGADA), 0, 'emitir un pasivo sin que nadie lo pida no es una opción');
});

test('los puntos se acreditan al cobrar, no al crear el pedido', async () => {
  await limpiar();
  const pedido = await comprar(TIENDA, VARIANTE, 'ana@f.test');

  // Creado y sin cobrar: nada. Es el caso del único pedido que tenía el piloto.
  assert.equal(await saldo(), 0);

  await comoServicio(db, `update orders set payment_status = 'paid' where id = '${pedido}'`);
  assert.equal(await saldo(), 20);
});

test('cobrar dos veces no paga dos veces', async () => {
  await limpiar();
  const pedido = await comprar(TIENDA, VARIANTE, 'ana@f.test');
  await comoServicio(db, `update orders set payment_status = 'paid' where id = '${pedido}'`);
  // Un `update` que deja el mismo estado, que es lo que hace cualquier pantalla
  // que guarda el pedido entero.
  await comoServicio(
    db,
    `update orders set payment_status = 'paid', updated_at = now() where id = '${pedido}'`,
  );

  assert.equal(await saldo(), 20);
  assert.deepEqual(await movimientos(), [['compra', 20]]);
});

test('cancelar emite el inverso y no borra el crédito', async () => {
  await limpiar();
  const pedido = await comprar(TIENDA, VARIANTE, 'ana@f.test');
  await comoServicio(db, `update orders set payment_status = 'paid' where id = '${pedido}'`);
  await comoServicio(db, `update orders set status = 'cancelled' where id = '${pedido}'`);

  // El saldo vuelve a cero **con los dos movimientos a la vista**: un libro que
  // borra no puede explicar por qué bajó.
  assert.equal(await saldo(), 0);
  assert.deepEqual(await movimientos(), [
    ['compra', 20],
    ['reverso', -20],
  ]);
});

test('cancelar un pedido que nunca se cobró no descuenta nada', async () => {
  await limpiar();
  const pedido = await comprar(TIENDA, VARIANTE, 'ana@f.test');
  await comoServicio(db, `update orders set status = 'cancelled' where id = '${pedido}'`);

  assert.deepEqual(await movimientos(), []);
});

test('una reseña publicada paga, y sin mirar la estrella', async () => {
  await limpiar();
  const pedido = await comprar(TIENDA, VARIANTE, 'ana@f.test');
  await comoServicio(db, `update orders set status = 'delivered' where id = '${pedido}'`);

  const [{ id }] = await comoServicio<{ id: string }>(
    db,
    `insert into product_reviews (tenant_id, store_id, product_id, customer_id, order_id, rating, body)
     select '${ORG}', '${TIENDA}', '${PRODUCTO}', o.customer_id, o.id, 1, 'No me gustó nada.'
     from orders o where o.id = '${pedido}' returning id`,
  );

  // Pendiente: no paga. Pagar antes de la revisión convierte esto en una máquina
  // de texto que nadie va a leer.
  assert.deepEqual(await movimientos(), []);

  await comoServicio(db, `update product_reviews set status = 'published' where id = '${id}'`);

  // Una estrella, y paga igual: pagar por estrellas altas arruina el activo.
  assert.deepEqual(await movimientos(), [['resena', 10]]);

  await comoServicio(db, `delete from product_reviews where id = '${id}'`);
});

test('vencen los puntos que quedaron sin gastar, y una sola vez', async () => {
  await limpiar();
  const cliente = await comoServicio<{ id: string }>(
    db,
    `select customer_id as id from orders where store_id = '${TIENDA}' limit 1`,
  );
  const id = cliente[0]!.id;

  // Dos créditos viejos y un gasto: de 40 ganados hace dos años, 15 ya se usaron.
  await comoServicio(
    db,
    `insert into loyalty_ledger (tenant_id, store_id, customer_id, points, source, created_at) values
       ('${ORG}', '${TIENDA}', '${id}', 20, 'ajuste', now() - interval '800 days'),
       ('${ORG}', '${TIENDA}', '${id}', 20, 'ajuste', now() - interval '700 days'),
       ('${ORG}', '${TIENDA}', '${id}', -15, 'canje', now() - interval '600 days')`,
  );

  const [{ n }] = await comoServicio<{ n: number }>(
    db,
    `select app.vencer_puntos('${TIENDA}'::uuid, '${id}'::uuid) as n`,
  );

  // 40 ganados menos 15 consumidos: vencen 25, no 40. Restar los 40 sería cobrarle
  // dos veces los 15 que ya había gastado.
  assert.equal(n, 25);
  assert.equal(await saldo(), 0);

  // Y llamarlo otra vez no vence nada más.
  const [{ n: otra }] = await comoServicio<{ n: number }>(
    db,
    `select app.vencer_puntos('${TIENDA}'::uuid, '${id}'::uuid) as n`,
  );
  assert.equal(otra, 0);
});

test('el comprador ve su saldo y su historia; otro no ve nada', async () => {
  await limpiar();
  const pedido = await comprar(TIENDA, VARIANTE, 'ana@f.test');
  await comoServicio(db, `update orders set payment_status = 'paid' where id = '${pedido}'`);
  await comoServicio(
    db,
    `insert into customer_accounts (user_id, tenant_id, store_id, customer_id)
     select '${ANA}', '${ORG}', '${TIENDA}', o.customer_id from orders o where o.id = '${pedido}'`,
  );

  const [{ j }] = await como<{
    j: { habilitado: boolean; saldo: number; movimientos: { puntos: number }[] };
  }>(db, ANA, `select mis_puntos('${TIENDA}'::uuid) as j`);

  assert.equal(j.habilitado, true);
  assert.equal(j.saldo, 20);
  assert.equal(j.movimientos.length, 1);

  // El dueño del comercio no es comprador de su propia tienda: no tiene saldo.
  const [{ j: delDueno }] = await como<{ j: { habilitado: boolean; saldo: number } }>(
    db,
    DUENO,
    `select mis_puntos('${TIENDA}'::uuid) as j`,
  );
  assert.equal(delDueno.habilitado, false);
  assert.equal(delDueno.saldo, 0);
});

test('el panel del comercio informa el pasivo aparte de lo emitido', async () => {
  await limpiar();
  const pedido = await comprar(TIENDA, VARIANTE, 'ana@f.test');
  await comoServicio(db, `update orders set payment_status = 'paid' where id = '${pedido}'`);
  await comoServicio(
    db,
    `insert into loyalty_ledger (tenant_id, store_id, customer_id, points, source)
     select '${ORG}', '${TIENDA}', o.customer_id, -5, 'canje' from orders o where o.id = '${pedido}'`,
  );

  const [{ j }] = await como<{
    j: { emitidos: number; gastados: number; pasivo: number; conPuntos: number };
  }>(db, DUENO, `select admin_loyalty('${TIENDA}'::uuid) as j`);

  assert.equal(j.emitidos, 20);
  assert.equal(j.gastados, 5);
  // El pasivo es lo que el comercio va a tener que entregar, y es el número que
  // nadie mira hasta que duele.
  assert.equal(j.pasivo, 15);
  assert.equal(j.conPuntos, 1);
});

test('el panel no le dice nada a quien no es del comercio', async () => {
  const [{ j }] = await como<{ j: { reglas: { enabled: boolean }; emitidos?: number } }>(
    db,
    ANA,
    `select admin_loyalty('${TIENDA}'::uuid) as j`,
  );
  assert.equal(j.reglas.enabled, false);
  assert.equal(j.emitidos, undefined);
});

/*
 * El canje (ADR-141).
 *
 * Es donde está el dinero, así que lo que se prueba es que **no se pueda entregar
 * un descuento sin cobrar los puntos**: sin saldo no hay cupón, un premio agotado se
 * agota de verdad, y el cupón que sale vale una sola vez.
 */

/** Crea un premio activo y devuelve su id. */
async function premio(
  puntos: number,
  extra: Record<string, string | number | null> = {},
): Promise<string> {
  const columnas = Object.keys(extra);
  const valores = Object.values(extra).map((v) => (v === null ? 'null' : String(v)));
  const r = await comoServicio<{ id: string }>(
    db,
    `insert into loyalty_rewards
       (tenant_id, store_id, title, points_cost, discount_type, discount_value, status
        ${columnas.length > 0 ? ', ' + columnas.join(', ') : ''})
     values ('${ORG}', '${TIENDA}', 'Diez por ciento', ${puntos}, 'percentage', 1000, 'active'
        ${valores.length > 0 ? ', ' + valores.join(', ') : ''})
     returning id`,
  );
  return r[0]!.id;
}

/** Deja a Ana con `puntos` de saldo y su cuenta vinculada. */
async function conSaldo(puntos: number): Promise<void> {
  await limpiar();
  await comoServicio(db, `delete from loyalty_rewards where store_id = '${TIENDA}'`);
  await comoServicio(db, `delete from promotions where store_id = '${TIENDA}'`);

  const pedido = await comprar(TIENDA, VARIANTE, 'ana@f.test');
  await comoServicio(
    db,
    `insert into customer_accounts (user_id, tenant_id, store_id, customer_id)
     select '${ANA}', '${ORG}', '${TIENDA}', o.customer_id from orders o where o.id = '${pedido}'
     on conflict do nothing`,
  );
  await comoServicio(
    db,
    `insert into loyalty_ledger (tenant_id, store_id, customer_id, points, source, note)
     select '${ORG}', '${TIENDA}', o.customer_id, ${puntos}, 'ajuste', 'para el test'
     from orders o where o.id = '${pedido}'`,
  );
}

test('canjear gasta los puntos y emite un cupón de un solo uso', async () => {
  await conSaldo(100);
  const id = await premio(60);

  const [{ j }] = await como<{ j: { codigo: string; saldo: number } }>(
    db,
    ANA,
    `select canjear_premio('${TIENDA}'::uuid, '${id}'::uuid) as j`,
  );

  assert.match(j.codigo, /^P[A-Z2-9]{9}$/);
  assert.equal(j.saldo, 40);
});

test('el cupón que sale es el que el motor de promociones ya sabe aplicar', async () => {
  await conSaldo(100);
  const id = await premio(60);

  /*
   * `como` hace rollback y `comoServicio` no tiene permiso —`canjear_premio` sólo se
   * concede a `authenticated`, que es quien lo llama de verdad—. `comoAdmin` es el
   * único que hace las dos cosas: adopta la identidad y confirma.
   */
  const [{ j }] = await comoAdmin<{ j: { codigo: string } }>(
    db,
    ANA,
    `select canjear_premio('${TIENDA}'::uuid, '${id}'::uuid) as j`,
  );

  const [cupon] = await comoServicio<{
    usage_limit: number;
    discount_type: string;
    status: string;
    ends_at: string;
  }>(
    db,
    `select usage_limit, discount_type, status::text as status, ends_at::text as ends_at
     from promotions where code = '${j.codigo}'`,
  );

  assert.equal(cupon!.usage_limit, 1, 'un canje que se puede usar dos veces se regaló dos veces');
  assert.equal(cupon!.discount_type, 'percentage');
  assert.equal(cupon!.status, 'active');
  assert.ok(cupon!.ends_at, 'un cupón sin vencimiento es un pasivo que no se puede cerrar');

  // Y el libro quedó con el gasto, apuntando al cupón que emitió.
  const [movimiento] = await comoServicio<{ points: number; promotion_id: string }>(
    db,
    `select points, promotion_id from loyalty_ledger where source = 'canje'`,
  );
  assert.equal(movimiento!.points, -60);
  assert.ok(movimiento!.promotion_id);
});

test('sin saldo no hay cupón', async () => {
  await conSaldo(10);
  const id = await premio(60);

  await assert.rejects(
    () => como(db, ANA, `select canjear_premio('${TIENDA}'::uuid, '${id}'::uuid)`),
    /Te faltan puntos/,
  );

  const cupones = await comoServicio<{ n: number }>(
    db,
    `select count(*)::int as n from promotions where store_id = '${TIENDA}'`,
  );
  assert.equal(cupones[0]!.n, 0, 'el cupón no puede existir si los puntos no se cobraron');
});

test('un premio agotado dice que se agotó, y no entrega nada', async () => {
  await conSaldo(500);
  const id = await premio(10, { max_redemptions: 1 });

  await comoAdmin(db, ANA, `select canjear_premio('${TIENDA}'::uuid, '${id}'::uuid)`);

  await assert.rejects(
    () => como(db, ANA, `select canjear_premio('${TIENDA}'::uuid, '${id}'::uuid)`),
    /se agoto/,
  );
});

test('el tope por persona se respeta', async () => {
  await conSaldo(500);
  const id = await premio(10, { max_per_customer: 1 });

  await comoAdmin(db, ANA, `select canjear_premio('${TIENDA}'::uuid, '${id}'::uuid)`);

  await assert.rejects(
    () => como(db, ANA, `select canjear_premio('${TIENDA}'::uuid, '${id}'::uuid)`),
    /todas las veces que se puede/,
  );
});

test('la vitrina dice el saldo, si alcanza y si está agotado', async () => {
  await conSaldo(50);
  await premio(30);
  await premio(80);

  const [{ j }] = await como<{
    j: { saldo: number; premios: { puntos: number; alcanza: boolean }[] };
  }>(db, ANA, `select premios_disponibles('${TIENDA}'::uuid) as j`);

  assert.equal(j.saldo, 50);
  // Ordenados por costo, y «alcanza» calculado en la base: el botón y el saldo no
  // pueden discrepar si los decide el mismo lugar.
  assert.deepEqual(
    j.premios.map((p) => [p.puntos, p.alcanza]),
    [
      [30, true],
      [80, false],
    ],
  );
});

test('el movimiento del canje trae su cupón, que es lo que se le va a preguntar', async () => {
  await conSaldo(100);
  const id = await premio(60);
  await comoAdmin(db, ANA, `select canjear_premio('${TIENDA}'::uuid, '${id}'::uuid)`);

  const [{ j }] = await como<{
    j: { movimientos: { origen: string; cupon: string | null; cuponUsado: boolean | null }[] };
  }>(db, ANA, `select mis_puntos('${TIENDA}'::uuid) as j`);

  const canje = j.movimientos.find((m) => m.origen === 'canje');
  // Sin esto, el código se perdía en el momento y el premio quedaba sin entregar.
  assert.match(canje?.cupon ?? '', /^P[A-Z2-9]{9}$/);
  assert.equal(canje?.cuponUsado, false);
});

test('una tienda sin fila de ajustes tiene reglas, no null', async () => {
  /*
   * Lo encontró el e2e del Admin: sin esto la función devolvía `null` y la pantalla
   * de Fidelidad se quedaba en el esqueleto para siempre. Los tests no lo veían porque
   * siembran `store_settings` para otras cosas.
   */
  await comoServicio(db, `delete from store_settings where store_id = '${APAGADA}'`);

  // Como el dueño: la función se concede a `authenticated`, que es quien la llama.
  const [{ j }] = await como<{ j: { enabled: boolean; porCompra: number } }>(
    db,
    DUENO,
    `select app.regla_de_puntos('${APAGADA}'::uuid) as j`,
  );

  assert.equal(j.enabled, false);
  assert.equal(j.porCompra, 20);

  await programa(APAGADA, false);
});
