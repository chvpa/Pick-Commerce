import { STOREFRONT_DOMAIN, SUPABASE_SECRET_KEY, SUPABASE_URL } from 'astro:env/server';
import { clienteDeServidor, repositorioCatalogo, repositorioTiendas } from '@pick/adapter-supabase';
import { resolverTenant, type CategoriaCatalogo, type ResolucionTenant } from '@pick/commerce-core';

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
const db = clienteDeServidor({ url: SUPABASE_URL, secretKey: SUPABASE_SECRET_KEY });

export const catalogo = repositorioCatalogo(db);

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
 */
export const tiendaActual = memoizar(async (): Promise<ResolucionTenant> => {
  const tienda = await resolverTenant(repositorioTiendas(db), STOREFRONT_DOMAIN);
  if (!tienda) {
    // Falla ruidosa: sin tienda no hay nada que mostrar, y devolver un catálogo
    // vacío haría parecer que el comercio no tiene productos.
    throw new Error(
      `No hay ninguna tienda con el dominio ${STOREFRONT_DOMAIN}. ` +
        'Revisar STOREFRONT_DOMAIN y `stores.domain`.',
    );
  }
  return tienda;
});

/** Categorías de la tienda, en el orden que definió el Admin. */
export const categorias = memoizar(
  async (): Promise<readonly CategoriaCatalogo[]> => catalogo.categorias((await tiendaActual()).storeId),
);

/**
 * Atributos que la tienda declaró filtrables (PROJECT.md §35).
 *
 * Es lo que decide qué facetas ve la PLP: antes la lista estaba escrita en la
 * página, así que un atributo nuevo aparecía en la base y no en el sitio.
 */
export const facetasFiltrables = memoizar(async () =>
  catalogo.facetasFiltrables((await tiendaActual()).storeId),
);
