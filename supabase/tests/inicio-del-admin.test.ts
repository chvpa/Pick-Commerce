import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como } from './harness.ts';

/**
 * El Inicio del Admin: lo que espera a la tienda y las series del período (v3
 * Fase 2).
 *
 * `admin_store_tasks` es `security definer` —lee la cola de avisos, que no tiene
 * políticas—, así que lo que más importa probar es el corte por organización:
 * el dueño de otro comercio y alguien de ningún comercio reciben `null`, no
 * ceros ni los números del comercio A.
 *
 * `admin_dashboard_series` es `security invoker`: el aislamiento lo pone RLS
 * sobre `orders`, y alcanza con ver que otro comercio recibe cubetas vacías.
 */

const TENANT = 'ab000000-0000-4000-8000-000000000000';
const TIENDA = 'ab100000-0000-4000-8000-000000000000';
const OTRO_TENANT = 'ac000000-0000-4000-8000-000000000000';
const OTRA_TIENDA = 'ac100000-0000-4000-8000-000000000000';

const DUENO = 'fa000000-0000-4000-8000-000000000000';
const AJENO = 'fa000000-0000-4000-8000-000000000001';
const FORASTERO = 'fa000000-0000-4000-8000-0000000000ff';

const CLIENTE = 'ca000000-0000-4000-8000-000000000000';

const SIN_COBRAR = '0a000000-0000-4000-8000-000000000001';
const COBRADO_RECIBIDO = '0a000000-0000-4000-8000-000000000002';
const COBRADO_ENVIADO = '0a000000-0000-4000-8000-000000000003';
const CANCELADO = '0a000000-0000-4000-8000-000000000004';
const ENTREGADO = '0a000000-0000-4000-8000-000000000005';
const AJENO_PEDIDO = '0a000000-0000-4000-8000-000000000006';

const P_SIN_FOTO = 'da000000-0000-4000-8000-000000000001';
const P_CON_FOTO = 'da000000-0000-4000-8000-000000000002';
const P_BORRADOR = 'da000000-0000-4000-8000-000000000003';

/**
 * La medianoche de hoy **en UTC**. PGlite corre con el huso del sistema, y las
 * cubetas se piden en UTC: con la medianoche local, la ventana empezaría a las
 * 03:00 y abarcaría ocho días en vez de siete.
 */
const HOY = `(date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')`;

let db: PGlite;

interface Tareas {
  readonly porCobrar: { n: number; desde: string | null };
  readonly paraPreparar: { n: number; desde: string | null };
  readonly avisosFallidos: { n: number; pedido: { number: number; customerName: string } | null };
  readonly sinFoto: { n: number; ocultos: boolean };
  readonly resenas: { n: number; ultima: { producto: string; rating: number } | null };
  readonly propuestas: { descripciones: number; fotos: number };
  readonly pedidos: number;
  readonly alta: Record<'productos' | 'pagos' | 'envio' | 'portada' | 'equipo', boolean>;
}

interface Serie {
  readonly puntos: readonly { desde: string; ventas: number; pedidos: number }[];
  readonly tramos: { hasta: [number, number]; pedidos: [number, number, number] } | null;
}

async function tareas(usuario: string, tienda = TIENDA): Promise<Tareas | null> {
  const filas = await como<{ j: Tareas | null }>(
    db,
    usuario,
    `select admin_store_tasks('${tienda}'::uuid) as j`,
  );
  return filas[0]!.j;
}

async function serie(usuario: string, horas: boolean, tienda = TIENDA): Promise<Serie> {
  const filas = await como<{ j: Serie }>(
    db,
    usuario,
    `select admin_dashboard_series(
       '${tienda}'::uuid,
       ${HOY} - interval '6 days',
       ${HOY} + interval '1 day',
       'UTC',
       ${horas}
     ) as j`,
  );
  return filas[0]!.j;
}

before(async () => {
  db = await baseDePrueba();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@a.test'), ('${AJENO}', 'ajeno@b.test'), ('${FORASTERO}', 'nadie@c.test');

    insert into organizations (id, name, slug) values
      ('${TENANT}', 'Comercio A', 'ia'), ('${OTRO_TENANT}', 'Comercio B', 'ib');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'tia', 'ia.test', 'PYG'),
      ('${OTRA_TIENDA}', '${OTRO_TENANT}', 'Tienda B', 'tib', 'ib.test', 'PYG');

    insert into memberships (tenant_id, user_id, role) values
      ('${TENANT}', '${DUENO}', 'owner'),
      ('${OTRO_TENANT}', '${AJENO}', 'owner');

    -- Con datos de la cuenta y ocultando lo que no tiene foto; sin envío decidido.
    insert into store_settings (store_id, tenant_id, settings) values
      ('${TIENDA}', '${TENANT}', '{
        "payments": {"enabled": ["bank_transfer"], "bankTransfer": {"instructions": "Cuenta 123"}},
        "catalog": {"hideWithoutImage": true}
      }');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${P_SIN_FOTO}', '${TENANT}', '${TIENDA}', 'sin-foto', 'Remera sin foto', 'active'),
      ('${P_CON_FOTO}', '${TENANT}', '${TIENDA}', 'con-foto', 'Campera con foto', 'active'),
      -- Sin foto pero sin publicar: no está en la vitrina, así que no falta.
      ('${P_BORRADOR}', '${TENANT}', '${TIENDA}', 'borrador', 'Borrador', 'draft');

    insert into product_media (tenant_id, product_id, url, width, height) values
      ('${TENANT}', '${P_CON_FOTO}', 'https://x.test/a.jpg', 800, 800);

    insert into customers (id, tenant_id, store_id, email, name, phone) values
      ('${CLIENTE}', '${TENANT}', '${TIENDA}', 'ana@cliente.test', 'Ana López', '0981111111');

    insert into orders (
      id, tenant_id, store_id, number, idempotency_key, status, payment_status, payment_method,
      customer_id, customer, address, total_amount, currency, created_at
    ) values
      ('${SIN_COBRAR}', '${TENANT}', '${TIENDA}', 1, gen_random_uuid(), 'received', 'pending',
       'bank_transfer', '${CLIENTE}', '{"name":"Ana López"}', '{}', 100000, 'PYG',
       ${HOY} - interval '2 days' + interval '10 hours'),
      ('${COBRADO_RECIBIDO}', '${TENANT}', '${TIENDA}', 2, gen_random_uuid(), 'received', 'paid',
       'bank_transfer', '${CLIENTE}', '{"name":"Ana López"}', '{}', 300000, 'PYG',
       ${HOY} - interval '1 day' + interval '9 hours'),
      -- Cobrado y ya en camino: no está para preparar.
      ('${COBRADO_ENVIADO}', '${TENANT}', '${TIENDA}', 3, gen_random_uuid(), 'shipped', 'paid',
       'bank_transfer', '${CLIENTE}', '{"name":"Ana López"}', '{}', 2000000, 'PYG',
       ${HOY} - interval '1 day' + interval '15 hours'),
      -- Cancelado y sin cobrar: no se cobra, ni entra en las series.
      ('${CANCELADO}', '${TENANT}', '${TIENDA}', 4, gen_random_uuid(), 'cancelled', 'pending',
       'bank_transfer', '${CLIENTE}', '{"name":"Ana López"}', '{}', 9000000, 'PYG',
       ${HOY} - interval '1 day' + interval '16 hours'),
      ('${ENTREGADO}', '${TENANT}', '${TIENDA}', 5, gen_random_uuid(), 'delivered', 'paid',
       'bank_transfer', '${CLIENTE}', '{"name":"Ana López"}', '{}', 200000, 'PYG',
       ${HOY} + interval '8 hours'),
      ('${AJENO_PEDIDO}', '${OTRO_TENANT}', '${OTRA_TIENDA}', 1, gen_random_uuid(), 'received', 'pending',
       'bank_transfer', null, '{"name":"Otro"}', '{}', 555000, 'PYG',
       ${HOY} - interval '1 day');

    insert into notification_outbox (tenant_id, store_id, order_id, event, recipient, attempts, sent_at) values
      -- Abandonado: cinco intentos y no salió.
      ('${TENANT}', '${TIENDA}', '${COBRADO_RECIBIDO}', 'order_confirmed', 'ana@cliente.test', 5, null),
      -- En cola: todavía puede salir solo.
      ('${TENANT}', '${TIENDA}', '${SIN_COBRAR}', 'order_confirmed', 'ana@cliente.test', 2, null),
      ('${TENANT}', '${TIENDA}', '${ENTREGADO}', 'order_confirmed', 'ana@cliente.test', 1, now()),
      -- Del otro comercio: no puede aparecer en el A.
      ('${OTRO_TENANT}', '${OTRA_TIENDA}', '${AJENO_PEDIDO}', 'order_confirmed', 'otro@b.test', 5, null);

    insert into product_reviews (tenant_id, store_id, product_id, customer_id, order_id, rating, status, created_at) values
      ('${TENANT}', '${TIENDA}', '${P_SIN_FOTO}', '${CLIENTE}', '${ENTREGADO}', 4, 'pending', now() - interval '2 hours'),
      ('${TENANT}', '${TIENDA}', '${P_CON_FOTO}', '${CLIENTE}', '${ENTREGADO}', 5, 'pending', now() - interval '1 hour');

    insert into description_proposals (tenant_id, store_id, product_id, proposed, status) values
      ('${TENANT}', '${TIENDA}', '${P_SIN_FOTO}', 'Una remera', 'pending'),
      ('${TENANT}', '${TIENDA}', '${P_CON_FOTO}', 'Una campera', 'approved');

    insert into media_proposals (tenant_id, store_id, product_id, original_url, proposed_url, status) values
      ('${TENANT}', '${TIENDA}', '${P_CON_FOTO}', 'https://x.test/a.jpg', 'https://x.test/b.jpg', 'pending');
  `);
});

after(async () => {
  await db.close();
});

test('el dueño ve lo que espera a su tienda', async () => {
  const t = await tareas(DUENO);
  assert.ok(t);

  // Sin cobrar y vivo: el cancelado no se cobra.
  assert.equal(t.porCobrar.n, 1);
  // Cobrado y sin salir: el enviado y el entregado ya no se preparan.
  assert.equal(t.paraPreparar.n, 1);

  // Sólo el abandonado: el que sigue en cola sale solo.
  assert.equal(t.avisosFallidos.n, 1);
  assert.equal(t.avisosFallidos.pedido?.number, 2);

  // El borrador sin foto no cuenta: no está en la vitrina.
  assert.deepEqual(t.sinFoto, { n: 1, ocultos: true });

  assert.equal(t.resenas.n, 2);
  assert.deepEqual(t.resenas.ultima, { producto: 'Campera con foto', rating: 5 });

  assert.deepEqual(t.propuestas, { descripciones: 1, fotos: 1 });
  assert.equal(t.pedidos, 5);
});

test('el checklist sale de lo que la tienda ya hizo', async () => {
  const t = await tareas(DUENO);
  assert.deepEqual(t?.alta, {
    productos: true,
    // La transferencia tiene los datos de la cuenta.
    pagos: true,
    // Nadie decidió nada del envío todavía.
    envio: false,
    portada: false,
    // El dueño solo no es un equipo.
    equipo: false,
  });
});

test('otro comercio y alguien de ningún comercio reciben null', async () => {
  /*
   * La función saltea RLS: si el corte por organización faltara, el dueño de B
   * vería el aviso abandonado y los pedidos de A con sólo pasar su id.
   */
  assert.equal(await tareas(AJENO), null);
  assert.equal(await tareas(FORASTERO), null);

  // Y el dueño de B, sobre su propia tienda, no ve nada de A.
  const deB = await tareas(AJENO, OTRA_TIENDA);
  assert.equal(deB?.porCobrar.n, 1);
  assert.equal(deB?.avisosFallidos.n, 1);
  assert.equal(deB?.pedidos, 1);
});

test('la serie tiene una cubeta por día, aunque esté vacía, y sin los cancelados', async () => {
  const s = await serie(DUENO, false);

  assert.equal(s.puntos.length, 7);
  const ventas = s.puntos.map((p) => p.ventas);
  // Hace dos días el sin cobrar; ayer los dos cobrados —el cancelado no—; hoy el entregado.
  assert.deepEqual(ventas, [0, 0, 0, 0, 100000, 2300000, 200000]);
  assert.deepEqual(
    s.puntos.map((p) => p.pedidos),
    [0, 0, 0, 0, 1, 2, 1],
  );
});

test('por hora, las cubetas son horas', async () => {
  const s = await serie(DUENO, true);
  assert.equal(s.puntos.length, 7 * 24);
  assert.equal(
    s.puntos.reduce((a, p) => a + p.pedidos, 0),
    4,
  );
});

test('los tramos del ticket se cortan alrededor del ticket del período', async () => {
  const s = await serie(DUENO, false);
  /*
   * Cuatro pedidos: 100.000, 300.000, 2.000.000 y 200.000. El ticket es
   * 650.000, así que los bordes son la mitad y el doble, a una cifra
   * significativa: 300.000 y 1.000.000.
   */
  assert.deepEqual(s.tramos, { hasta: [300000, 1000000], pedidos: [3, 0, 1] });
});

test('otro comercio recibe la serie vacía y sin tramos', async () => {
  const s = await serie(AJENO, false);
  assert.equal(s.puntos.length, 7);
  assert.ok(s.puntos.every((p) => p.ventas === 0 && p.pedidos === 0));
  assert.equal(s.tramos, null);
});
