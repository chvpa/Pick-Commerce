import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';
import { ADMIN_E2E, TIENDA_E2E } from './datos-admin-e2e.ts';
import { CONFIGURACION, IDS, TIENDA } from './seed-data.ts';
import { SECCION_PREFERENCIAS } from './preparar-storefront-e2e.ts';

/**
 * Borra lo que una corrida de e2e dejó en el proyecto de desarrollo.
 *
 * El seed restituye el catálogo pero no toca los pedidos, así que sin esto el
 * Admin se llena de compras de prueba entre corridas. En CI no hace falta —la
 * base es efímera (ADR-058)— pero corre igual: allá no hay `.env` y sin
 * credenciales esto se saltea solo.
 *
 * El marcador es el dominio `@e2e.test` de los correos que usan las pruebas.
 * Borrar por fecha o por tienda alcanzaría también a pedidos reales de la demo.
 *
 * `order_counters` no se toca a propósito: los números consumidos quedan
 * consumidos. Reciclarlos daría dos pedidos distintos con el mismo número, que
 * es exactamente lo que la numeración existe para evitar.
 *
 * Es un script y no una función del teardown de Playwright por una razón
 * concreta: el cliente de Supabase deja sockets con keep-alive abiertos, y al
 * salir Playwright inmediatamente después, Node en Windows se caía con una
 * aserción de libuv. La corrida terminaba en verde y el comando devolvía un
 * código de error igual, de forma intermitente. En un proceso aparte los
 * handles se mueren con él.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (url && secretKey) {
  try {
    const db = clienteDeServidor({ url, secretKey });

    // Las líneas y los eventos se van en cascada con el pedido; los clientes no,
    // porque no cuelgan de él.
    const pedidos = await db
      .from('orders')
      .delete()
      .like('customer->>email', '%@e2e.test')
      .select('id');
    await db.from('customers').delete().like('email', '%@e2e.test');

    // Las promociones que crea el smoke del Admin. Las de la tienda de prueba se
    // van en cascada con ella, pero el test corre sobre la tienda activa, que
    // suele ser la de la demo: sin esto, cada corrida le deja una campaña. El
    // marcador es el título, igual que el correo para los pedidos.
    const promos = await db
      .from('promotions')
      .delete()
      .like('title', 'Rebaja del smoke %')
      .select('id');

    // Ídem las colecciones: el smoke corre sobre la tienda activa, que suele ser
    // la de la demo, así que no se van en cascada con la tienda de prueba.
    /*
     * Dos prefijos: el del caso de novedades y el del orden automático. El
     * segundo faltaba, y **eso rompió el smoke**: la lista de colecciones pagina
     * de a veinte, así que una colección por corrida terminó empujando la recién
     * creada fuera de la primera página. Un test que se ensucia a sí mismo falla
     * por acumulación y no por un cambio de código.
     */
    const colecciones = await db
      .from('collections')
      .delete()
      .or('title.like.Novedades del smoke %,title.like.Tendencia del smoke %')
      .select('id');

    /*
     * Los eventos que la corrida generó navegando la demo.
     *
     * No se van con nada: la tienda de la demo no se borra, y los eventos cuelgan
     * de ella. Sin esto, cada corrida de CI deja un puñado de sesiones falsas en
     * el proyecto de desarrollo y la conversión del panel de la demo baja sola,
     * sin que nadie entienda por qué.
     *
     * Se borra por ventana de tiempo y no por marcador: un `page_view` no tiene
     * dónde llevar uno, y todo lo de la última hora en desarrollo es de la
     * corrida.
     */
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const eventos = await db.from('store_events').delete().gte('occurred_at', desde).select('id');

    console.log(`  pedidos de prueba borrados: ${pedidos.data?.length ?? 0}`);
    console.log(`  eventos de la corrida borrados: ${eventos.data?.length ?? 0}`);
    console.log(`  promociones de prueba borradas: ${promos.data?.length ?? 0}`);
    console.log(`  colecciones de prueba borradas: ${colecciones.data?.length ?? 0}`);

    // La segunda tienda y el usuario que el smoke del Admin necesita para que el
    // selector sea un menú. La membresía se va en cascada con el usuario.
    await db.from('stores').delete().eq('id', TIENDA_E2E.id);

    const { data: usuarios } = await db.auth.admin.listUsers();
    const admin = usuarios?.users.find((u) => u.email === ADMIN_E2E.email);
    if (admin) await db.auth.admin.deleteUser(admin.id);

    console.log(`  tienda y usuario del smoke del Admin: borrados`);

    /*
     * Y lo que el smoke le cambió a la tienda de la demo, que no es suya.
     *
     * `preparar-storefront-e2e.ts` la renombra a «Pick Demo (smoke)» y le pisa
     * `settings.shipping` para ejercitar el costo de envío. Nada lo revertía, y
     * el storefront de la demo estuvo en producción titulado «Pick Demo
     * (smoke)»: material de venta con el nombre de una corrida de test, y
     * INFRAESTRUCTURA §1 prometiendo que eso no podía pasar.
     *
     * Se restituye al estado que siembra el seed, que es la única fuente de la
     * demo: su nombre, y el `shipping` que el seed declare — hoy ninguno, así
     * que la clave se va. El resto de los ajustes no se toca.
     */
    const semilla = (CONFIGURACION.settings as Record<string, unknown>).shipping;
    const { data: fila } = await db
      .from('store_settings')
      .select('settings')
      .eq('store_id', TIENDA.id)
      .maybeSingle();
    const ajustes = { ...((fila?.settings as Record<string, unknown>) ?? {}) };
    if (semilla === undefined) delete ajustes.shipping;
    else ajustes.shipping = semilla;

    await db.from('stores').update({ name: TIENDA.name }).eq('id', TIENDA.id);
    await db
      .from('store_settings')
      .upsert({ store_id: TIENDA.id, tenant_id: TIENDA.tenant_id, settings: ajustes });

    /*
     * La sección y el orden automático que sembró `preparar-storefront-e2e`. La
     * portada de la demo vuelve a ser la del seed: una corrida de test no puede
     * dejarle una sección puesta a lo que se le muestra a alguien.
     */
    await db.from('home_sections').delete().eq('id', SECCION_PREFERENCIAS.id);
    await db.from('collections').update({ sort: null }).eq('id', IDS.coleccionDinamica);

    console.log(`  tienda de la demo restituida: «${TIENDA.name}», sin el envío del smoke`);
  } catch (error) {
    // Una limpieza fallida no puede tumbar una corrida que ya pasó: lo peor que
    // deja es basura en un entorno de desarrollo.
    console.warn(`  no se pudieron borrar los pedidos de prueba: ${(error as Error).message}`);
  }
}
