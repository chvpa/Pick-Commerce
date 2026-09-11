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

/** Una zona de entrega —un departamento, una ciudad— con su tarifa. */
export interface ZonaDeEnvio {
  readonly name: string;
  readonly amount: number;
}

export interface ConfiguracionDeEnvio {
  /**
   * `none` es una tienda que no cobra envío: retira, o lo arregla aparte.
   * `flat` cobra lo mismo a todos. `zones` cobra según a dónde va.
   */
  readonly mode: 'none' | 'flat' | 'zones';
  /**
   * En la unidad mínima de la moneda, como todo importe del sistema. En `flat`
   * es la tarifa; en `zones` es **la tarifa de una zona que no está en la
   * tabla**, para que un destino desconocido nunca salga gratis por error.
   */
  readonly amount: number;
  /** Desde cuánto el envío es gratis. Ausente = nunca. Vale en los dos modos. */
  readonly freeFrom?: number;
  /** Sólo en `zones`, y nunca vacío: sin zonas válidas la configuración cae a `none`. */
  readonly zones?: readonly ZonaDeEnvio[];
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
  if (shipping.mode !== 'flat' && shipping.mode !== 'zones') return SIN_ENVIO;

  const amount = importe(shipping.amount);
  if (amount === undefined) return SIN_ENVIO;

  const freeFrom = importe(shipping.freeFrom);
  // Un umbral de cero sería «siempre gratis», que se escribe con `none`.
  const umbral = freeFrom !== undefined && freeFrom > 0 ? { freeFrom } : {};

  if (shipping.mode === 'flat') return { mode: 'flat', amount, ...umbral };

  /*
   * Las zonas se leen una por una y se descartan las rotas —sin nombre, o con un
   * importe que no es un entero no negativo— en vez de tirar la configuración
   * entera: una zona mal escrita en el Admin no puede dejar sin envío a las
   * otras diecisiete. Si no queda ninguna, sí cae a `none`: un modo por zonas
   * sin zonas no es una configuración.
   */
  const zones = (Array.isArray(shipping.zones) ? shipping.zones : [])
    .map((z): ZonaDeEnvio | undefined => {
      const zona = z as Record<string, unknown> | null;
      const name = typeof zona?.name === 'string' ? zona.name.trim() : '';
      const monto = importe(zona?.amount);
      return name !== '' && monto !== undefined ? { name, amount: monto } : undefined;
    })
    .filter((z): z is ZonaDeEnvio => z !== undefined);
  if (zones.length === 0) return SIN_ENVIO;

  return { mode: 'zones', amount, zones, ...umbral };
}

/**
 * La zona de la tabla a la que corresponde un nombre, o nada.
 *
 * Sin distinguir mayúsculas ni espacios de más: «central» y «Central » son la
 * misma. Es la misma comparación que hace `create_order`, y por eso vive acá:
 * el checkout tiene que rechazar exactamente lo que la base no va a encontrar.
 */
export function zonaDeEnvio(
  config: ConfiguracionDeEnvio,
  nombre: string | undefined,
): ZonaDeEnvio | undefined {
  if (config.mode !== 'zones' || !nombre) return undefined;
  const buscado = nombre.trim().toLowerCase();
  return config.zones?.find((z) => z.name.toLowerCase() === buscado);
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
  zona?: string,
): Money {
  if (config.mode === 'none') return money(0, subtotalConDescuento.currency);
  if (config.freeFrom !== undefined && subtotalConDescuento.amount >= config.freeFrom) {
    return money(0, subtotalConDescuento.currency);
  }
  // Por zona: la de la tabla si está; si no —o si el comprador todavía no
  // eligió—, la tarifa general. Nunca cero por no saber a dónde va.
  const tarifa =
    config.mode === 'zones' ? (zonaDeEnvio(config, zona)?.amount ?? config.amount) : config.amount;
  return { amount: tarifa, currency: subtotalConDescuento.currency };
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
