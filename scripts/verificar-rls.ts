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
  } finally {
    await borrarActor(uno);
    await borrarActor(otro);
  }

  console.log(
    `\n${fallas === 0 ? 'Aislamiento verificado.' : `${fallas} comprobaciones fallaron.`}`,
  );
  process.exit(fallas === 0 ? 0 : 1);
}

await main();
