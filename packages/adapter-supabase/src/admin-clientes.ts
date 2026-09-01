import type { ClienteDeLista, PaginaClientes, RepositorioAdminClientes } from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * Clientes vistos desde el Admin.
 *
 * Las dos operaciones van a la misma función: la ficha de un cliente son sus
 * agregados de compra, que la lista ya calcula. Un select aparte para el detalle
 * los duplicaría y los haría divergir en cuanto alguien toque uno.
 */
export function repositorioAdminClientes(db: PickSupabaseClient): RepositorioAdminClientes {
  return {
    async listar(storeId, consulta): Promise<PaginaClientes> {
      const { data, error } = await db.rpc('admin_customers', {
        p_store_id: storeId,
        p_query: consulta.query ?? '',
        p_page: consulta.page ?? 1,
        p_per_page: consulta.perPage ?? 20,
        // Sin rango, todos: es el comportamiento que la pantalla tenía y el que
        // espera cualquier otro llamador.
        ...(consulta.desde ? { p_from: consulta.desde } : {}),
        ...(consulta.hasta ? { p_to: consulta.hasta } : {}),
      });

      if (error) throw new Error(`No se pudieron consultar los clientes: ${error.message}`);
      return data as unknown as PaginaClientes;
    },

    async porId(storeId, id): Promise<ClienteDeLista | null> {
      const { data, error } = await db.rpc('admin_customers', {
        p_store_id: storeId,
        p_customer_id: id,
        p_page: 1,
        p_per_page: 1,
      });

      if (error) throw new Error(`No se pudo consultar el cliente: ${error.message}`);
      return (data as unknown as PaginaClientes).items[0] ?? null;
    },
  };
}
