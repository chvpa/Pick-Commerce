import type {
  PaginaDeRendimiento,
  RepositorioDashboard,
  ResumenDelPeriodo,
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
