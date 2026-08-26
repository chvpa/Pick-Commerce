/**
 * Resolución de tenant.
 *
 * Cada storefront tiene su dominio y es lo que identifica a la tienda en
 * runtime. La normalización vive acá, separada de la consulta, porque es donde
 * están los errores: un dominio mal normalizado no falla, **resuelve al tenant
 * equivocado**, que es la peor forma de fallar en un sistema multitenant.
 */

/**
 * Lleva un host a la forma con la que se guarda en `stores.domain`.
 *
 * Quita el puerto, baja a minúsculas y descarta el `www.`, que es el mismo
 * sitio. No quita otros subdominios: `tienda.cliente.com` y `cliente.com` son
 * tiendas distintas hasta que alguien diga lo contrario.
 */
export function normalizarDominio(host: string): string {
  const limpio = host.trim().toLowerCase().split(':')[0] ?? '';
  return limpio.startsWith('www.') ? limpio.slice(4) : limpio;
}

export interface ResolucionTenant {
  readonly tenantId: string;
  readonly storeId: string;
  readonly currency: string;
  readonly locale: string;
}

/** Contrato del repositorio. El adapter lo implementa contra Supabase. */
export interface RepositorioTiendas {
  porDominio(dominio: string): Promise<ResolucionTenant | null>;
}

/**
 * Resuelve la tienda de una petición.
 *
 * Devuelve `null` en vez de lanzar: un dominio desconocido es un 404 del
 * storefront, no un error del servidor.
 */
export async function resolverTenant(
  repo: RepositorioTiendas,
  host: string,
): Promise<ResolucionTenant | null> {
  const dominio = normalizarDominio(host);
  if (dominio === '') return null;
  return repo.porDominio(dominio);
}
