import type { Money, Order } from '@pick/commerce-types';
import { addMoney } from './money.ts';
import type { DatosDeCheckout } from './datos-de-checkout.ts';
import type { PromocionesDelCarrito } from './promotions.ts';

/**
 * Reglas del carrito y del checkout, sin framework y sin base.
 *
 * Lo que vive acá es lo que tiene que dar el mismo resultado en el browser, en
 * el endpoint del servidor y en un test: qué falta, cuánto suma, qué datos son
 * válidos. Lo que **no** vive acá es la autoridad: el stock y el precio los
 * decide `create_order` dentro de su transacción (ADR-065). Esto ordena y
 * anticipa; no promete.
 */

// ---------------------------------------------------------------------------
// Validación del carrito
// ---------------------------------------------------------------------------

/** Lo que el cliente pide: una variante y una cantidad. Nada más viaja. */
export interface LineaDeCarrito {
  readonly variantId: string;
  readonly quantity: number;
}

/** Lo que el servidor sabe de una variante, para poder mostrarla y acotarla. */
export interface VarianteParaCarrito {
  readonly variantId: string;
  readonly title: string;
  readonly variantTitle?: string;
  readonly sku: string;
  readonly price: Money;
  readonly available: number;
  readonly imageUrl?: string;
}

/**
 * Por qué una línea no se puede comprar.
 *
 * Son los dos casos que el comprador puede entender y corregir. Todo lo demás
 * —moneda mezclada, tienda inexistente— es configuración rota y se trata como
 * error, no como problema del carrito.
 */
export type ProblemaDeCarrito =
  | { readonly type: 'variant_unavailable'; readonly variantId: string }
  | { readonly type: 'insufficient_stock'; readonly variantId: string; readonly available: number };

export interface LineaValidada extends VarianteParaCarrito {
  readonly quantity: number;
  readonly subtotal: Money;
}

export interface CarritoValidado {
  readonly lines: readonly LineaValidada[];
  readonly issues: readonly ProblemaDeCarrito[];
  /** Suma de las líneas que **sí** se pueden comprar. */
  readonly total: Money;
}

/**
 * Cruza lo que el cliente pide contra lo que el servidor tiene.
 *
 * Devuelve las dos cosas: lo comprable y lo que no. Una línea con problema no
 * entra en el total, porque el total que se muestra tiene que ser el que se va a
 * cobrar.
 *
 * Las cantidades se consolidan por variante antes de comparar. El espejo del
 * cliente no debería mandar dos líneas de la misma variante, pero el payload
 * viene del browser: validar cada una contra el stock entero dejaría pasar el
 * doble de lo que hay. `create_order` hace lo mismo del lado de la base, y no es
 * redundancia: son dos entradas distintas al mismo dato.
 */
export function validarCarrito(
  lineas: readonly LineaDeCarrito[],
  variantes: readonly VarianteParaCarrito[],
): CarritoValidado {
  const porVariante = new Map<string, number>();
  const orden: string[] = [];
  for (const linea of lineas) {
    if (!porVariante.has(linea.variantId)) orden.push(linea.variantId);
    porVariante.set(linea.variantId, (porVariante.get(linea.variantId) ?? 0) + linea.quantity);
  }

  const disponibles = new Map(variantes.map((v) => [v.variantId, v]));
  const validas: LineaValidada[] = [];
  const issues: ProblemaDeCarrito[] = [];

  for (const variantId of orden) {
    const quantity = porVariante.get(variantId)!;
    const variante = disponibles.get(variantId);

    if (!variante) {
      issues.push({ type: 'variant_unavailable', variantId });
      continue;
    }
    if (quantity < 1) {
      issues.push({ type: 'variant_unavailable', variantId });
      continue;
    }
    if (variante.available < quantity) {
      // Un negativo es un descuadre del espejo del ERP (ADR-056); al comprador
      // se le dice cero, que es lo que puede llevar.
      const disponible = Math.max(variante.available, 0);
      issues.push({ type: 'insufficient_stock', variantId, available: disponible });

      /*
       * Se **recorta**, no se pierde la línea.
       *
       * Antes quedaba afuera entera, así que un carrito con dos unidades de algo
       * que tenía una terminaba sin ese producto: el checkout decía «ajustamos tu
       * carrito» y en realidad lo había sacado, y la venta de la unidad que sí
       * existía se perdía. Con cero disponible no hay nada que recortar y sale
       * igual que antes. Reportado en producción.
       */
      if (disponible > 0) {
        validas.push({
          ...variante,
          quantity: disponible,
          subtotal: {
            amount: variante.price.amount * disponible,
            currency: variante.price.currency,
          },
        });
      }
      continue;
    }

    validas.push({
      ...variante,
      quantity,
      subtotal: { amount: variante.price.amount * quantity, currency: variante.price.currency },
    });
  }

  return { lines: validas, issues, total: totalDelCarrito(validas) };
}

/**
 * Suma las líneas.
 *
 * Usa `addMoney`, que **lanza** ante monedas distintas. Es deliberado: sumar a
 * mano y rotular con la moneda del primer ítem —que es lo que hacía el
 * carrito— produce un total silenciosamente equivocado, y un total equivocado
 * en una pantalla de compra es peor que un error.
 */
export function totalDelCarrito(lineas: readonly { subtotal: Money }[]): Money {
  if (lineas.length === 0) return { amount: 0, currency: 'PYG' };
  return lineas.slice(1).reduce((total, l) => addMoney(total, l.subtotal), lineas[0]!.subtotal);
}

// ---------------------------------------------------------------------------
// Formas de pago
// ---------------------------------------------------------------------------

export interface ConfiguracionDePagos {
  readonly enabled: readonly string[];
  readonly default: string;
  readonly bankTransfer?: { readonly instructions: string };
}

/**
 * Formas de pago habilitadas para la tienda (PROJECT.md §34, ADR-021).
 *
 * El default no es vacío sino transferencia bancaria: es el único método que no
 * necesita proveedor ni credenciales, habilitarlo no puede romper nada, y una
 * tienda recién creada tiene que poder vender. Mismo criterio que la
 * configuración de moneda.
 */
export function configuracionDePagos(settings: unknown): ConfiguracionDePagos {
  const POR_DEFECTO: ConfiguracionDePagos = {
    enabled: ['bank_transfer'],
    default: 'bank_transfer',
  };

  const bruto = (settings as { payments?: unknown } | null)?.payments;
  if (!bruto || typeof bruto !== 'object') return POR_DEFECTO;

  const payments = bruto as Record<string, unknown>;
  const enabled = Array.isArray(payments.enabled)
    ? payments.enabled.filter((m): m is string => typeof m === 'string' && m.length > 0)
    : [];
  if (enabled.length === 0) return POR_DEFECTO;

  const pedido = typeof payments.default === 'string' ? payments.default : '';
  const instrucciones = (payments.bankTransfer as { instructions?: unknown } | undefined)
    ?.instructions;

  return {
    enabled,
    // Un default que no está habilitado no es un default: se cae al primero.
    default: enabled.includes(pedido) ? pedido : enabled[0]!,
    ...(typeof instrucciones === 'string' && instrucciones
      ? { bankTransfer: { instructions: instrucciones } }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

export type ResultadoDePedido =
  { readonly order: Order } | { readonly issues: readonly ProblemaDeCarrito[] };

/**
 * Lo que el checkout necesita de la base.
 *
 * `storeId` es el primer parámetro de los dos métodos, y no por estilo: es la
 * única cosa que acota los datos en el camino de la secret key, que saltea RLS
 * (ADR-052). Un método sin `storeId` sería un método que puede devolver o
 * escribir datos de cualquier comercio.
 */
export interface RepositorioCheckout {
  variantesParaCarrito(
    storeId: string,
    variantIds: readonly string[],
  ): Promise<readonly VarianteParaCarrito[]>;

  /**
   * El dinero del carrito con las promociones ya aplicadas.
   *
   * Va por la misma función que usa `create_order`, y no por una suma propia,
   * para que el carrito no pueda mostrar un total distinto del que se cobra.
   */
  promocionesDelCarrito(
    storeId: string,
    lineas: readonly LineaDeCarrito[],
    codigo?: string,
  ): Promise<PromocionesDelCarrito>;

  crearPedido(
    storeId: string,
    idempotencyKey: string,
    datos: DatosDeCheckout & {
      readonly lines: readonly LineaDeCarrito[];
      /** El código, nunca el monto: lo resuelve la base. */
      readonly couponCode?: string;
    },
  ): Promise<ResultadoDePedido>;
}
