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

/**
 * Un rango propio, de un día a otro, los dos incluidos: `YYYY-MM-DD` en la hora
 * de quien mira. El extremo de arriba es la medianoche del día siguiente, así
 * que «hasta el 30» cuenta el 30 entero.
 */
export function rangoPropio(desde: string, hasta: string): { from: string; to: string } {
  const [a1, m1, d1] = desde.split('-').map(Number) as [number, number, number];
  const [a2, m2, d2] = hasta.split('-').map(Number) as [number, number, number];
  return {
    from: new Date(a1, m1 - 1, d1).toISOString(),
    to: new Date(a2, m2 - 1, d2 + 1).toISOString(),
  };
}

/** El tope de un rango propio: más que esto es un informe, no una mirada. */
export const DIAS_MAXIMOS_DEL_RANGO = 366;

/**
 * Qué está mal en un rango, en palabras, o `null` si sirve. `hoy` también es
 * `YYYY-MM-DD`: comparar cadenas de esa forma es comparar fechas.
 */
export function problemaDelRango(desde: string, hasta: string, hoy: string): string | null {
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha.test(desde) || !fecha.test(hasta)) return 'Elegí las dos fechas.';
  if (desde > hasta) return 'La fecha de inicio es posterior a la de fin.';
  if (hasta > hoy) return 'El rango no puede terminar después de hoy.';
  if (diasDelRango(desde, hasta) > DIAS_MAXIMOS_DEL_RANGO) return 'Elegí un año como mucho.';
  return null;
}

/** Cuántos días abarca un rango propio, los dos extremos incluidos. */
export function diasDelRango(desde: string, hasta: string): number {
  const { from, to } = rangoPropio(desde, hasta);
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / UN_DIA_MS);
}

/** Un día en milisegundos, para correr `hoy` a ayer. */
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * El período con el que se compara: el inmediatamente anterior, del mismo largo.
 *
 * `hoy` se compara con **ayer a la misma hora**, no con las últimas horas de
 * ayer: a las tres de la tarde, «hoy» es de la medianoche a las tres, y lo justo
 * es contrastarlo con ayer de la medianoche a las tres. Los otros dos son
 * ventanas móviles y se comparan con la ventana de antes.
 */
export function periodoAnterior(
  periodo: Periodo,
  rango: { readonly from: string; readonly to: string },
): { from: string; to: string } {
  const desde = new Date(rango.from).getTime();
  const hasta = new Date(rango.to).getTime();
  const corrimiento = periodo === 'hoy' ? UN_DIA_MS : hasta - desde;
  return {
    from: new Date(desde - corrimiento).toISOString(),
    to: new Date(hasta - corrimiento).toISOString(),
  };
}

/**
 * Cuánto cambió un número contra el período anterior, en tanto por uno.
 *
 * `null` cuando antes fue cero: de cero a algo no es «+∞ %», es que antes no
 * había nada con qué comparar, y la pantalla no muestra la flecha.
 */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (actual - anterior) / anterior;
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

/**
 * Lo que espera a la tienda: «Para hacer» del Inicio, el checklist de una
 * tienda nueva y los contadores del sidebar, de una sola consulta.
 */
export interface TareasDeLaTienda {
  /** El pago no entró y el pedido sigue vivo. `desde` es el más viejo. */
  readonly porCobrar: { readonly n: number; readonly desde: string | null };
  /** Cobrado y todavía sin salir de la tienda. */
  readonly paraPreparar: { readonly n: number; readonly desde: string | null };
  /** Avisos que no van a salir nunca (ADR-102), con el pedido del último. */
  readonly avisosFallidos: {
    readonly n: number;
    readonly pedido: {
      readonly id: string;
      readonly number: number;
      readonly customerName?: string;
    } | null;
  };
  /** Publicados y sin foto. `ocultos` si la tienda no los muestra. */
  readonly sinFoto: { readonly n: number; readonly ocultos: boolean };
  readonly resenas: {
    readonly n: number;
    readonly ultima: { readonly producto: string; readonly rating: number } | null;
  };
  /** Lo que propuso la IA y espera que alguien lo mire. */
  readonly propuestas: { readonly descripciones: number; readonly fotos: number };
  /** Los pedidos de toda la vida de la tienda: decide si es nueva. */
  readonly pedidos: number;
  readonly alta: PasosDeAlta;
}

/** El checklist de una tienda nueva, leído de lo que la tienda ya hizo. */
export interface PasosDeAlta {
  readonly productos: boolean;
  readonly pagos: boolean;
  readonly envio: boolean;
  readonly portada: boolean;
  readonly equipo: boolean;
}

export interface PuntoDeSerie {
  /** El comienzo de la hora o del día, en el huso de quien mira y sin offset. */
  readonly desde: string;
  readonly ventas: number;
  readonly pedidos: number;
}

export interface SerieDelPeriodo {
  /** Una cubeta por hora o por día, también las vacías. */
  readonly puntos: readonly PuntoDeSerie[];
  /**
   * Los pedidos según cuánto gastaron, en tres tramos cortados alrededor del
   * ticket del período: hasta la mitad, hasta el doble, y más. `null` si no
   * hubo ventas.
   */
  readonly tramos: {
    readonly hasta: readonly [number, number];
    readonly pedidos: readonly [number, number, number];
  } | null;
}

export interface RepositorioDashboard {
  resumen(storeId: string, from: string, to: string): Promise<ResumenDelPeriodo>;
  /** `null` si la tienda no es de quien pregunta. */
  tareas(storeId: string): Promise<TareasDeLaTienda | null>;
  serie(
    storeId: string,
    from: string,
    to: string,
    zonaHoraria: string,
    porHora: boolean,
  ): Promise<SerieDelPeriodo>;
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
