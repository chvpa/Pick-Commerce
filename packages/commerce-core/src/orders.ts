import type { Order, OrderEvent, OrderStatus } from '@pick/commerce-types';

/**
 * Estados de un pedido: etiquetas, orden y transiciones.
 *
 * Lo comparten el storefront y el Admin, así que vive en el core y no en la app.
 */

/** En el orden en que ocurren. `cancelled` va al final porque sale del flujo. */
export const ESTADOS_DE_PEDIDO: readonly OrderStatus[] = [
  'received',
  'confirmed',
  'preparing',
  'ready',
  'shipped',
  'in_transit',
  'delivered',
  'cancelled',
];

export const ETIQUETA_ESTADO_PEDIDO: Readonly<Record<OrderStatus, string>> = {
  received: 'Recibido',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Listo',
  shipped: 'Enviado',
  in_transit: 'En tránsito',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

/**
 * La única regla: de `cancelled` no se sale.
 *
 * El resto se mueve libre a propósito. Un operador que marcó "enviado" por error
 * tiene que poder volver atrás, y la timeline deja constancia de los dos
 * movimientos. Una máquina de estados rígida acá produciría pedidos trabados que
 * se destraban editando la base a mano, que es peor que el problema que resuelve.
 *
 * Cancelar es distinto porque devuelve stock: dejar que un pedido salga de
 * cancelado obligaría a volver a descontarlo, y ese stock puede haberse vendido.
 */
export function puedeTransicionar(desde: OrderStatus, hacia: OrderStatus): boolean {
  if (desde === hacia) return false;
  return desde !== 'cancelled';
}

/** Un pedido ya no se toca más: sirve para ocultar controles en el Admin. */
export function esTerminal(estado: OrderStatus): boolean {
  return estado === 'cancelled';
}

/**
 * Texto de una entrada de la timeline.
 *
 * El `data` viene de la base como jsonb, así que llega sin tipar; se lee con
 * cuidado en vez de castear.
 */
export function describirEvento(evento: OrderEvent): string {
  const data = evento.data as { from?: string; to?: string; note?: string };

  if (evento.type === 'created') return 'Pedido recibido';

  if (evento.type === 'status_changed' && data.to) {
    const hacia = ETIQUETA_ESTADO_PEDIDO[data.to as OrderStatus] ?? data.to;
    const desde = data.from
      ? (ETIQUETA_ESTADO_PEDIDO[data.from as OrderStatus] ?? data.from)
      : null;
    const base = desde ? `${desde} → ${hacia}` : hacia;
    return data.note ? `${base} — ${data.note}` : base;
  }

  return evento.type;
}

// ---------------------------------------------------------------------------
// Puerto del Admin
// ---------------------------------------------------------------------------

export interface PedidoDeLista {
  readonly id: string;
  readonly number: number;
  readonly createdAt: string;
  readonly customerName: string;
  readonly total: { readonly amount: number; readonly currency: string };
  readonly status: OrderStatus;
  readonly paymentStatus: string;
  readonly itemCount: number;
}

export interface PaginaPedidos {
  readonly items: readonly PedidoDeLista[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

export interface ConsultaPedidos {
  readonly query?: string;
  readonly status?: OrderStatus;
  readonly page?: number;
  readonly perPage?: number;
}

export interface PedidoConTimeline {
  readonly order: Order;
  readonly events: readonly OrderEvent[];
}

/** Igual que el resto de los repositorios: `storeId` primero, siempre. */
export interface RepositorioAdminPedidos {
  listar(storeId: string, consulta: ConsultaPedidos): Promise<PaginaPedidos>;
  porId(storeId: string, id: string): Promise<PedidoConTimeline | null>;
  cambiarEstado(storeId: string, id: string, estado: OrderStatus, nota?: string): Promise<Order>;
}
