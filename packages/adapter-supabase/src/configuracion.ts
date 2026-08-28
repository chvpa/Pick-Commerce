import type { EntradaDeAuditoria, RepositorioConfiguracion } from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * `store_settings.settings`.
 *
 * Leer va directo a la tabla —RLS ya acota por membresía— y escribir va por
 * `admin_save_settings`, que hace tres cosas que el cliente no puede: mergear
 * sólo la sección editada, insertar en `audit_log` (que la app no tiene permiso
 * de escribir) y fijar el actor con `auth.uid()` en vez de creerle al payload.
 */
export function repositorioConfiguracion(db: PickSupabaseClient): RepositorioConfiguracion {
  return {
    async leer(storeId): Promise<Readonly<Record<string, unknown>>> {
      const { data, error } = await db
        .from('store_settings')
        .select('settings')
        .eq('store_id', storeId)
        .maybeSingle();

      if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`);
      // Una tienda sin fila todavía no configuró nada, que no es un error: los
      // lectores del core caen a sus defaults seguros.
      return (data?.settings ?? {}) as Readonly<Record<string, unknown>>;
    },

    async guardar(
      storeId,
      parcial,
      auditoria?: EntradaDeAuditoria,
    ): Promise<Readonly<Record<string, unknown>>> {
      const { data, error } = await db.rpc('admin_save_settings', {
        p_store_id: storeId,
        p_settings: parcial as never,
        ...(auditoria ? { p_audit: auditoria as never } : {}),
      });

      if (error) throw new Error(`No se pudo guardar la configuración: ${error.message}`);
      return data as unknown as Readonly<Record<string, unknown>>;
    },
  };
}
