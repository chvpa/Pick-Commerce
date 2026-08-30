import { formatMoney, money } from './money.ts';
import type { CurrencyCode, Money } from '@pick/commerce-types';

/**
 * El costo de envío.
 *
 * PROJECT.md §13 lo pide entre lo que un pedido debe conservar, y hasta la Fase
 * 12 no existía: `orders` guardaba `total_amount` y nada más. Un comercio que
 * despacha lo cobraba por fuera del sistema, y el pedido decía que se pagó menos
 * de lo que se pagó.
 *
 * **Lo mínimo completo, y nada más:** una tarifa plana por tienda y un umbral
 * opcional de envío gratis. Zonas, transportistas y retiro en sucursal quedan
 * fuera — «pickup por sucursal» está en v2, así que no se adelanta acá.
 *
 * Como el descuento, el importe **se calcula siempre en el servidor**. El
 * carrito no manda un costo de envío ni podría: sería el número que decide
 * cuánto se cobra, elegido por quien paga.
 */

export interface ConfiguracionDeEnvio {
  /** `none` es una tienda que no cobra envío: retira, o lo arregla aparte. */
  readonly mode: 'none' | 'flat';
  /** En la unidad mínima de la moneda, como todo importe del sistema. */
  readonly amount: number;
  /** Desde cuánto el envío es gratis. Ausente = nunca. */
  readonly freeFrom?: number;
}

const SIN_ENVIO: ConfiguracionDeEnvio = { mode: 'none', amount: 0 };

/** Un entero no negativo, o nada. Un importe negativo restaría del total. */
function importe(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : undefined;
}

/**
 * Lee la sección `shipping` de la configuración de la tienda.
 *
 * El default es **no cobrar**, y es deliberado: una tienda recién creada que
 * empezara cobrando un envío que nadie configuró le sumaría plata al total sin
 * que el comercio lo sepa. El silencio se resuelve hacia el lado que no cobra de
 * más. Mismo criterio que la configuración de moneda y la de pagos.
 */
export function configuracionDeEnvio(settings: unknown): ConfiguracionDeEnvio {
  const bruto = (settings as { shipping?: unknown } | null)?.shipping;
  if (!bruto || typeof bruto !== 'object') return SIN_ENVIO;

  const shipping = bruto as Record<string, unknown>;
  if (shipping.mode !== 'flat') return SIN_ENVIO;

  const amount = importe(shipping.amount);
  if (amount === undefined) return SIN_ENVIO;

  const freeFrom = importe(shipping.freeFrom);

  return {
    mode: 'flat',
    amount,
    // Un umbral de cero sería «siempre gratis», que se escribe con `none`.
    ...(freeFrom !== undefined && freeFrom > 0 ? { freeFrom } : {}),
  };
}

/**
 * Cuánto se cobra de envío para este pedido.
 *
 * El umbral se compara contra **lo que se va a pagar por los productos**, o sea
 * el subtotal ya con el descuento aplicado. Es la lectura honesta de «compras
 * superiores a X»: comparar contra el subtotal sin descontar regalaría el envío
 * por una compra que terminó costando menos que el umbral.
 *
 * Es la misma cuenta que hace `create_order`, y por eso vive acá: el checkout
 * tiene que poder mostrar el número que se va a cobrar, no una aproximación.
 */
export function calcularEnvio(
  config: ConfiguracionDeEnvio,
  subtotalConDescuento: Money,
): Money {
  if (config.mode === 'none') return money(0, subtotalConDescuento.currency);
  if (config.freeFrom !== undefined && subtotalConDescuento.amount >= config.freeFrom) {
    return money(0, subtotalConDescuento.currency);
  }
  return { amount: config.amount, currency: subtotalConDescuento.currency };
}

/**
 * La barra de anuncio del envío gratis, o nada.
 *
 * Se **deriva** de la configuración en vez de escribirse a mano, y ese es el
 * punto. Antes era un texto fijo en el código del storefront que prometía envío
 * gratis desde 500.000 en toda tienda que se sirviera, sin que nada lo
 * respaldara. Generado desde el mismo número que usa `create_order`, el anuncio
 * no puede prometer algo que la caja no vaya a cumplir.
 */
export function anuncioDeEnvio(
  config: ConfiguracionDeEnvio,
  currency: CurrencyCode,
  locale: string,
): string | null {
  if (config.mode === 'none' || config.freeFrom === undefined) return null;
  return `Envío gratis en compras desde ${formatMoney({ amount: config.freeFrom, currency }, locale)}`;
}

/**
 * Si esta tienda es una demo.
 *
 * Un pedido de demostración se crea igual —el prospecto tiene que verlo entrar
 * al Admin, que es la mitad de lo que se le está mostrando— pero queda marcado y
 * no dispara correos. Sin esto, cada prospecto que prueba deja un pedido
 * indistinguible de uno real y, con un dominio verificado en Resend, le llega un
 * correo a quien haya escrito su dirección.
 */
export function esTiendaDemo(settings: unknown): boolean {
  return (settings as { demo?: unknown } | null)?.demo === true;
}
