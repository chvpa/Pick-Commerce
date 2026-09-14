import { existsSync } from 'node:fs';
import { clienteDeBrowser, clienteDeServidor } from '@pick/adapter-supabase';

/**
 * Verifica el aislamiento entre comercios **con sesiones de verdad**.
 *
 * La suite de PGlite (`pnpm test:rls`) cubre las políticas con `set role` y un
 * `app.user_id` puesto a mano. Es rápida y corre en CI, pero no ejercita el
 * camino real: PostgREST, un JWT firmado por Supabase Auth y `auth.uid()`
 * resolviéndose desde ese token. Entre las dos cosas hay una capa entera —la que
 * traduce el token en identidad— y ninguna prueba la tocaba: el ROADMAP lo tenía
 * anotado como «la verificación de RLS con JWTs reales es manual».
 *
 * Esto la automatiza. Crea dos usuarios en **dos organizaciones distintas**,
 * entra con cada uno y comprueba que ninguno ve nada del otro por ninguna de las
 * vías que el Admin usa: tablas directas y funciones `security definer`.
 *
 *   pnpm rls:verificar
 *
 * Corre contra el proyecto de desarrollo, no en CI: necesita la secret key para
 * crear los usuarios, y en CI no hay secretos (INFRAESTRUCTURA §3). Es un
 * control de release, de los que el harness llama T3.
 *
 * Los usuarios llevan el dominio `@rls.test`, que es su propio marcador: se
 * borran al terminar, pase o falle.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !secretKey || !publishableKey) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SECRET_KEY y SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const admin = clienteDeServidor({ url, secretKey });
const PASSWORD = 'rls-verificacion-2026-Pick!';

interface Actor {
  readonly etiqueta: string;
  readonly email: string;
  readonly tenantId: string;
  readonly storeId: string;
  userId?: string;
}

let fallas = 0;

function comprobar(descripcion: string, ok: boolean, detalle = ''): void {
  console.log(`  ${ok ? '✔' : '✖'} ${descripcion}${detalle ? ` — ${detalle}` : ''}`);
  if (!ok) fallas += 1;
}

/** Un usuario nuevo con membresía en una organización. Idempotente. */
async function crearActor(actor: Actor, rol = 'owner'): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: actor.email,
    password: PASSWORD,
    email_confirm: true,
  });

  let userId = data?.user?.id;
  if (!userId) {
    // Ya existía de una corrida anterior que no llegó a limpiar.
    if (!error) throw new Error(`No se pudo crear ${actor.email}`);
    const { data: existentes } = await admin.auth.admin.listUsers();
    userId = existentes?.users.find((u) => u.email === actor.email)?.id;
    if (!userId) throw new Error(`No se pudo crear ni encontrar ${actor.email}: ${error.message}`);
  }

  const { error: errorMembresia } = await admin
    .from('memberships')
    .upsert({ tenant_id: actor.tenantId, user_id: userId, role: rol });
  if (errorMembresia) throw new Error(`Membresía de ${actor.email}: ${errorMembresia.message}`);

  return userId;
}

async function borrarActor(actor: Actor): Promise<void> {
  if (actor.userId) await admin.auth.admin.deleteUser(actor.userId);
}

/*
 * ---------------------------------------------------------------------------
 * El otro lado del mostrador
 * ---------------------------------------------------------------------------
 *
 * Un comprador está en el **mismo** `auth.users` que el staff —hay un solo
 * proyecto de Supabase— y no tiene membresía en ninguna organización. Lo que
 * decide qué ve es `customer_accounts`, y la forma de arruinarlo es de una
 * línea: usar `app.current_tenants()` en una política de comprador, que
 * significa «staff» y le entregaría la tienda entera.
 *
 * La suite de PGlite ya cubre eso con `set role`. Acá se comprueba con el JWT
 * real, que es la capa que aquella no toca.
 */

const COMPRADOR = { email: 'compradora@rls.test', password: PASSWORD };
let compradorId: string | undefined;

async function borrarComprador(): Promise<void> {
  if (!compradorId) return;
  await admin.from('customers').delete().eq('email', COMPRADOR.email);
  await admin.auth.admin.deleteUser(compradorId);
}

/** Un pedido de invitada en esa tienda, por el mismo camino que el checkout. */
async function pedidoDePrueba(storeId: string): Promise<string | null> {
  const { data: variantes } = await admin
    .from('product_variants')
    .select('id, products!inner(store_id)')
    .eq('products.store_id', storeId)
    .limit(1);

  const variantId = variantes?.[0]?.id;
  if (!variantId) return null;

  const { data } = await admin.rpc('create_order', {
    p_store_id: storeId,
    p_idempotency_key: crypto.randomUUID(),
    p_input: {
      customer: { name: 'Compradora RLS', email: COMPRADOR.email, phone: '0981000000' },
      address: { street: 'Calle RLS', city: 'Asunción' },
      paymentMethod: 'bank_transfer',
      lines: [{ variantId, quantity: 1 }],
    } as never,
  });

  return (data as { order?: { id: string } } | null)?.order?.id ?? null;
}

async function verificarComprador(propia: Actor, ajena: Actor): Promise<void> {
  console.log('');
  console.log('Con la sesión de una compradora (sin membresía en ninguna organización):');

  const { data: creado } = await admin.auth.admin.createUser({
    email: COMPRADOR.email,
    password: COMPRADOR.password,
    email_confirm: true,
  });
  compradorId = creado?.user?.id;
  if (!compradorId) {
    comprobar('se pudo crear la compradora', false);
    return;
  }

  const miPedido = await pedidoDePrueba(propia.storeId);
  if (!miPedido) {
    comprobar(`«${propia.etiqueta}» tiene una variante con la que comprar`, false);
    return;
  }

  const { error: errorVinculo } = await admin.rpc('link_customer_account', {
    p_store_id: propia.storeId,
    p_user_id: compradorId,
    p_email: COMPRADOR.email,
  });
  comprobar('link_customer_account engancha la cuenta', !errorVinculo, errorVinculo?.message ?? '');

  const compradora = clienteDeBrowser({ url: url!, publishableKey: publishableKey! });
  const { data: entrada, error: errorEntrada } =
    await compradora.auth.signInWithPassword(COMPRADOR);
  if (errorEntrada || !entrada.session) {
    comprobar('la compradora puede entrar', false, errorEntrada?.message ?? '');
    return;
  }

  // Lo suyo, y nada más. `orders` es la tabla donde las dos políticas conviven:
  // la del staff por `app.current_tenants()` y la suya por `customer_accounts`.
  const { data: pedidos } = await compradora.from('orders').select('id, store_id');
  comprobar(
    'orders: ve su pedido y sólo el suyo',
    (pedidos ?? []).length === 1 && pedidos?.[0]?.id === miPedido,
    `${pedidos?.length ?? 0} pedidos`,
  );

  /*
   * Lo que un comprador **no** es: staff. Estas cinco son las tablas que el
   * Admin consulta, y para alguien sin membresía tienen que venir vacías —es la
   * garantía de la Fase 0, ahora con una sesión que además tiene cuenta—.
   */
  for (const tabla of ['products', 'customers', 'promotions', 'store_events'] as const) {
    const { data } = await compradora.from(tabla).select('tenant_id');
    comprobar(
      `${tabla}: una compradora no ve nada`,
      (data ?? []).length === 0,
      `${data?.length ?? 0} filas`,
    );
  }

  // Su listado, y el de la tienda donde no tiene cuenta.
  const { data: mios } = await compradora.rpc('customer_orders', {
    p_store_id: propia.storeId,
    p_page: 1,
    p_per_page: 10,
  });
  comprobar(
    'customer_orders: devuelve su pedido en su tienda',
    ((mios as { total?: number } | null)?.total ?? 0) === 1,
  );

  const { data: ajenos } = await compradora.rpc('customer_orders', {
    p_store_id: ajena.storeId,
    p_page: 1,
    p_per_page: 10,
  });
  comprobar(
    'customer_orders: en la tienda donde no tiene cuenta viene vacío',
    ((ajenos as { total?: number } | null)?.total ?? 0) === 0,
  );

  // Un pedido ajeno por id. `order_json` es security invoker: lo filtra RLS.
  const { data: otroPedido } = await admin
    .from('orders')
    .select('id')
    .neq('id', miPedido)
    .limit(1)
    .maybeSingle();

  if (otroPedido?.id) {
    const { data: leido } = await compradora.rpc('order_json', { p_order_id: otroPedido.id });
    comprobar(
      'order_json: un pedido ajeno por id no devuelve el pedido',
      !(leido as { number?: number } | null)?.number,
    );
  }

  // Escribir colgada de otra cuenta. Lo impide el `with check` de la política.
  const { data: otraCuenta } = await admin
    .from('customer_accounts')
    .select('customer_id, tenant_id, store_id')
    .neq('user_id', compradorId)
    .limit(1)
    .maybeSingle();

  if (!otraCuenta) {
    // Se dice en vez de saltarse en silencio: un control que no corrió y uno que
    // pasó se ven igual en la salida, y esa confusión ya costó un ciclo acá.
    console.log(
      '  · sin otra cuenta de comprador en la base: el caso de la dirección ajena no corrió',
    );
  }

  if (otraCuenta) {
    const { error } = await compradora.from('customer_addresses').insert({
      tenant_id: otraCuenta.tenant_id,
      store_id: otraCuenta.store_id,
      customer_id: otraCuenta.customer_id,
      address: { street: 'Intrusa', city: 'Asunción' } as never,
    });
    comprobar(
      'customer_addresses: no se puede colgar una dirección de otra cuenta',
      Boolean(error),
    );
  }

  // Y la función del vínculo no está a su alcance: es la que decide de quién son
  // los pedidos, así que sólo la secret key la puede llamar.
  const { error: errorVincular } = await compradora.rpc('link_customer_account', {
    p_store_id: propia.storeId,
    p_user_id: compradorId,
    p_email: 'otra@persona.test',
  });
  comprobar(
    'link_customer_account: no la puede llamar una sesión de comprador',
    Boolean(errorVincular),
  );

  await compradora.auth.signOut();
}

async function main(): Promise<void> {
  const { data: orgs } = await admin.from('organizations').select('id, slug').order('slug');
  if (!orgs || orgs.length < 2) {
    console.error(
      'Hacen falta al menos dos organizaciones para verificar el aislamiento.\n' +
        'Crear la segunda con `pnpm tienda:crear <slug> <nombre>`.',
    );
    process.exit(1);
  }

  const [a, b] = orgs;
  const { data: tiendas } = await admin.from('stores').select('id, tenant_id');
  const tiendaDe = (tenantId: string): string => {
    const t = tiendas?.find((s) => s.tenant_id === tenantId);
    if (!t) throw new Error(`La organización ${tenantId} no tiene tiendas.`);
    return t.id;
  };

  const uno: Actor = {
    etiqueta: a!.slug,
    email: 'uno@rls.test',
    tenantId: a!.id,
    storeId: tiendaDe(a!.id),
  };
  const otro: Actor = {
    etiqueta: b!.slug,
    email: 'otro@rls.test',
    tenantId: b!.id,
    storeId: tiendaDe(b!.id),
  };

  console.log(`Verificando aislamiento entre «${uno.etiqueta}» y «${otro.etiqueta}»\n`);

  try {
    uno.userId = await crearActor(uno);
    otro.userId = await crearActor(otro);

    const sesion = clienteDeBrowser({ url: url!, publishableKey: publishableKey! });
    const { data: entrada, error: errorEntrada } = await sesion.auth.signInWithPassword({
      email: uno.email,
      password: PASSWORD,
    });
    if (errorEntrada || !entrada.session) {
      throw new Error(`No se pudo iniciar sesión: ${errorEntrada?.message}`);
    }

    console.log(`Con la sesión de «${uno.etiqueta}»:`);

    /*
     * Lectura directa de tablas. RLS es lo único que separa acá: el Admin
     * consulta así, con la publishable key (ADR-052).
     */
    for (const tabla of [
      'products',
      'orders',
      'customers',
      'promotions',
      'store_events',
    ] as const) {
      const { data } = await sesion.from(tabla).select('tenant_id');
      const ajenas = (data ?? []).filter((f) => f.tenant_id !== uno.tenantId).length;
      comprobar(
        `${tabla}: no devuelve filas de otra organización`,
        ajenas === 0,
        `${data?.length ?? 0} filas, ${ajenas} ajenas`,
      );
    }

    /*
     * Las funciones. Dos clases, y se comprueban distinto porque protegen de
     * forma distinta:
     *
     * - Las `security definer` **saltean RLS**, así que su filtro por
     *   organización es una línea dentro de cada una y nada más lo respalda.
     *   Tienen que **rechazar** un id ajeno.
     * - Las `security invoker` corren con los permisos de quien llama, así que
     *   RLS las cubre: con una tienda ajena no fallan, devuelven **ceros**. Eso
     *   es correcto y está escrito en su propio código; exigirles un error sería
     *   pedirles algo que no prometen.
     */
    const definers: {
      nombre: string;
      propia: Record<string, unknown>;
      ajena: Record<string, unknown>;
    }[] = [
      {
        nombre: 'admin_team',
        propia: { p_tenant: uno.tenantId },
        ajena: { p_tenant: otro.tenantId },
      },
      {
        nombre: 'ai_credential_status',
        propia: { p_store_id: uno.storeId },
        ajena: { p_store_id: otro.storeId },
      },
      {
        nombre: 'ai_credential_secret',
        propia: { p_store_id: uno.storeId },
        ajena: { p_store_id: otro.storeId },
      },
    ];

    for (const { nombre, propia, ajena } of definers) {
      /*
       * Las **dos** caras, y no sólo el rechazo.
       *
       * Un control que sólo mira que la llamada ajena falle pasa igual cuando
       * falla por cualquier otra cosa: el nombre de un parámetro mal escrito da
       * «function not found», que se lee idéntico a «sin permiso». Pasó acá, y
       * lo encontró un sabotaje —apuntar la comprobación a la organización
       * propia y ver que seguía en verde—, no la lectura.
       */
      const { error: conLaPropia } = await sesion.rpc(nombre as never, propia as never);
      const { error: conLaAjena } = await sesion.rpc(nombre as never, ajena as never);

      comprobar(
        `${nombre}: responde a la propia y rechaza la ajena`,
        !conLaPropia && Boolean(conLaAjena),
        conLaPropia ? `falló con la propia: ${conLaPropia.message}` : '',
      );
    }

    const rango = { p_from: new Date(0).toISOString(), p_to: new Date().toISOString() };

    const { data: panel } = await sesion.rpc('admin_dashboard', {
      p_store_id: otro.storeId,
      ...rango,
    });
    const resumen = panel as { sales?: { amount: number }; orders?: number } | null;
    comprobar(
      'admin_dashboard: con una tienda ajena devuelve ceros, no sus ventas',
      (resumen?.sales?.amount ?? 0) === 0 && (resumen?.orders ?? 0) === 0,
      JSON.stringify(resumen?.sales ?? null),
    );

    const { data: pedidos } = await sesion.rpc('admin_orders', {
      p_store_id: otro.storeId,
      p_query: '',
      p_status: null,
      p_page: 1,
      p_per_page: 20,
    });
    comprobar(
      'admin_orders: no lista los pedidos de otra organización',
      ((pedidos as { total?: number } | null)?.total ?? 0) === 0,
    );

    /*
     * Escribir en otra organización. El caso que ninguna lectura cubre: una
     * política de select correcta y una de insert ausente dejan pasar esto.
     */
    const { error: errorEscritura } = await sesion.from('products').insert({
      tenant_id: otro.tenantId,
      store_id: otro.storeId,
      handle: `intruso-${Date.now()}`,
      title: 'No debería existir',
      status: 'draft',
    });
    comprobar('products: no se puede escribir en otra organización', Boolean(errorEscritura));

    await sesion.auth.signOut();

    await verificarComprador(uno, otro);
  } finally {
    await borrarActor(uno);
    await borrarActor(otro);
    await borrarComprador();
  }

  console.log(
    `\n${fallas === 0 ? 'Aislamiento verificado.' : `${fallas} comprobaciones fallaron.`}`,
  );
  process.exit(fallas === 0 ? 0 : 1);
}

await main();
