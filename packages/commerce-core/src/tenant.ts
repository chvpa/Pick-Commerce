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
  /** Lo firma cada correo transaccional: sin él, el aviso no dice de quién es. */
  readonly name: string;
}

/** Tienda tal como la lista el Admin para elegir sobre cuál trabajar. */
export interface TiendaResumen {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly currency: string;
  readonly locale: string;
  /**
   * El dominio del storefront de esta tienda. Opcional porque una tienda recién
   * provisionada puede no tenerlo todavía; el Admin lo necesita para avisarle al
   * storefront que hay correos por mandar.
   */
  readonly domain?: string;
}

/**
 * Una sucursal, con lo que tiene guardado.
 *
 * `negativos` está separado del total a propósito: en la suma de dos sucursales
 * un -2 y un 5 son 3, y el descuadre —que es lo que el espejo del ERP existe
 * para mostrar (ADR-009)— desaparece.
 */
export interface Sucursal {
  readonly id: string;
  readonly name: string;
  readonly isPickupPoint: boolean;
  readonly unidades: number;
  readonly negativos: number;
}

/** Contrato del repositorio. El adapter lo implementa contra Supabase. */
export interface RepositorioTiendas {
  porDominio(dominio: string): Promise<ResolucionTenant | null>;
  /** Las sucursales de una tienda, en el orden en que se crearon. */
  sucursales(storeId: string): Promise<readonly Sucursal[]>;
  /** Alta de una sucursal. Devuelve su id, que es lo que el stock necesita. */
  crearSucursal(tenantId: string, storeId: string, nombre: string): Promise<string>;
  renombrarSucursal(storeId: string, id: string, nombre: string): Promise<void>;
  /**
   * Las tiendas que el usuario puede administrar.
   *
   * No recibe el tenant: **RLS ya acota** a las organizaciones donde el usuario
   * tiene membresía. Pasarlo daría la impresión de que la seguridad depende de
   * este argumento, cuando quitarlo no cambiaría nada.
   */
  mias(): Promise<readonly TiendaResumen[]>;
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
