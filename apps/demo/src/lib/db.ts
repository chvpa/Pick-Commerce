import { getSecret } from 'astro:env/server';
import {
  clienteDeServidor,
  repositorioCatalogo,
  repositorioCheckout,
  repositorioTiendas,
  type PickSupabaseClient,
} from '@pick/adapter-supabase';
import {
  configuracionDePagos,
  resolverTenant,
  type CategoriaCatalogo,
  type ConfiguracionDePagos,
  type RepositorioCatalogo,
  type RepositorioCheckout,
  type ResolucionTenant,
} from '@pick/commerce-core';

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
    return getSecret('STOREFRONT_DOMAIN') || 'pick-demo.pages.dev';
  } catch {
    return 'pick-demo.pages.dev';
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
export function checkout(): RepositorioCheckout {
  repoCheckout ??= repositorioCheckout(db());
  return repoCheckout;
}

/**
 * Formas de pago habilitadas (PROJECT.md §34).
 *
 * Se memoiza como el resto de la configuración: cambia cuando el comercio la
 * edita, no en cada visita.
 */
export const pagos = memoizar(async (): Promise<ConfiguracionDePagos> => {
  const { data } = await db()
    .from('store_settings')
    .select('settings')
    .eq('store_id', (await tiendaActual()).storeId)
    .maybeSingle();
  return configuracionDePagos(data?.settings);
});
