import type {
  PaginaPedidos,
  PedidoConTimeline,
  RepositorioAdminPedidos,
} from '@pick/commerce-core';
import type { Order, OrderEvent } from '@pick/commerce-types';
import type { PickSupabaseClient } from './client.ts';

/**
 * Pedidos vistos desde el Admin.
 *
 * Se llama con el JWT del usuario, así que **RLS decide**: leer exige membresía
 * y cambiar el estado exige `order.write`. Este archivo no verifica permisos, y
 * no debe (ADR-052).
 */

export function repositorioAdminPedidos(db: PickSupabaseClient): RepositorioAdminPedidos {
  return {
    async listar(storeId, consulta): Promise<PaginaPedidos> {
      const { data, error } = await db.rpc('admin_orders', {
        p_store_id: storeId,
        p_query: consulta.query ?? '',
        p_status: consulta.status ?? undefined,
        p_page: consulta.page ?? 1,
        p_per_page: consulta.perPage ?? 20,
      });

      if (error) throw new Error(`No se pudieron consultar los pedidos: ${error.message}`);
      return data as unknown as PaginaPedidos;
    },

    async porId(storeId, id): Promise<PedidoConTimeline | null> {
      // El pedido sale de `order_json` para que el Admin y el storefront vean
      // exactamente la misma forma; la timeline es una consulta aparte porque
      // sólo la mira esta pantalla.
      const [pedido, eventos] = await Promise.all([
        db.rpc('order_json', { p_order_id: id }),
        db
          .from('order_events')
          .select('id, type, data, created_at')
          .eq('order_id', id)
          .order('created_at', { ascending: true }),
      ]);

      if (pedido.error) throw new Error(`No se pudo consultar el pedido: ${pedido.error.message}`);
      if (eventos.error)
        throw new Error(`No se pudo consultar la timeline: ${eventos.error.message}`);

      const order = pedido.data as unknown as Order | null;
      // `order_json` no filtra por tienda —no la recibe—, así que el scope lo
      // impone RLS: un pedido de otro comercio vuelve nulo. La comprobación
      // explícita cubre el caso de un id de otra tienda del mismo comercio.
      if (!order || !order.id) return null;

      const { data: dueño } = await db
        .from('orders')
        .select('id')
        .eq('id', id)
        .eq('store_id', storeId)
        .maybeSingle();
      if (!dueño) return null;

      return {
        order,
        events: (eventos.data ?? []).map((e): OrderEvent => ({
          id: e.id,
          type: e.type,
          data: (e.data ?? {}) as Record<string, unknown>,
          createdAt: e.created_at,
        })),
      };
    },

    async cambiarEstado(storeId, id, estado, nota): Promise<Order> {
      const { data, error } = await db.rpc('admin_set_order_status', {
        p_store_id: storeId,
        p_order_id: id,
        p_status: estado,
        p_note: nota ?? undefined,
      });

      if (error) throw new Error(`No se pudo cambiar el estado: ${error.message}`);
      return data as unknown as Order;
    },

    async cambiarPago(storeId, id, pago, nota): Promise<Order> {
      const { data, error } = await db.rpc('admin_set_payment_status', {
        p_store_id: storeId,
        p_order_id: id,
        p_status: pago,
        p_note: nota ?? undefined,
      });

      if (error) throw new Error(`No se pudo cambiar el estado de pago: ${error.message}`);
      return data as unknown as Order;
    },
  };
}
