import type { OrderStatus } from '@pick/commerce-types';
import type { PedidoDeLista } from './orders.ts';

/**
 * El resumen que ve el operador al entrar al Admin.
 *
 * Se deriva de los pedidos que ya están en la base, no de eventos de
 * navegación: acá no hay page_view ni add_to_cart, que son de Fase 10. La
 * consecuencia es que responde "cuánto vendí", no "cuánta gente miró", y la
 * diferencia conviene tenerla presente antes de leer una conversión que este
 * panel no calcula.
 */

export type Periodo = 'hoy' | '7d' | '30d';

export const ETIQUETA_PERIODO: Readonly<Record<Periodo, string>> = {
  hoy: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
};

/**
 * El rango de un período, en el huso de quien mira.
 *
 * `hoy` arranca a la medianoche **local** y no hace 24 horas: el operador que
 * pregunta cuánto vendió hoy quiere lo de hoy, no lo de ayer a esta hora. Los
 * otros dos sí son ventanas móviles, porque "los últimos 7 días" no tiene un
 * comienzo de jornada que respetar.
 *
 * El extremo superior es siempre `ahora`, y la función SQL compara con `<`, así
 * que un pedido nunca cae en dos períodos.
 */
export function rangoDePeriodo(periodo: Periodo, ahora: Date): { from: string; to: string } {
  const desde = new Date(ahora);

  if (periodo === 'hoy') {
    desde.setHours(0, 0, 0, 0);
  } else {
    desde.setDate(desde.getDate() - (periodo === '7d' ? 7 : 30));
  }

  return { from: desde.toISOString(), to: ahora.toISOString() };
}

export interface Dinero {
  readonly amount: number;
  readonly currency: string;
}

export interface ProductoVendido {
  readonly title: string;
  readonly variantTitle?: string;
  readonly sku: string;
  readonly quantity: number;
  readonly revenue: Dinero;
}

export interface ResumenDelPeriodo {
  /** Sin los cancelados: lo que se anuló no se vendió. */
  readonly sales: Dinero;
  readonly orderCount: number;
  /** Ticket promedio. Cero si no hubo pedidos, nunca `NaN`. */
  readonly aov: Dinero;
  /** Sólo los estados presentes, y acá **sí** entran los cancelados. */
  readonly byStatus: Readonly<Partial<Record<OrderStatus, number>>>;
  readonly topProducts: readonly ProductoVendido[];
  /** Los últimos pedidos de la tienda, sin filtrar por período. */
  readonly recent: readonly PedidoDeLista[];
}

export interface RepositorioDashboard {
  resumen(storeId: string, from: string, to: string): Promise<ResumenDelPeriodo>;
}
