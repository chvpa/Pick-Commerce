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

/**
 * Aplica un porcentaje expresado en **puntos básicos** (1500 = 15 %).
 *
 * En puntos básicos y no en porcentaje para que "12,5 %" sea un entero: el
 * dinero de este sistema nunca pasa por un float, y un descuento tampoco.
 *
 * Devuelve el **importe a descontar**, no el precio resultante, porque el
 * llamador casi siempre necesita los dos y derivar el descuento de la resta
 * vuelve a introducir el redondeo que acá se decide una sola vez.
 *
 * Redondea al medio hacia arriba sobre la unidad mínima de la moneda —que es en
 * la que ya viene `amount`—, así que 15 % de ₲33.333 son ₲5.000 y no ₲4.999,95.
 */
export function percentageOf(value: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new TypeError(`Los puntos básicos deben ser un entero no negativo: ${basisPoints}`);
  }
  return { amount: Math.round((value.amount * basisPoints) / 10_000), currency: value.currency };
}

/**
 * Resta sin bajar de cero.
 *
 * El tope importa: un descuento de monto fijo mayor que el precio dejaría un
 * importe negativo, y un negativo que llega al total del pedido es plata que el
 * comercio le termina debiendo al comprador.
 */
export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(
      `No se pueden restar importes de distinta moneda: ${a.currency} - ${b.currency}`,
    );
  }
  return { amount: Math.max(0, a.amount - b.amount), currency: a.currency };
}

/** Multiplica por una cantidad entera de unidades. */
export function multiplyMoney(value: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new TypeError(`La cantidad debe ser un entero no negativo: ${quantity}`);
  }
  return { amount: value.amount * quantity, currency: value.currency };
}
