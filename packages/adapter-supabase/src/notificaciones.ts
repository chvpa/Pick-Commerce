import type { NotificacionPendiente, RepositorioNotificaciones } from '@pick/commerce-core';
import type { Order } from '@pick/commerce-types';
import type { PickSupabaseClient } from './client.ts';

/**
 * La cola de correos.
 *
 * Las dos funciones son de `service_role`: la cola guarda pedidos enteros, con
 * la dirección del comprador, y no tiene políticas.
 *
 * Enviar y marcar **no** son atómicos, y no hace falta que lo sean. Si el
 * proceso muere entre las dos cosas, el próximo drenaje reclama la misma fila y
 * le manda al proveedor la misma clave de idempotencia —el id de la fila—, así
 * que el comprador no recibe el aviso dos veces. Envolverlo en una transacción
 * distribuida sería resolver con arquitectura algo que el proveedor ya resuelve.
 */
export function repositorioNotificaciones(db: PickSupabaseClient): RepositorioNotificaciones {
  return {
    async reclamar(storeId, limite): Promise<readonly NotificacionPendiente[]> {
      const { data, error } = await db.rpc('claim_notifications', {
        p_store_id: storeId,
        p_limit: limite ?? 20,
      });

      if (error) throw new Error(`No se pudieron reclamar los correos: ${error.message}`);

      return (data ?? []).map((fila): NotificacionPendiente => {
        const payload = (fila.payload ?? {}) as Readonly<Record<string, unknown>>;
        const order = payload.order as Order | undefined;
        return {
          id: fila.id,
          event: fila.event,
          recipient: fila.recipient,
          // El pedido va serializado en la fila desde que se encoló: el correo
          // cuenta lo que pasó cuando pasó, no lo que el pedido sea ahora.
          //
          // Y puede no haberlo: desde ADR-123 el código de acceso sale por esta
          // misma cola, y no tiene pedido. Por eso `order_id` acepta nulos.
          ...(fila.order_id ? { orderId: fila.order_id } : {}),
          ...(order ? { order } : {}),
          datos: payload,
        };
      });
    },

    async marcarEnviada(storeId, id): Promise<void> {
      const { error } = await db.rpc('mark_notification_sent', {
        p_store_id: storeId,
        p_id: id,
      });

      if (error) throw new Error(`No se pudo marcar el correo como enviado: ${error.message}`);
    },
  };
}
