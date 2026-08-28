import type { Order, OrderEvent, OrderStatus, PaymentStatus } from '@pick/commerce-types';

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
 * Cobrar, con transferencia bancaria, es una persona mirando un comprobante. Son
 * dos estados y no más: si el pago se confirma solo, lo confirma el gateway
 * (Fase 7) y esta lista no cambia.
 */
export const ESTADOS_DE_PAGO: readonly PaymentStatus[] = ['pending', 'paid'];

export const ETIQUETA_ESTADO_PAGO: Readonly<Record<PaymentStatus, string>> = {
  pending: 'Pendiente',
  paid: 'Pagado',
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

  if (evento.type === 'payment_changed' && data.to) {
    const hacia = ETIQUETA_ESTADO_PAGO[data.to as PaymentStatus] ?? data.to;
    const base = data.to === 'paid' ? 'Marcado como pagado' : `Pago: ${hacia}`;
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
  readonly paymentStatus: PaymentStatus;
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
  /**
   * Marca el pedido como pagado o pendiente.
   *
   * Separado de `cambiarEstado` porque son dos ejes distintos: un pedido puede
   * estar entregado y sin cobrar, o pagado y todavía en preparación. Meterlos en
   * la misma máquina de estados obligaría a inventar combinaciones.
   */
  cambiarPago(storeId: string, id: string, pago: PaymentStatus, nota?: string): Promise<Order>;
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
//
// Van con los pedidos y no en un módulo propio porque un cliente, para el
// Admin, **son sus pedidos**: la ficha es nombre, contacto y agregados de
// compra. No hay perfil, ni login, ni direcciones guardadas — el checkout es
// guest (ADR-065) y el pedido conserva su propia copia de todo.

export interface ClienteDeLista {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly taxId?: string;
  readonly taxName?: string;
  readonly createdAt: string;
  /** Pedidos no cancelados: lo que se anuló no es una compra. */
  readonly orderCount: number;
  readonly totalSpent: { readonly amount: number; readonly currency: string };
  /** Ausente si nunca compró, o si su único pedido se canceló. */
  readonly lastOrderAt?: string;
}

export interface PaginaClientes {
  readonly items: readonly ClienteDeLista[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

export interface ConsultaClientes {
  readonly query?: string;
  readonly page?: number;
  readonly perPage?: number;
}

export interface RepositorioAdminClientes {
  listar(storeId: string, consulta: ConsultaClientes): Promise<PaginaClientes>;
  porId(storeId: string, id: string): Promise<ClienteDeLista | null>;
}
