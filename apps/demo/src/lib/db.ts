import { getSecret } from 'astro:env/server';
import {
  clienteDeServidor,
  repositorioCatalogo,
  repositorioCheckout,
  repositorioNotificaciones,
  repositorioPagos,
  repositorioTiendas,
  type PickSupabaseClient,
} from '@pick/adapter-supabase';
import {
  anuncioDeEnvio,
  configuracionDeEnvio,
  configuracionDePagos,
  cuentasHabilitadas,
  esTiendaDemo,
  resolverTenant,
  type CategoriaCatalogo,
  type ConfiguracionDeEnvio,
  type ConfiguracionDePagos,
  type RepositorioCatalogo,
  type RepositorioCheckout,
  type RepositorioNotificaciones,
  type RepositorioPagos,
  type ResolucionTenant,
  type SeoContexto,
} from '@pick/commerce-core';
import type { Product } from '@pick/commerce-types';
import { SITE_URL } from './store-config.ts';

/**
 * Acceso a datos del storefront.
 *
 * Usa la secret key, que **saltea RLS**: en este camino no hay un usuario
 * detrás, así que RLS no protege nada. Lo que acota los datos es que todas las
 * consultas pasan por `catalog_search`, que filtra por tienda y por estado. Ver
 * ADR-052.
 *
 * Sólo lo importan las rutas on-demand. Una página prerenderizada que lo
 * importara metería la base en el build, que es justo lo que ADR-057 evita.
 */

let cliente: PickSupabaseClient | undefined;

/**
 * El cliente se crea la primera vez que se usa, y las credenciales se piden con
 * `getSecret` en ese momento.
 *
 * No es una optimización. Importar `SUPABASE_URL` de `astro:env/server` evalúa
 * la variable **al cargar el módulo**, no al usarla: con una credencial ausente
 * la excepción ocurría antes de que corriera nada, y el resultado era un 500 con
 * el cuerpo vacío que no decía qué faltaba. Pidiéndolas dentro de la función, el
 * middleware llega antes y muestra una pantalla que lo explica.
 *
 * `STOREFRONT_DOMAIN` va por el mismo camino desde que se descubrió que, siendo
 * `public`, quedaba incrustada en el bundle al construir: cargarla en el Worker
 * no tenía ningún efecto.
 */
/**
 * Dominio de la tienda que sirve este deploy.
 *
 * El default es el de la demo, para que `astro dev` y el CI funcionen sin
 * configurar nada. Tiene que coincidir con `stores.domain`, no con el dominio
 * desde el que se sirve el sitio: son cosas distintas y hoy son distintas.
 */
function dominioDeLaTienda(): string {
  try {
    return getSecret('STOREFRONT_DOMAIN') || 'pick-commerce.chvpa-contacto.workers.dev';
  } catch {
    return 'pick-commerce.chvpa-contacto.workers.dev';
  }
}

function requerida(nombre: 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'): string {
  const valor = getSecret(nombre);
  if (!valor) {
    // No debería llegar acá: el middleware corta antes con una pantalla que
    // nombra lo que falta. Si llega, que el mensaje sirva igual.
    throw new Error(`Falta ${nombre} en el entorno del Worker.`);
  }
  return valor;
}

function db(): PickSupabaseClient {
  cliente ??= clienteDeServidor({
    url: requerida('SUPABASE_URL'),
    secretKey: requerida('SUPABASE_SECRET_KEY'),
  });
  return cliente;
}

/**
 * El cliente crudo, para lo que no tiene repositorio propio.
 *
 * Hoy sólo lo usa analytics, que escribe en una tabla en vez de llamar a una
 * función. Sigue siendo la secret key: mismo alcance y mismas advertencias que el
 * resto de este archivo.
 */
export function clienteDelStorefront(): PickSupabaseClient {
  return db();
}

let repo: RepositorioCatalogo | undefined;

export function catalogo(): RepositorioCatalogo {
  repo ??= repositorioCatalogo(db());
  return repo;
}

/**
 * Cachea el resultado por un rato dentro del mismo isolate.
 *
 * La tienda, sus categorías y sus facetas cambian con cada edición del Admin,
 * no con cada visita: consultarlas en cada request son tres round-trips por
 * página para datos que casi nunca cambian. El TTL es corto porque la latencia
 * de propagación de un cambio importa más que ahorrar una consulta.
 */
function memoizar<T>(cargar: () => Promise<T>, ttl = 60_000): () => Promise<T> {
  let cache: { valor: T; hasta: number } | null = null;
  return async () => {
    if (cache && cache.hasta > Date.now()) return cache.valor;
    const valor = await cargar();
    cache = { valor, hasta: Date.now() + ttl };
    return valor;
  };
}

/**
 * La tienda que sirve este deploy.
 *
 * Sale de la configuración y no del `Host` de la petición: un storefront sirve
 * a una tienda. Resolver por host es lo que hará el router multi-tenant cuando
 * exista, y por eso la consulta ya es por dominio.
 *
 * **No es la URL pública del sitio.** Es la llave con la que se busca la tienda
 * en `stores.domain`: las dos tienen que coincidir entre sí, no con el dominio
 * desde el que se sirve.
 */
export const tiendaActual = memoizar(async (): Promise<ResolucionTenant> => {
  const dominio = dominioDeLaTienda();
  const tienda = await resolverTenant(repositorioTiendas(db()), dominio);
  if (!tienda) {
    // Falla ruidosa: sin tienda no hay nada que mostrar, y devolver un catálogo
    // vacío haría parecer que el comercio no tiene productos.
    throw new Error(
      `No hay ninguna tienda con el dominio ${dominio}. ` +
        'Revisar STOREFRONT_DOMAIN y `stores.domain`.',
    );
  }
  return tienda;
});

/** Categorías de la tienda, en el orden que definió el Admin. */
export const categorias = memoizar(async (): Promise<readonly CategoriaCatalogo[]> =>
  catalogo().categorias((await tiendaActual()).storeId),
);

/**
 * Atributos que la tienda declaró filtrables (PROJECT.md §35).
 *
 * Es lo que decide qué facetas ve la PLP: antes la lista estaba escrita en la
 * página, así que un atributo nuevo aparecía en la base y no en el sitio.
 */
export const facetasFiltrables = memoizar(async () =>
  catalogo().facetasFiltrables((await tiendaActual()).storeId),
);

let repoCheckout: RepositorioCheckout | undefined;

/** Carrito y creación de pedidos. Ver ADR-065. */
let repoPagos: RepositorioPagos | undefined;

/** Lo que informó el gateway. Sólo lo usa el webhook. */
export function pagosDelGateway(): RepositorioPagos {
  repoPagos ??= repositorioPagos(db());
  return repoPagos;
}

let repoNotificaciones: RepositorioNotificaciones | undefined;

/** La cola de correos. */
export function notificaciones(): RepositorioNotificaciones {
  repoNotificaciones ??= repositorioNotificaciones(db());
  return repoNotificaciones;
}

export function checkout(): RepositorioCheckout {
  repoCheckout ??= repositorioCheckout(db());
  return repoCheckout;
}

/**
 * Formas de pago habilitadas (PROJECT.md §34).
 *
 * Sale de `ajustes`, que se memoiza: la configuración cambia cuando el comercio
 * la edita, no en cada visita, y los tres lectores comparten una sola consulta
 * en vez de hacer una cada uno.
 */
const ajustes = memoizar(async (): Promise<unknown> => {
  const { data } = await db()
    .from('store_settings')
    .select('settings')
    .eq('store_id', (await tiendaActual()).storeId)
    .maybeSingle();
  return data?.settings ?? {};
});

export async function pagos(): Promise<ConfiguracionDePagos> {
  return configuracionDePagos(await ajustes());
}

/**
 * El costo de envío de la tienda.
 *
 * Lo lee el checkout para **mostrar** lo que se va a cobrar; quien lo cobra es
 * `create_order`, con la misma cuenta. Que los dos salgan de la misma
 * configuración y de la misma función del core es lo que impide que el resumen
 * diga un número y la caja otro.
 */
export async function envio(): Promise<ConfiguracionDeEnvio> {
  return configuracionDeEnvio(await ajustes());
}

/** Si esta tienda es una demostración. Lo usa el aviso del checkout. */
export async function tiendaEsDemo(): Promise<boolean> {
  return esTiendaDemo(await ajustes());
}

/**
 * Si esta tienda tiene cuentas de comprador.
 *
 * Apagado por defecto, y lo que cuelga de eso es todo: sin el interruptor no hay
 * entrada en el encabezado y `/cuenta` responde 404. Una tienda que no las
 * habilitó no puede tener una página que le pida el correo a alguien para
 * mandarle un código que su dominio quizá no entregue (ADR-123).
 */
export async function hayCuentas(): Promise<boolean> {
  return cuentasHabilitadas(await ajustes());
}

/**
 * Títulos que se parecen a lo que se está escribiendo, para el buscador.
 *
 * Un fallo devuelve la lista vacía: sin sugerencias el formulario sigue buscando
 * igual, así que no hay motivo para mostrarle un error a nadie.
 */
export async function sugerenciasDeBusqueda(q: string): Promise<readonly string[]> {
  try {
    const { storeId } = await tiendaActual();
    const { data, error } = await db().rpc('search_suggest', { p_store_id: storeId, p_q: q });
    if (error) throw new Error(error.message);
    return data as unknown as readonly string[];
  } catch (error) {
    console.error('[sugerencias] no se pudieron leer', error);
    return [];
  }
}

/**
 * Lo que se mira junto con esto, para la tira del PDP y la del carrito.
 *
 * El documento del producto sale del mismo lugar que el del catálogo
 * (`app.catalog_items`), así que la tarjeta es la misma: mismo precio con
 * promoción, mismo tachado, mismo stock, y sin lo que el catálogo esconde.
 *
 * Un fallo devuelve la lista vacía y la tira no se dibuja. Una recomendación es
 * ayuda, no contenido: la página de producto tiene que seguir vendiendo.
 */
export async function recomendados(
  anclas: readonly string[],
  limite = 8,
): Promise<readonly Product[]> {
  if (anclas.length === 0) return [];

  try {
    const { storeId } = await tiendaActual();
    const { data, error } = await db().rpc('recommended_products', {
      p_store_id: storeId,
      p_anchor_ids: [...anclas],
      p_limit: limite,
    });

    if (error) throw new Error(error.message);
    return data as unknown as readonly Product[];
  } catch (error) {
    console.error('[recomendados] no se pudieron leer', error);
    return [];
  }
}

/**
 * Lo mismo que `recomendados`, pero a partir de variantes.
 *
 * El carrito guarda `variantId` —es lo que se agrega y lo que se revalida—, así
 * que el mapeo a producto se hace acá, en una consulta, y no en el navegador:
 * pedirle al cliente que sepa a qué producto pertenece cada variante sería
 * darle una respuesta que ya tenemos.
 *
 * Un id inventado no rompe nada: no aparece en `product_variants` y el arreglo
 * de anclas queda más corto.
 */
export async function recomendadosParaVariantes(
  variantIds: readonly string[],
  limite = 3,
): Promise<readonly Product[]> {
  if (variantIds.length === 0) return [];

  try {
    const { storeId } = await tiendaActual();
    const { data, error } = await db()
      .from('product_variants')
      .select('product_id, products!inner(store_id)')
      .in('id', [...variantIds])
      .eq('products.store_id', storeId);

    if (error) throw new Error(error.message);

    const anclas = [...new Set((data ?? []).map((v) => v.product_id))];
    return await recomendados(anclas, limite);
  } catch (error) {
    console.error('[recomendados] no se pudieron mapear las variantes', error);
    return [];
  }
}

/**
 * Quién dice el sitio que es.
 *
 * El nombre sale de la base y no de una constante. Estuvo fijo en «Pick Demo»
 * desde la Fase 1, con un comentario que decía que en la Fase 3 pasaría a
 * leerse: el storefront de cualquier comercio se anunciaba como la demo en el
 * encabezado, en el pie y en el `<title>` que indexa un buscador. Es lo que
 * bloqueaba el piloto.
 *
 * `siteUrl` **sí** sigue siendo del despliegue. No es el dominio desde el que se
 * sirve sino el que se declara como público, y de él salen el canonical, el
 * `og:url` y el sitemap: fijarlo por despliegue es lo que impide que dos hosts
 * que sirven lo mismo produzcan dos canonical distintos. Ver INFRAESTRUCTURA §5.
 */
export async function contextoSeo(): Promise<SeoContexto> {
  return { siteUrl: SITE_URL, storeName: (await tiendaActual()).name };
}

/**
 * La barra de anuncio, derivada del envío.
 *
 * Antes era un texto fijo en el código que prometía envío gratis desde 500.000
 * en toda tienda que se sirviera, sin que nada lo respaldara. Ahora sale del
 * mismo número que cobra `create_order`, así que no puede prometer algo que la
 * caja no vaya a cumplir — y desaparece sola en una tienda que no tiene envío
 * gratis. Un anuncio libre es contenido, y para eso está el CMS.
 */
export async function anuncio(): Promise<string | null> {
  const tienda = await tiendaActual();
  return anuncioDeEnvio(await envio(), tienda.currency as 'PYG', tienda.locale);
}

/**
 * Lo que este navegador vino mirando.
 *
 * **Cero tracking nuevo**: el evento `product_view` ya se registra del lado del
 * servidor desde la Fase 10, sin una línea de JavaScript. Esto sólo lo lee.
 *
 * Sin `deviceId` —alguien que apagó la personalización, o un bot, o una
 * precarga— devuelve vacío sin consultar nada. Y un fallo no puede tumbar la
 * portada: se cae a vacío y la tira no se dibuja.
 */
export async function vistosRecientemente(
  deviceId: string | undefined,
  limite = 8,
): Promise<readonly ProductoVisto[]> {
  if (!deviceId) return [];

  try {
    const { storeId } = await tiendaActual();
    const { data, error } = await db().rpc('recently_viewed', {
      p_store_id: storeId,
      p_device_id: deviceId,
      p_limit: limite,
    });

    if (error) throw new Error(error.message);
    return data as unknown as readonly ProductoVisto[];
  } catch (error) {
    console.error('[vistos] no se pudieron leer', error);
    return [];
  }
}

export interface ProductoVisto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly brand: string | null;
  readonly image: { url: string; alt: string | null; width: number; height: number } | null;
  readonly viewedAt: string;
}
