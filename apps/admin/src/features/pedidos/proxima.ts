import { ETIQUETA_ESTADO_PEDIDO, formatMoney } from '@pick/commerce-core';
import type { Order, OrderStatus } from '@pick/commerce-types';

/**
 * Qué le toca a un pedido, dicho como una sola acción.
 *
 * El detalle del handoff (ADR-143) no ofrece todos los estados como botones:
 * muestra lo próximo que hay que hacer. Vive aparte de la pantalla para poder
 * probarlo, como `tareas.ts`: qué botón aparece y qué promete es la parte que
 * puede mentir sin que nada falle a la vista.
 *
 * Mientras falta cobrar, lo próximo es cobrar: no se prepara lo que no se pagó.
 * Moverlo igual sigue siendo posible desde la lista, de a uno.
 */

export type ClaveDeAccion = 'cobrar' | 'rechazado' | 'avanzar' | 'completo' | 'cancelado';

export interface ProximaAccion {
  readonly clave: ClaveDeAccion;
  readonly titulo: string;
  readonly detalle: string;
  /** El botón principal. Ausente cuando no queda nada por hacer. */
  readonly boton?: string;
  /** A qué estado lleva el botón. Ausente cuando el botón cobra. */
  readonly hacia?: OrderStatus;
}

const SIGUIENTE: Partial<Record<OrderStatus, readonly [OrderStatus, string]>> = {
  received: ['confirmed', 'Confirmar pedido'],
  confirmed: ['preparing', 'Empezar a preparar'],
  preparing: ['ready', 'Marcar como listo'],
  ready: ['shipped', 'Marcar como enviado'],
  shipped: ['delivered', 'Marcar como entregado'],
  in_transit: ['delivered', 'Marcar como entregado'],
};

/**
 * Los pasos que le escriben al cliente. Lo decide `app.queue_order_notification`
 * en la base: confirmar, preparar y «listo» no mandan nada, y prometer un correo
 * que no sale es peor que no decir nada.
 */
const AVISA: ReadonlySet<OrderStatus> = new Set(['shipped', 'delivered']);

export function proximaAccion(
  order: Pick<Order, 'status' | 'paymentStatus' | 'paymentMethod' | 'total' | 'isDemo'>,
  locale: string,
): ProximaAccion {
  if (order.status === 'cancelled') {
    return {
      clave: 'cancelado',
      titulo: 'Pedido cancelado',
      detalle: 'El stock volvió al inventario.',
    };
  }

  if (order.paymentStatus === 'failed') {
    return {
      clave: 'rechazado',
      titulo: 'El pago fue rechazado',
      detalle: 'Escribile al cliente para cobrarle de otra forma.',
      boton: 'Marcar como pagado',
    };
  }

  if (order.paymentStatus === 'pending') {
    return order.paymentMethod === 'bank_transfer'
      ? {
          clave: 'cobrar',
          titulo: 'Esperando la transferencia',
          detalle: `Confirmalo cuando veas los ${formatMoney(order.total, locale)} en el banco.`,
          boton: 'Marcar como pagado',
        }
      : {
          clave: 'cobrar',
          titulo: 'Esperando el pago',
          detalle: 'Si te pagó por otro medio, marcalo como pagado.',
          boton: 'Marcar como pagado',
        };
  }

  const siguiente = SIGUIENTE[order.status];
  if (!siguiente) {
    return { clave: 'completo', titulo: 'Pedido completado', detalle: 'No queda nada por hacer.' };
  }

  const [hacia, boton] = siguiente;
  return {
    clave: 'avanzar',
    titulo: boton,
    detalle: !AVISA.has(hacia)
      ? 'Este paso no le escribe al cliente.'
      : order.isDemo
        ? 'Es un pedido de demostración: no se le escribe a nadie.'
        : 'Al hacerlo, se le avisa al cliente por correo.',
    boton,
    hacia,
  };
}

const FLUJO: readonly OrderStatus[] = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'shipped',
  'delivered',
];

export interface PasoDelPedido {
  readonly etiqueta: string;
  readonly hecho: boolean;
  readonly actual: boolean;
}

/** La barra de pasos y su rótulo: «En preparación · paso 3 de 6». */
export function pasosDelPedido(estado: OrderStatus): {
  readonly pasos: readonly PasoDelPedido[];
  readonly resumen: string;
} {
  // En tránsito es una forma de estar enviado: ocupa ese paso con su nombre.
  const posicion = FLUJO.indexOf(estado === 'in_transit' ? 'shipped' : estado);
  const entregado = estado === 'delivered';
  const pasos = FLUJO.map((k, i) => ({
    etiqueta:
      k === 'shipped' && estado === 'in_transit'
        ? ETIQUETA_ESTADO_PEDIDO.in_transit
        : ETIQUETA_ESTADO_PEDIDO[k],
    hecho: posicion >= 0 && (i < posicion || (i === posicion && entregado)),
    actual: posicion >= 0 && i === posicion && !entregado,
  }));

  const resumen =
    estado === 'cancelled'
      ? 'Cancelado'
      : entregado
        ? 'Completado'
        : `${pasos[posicion]!.etiqueta} · paso ${posicion + 1} de ${FLUJO.length}`;
  return { pasos, resumen };
}
