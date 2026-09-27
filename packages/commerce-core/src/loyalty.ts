/**
 * Fidelidad: los puntos de una tienda (ADR-141).
 *
 * El libro vive en la base y es append-only; acá están los contratos que el Admin y
 * el storefront comparten, y la única cuenta que no es una suma: el **tipo de cambio
 * implícito** de un premio.
 *
 * Las reglas —cuántos puntos da cada cosa— **no están acá a propósito**. Viven en
 * `app.regla_de_puntos`, del lado de la base, porque es el disparador el que emite:
 * si además estuvieran escritas en TypeScript, el día que cambie una el sistema
 * pagaría una cosa y la pantalla diría otra.
 */

/** Lo que devuelve `app.regla_de_puntos`. Apagado es el estado inicial de toda tienda. */
export interface ReglasDePuntos {
  readonly enabled: boolean;
  readonly porCompra: number;
  readonly porResena: number;
  readonly diasDeVencimiento: number;
}

/**
 * El programa en números.
 *
 * `pasivo` está aparte de `emitidos` porque es el número que importa y el que nadie
 * mira hasta que duele: son los puntos emitidos y no gastados, o sea lo que el
 * comercio va a tener que entregar.
 */
export interface ResumenDeFidelidad {
  readonly reglas: ReglasDePuntos;
  readonly emitidos: number;
  readonly gastados: number;
  readonly pasivo: number;
  readonly conPuntos: number;
  readonly porCompras: number;
  readonly porResenas: number;
  readonly vencidos: number;
}

/** Un premio del catálogo de canje, tal como lo administra el comercio. */
export interface Premio {
  readonly id: string;
  readonly title: string;
  readonly pointsCost: number;
  /** El mismo vocabulario del motor de promociones: es el que calcula el descuento. */
  readonly discountType: 'percentage' | 'fixed';
  readonly discountValue: number;
  readonly status: 'draft' | 'active' | 'archived';
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly maxRedemptions?: number;
  readonly redemptions: number;
  readonly maxPerCustomer?: number;
  readonly validDays: number;
}

/** Lo que se manda al guardar. Sin `redemptions`: ese lo lleva la base. */
export type PremioParaGuardar = Omit<Premio, 'id' | 'redemptions'> & { readonly id?: string };

/**
 * El tipo de cambio implícito de un premio, en palabras.
 *
 * **Es lo más valioso de la pantalla de premios**, y el motivo es concreto: sin esto,
 * un envío gratis a diez puntos se convierte en un descuento permanente del 12 % sobre
 * cada pedido sin que nadie lo note. Con los puntos por compra al lado, la cuenta se
 * ve antes de publicar.
 *
 * Devuelve cadena vacía cuando no hay nada que decir —sin costo, sin regla— en vez de
 * una frase sobre una división por cero.
 */
export function tipoDeCambio(porCompra: number, puntosDelPremio: number): string {
  if (porCompra <= 0 || puntosDelPremio <= 0) return '';

  const compras = puntosDelPremio / porCompra;

  if (compras < 1) {
    const canjes = Math.floor(porCompra / puntosDelPremio);
    return `Una compra da ${porCompra} puntos: alcanza para ${canjes} ${
      canjes === 1 ? 'canje' : 'canjes'
    } de esto.`;
  }

  // Hacia arriba: con 1,2 compras por canje, «una compra» sería mentir por poco, y
  // ese poco es el que convierte un premio en un descuento permanente.
  const compran = Math.ceil(compras);
  return `Una compra da ${porCompra} puntos: hacen falta ${compran} ${
    compran === 1 ? 'compra' : 'compras'
  } para un canje de esto.`;
}
