import type { OrderStatus, PaymentStatus, ProductStatus } from '@pick/commerce-types';
import type { Tono } from '@/components/ui/badge';

/**
 * Qué tono lleva cada estado, en todo el Admin.
 *
 * Vive en un solo lugar porque el mismo pedido aparece en la lista, en su
 * detalle, en el resumen y en la ficha del cliente: si cada pantalla elige su
 * color, «Recibido» termina siendo ámbar en una y azul en otra, y el color deja
 * de decir nada. Los tonos son los del handoff (ADR-143).
 */
export const TONO_DE_PEDIDO: Readonly<Record<OrderStatus, Tono>> = {
  // Recibido pide algo de quien mira: confirmarlo.
  received: 'amber',
  confirmed: 'blue',
  preparing: 'blue',
  ready: 'blue',
  shipped: 'blue',
  in_transit: 'blue',
  delivered: 'green',
  cancelled: 'gray',
};

export const TONO_DE_PAGO: Readonly<Record<PaymentStatus, Tono>> = {
  pending: 'amber',
  paid: 'green',
  // Rechazado es lo único que pide atención: el pedido está y no se cobró.
  failed: 'red',
};

export const TONO_DE_PRODUCTO: Readonly<Record<ProductStatus, Tono>> = {
  active: 'green',
  draft: 'gray',
  inactive: 'amber',
  archived: 'gray',
};
