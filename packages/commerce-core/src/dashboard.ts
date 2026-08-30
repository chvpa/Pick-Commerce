import type { OrderStatus } from '@pick/commerce-types';
import type { PedidoDeLista } from './orders.ts';

/**
 * El resumen que ve el operador al entrar al Admin.
 *
 * Se deriva de los pedidos que ya están en la base, no de eventos de
 * navegación: responde **«cuánto vendí»**. Lo que responde «cuánta gente miró»
 * —sesiones, embudo, conversión, búsquedas— vive en `analytics.ts` y sale de
 * otra fuente. La línea entre las dos es de ADR-067 y sigue vigente.
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
  /** Unidades vendidas: la suma de las cantidades de las líneas. */
  readonly units: number;
  /**
   * Ingresos menos costo, **sólo de las líneas que tienen costo**.
   *
   * `null` cuando ninguna lo tiene, y no cero: cero es un margen y «no sé» no lo
   * es. Siempre se lee junto a `marginCoverage` — un margen sobre cobertura
   * parcial no es un margen, es la mitad de uno pareciendo excelente.
   */
  readonly margin: Dinero | null;
  /** Qué fracción de los ingresos tiene costo conocido, en tanto por uno. */
  readonly marginCoverage: number;
  /** Sólo los estados presentes, y acá **sí** entran los cancelados. */
  readonly byStatus: Readonly<Partial<Record<OrderStatus, number>>>;
  readonly topProducts: readonly ProductoVendido[];
  /** Los últimos pedidos de la tienda, sin filtrar por período. */
  readonly recent: readonly PedidoDeLista[];
}

/**
 * Una fila de «ventas por producto».
 *
 * La misma forma para los dos modos, porque son la misma mirada desde dos lados.
 * En `sin_movimiento` las unidades y los ingresos son cero y lo que importa es
 * `stock`: sin él, «no se vendió» es una curiosidad; con él es cuánta plata está
 * quieta.
 */
export interface RendimientoDeProducto {
  readonly sku: string;
  readonly title: string;
  readonly variantTitle?: string;
  readonly unidades: number;
  readonly ingresos: Dinero;
  /** `null` si ninguna línea de este sku tenía costo cargado. */
  readonly margen?: Dinero;
  /** Sólo en `sin_movimiento`: lo que hay sin vender. */
  readonly stock?: number;
}

export type ModoDeRendimiento = 'vendidos' | 'sin_movimiento';

export const ETIQUETA_MODO: Readonly<Record<ModoDeRendimiento, string>> = {
  vendidos: 'Lo que más se vendió',
  sin_movimiento: 'Lo que no se movió',
};

export interface PaginaDeRendimiento {
  readonly items: readonly RendimientoDeProducto[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

export interface RepositorioDashboard {
  resumen(storeId: string, from: string, to: string): Promise<ResumenDelPeriodo>;
  /** Ventas por producto, o lo que no se movió. Pagina: ADR-024. */
  rendimiento(
    storeId: string,
    from: string,
    to: string,
    modo: ModoDeRendimiento,
    page: number,
    perPage: number,
  ): Promise<PaginaDeRendimiento>;
}
