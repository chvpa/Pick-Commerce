import type {
  PaginaDeRendimiento,
  RepositorioDashboard,
  ResumenDelPeriodo,
  SerieDelPeriodo,
  TareasDeLaTienda,
} from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * El resumen del Admin.
 *
 * `admin_dashboard` es `security invoker`, así que para un usuario de otro
 * comercio las políticas no devuelven ninguna fila y el resumen vuelve en cero.
 * Ese caso no es un error y no se trata como tal: una tienda recién creada
 * también da cero.
 */
export function repositorioDashboard(db: PickSupabaseClient): RepositorioDashboard {
  return {
    async resumen(storeId, from, to): Promise<ResumenDelPeriodo> {
      const { data, error } = await db.rpc('admin_dashboard', {
        p_store_id: storeId,
        p_from: from,
        p_to: to,
      });

      if (error) throw new Error(`No se pudo consultar el resumen: ${error.message}`);
      return data as unknown as ResumenDelPeriodo;
    },

    /*
     * `admin_store_tasks` es `security definer` —lee la cola de avisos, que no
     * tiene políticas— y devuelve null si la tienda no es de quien pregunta.
     */
    async tareas(storeId): Promise<TareasDeLaTienda | null> {
      const { data, error } = await db.rpc('admin_store_tasks', { p_store_id: storeId });
      if (error) throw new Error(`No se pudo consultar lo pendiente: ${error.message}`);
      return data as unknown as TareasDeLaTienda | null;
    },

    async serie(storeId, from, to, zonaHoraria, porHora): Promise<SerieDelPeriodo> {
      const { data, error } = await db.rpc('admin_dashboard_series', {
        p_store_id: storeId,
        p_from: from,
        p_to: to,
        p_tz: zonaHoraria,
        p_hourly: porHora,
      });
      if (error) throw new Error(`No se pudo consultar la serie: ${error.message}`);
      return data as unknown as SerieDelPeriodo;
    },

    async rendimiento(storeId, from, to, modo, page, perPage): Promise<PaginaDeRendimiento> {
      const { data, error } = await db.rpc('admin_product_performance', {
        p_store_id: storeId,
        p_from: from,
        p_to: to,
        p_modo: modo,
        p_page: page,
        p_per_page: perPage,
      });

      if (error) {
        throw new Error(`No se pudieron consultar las ventas por producto: ${error.message}`);
      }
      return data as unknown as PaginaDeRendimiento;
    },
  };
}
