import type {
  AvisoDelPedido,
  ConteoDeBandejas,
  PaginaPedidos,
  PedidoConTimeline,
  ProductoDeLaLinea,
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
        // 'todos' no filtra: se manda sólo lo que acota.
        ...(consulta.bandeja && consulta.bandeja !== 'todos' ? { p_bucket: consulta.bandeja } : {}),
        ...(consulta.pago ? { p_payment: consulta.pago } : {}),
        ...(consulta.desde ? { p_from: consulta.desde } : {}),
        ...(consulta.hasta ? { p_to: consulta.hasta } : {}),
        ...(consulta.antiguosPrimero ? { p_oldest_first: true } : {}),
      });

      if (error) throw new Error(`No se pudieron consultar los pedidos: ${error.message}`);
      return data as unknown as PaginaPedidos;
    },

    async porId(storeId, id): Promise<PedidoConTimeline | null> {
      // El pedido sale de `order_json` para que el Admin y el storefront vean
      // exactamente la misma forma; la timeline es una consulta aparte porque
      // sólo la mira esta pantalla.
      const [pedido, eventos, avisos] = await Promise.all([
        db.rpc('order_json', { p_order_id: id }),
        db
          .from('order_events')
          .select('id, type, data, created_at')
          .eq('order_id', id)
          .order('created_at', { ascending: true }),
        // Por RPC y no por consulta: la cola no tiene políticas —guarda la
        // dirección del comprador— y la función devuelve sólo metadatos.
        db.rpc('admin_order_notifications', { p_store_id: storeId, p_order_id: id }),
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
        .select('id, customer_id')
        .eq('id', id)
        .eq('store_id', storeId)
        .maybeSingle();
      if (!dueño) return null;

      /*
       * La foto y la página de cada línea, del catálogo de hoy: la línea guarda
       * su copia del título y del precio, pero no una foto. Si falla o la
       * variante ya no está, la línea se dibuja sin foto, que no es motivo para
       * no poder abrir el pedido.
       */
      const variantes = order.items.flatMap((i) => (i.variantId ? [i.variantId] : []));
      const { data: delCatalogo } =
        variantes.length > 0
          ? await db
              .from('product_variants')
              .select('id, products(handle, product_media(url, position))')
              .in('id', variantes)
          : { data: [] };
      const productos: Record<string, ProductoDeLaLinea> = {};
      for (const v of delCatalogo ?? []) {
        if (!v.products) continue;
        const [primera] = [...v.products.product_media].sort((a, b) => a.position - b.position);
        productos[v.id] = {
          handle: v.products.handle,
          ...(primera ? { imagen: primera.url } : {}),
        };
      }

      return {
        order,
        events: (eventos.data ?? []).map((e): OrderEvent => ({
          id: e.id,
          type: e.type,
          data: (e.data ?? {}) as Record<string, unknown>,
          createdAt: e.created_at,
        })),
        // Un fallo acá no puede tapar el pedido: que no se sepa si el correo
        // salió es peor que nada, pero mucho menos que no poder abrir la venta.
        avisos: (avisos.error ? [] : (avisos.data ?? [])) as unknown as AvisoDelPedido[],
        ...(dueño.customer_id ? { customerId: dueño.customer_id } : {}),
        productos,
      };
    },

    async agregarNota(storeId, id, nota): Promise<void> {
      /*
       * Directo a la tabla y no por una función: la timeline se lee y se agrega
       * por RLS —escribir pide `order.write`— y nunca se edita ni se borra. El
       * tenant sale del pedido, acotado a la tienda.
       */
      const { data: pedido, error: noEsta } = await db
        .from('orders')
        .select('tenant_id')
        .eq('id', id)
        .eq('store_id', storeId)
        .single();
      if (noEsta) throw new Error('El pedido no existe en esta tienda');

      const { error } = await db.from('order_events').insert({
        tenant_id: pedido.tenant_id,
        order_id: id,
        type: 'note',
        data: { note: nota },
      });
      if (error) throw new Error(`No se pudo guardar la nota: ${error.message}`);
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

    async conteos(storeId): Promise<ConteoDeBandejas> {
      const { data, error } = await db.rpc('admin_order_counts', { p_store_id: storeId });
      if (error) throw new Error(`No se pudieron contar los pedidos: ${error.message}`);
      return data as unknown as ConteoDeBandejas;
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
