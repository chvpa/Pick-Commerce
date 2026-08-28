import type { RepositorioTiendas, ResolucionTenant, TiendaResumen } from '@pick/commerce-core';
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
