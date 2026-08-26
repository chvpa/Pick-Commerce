import type { RepositorioTiendas, ResolucionTenant } from '@pick/commerce-core';
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
        .select('id, tenant_id, currency, locale')
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
      };
    },
  };
}
