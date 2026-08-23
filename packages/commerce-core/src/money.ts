import type { CurrencyCode, Money } from '@pick/commerce-types';

/**
 * Locale por defecto del primer mercado. Cada store puede sobreescribirlo:
 * el core no asume que todos los tenants son paraguayos.
 */
const DEFAULT_LOCALE = 'es-PY';

const decimalsByCurrency = new Map<CurrencyCode, number>();

/**
 * Decimales de la moneda según ICU (PYG = 0, USD = 2). Se resuelve con `Intl`
 * en vez de mantener una tabla propia que habría que sincronizar a mano.
 */
export function currencyDecimals(currency: CurrencyCode): number {
  const cached = decimalsByCurrency.get(currency);
  if (cached !== undefined) return cached;

  // Lanza RangeError si el código de moneda es inválido: preferimos fallar
  // fuerte antes que formatear un importe con la moneda equivocada.
  const resolved = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions();
  const decimals = resolved.maximumFractionDigits ?? 2;
  decimalsByCurrency.set(currency, decimals);
  return decimals;
}

/** Construye un `Money` a partir de un importe en unidades mayores (1500.5 USD). */
export function money(majorAmount: number, currency: CurrencyCode): Money {
  const factor = 10 ** currencyDecimals(currency);
  return { amount: Math.round(majorAmount * factor), currency };
}

/** Devuelve el importe en unidades mayores. Sólo para display/exportación. */
export function toMajorUnits(value: Money): number {
  return value.amount / 10 ** currencyDecimals(value.currency);
}

export function formatMoney(value: Money, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: value.currency }).format(
    toMajorUnits(value),
  );
}

/** Suma importes de la misma moneda. Mezclar monedas es un error de programación. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(
      `No se pueden sumar importes de distinta moneda: ${a.currency} + ${b.currency}`,
    );
  }
  return { amount: a.amount + b.amount, currency: a.currency };
}

/**
 * Porcentaje de descuento entre el precio actual y el precio anterior.
 * Devuelve `null` cuando no hay oferta que mostrar, para que la UI no tenga que
 * decidir si un 0 % es "sin descuento" o "descuento nulo".
 */
export function discountPercent(current: Money, compareAt: Money): number | null {
  if (current.currency !== compareAt.currency) {
    throw new TypeError(
      `No se puede comparar precios de distinta moneda: ${current.currency} vs ${compareAt.currency}`,
    );
  }
  if (compareAt.amount <= 0 || current.amount >= compareAt.amount) return null;

  // Se redondea hacia abajo: mostrar "30 %" con un 29,7 % real exagera la oferta.
  return Math.floor(((compareAt.amount - current.amount) / compareAt.amount) * 100);
}
