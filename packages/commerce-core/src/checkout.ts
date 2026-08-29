import type { Money, Order, OrderAddress, OrderCustomer } from '@pick/commerce-types';
import { addMoney } from './money.ts';
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
      issues.push({
        type: 'insufficient_stock',
        variantId,
        // Un negativo es un descuadre del espejo del ERP (ADR-056); al comprador
        // se le dice cero, que es lo que puede llevar.
        available: Math.max(variante.available, 0),
      });
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
// Datos del checkout
// ---------------------------------------------------------------------------

export interface DatosDeCheckout {
  readonly customer: OrderCustomer;
  readonly address: OrderAddress;
  readonly paymentMethod: string;
  readonly notes?: string;
}

/**
 * Valida lo que la persona escribió.
 *
 * Sin Zod a propósito: el core no tiene dependencias de runtime (ADR-029), y
 * este mismo módulo corre en el island y en el endpoint. Que corra en los dos es
 * el punto — el servidor no puede confiar en que el browser validó.
 *
 * Los mensajes son los que ve el comprador, así que están en español y dicen qué
 * hacer, no qué falló.
 */
export function validarDatosDeCheckout(entrada: unknown): {
  readonly datos?: DatosDeCheckout;
  readonly errores: Readonly<Record<string, string>>;
} {
  const errores: Record<string, string> = {};
  const bruto = (entrada ?? {}) as Record<string, unknown>;
  const cliente = (bruto.customer ?? {}) as Record<string, unknown>;
  const direccion = (bruto.address ?? {}) as Record<string, unknown>;

  const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

  const name = texto(cliente.name);
  const email = texto(cliente.email).toLowerCase();
  const phone = texto(cliente.phone);
  const street = texto(direccion.street);
  const city = texto(direccion.city);
  const paymentMethod = texto(bruto.paymentMethod);

  if (name.length < 2) errores.name = 'Escribí tu nombre y apellido.';

  // Deliberadamente laxa: exige la forma mínima de un email y nada más. Una
  // expresión estricta rechaza direcciones válidas, y quien se equivoca de mail
  // no se entera igual —lo que confirma una dirección es un mensaje que llega—.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.email = 'Revisá el correo.';

  // Paraguay: 10 dígitos con el 0 inicial. Se aceptan espacios y guiones, y el
  // prefijo +595, porque así es como la gente escribe su número.
  const soloDigitos = phone.replace(/[\s()-]/g, '').replace(/^\+?595/, '0');
  if (!/^0\d{8,9}$/.test(soloDigitos))
    errores.phone = 'Revisá el teléfono, por ejemplo 0981 123 456.';

  if (street.length < 4) errores.street = 'Escribí la dirección de entrega.';
  if (city.length < 2) errores.city = 'Escribí la ciudad.';
  if (!paymentMethod) errores.paymentMethod = 'Elegí una forma de pago.';

  if (Object.keys(errores).length > 0) return { errores };

  const taxId = texto(cliente.taxId);
  const taxName = texto(cliente.taxName);
  const reference = texto(direccion.reference);
  const notes = texto(bruto.notes);

  return {
    errores,
    datos: {
      // Los opcionales se omiten en vez de mandarse vacíos: la base guarda
      // ausencia, no cadena vacía (ADR-059).
      customer: {
        name,
        email,
        phone: soloDigitos,
        ...(taxId ? { taxId } : {}),
        ...(taxName ? { taxName } : {}),
      },
      address: { street, city, ...(reference ? { reference } : {}) },
      paymentMethod,
      ...(notes ? { notes } : {}),
    },
  };
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
