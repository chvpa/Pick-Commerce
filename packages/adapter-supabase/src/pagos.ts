import type { RepositorioPagos } from '@pick/commerce-core';
import type { Order } from '@pick/commerce-types';
import type { PickSupabaseClient } from './client.ts';

/**
 * Lo que informó el gateway.
 *
 * `record_payment` se concede **sólo** a `service_role`, así que esto se llama
 * desde el webhook del storefront con la secret key, nunca desde el browser. La
 * gemela del Admin —`admin_set_payment_status`— es la de la persona que mira un
 * comprobante; la diferencia entre las dos es quién puede invocarlas y que ésta
 * guarda la referencia del proveedor.
 *
 * La idempotencia vive del otro lado: reintentar con el mismo estado devuelve el
 * pedido sin escribir nada.
 */
export function repositorioPagos(db: PickSupabaseClient): RepositorioPagos {
  return {
    async registrar(storeId, orderId, estado, referencia, nota): Promise<Order> {
      const { data, error } = await db.rpc('record_payment', {
        p_store_id: storeId,
        p_order_id: orderId,
        p_status: estado,
        p_reference: referencia,
        p_note: nota ?? undefined,
      });

      if (error) throw new Error(`No se pudo registrar el pago: ${error.message}`);
      return data as unknown as Order;
    },
  };
}
