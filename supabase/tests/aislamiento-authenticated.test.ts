import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { baseDePrueba, como, comoServicio, intentar } from './harness.ts';

/**
 * Qué alcanza alguien que está autenticado y no es de ningún comercio.
 *
 * Hasta hoy la pregunta no tenía respuesta comprobada porque no podía haber uno:
 * `authenticated` significaba «alguien del equipo de un comercio», y los 32
 * `grant execute` del repo se escribieron bajo esa premisa. La Fase 1 de v2 abre
 * cuentas de comprador, y a partir de ahí `authenticated` significa «cualquiera
 * que se registró». Este archivo fija la línea **antes** de que eso pase: si una
 * función queda al alcance de un forastero, se entera acá y no en producción.
 *
 * **Lo que hoy sostiene el aislamiento no es RLS.** Ocho de las funciones
 * alcanzables son `security definer` —RLS salteada por construcción— y lo que
 * corta es un `app.has_permission` escrito a mano adentro de cada una. Una de
 * ellas, `ai_credential_secret`, devuelve el ciphertext de la credencial de
 * OpenAI del comercio. Por eso la comprobación es por huella y no por forma: se
 * siembran datos con marcas irrepetibles y se afirma que **ninguna** respuesta
 * las contiene. Una función que cambie de forma sigue estando cubierta; una que
 * empiece a devolver de más, no pasa.
 */

const TENANT = 'a0000000-0000-4000-8000-000000000000';
const TIENDA = 'a1000000-0000-4000-8000-000000000000';
const SUCURSAL = 'a2000000-0000-4000-8000-000000000000';
const PRODUCTO = 'a3000000-0000-4000-8000-000000000000';
const VARIANTE = 'a4000000-0000-4000-8000-000000000000';

const DUENO = 'f0000000-0000-4000-8000-000000000000';
/** Existe en `auth.users` y no tiene ni una fila en `memberships`. */
const FORASTERO = 'f0000000-0000-4000-8000-0000000000ff';

/**
 * Marcas que sólo existen adentro del comercio A.
 *
 * Cada una está en un lugar distinto a propósito, porque cada función devuelve
 * una cosa distinta: el título viaja en el catálogo del Admin, el email en los
 * clientes y en los avisos, el importe en el resumen y en las ventas por
 * producto, el ciphertext y el last4 en la credencial de IA, y las instrucciones
 * de cobro en la configuración de la tienda.
 */
const HUELLAS = [
  'Remera del comercio A',
  'ana@privada.test',
  '137731', // el precio, y por lo tanto el total del pedido
  'CIPHERTEXT-QUE-NO-DEBE-SALIR',
  '9x9x', // los últimos cuatro de la API key
  'TRANSFERIR-A-LA-CUENTA-SECRETA',
  'RESENA-QUE-NO-DEBE-SALIR',
  'PUNTOS-QUE-NO-DEBEN-SALIR',
] as const;

/**
 * Toda función que `authenticated` puede ejecutar está en una de estas dos
 * listas, y el primer test lo comprueba contra el catálogo de Postgres. Agregar
 * un `grant execute ... to authenticated` sin clasificarlo deja la suite en
 * rojo, que es el punto: la decisión se toma, no se hereda.
 */
const BLOQUEADAS: readonly (readonly [string, string])[] = [
  ['public.admin_products', `admin_products('${TIENDA}', null, null, 1, 20)`],
  ['public.admin_save_product', `admin_save_product('${TIENDA}', '{"title":"x"}'::jsonb)`],
  ['public.import_products', `import_products('${TIENDA}', '[]'::jsonb)`],
  ['public.admin_orders', `admin_orders('${TIENDA}', null, null, 1, 20)`],
  ['public.admin_customers', `admin_customers('${TIENDA}', null, null, 1, 20)`],
  // Cohortes y RFM: `security invoker` sobre `orders` y `customers`, como la
  // lista de clientes (ADR-134).
  ['public.admin_customer_cohorts', `admin_customer_cohorts('${TIENDA}', 'UTC', 12)`],
  ['public.admin_customer_segments', `admin_customer_segments('${TIENDA}', null, 1, 20)`],
  // La antigüedad del stock: invoker, la acota RLS sobre el catálogo, el stock y
  // los pedidos (ADR-135).
  ['public.admin_inventory_aging', `admin_inventory_aging('${TIENDA}', null, 1, 20)`],
  // Las sucursales con su stock: invoker sobre `locations` e `inventory_levels`,
  // que tienen política de lectura por membresía.
  ['public.admin_locations', `admin_locations('${TIENDA}')`],
  // Reseñas: la cola del Admin y la moderación, las dos `definer` con el filtro de
  // membresía escrito adentro (ADR-140).
  ['public.admin_product_reviews', `admin_product_reviews('${TIENDA}', null, 1, 20)`],
  [
    'public.admin_moderate_reviews',
    `admin_moderate_reviews('${TIENDA}', array[]::uuid[], 'published')`,
  ],
  // Las publicadas de un producto: `invoker`, así que a un forastero le devuelve
  // vacío por las políticas de `product_reviews`.
  ['public.product_reviews_publicas', `product_reviews_publicas('${TIENDA}', '${PRODUCTO}', 20)`],
  // Escribir una reseña: `definer`, y lo primero que hace es exigir una cuenta de
  // comprador en esa tienda. Un forastero no tiene ninguna.
  ['public.escribir_resena', `escribir_resena('${TIENDA}', '${PRODUCTO}', 5::smallint, 'x')`],
  // Fidelidad (ADR-141). Las tres son `definer` y las tres empiezan por resolver la
  // identidad del comprador: un forastero no tiene cuenta en ninguna tienda.
  ['public.admin_loyalty', `admin_loyalty('${TIENDA}')`],
  ['public.mis_puntos', `mis_puntos('${TIENDA}', 20)`],
  ['public.premios_disponibles', `premios_disponibles('${TIENDA}')`],
  ['public.canjear_premio', `canjear_premio('${TIENDA}', '00000000-0000-4000-8000-000000000000')`],
  ['public.admin_dashboard', `admin_dashboard('${TIENDA}', now() - interval '30 days', now())`],
  ['public.admin_analytics', `admin_analytics('${TIENDA}', now() - interval '30 days', now())`],
  [
    'public.admin_product_performance',
    `admin_product_performance('${TIENDA}', now() - interval '30 days', now(), 'vendidos', 1, 20)`,
  ],
  ['public.admin_team', `admin_team('${TENANT}')`],
  ['public.admin_save_settings', `admin_save_settings('${TIENDA}', '{"a":1}'::jsonb, null)`],
  ['public.ai_credential_status', `ai_credential_status('${TIENDA}')`],
  ['public.ai_credential_secret', `ai_credential_secret('${TIENDA}')`],
  [
    'public.admin_save_ai_credential',
    `admin_save_ai_credential('${TIENDA}', 'x', '1234', 'gpt-5-mini')`,
  ],
  ['public.order_json', `order_json((select id from orders limit 1))`],
  [
    'public.admin_order_notifications',
    `admin_order_notifications('${TIENDA}', (select id from orders limit 1))`,
  ],
  [
    'public.admin_set_order_status',
    `admin_set_order_status('${TIENDA}', (select id from orders limit 1), 'preparing', null)`,
  ],
  [
    'public.admin_set_payment_status',
    `admin_set_payment_status('${TIENDA}', (select id from orders limit 1), 'paid', null)`,
  ],
  // Las dos que sirven al storefront no son `security definer`, así que RLS las
  // acota: a un forastero le devuelven el catálogo vacío y ninguna promoción.
  // Quien las llama de verdad es el Worker con la secret key, que saltea RLS
  // (ADR-052); el grant a `authenticated` es para el Admin.
  [
    'public.catalog_search',
    `catalog_search('${TIENDA}', '{}'::jsonb, null, null, 1, 20, null, null, null, null)`,
  ],
  ['public.cart_promotions', `cart_promotions('${TIENDA}', '[]'::jsonb, null)`],
  // Los pedidos del comprador. `security invoker` a propósito: la defensa es
  // RLS, no una comprobación escrita adentro (ADR-121). Un forastero recibe la
  // página vacía.
  ['public.customer_orders', `customer_orders('${TIENDA}', 1, 10)`],
  // Los productos guardados, por lo mismo: `security invoker` y RLS sobre
  // `wishlist_items`, que es del comprador.
  ['public.wishlist_products', `wishlist_products('${TIENDA}')`],
  // El resultado de cada sección de la portada: es el tablero del comercio, y
  // `security invoker` con RLS sobre `store_events` y `orders` lo acota.
  ['public.admin_section_performance', `admin_section_performance('${TIENDA}', 30)`],
  /*
   * El perfil de quien entró a su cuenta. Es `definer` —la tabla no tiene
   * política de comprador— con el filtro de identidad adentro, así que para
   * cualquier otro devuelve `{}` (ADR-128).
   */
  ['public.my_preferences', `my_preferences('${TIENDA}')`],
  // Y el borrado del perfil, por lo mismo: `definer` con el filtro de identidad
  // adentro. Para quien no tiene cuenta en esta tienda no borra nada.
  ['public.forget_my_preferences', `forget_my_preferences('${TIENDA}')`],
  // La cola de productos sin foto: `security invoker`, la acota RLS sobre
  // `products` y `product_media` (v2 Fase 5).
  ['public.admin_products_without_photo', `admin_products_without_photo('${TIENDA}', 1, 20)`],
  [
    'public.admin_products_without_description',
    `admin_products_without_description('${TIENDA}', 1, 20)`,
  ],
  // Aprobar una foto propuesta por la IA: invoker, y lo acota RLS sobre
  // `media_proposals` y `product_media`, que piden `catalog.write` (ADR-130).
  ['public.admin_apply_media_proposals', `admin_apply_media_proposals('${TIENDA}', '{}'::uuid[])`],
  [
    'public.admin_apply_description_proposals',
    `admin_apply_description_proposals('${TIENDA}', '{}'::uuid[])`,
  ],
];

/**
 * Alcanzables a propósito, porque no hay nada que puedan filtrar.
 *
 * No se clasifica nada como inofensivo por descarte: más abajo hay un test que
 * comprueba el comportamiento que justifica a cada una. Las tres de promociones
 * y la del embudo son aritmética sobre los argumentos y no leen ninguna tabla;
 * las dos primeras son las que **responden** la pregunta de quién sos, así que
 * no tendría sentido pedirles permiso.
 */
const PUBLICAS = [
  'app.apply_chain',
  'app.current_customer', // devuelve null para quien no tiene cuenta en esa tienda
  'app.current_tenants', // devuelve vacío para quien no es de ningún comercio
  'app.es_mi_pedido', // devuelve false
  'app.has_permission', // devuelve false
  // Pliega mayúsculas y acentos de su argumento. Además la evalúa la columna
  // generada `products.search_doc` con el rol de quien escribe el producto.
  'app.normalizar_busqueda',
  'app.paso_del_embudo',
  'app.promo_discount',
  /*
   * Devuelve ids de productos publicados y un número de parecido, que es
   * información de vitrina: el storefront ya se la sirve a cualquiera sin
   * credenciales. Es `security definer` para lo contrario de lo habitual — no
   * para dar acceso, sino para **no tener que abrir** `product_embeddings` ni
   * `search_queries`, que quedan sin grants. El filtro por tienda va adentro
   * (ADR-132).
   */
  'app.similitud_semantica',
  // Devuelve false para quien no compró. La usa la política de inserción de
  // reseñas, así que `authenticated` tiene que poder ejecutarla (ADR-140).
  'app.compro_y_recibio',
  // Las reglas del programa de puntos de una tienda: números de configuración, y
  // para quien no es de esa tienda no dicen nada que no esté en su vitrina.
  'app.regla_de_puntos',
  // Devuelve todo en false para quien no compró en esa tienda, que es lo que
  // necesita el PDP para decidir si ofrece el formulario (ADR-140).
  'public.mi_resena',
] as const;

let db: PGlite;

before(async () => {
  db = await baseDePrueba();

  await db.exec(`
    insert into auth.users (id, email) values
      ('${DUENO}', 'dueno@a.test'),
      ('${FORASTERO}', 'forastero@nadie.test');

    insert into organizations (id, name, slug) values ('${TENANT}', 'Comercio A', 'a');

    insert into stores (id, tenant_id, name, slug, domain, currency) values
      ('${TIENDA}', '${TENANT}', 'Tienda A', 'ta', 'a.test', 'PYG');

    insert into locations (id, tenant_id, store_id, name) values
      ('${SUCURSAL}', '${TENANT}', '${TIENDA}', 'Central');

    -- El forastero **no** aparece acá. Es todo el experimento.
    insert into memberships (tenant_id, user_id, role) values ('${TENANT}', '${DUENO}', 'owner');

    insert into products (id, tenant_id, store_id, handle, title, status) values
      ('${PRODUCTO}', '${TENANT}', '${TIENDA}', 'remera-a', 'Remera del comercio A', 'active');

    insert into product_variants
      (id, tenant_id, product_id, sku, title, price, cost, currency, position)
      values ('${VARIANTE}', '${TENANT}', '${PRODUCTO}', 'REM-A', 'M', 137731, 90000, 'PYG', 0);

    insert into inventory_levels (tenant_id, variant_id, location_id, available) values
      ('${TENANT}', '${VARIANTE}', '${SUCURSAL}', 10);

    -- Sin foto el catálogo lo oculta (20260910233527), y el test de más abajo
    -- necesita que el producto se vea para poder afirmar que se ve.
    insert into product_media (tenant_id, product_id, url, width, height) values
      ('${TENANT}', '${PRODUCTO}', 'https://cdn.test/a.webp', 800, 800);

    insert into store_settings (store_id, tenant_id, settings) values
      ('${TIENDA}', '${TENANT}',
       '{"payments":{"enabled":["bank_transfer"],"bankTransfer":{"instructions":"TRANSFERIR-A-LA-CUENTA-SECRETA"}}}'::jsonb);

    insert into ai_credentials (store_id, tenant_id, ciphertext, last4, model) values
      ('${TIENDA}', '${TENANT}', 'CIPHERTEXT-QUE-NO-DEBE-SALIR', '9x9x', 'gpt-5-mini');
  `);

  // Un pedido real, con su cliente, sus líneas y sus eventos: sin datos, «no
  // devolvió nada» no prueba nada.
  await comoServicio(
    db,
    `select create_order('${TIENDA}'::uuid, gen_random_uuid(),
       '{"customer":{"name":"Ana Privada","email":"ana@privada.test","phone":"0981123456"},
         "address":{"street":"Calle 1","city":"Asuncion"},
         "paymentMethod":"bank_transfer",
         "lines":[{"variantId":"${VARIANTE}","quantity":1}]}'::jsonb)`,
  );

  /*
   * Y una reseña publicada, con el texto como huella: el forastero no tiene que
   * poder leerla ni por la tabla ni por la función de la vitrina. Se inserta con la
   * secret key porque el pedido no está entregado —la política de inserción exige
   * eso— y lo que este archivo prueba es la lectura, no el alta.
   */
  await comoServicio(
    db,
    `insert into product_reviews (tenant_id, store_id, product_id, customer_id, order_id, rating, body, status)
     select '${TENANT}', '${TIENDA}', '${PRODUCTO}', o.customer_id, o.id, 5,
            'RESENA-QUE-NO-DEBE-SALIR', 'published'
     from orders o where o.store_id = '${TIENDA}' limit 1`,
  );

  /*
   * Y un movimiento de puntos, con el importe como huella: el libro de un comercio no
   * tiene que poder leerse desde afuera. Se inserta con la secret key porque el libro
   * lo escriben los disparadores, y lo que este archivo prueba es la lectura.
   */
  await comoServicio(
    db,
    `insert into loyalty_ledger (tenant_id, store_id, customer_id, points, source, note)
     select '${TENANT}', '${TIENDA}', o.customer_id, 4242, 'ajuste', 'PUNTOS-QUE-NO-DEBEN-SALIR'
     from orders o where o.store_id = '${TIENDA}' limit 1`,
  );
});

after(async () => {
  await db.close();
});

// --- El inventario ----------------------------------------------------------

test('toda función alcanzable por `authenticated` está clasificada', async () => {
  const filas = await db.query<{ nombre: string }>(`
    select p.pronamespace::regnamespace::text || '.' || p.proname as nombre
    from pg_proc p
    where has_function_privilege('authenticated', p.oid, 'execute')
      and p.pronamespace::regnamespace::text in ('public', 'app')
    group by 1
    order by 1
  `);

  const alcanzables = filas.rows.map((f) => f.nombre);
  const clasificadas = [...BLOQUEADAS.map(([n]) => n), ...PUBLICAS].sort();

  assert.deepEqual(
    alcanzables,
    clasificadas,
    'hay una función alcanzable por `authenticated` que nadie clasificó, o una ' +
      'clasificada que ya no existe. Decidir a cuál de las dos listas va.',
  );
});

test('`app.consume_promotion` no está al alcance de nadie salvo el servicio', async () => {
  // Es `security definer`, recibe un uuid arbitrario y no comprueba ni tenant ni
  // permiso. Su único llamador, `create_order`, corre como `service_role`, así
  // que el grant nunca hizo falta. Hicieron falta dos migraciones: revocarle a
  // `authenticated` no alcanzó, porque sobrevivía el `execute` que Postgres le
  // da a `PUBLIC` al crear la función.
  const r = await db.query<{ puede: boolean }>(
    `select has_function_privilege('authenticated', 'app.consume_promotion(uuid)', 'execute') as puede`,
  );
  assert.equal(r.rows[0]!.puede, false);
});

// --- Las funciones ----------------------------------------------------------

for (const [nombre, llamada] of BLOQUEADAS) {
  test(`${nombre} no le dice nada a un forastero`, async () => {
    const r = await intentar(db, FORASTERO, `select (${llamada})::text as t`);

    // Si lanzó, ya está: nada salió. Si contestó, lo que contestó no puede
    // contener nada del comercio A.
    if (!r.ok) return;

    const filas = await como<{ t: string | null }>(db, FORASTERO, `select (${llamada})::text as t`);
    const texto = filas.map((f) => f.t ?? '').join(' ');
    for (const huella of HUELLAS) {
      assert.ok(
        !texto.includes(huella),
        `${nombre} devolvió «${huella}», que es del comercio A: ${texto.slice(0, 300)}`,
      );
    }
  });
}

// --- Las tablas -------------------------------------------------------------

for (const tabla of [
  'customers',
  'orders',
  'order_items',
  'order_events',
  'store_settings',
  'product_reviews',
  'loyalty_ledger',
]) {
  test(`un forastero no lee ni una fila de ${tabla}`, async () => {
    const suyas = await comoServicio<{ n: number }>(db, `select count(*)::int as n from ${tabla}`);
    assert.ok(suyas[0]!.n > 0, `el seed no dejó filas en ${tabla}: el test no probaría nada`);

    const filas = await como<{ n: number }>(
      db,
      FORASTERO,
      `select count(*)::int as n from ${tabla}`,
    );
    assert.equal(filas[0]!.n, 0);
  });
}

test('un `viewer` tampoco lee `store_settings`: leerla pide `settings.write`', async () => {
  // La política de lectura acotaba por membresía y no pedía ningún permiso, al
  // contrario de la de escritura. Ahí viven las zonas de envío, las
  // instrucciones de cobro y la configuración del catálogo.
  const VIEWER = 'f0000000-0000-4000-8000-0000000000aa';
  await db.exec(`
    insert into auth.users (id, email) values ('${VIEWER}', 'viewer@a.test')
      on conflict do nothing;
    insert into memberships (tenant_id, user_id, role) values ('${TENANT}', '${VIEWER}', 'viewer')
      on conflict do nothing;
  `);

  const delViewer = await como<{ n: number }>(
    db,
    VIEWER,
    'select count(*)::int as n from store_settings',
  );
  assert.equal(delViewer[0]!.n, 0);

  const delDueno = await como<{ n: number }>(
    db,
    DUENO,
    'select count(*)::int as n from store_settings',
  );
  assert.equal(delDueno[0]!.n, 1, 'el dueño dejó de ver su propia configuración');
});

// --- Lo que sí es público, y por qué ----------------------------------------

test('las funciones sin dueño no le dan nada a un forastero', async () => {
  const tenants = await como<{ t: string }>(db, FORASTERO, 'select app.current_tenants() as t');
  assert.deepEqual(tenants, [], '`current_tenants` le devolvió una organización a un forastero');

  // Las dos del comprador responden «quién sos», así que pedirles permiso no
  // tendría sentido; lo que no pueden es decir algo de otro.
  const cliente = await como<{ c: string | null }>(
    db,
    FORASTERO,
    `select app.current_customer('${TIENDA}') as c`,
  );
  assert.equal(
    cliente[0]!.c,
    null,
    '`current_customer` le dio una ficha de cliente a un forastero',
  );

  const ajeno = await como<{ m: boolean }>(
    db,
    FORASTERO,
    'select app.es_mi_pedido((select id from orders limit 1)) as m',
  );
  assert.equal(ajeno[0]!.m, false, '`es_mi_pedido` dijo que sí sobre un pedido ajeno');

  const permiso = await como<{ p: boolean }>(
    db,
    FORASTERO,
    `select app.has_permission('${TENANT}', 'settings.write') as p`,
  );
  assert.equal(permiso[0]!.p, false);
});

test('el catálogo del comercio lo sigue viendo el comercio', async () => {
  // La contracara del test de arriba: que un forastero reciba `items: []` de
  // `catalog_search` podría deberse a que la consulta se rompió, no a que RLS la
  // acote. Esto lo distingue.
  const r = await como<{ t: string }>(
    db,
    DUENO,
    `select catalog_search('${TIENDA}', '{}'::jsonb, null, null, 1, 20, null, null, null, null)::text as t`,
  );
  const texto = r[0]!.t;
  assert.ok(texto.includes('Remera del comercio A'), 'el dueño dejó de ver su propio catálogo');
  assert.ok(!texto.includes('90000'), '`catalog_search` está devolviendo el costo');
});
