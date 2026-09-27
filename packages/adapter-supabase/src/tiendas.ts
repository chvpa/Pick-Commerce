import type {
  RepositorioTiendas,
  ResolucionTenant,
  Sucursal,
  TiendaResumen,
} from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * Repositorio de tiendas contra Supabase.
 *
 * Sólo la consulta: la normalización del dominio y la decisión de qué hacer con
 * un dominio desconocido viven en el Core, donde se testean sin base de datos.
 */
export function repositorioTiendas(db: PickSupabaseClient): RepositorioTiendas {
  return {
    async porDominio(dominio: string): Promise<ResolucionTenant | null> {
      const { data, error } = await db
        .from('stores')
        .select('id, tenant_id, name, currency, locale')
        .eq('domain', dominio)
        // `maybeSingle` y no `single`: no encontrar la tienda es un caso normal
        // —un dominio que todavía no se configuró—, no una excepción.
        .maybeSingle();

      if (error) throw new Error(`No se pudo resolver el dominio ${dominio}: ${error.message}`);
      if (!data) return null;

      return {
        tenantId: data.tenant_id,
        storeId: data.id,
        currency: data.currency,
        locale: data.locale,
        name: data.name,
      };
    },

    /*
     * Las tres de sucursales. El alta y el renombre van directo a la tabla —RLS
     * ya pide `store.manage`—; el listado va por función porque PostgREST no
     * agrupa y lo que hace falta es el stock por sucursal, no las filas.
     *
     * Borrar una sucursal no está: `inventory_levels.location_id` es
     * `on delete cascade`, así que el borrado se llevaría su stock sin decirlo, y
     * la pregunta de a dónde va ese stock no se contesta con una pantalla.
     */
    async sucursales(storeId): Promise<readonly Sucursal[]> {
      const { data, error } = await db.rpc('admin_locations', { p_store_id: storeId });
      if (error) throw new Error(`No se pudieron leer las sucursales: ${error.message}`);
      return data as unknown as readonly Sucursal[];
    },

    async crearSucursal(tenantId, storeId, nombre): Promise<string> {
      const { data, error } = await db
        .from('locations')
        .insert({ tenant_id: tenantId, store_id: storeId, name: nombre })
        .select('id')
        .single();

      if (error) throw new Error(`No se pudo crear la sucursal: ${error.message}`);
      return data.id;
    },

    async renombrarSucursal(storeId, id, nombre): Promise<void> {
      const { error } = await db
        .from('locations')
        .update({ name: nombre, updated_at: new Date().toISOString() })
        .eq('store_id', storeId)
        .eq('id', id);

      if (error) throw new Error(`No se pudo renombrar la sucursal: ${error.message}`);
    },

    async mias(): Promise<readonly TiendaResumen[]> {
      // Sin filtro por tenant: RLS devuelve sólo las tiendas de las
      // organizaciones donde el usuario tiene membresía.
      const { data, error } = await db
        .from('stores')
        .select('id, tenant_id, name, slug, currency, locale, domain')
        .order('name');

      if (error) throw new Error(`No se pudieron leer las tiendas: ${error.message}`);
      return (data ?? []).map((s) => ({
        id: s.id,
        tenantId: s.tenant_id,
        name: s.name,
        slug: s.slug,
        currency: s.currency,
        locale: s.locale,
        ...(s.domain ? { domain: s.domain } : {}),
      }));
    },
  };
}
