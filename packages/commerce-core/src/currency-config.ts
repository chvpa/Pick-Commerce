import type { CurrencyCode } from '@pick/commerce-types';

/**
 * Configuración de moneda de una tienda (PROJECT.md §33).
 *
 * Vive en `store_settings.settings.currency`. Separa cinco conceptos que es
 * fácil confundir y caro confundir: la moneda del catálogo, la que se muestra,
 * la del checkout, la del ERP y la de settlement del gateway. **Mostrar USD no
 * significa cobrar en USD.**
 */
export interface TipoDeCambio {
  /** `manual` hoy; un provider automático puede agregarse después. */
  readonly mode: 'manual' | 'provider';
  /** Cuántas unidades de la moneda base equivalen a una de la mostrada. */
  readonly value: number;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

export interface CurrencyConfig {
  readonly base: CurrencyCode;
  readonly enabled: boolean;
  readonly displayCurrencies: readonly CurrencyCode[];
  readonly checkoutCurrency: CurrencyCode;
  readonly exchangeRate?: TipoDeCambio;
  readonly rounding: 'commerce-default';
}

/** Una tienda sin configurar cobra y muestra en su moneda, sin conversión. */
export function configuracionPorDefecto(moneda: CurrencyCode): CurrencyConfig {
  return {
    base: moneda,
    enabled: false,
    displayCurrencies: [moneda],
    checkoutCurrency: moneda,
    rounding: 'commerce-default',
  };
}

/**
 * Lee la configuración de `store_settings.settings`.
 *
 * Ante datos ausentes o corruptos devuelve el default seguro en vez de lanzar:
 * una tienda no debe dejar de vender porque su configuración de moneda esté mal
 * escrita, sólo debe dejar de convertir.
 */
export function configuracionDeMoneda(
  settings: unknown,
  monedaDeLaTienda: CurrencyCode,
): CurrencyConfig {
  const bruto = (settings as { currency?: Partial<CurrencyConfig> } | null)?.currency;
  const base = typeof bruto?.base === 'string' ? bruto.base : monedaDeLaTienda;

  return {
    base,
    enabled: bruto?.enabled === true,
    displayCurrencies:
      Array.isArray(bruto?.displayCurrencies) && bruto.displayCurrencies.length > 0
        ? bruto.displayCurrencies
        : [base],
    checkoutCurrency: typeof bruto?.checkoutCurrency === 'string' ? bruto.checkoutCurrency : base,
    ...(bruto?.exchangeRate ? { exchangeRate: bruto.exchangeRate } : {}),
    rounding: 'commerce-default',
  };
}

export interface EntradaDeAuditoria {
  readonly action: string;
  readonly entity: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Cambia el tipo de cambio manual y produce su registro de auditoría.
 *
 * Es pura y devuelve las dos cosas juntas a propósito: §33 exige registrar el
 * cambio, y separar la actualización del registro deja la puerta abierta a que
 * alguien haga la primera y olvide el segundo. Con esta firma no se puede
 * cambiar la tasa sin obtener también qué auditar.
 */
export function actualizarTasa(
  config: CurrencyConfig,
  valor: number,
  actorId: string,
  ahora: string,
): { config: CurrencyConfig; auditoria: EntradaDeAuditoria } {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new RangeError('El tipo de cambio debe ser un número positivo');
  }

  const anterior = config.exchangeRate?.value ?? null;

  return {
    config: {
      ...config,
      exchangeRate: { mode: 'manual', value: valor, updatedAt: ahora, updatedBy: actorId },
    },
    auditoria: {
      action: 'currency.rate_updated',
      entity: 'store_settings',
      metadata: { anterior, nuevo: valor, base: config.base },
    },
  };
}

// ---------------------------------------------------------------------------
// Puerto de la configuración
// ---------------------------------------------------------------------------

/**
 * Lee y escribe `store_settings.settings`.
 *
 * `guardar` recibe un **parcial de primer nivel** —`{ currency: ... }` o
 * `{ payments: ... }`— y no la configuración entera: cada formulario del Admin
 * edita una sección y no conoce las otras. Mandar todo obligaría a leer y
 * reenviar lo que no se tocó, que es la forma más fácil de pisarlo.
 *
 * La auditoría viaja con la escritura, no después, y del otro lado las dos
 * quedan en la misma transacción. Es lo que hace imposible guardar una tasa de
 * cambio sin dejar registro de quién la cambió (PROJECT.md §33).
 */
export interface RepositorioConfiguracion {
  leer(storeId: string): Promise<Readonly<Record<string, unknown>>>;
  guardar(
    storeId: string,
    parcial: Readonly<Record<string, unknown>>,
    auditoria?: EntradaDeAuditoria,
  ): Promise<Readonly<Record<string, unknown>>>;
}
