import type { Money } from '@pick/commerce-types';
import { multiplyMoney, percentageOf, subtractMoney } from './money.ts';

/**
 * Motor de promociones.
 *
 * **Esto es la especificación ejecutable.** Por el mismo razonamiento de
 * ADR-055: el modo de fallo de una promoción es *silencioso* —un descuento mal
 * calculado no lanza ninguna excepción, sólo cobra mal—, así que la semántica se
 * fija acá, con tests, y `catalog_search` y `create_order` la reflejan.
 *
 * El modelo es plano a propósito. PROJECT.md §15 dibuja `conditions[]` y
 * `actions[]`, pero los casos de la Fase 9 —porcentaje, monto fijo, mínimo de
 * compra, mínimo de cantidad, cupón, vigencia y alcance— entran en columnas. Un
 * motor de reglas para eso sería un intérprete que hay que depurar sin ganar
 * nada.
 */

/** Se archiva, no se borra: un pedido viejo tiene que poder explicar su descuento. */
export type PromotionStatus = 'draft' | 'active' | 'archived';

export type DiscountType = 'percentage' | 'fixed';

/** A qué productos alcanza. `all` es toda la tienda. */
export type PromotionTarget =
  | { readonly kind: 'all' }
  | { readonly kind: 'category'; readonly ids: readonly string[] }
  | { readonly kind: 'collection'; readonly ids: readonly string[] }
  | { readonly kind: 'product'; readonly ids: readonly string[] };

export interface Promotion {
  readonly id: string;
  readonly title: string;
  readonly status: PromotionStatus;
  /** Mayor primero. Es el control del comercio sobre cuál gana. */
  readonly priority: number;
  /** Si combina con otras. Ver `aplicarCadena` para la regla exacta. */
  readonly stackable: boolean;
  /** Ausente = automática. Presente = cupón, y el comprador lo escribe. */
  readonly code?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly usageLimit?: number;
  readonly usageCount: number;
  readonly discountType: DiscountType;
  /** Puntos básicos si es porcentaje (1500 = 15 %); unidad mínima si es fijo. */
  readonly discountValue: number;
  readonly target: PromotionTarget;
  readonly minSubtotal?: number;
  readonly minQuantity?: number;
}

/** Lo que hay que saber de un producto para decidir si una promoción lo alcanza. */
export interface ProductoParaPromocion {
  readonly productId: string;
  readonly categoryId?: string;
  readonly collectionIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Vigencia y alcance
// ---------------------------------------------------------------------------

/**
 * Una promoción **de catálogo** se puede mostrar en la PLP y el PDP; una de
 * carrito no.
 *
 * No es una elección de diseño, es una consecuencia de los datos: un mínimo de
 * compra o de cantidad no se puede evaluar en una grilla de productos porque
 * todavía no hay carrito, y un cupón no se puede dar por aplicado antes de que
 * el comprador lo escriba.
 */
export function esDeCatalogo(promo: Promotion): boolean {
  return promo.minSubtotal === undefined && promo.minQuantity === undefined && !promo.code;
}

/**
 * Si la promoción está viva *ahora*.
 *
 * `ahora` entra por parámetro y no se lee del reloj: una función que consulta la
 * hora no se puede testear en sus bordes, que es justo donde fallan las
 * vigencias.
 */
export function vigente(promo: Promotion, ahora: Date): boolean {
  if (promo.status !== 'active') return false;

  const t = ahora.getTime();
  // `startsAt` es inclusivo y `endsAt` exclusivo: una promoción que termina el
  // día 1 a las 00:00 no aplica el día 1. Los dos bordes van con test.
  if (promo.startsAt !== undefined && t < Date.parse(promo.startsAt)) return false;
  if (promo.endsAt !== undefined && t >= Date.parse(promo.endsAt)) return false;

  if (promo.usageLimit !== undefined && promo.usageCount >= promo.usageLimit) return false;

  return true;
}

/** Si el target de la promoción incluye a este producto. */
export function alcanza(promo: Promotion, producto: ProductoParaPromocion): boolean {
  const t = promo.target;
  switch (t.kind) {
    case 'all':
      return true;
    case 'product':
      return t.ids.includes(producto.productId);
    case 'category':
      return producto.categoryId !== undefined && t.ids.includes(producto.categoryId);
    case 'collection':
      return producto.collectionIds.some((id) => t.ids.includes(id));
  }
}

/**
 * Orden de aplicación: prioridad mayor primero, y el id desempata.
 *
 * El desempate por id no es cosmético: sin un orden total, dos promociones con
 * la misma prioridad podrían aplicarse en distinto orden en el catálogo y en el
 * carrito, y con descuentos encadenados eso da precios distintos.
 */
export function ordenarPorPrioridad(promos: readonly Promotion[]): readonly Promotion[] {
  return [...promos].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------

/** Lo que una promoción efectivamente descontó. Es lo que se guarda en el pedido. */
export interface PromocionAplicada {
  readonly promotionId: string;
  readonly title: string;
  readonly code?: string;
  readonly discountType: DiscountType;
  readonly discountValue: number;
  readonly amount: Money;
}

/** El descuento de una promoción sobre un importe, sin encadenar. */
function descuentoSobre(promo: Promotion, base: Money): Money {
  return promo.discountType === 'percentage'
    ? percentageOf(base, promo.discountValue)
    : { amount: Math.min(promo.discountValue, base.amount), currency: base.currency };
}

/**
 * Encadena promociones sobre un importe.
 *
 * **La regla de stackability, en una frase:** se recorren por prioridad; una
 * promoción que no combina se aplica sólo si todavía no se aplicó ninguna, y
 * corta la cadena.
 *
 * De ahí salen los cuatro casos, y los cuatro tienen test:
 * - la más prioritaria no combina → aplica sola;
 * - las dos combinan → se encadenan, la segunda sobre el precio ya rebajado;
 * - la prioritaria combina y la segunda no → la segunda se saltea, porque
 *   declaró que no se suma a otra y respetar eso importa más que descontar más;
 * - ninguna aplica → el importe queda intacto.
 */
export function aplicarCadena(
  base: Money,
  promos: readonly Promotion[],
): { readonly amount: Money; readonly applied: readonly PromocionAplicada[] } {
  let actual = base;
  const applied: PromocionAplicada[] = [];

  for (const promo of ordenarPorPrioridad(promos)) {
    if (!promo.stackable && applied.length > 0) continue;

    const descuento = descuentoSobre(promo, actual);
    if (descuento.amount <= 0) continue;

    actual = subtractMoney(actual, descuento);
    applied.push({
      promotionId: promo.id,
      title: promo.title,
      ...(promo.code ? { code: promo.code } : {}),
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      amount: descuento,
    });

    if (!promo.stackable) break;
  }

  return { amount: actual, applied };
}

/**
 * Precio efectivo de una variante para el catálogo.
 *
 * Devuelve el rebajado en `price` y el de lista en `compareAtPrice`, que es
 * exactamente la forma que la PLP y el PDP ya saben pintar: no hay que tocar
 * ningún componente para que una campaña se vea.
 *
 * `compareAtPrice` sólo viene si hubo descuento. Si la variante ya traía uno
 * propio del catálogo, gana el mayor de los dos: tachar un precio menor que el
 * de lista mostraría un ahorro más chico del real.
 */
export function precioDeCatalogo(
  listPrice: Money,
  compareAtPrice: Money | undefined,
  promos: readonly Promotion[],
  producto: ProductoParaPromocion,
  ahora: Date,
): { readonly price: Money; readonly compareAtPrice?: Money } {
  const aplicables = promos.filter(
    (p) => esDeCatalogo(p) && vigente(p, ahora) && alcanza(p, producto),
  );
  const { amount } = aplicarCadena(listPrice, aplicables);

  if (amount.amount >= listPrice.amount) {
    return compareAtPrice ? { price: listPrice, compareAtPrice } : { price: listPrice };
  }

  const tachado =
    compareAtPrice && compareAtPrice.amount > listPrice.amount ? compareAtPrice : listPrice;
  return { price: amount, compareAtPrice: tachado };
}

// ---------------------------------------------------------------------------
// El Admin
// ---------------------------------------------------------------------------

/** Lo que el formulario manda. Sin `id`: al crear todavía no hay. */
export interface DatosDePromocion {
  readonly title: string;
  readonly status: PromotionStatus;
  readonly priority: number;
  readonly stackable: boolean;
  readonly code?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly usageLimit?: number;
  readonly discountType: DiscountType;
  readonly discountValue: number;
  readonly target: PromotionTarget;
  readonly minSubtotal?: number;
  readonly minQuantity?: number;
}

export interface PaginaPromociones {
  readonly items: readonly Promotion[];
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
}

/**
 * A cuántos productos llega una promoción, con un ejemplo.
 *
 * Es lo que PROJECT.md §15 pide antes de publicar: «modo simulación/preview
 * cuando sea razonable». No es un simulador —es una consulta— y alcanza para lo
 * que el comercio necesita saber, que es si apuntó a lo que creía.
 */
export interface AlcanceDePromocion {
  readonly count: number;
  readonly ejemplo?: { readonly title: string; readonly price: Money };
}

export interface RepositorioPromociones {
  listar(
    storeId: string,
    consulta: { readonly page?: number; readonly perPage?: number },
  ): Promise<PaginaPromociones>;
  porId(storeId: string, id: string): Promise<Promotion | null>;
  guardar(storeId: string, datos: DatosDePromocion, id?: string): Promise<string>;
  alcance(storeId: string, target: PromotionTarget): Promise<AlcanceDePromocion>;

  /** Prender o apagar una campaña sin abrir su formulario. */
  cambiarEstado(storeId: string, id: string, status: PromotionStatus): Promise<void>;

  /**
   * Borrar de verdad, no archivar.
   *
   * Es seguro porque el pedido guarda un **snapshot** de lo que se le aplicó y no
   * una referencia (ADR-092): un pedido de marzo sigue explicando su descuento
   * aunque la campaña ya no exista. Archivar sigue estando para lo otro —dejar de
   * aplicar sin perder la campaña— y son dos intenciones distintas.
   */
  borrar(storeId: string, id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Carrito
// ---------------------------------------------------------------------------

export interface LineaParaPromocion extends ProductoParaPromocion {
  readonly variantId: string;
  /** Precio de lista. El descuento se calcula acá, nunca sobre el subtotal. */
  readonly listUnitPrice: Money;
  readonly quantity: number;
}

export interface LineaConPromociones extends LineaParaPromocion {
  /** Precio unitario después de las promociones de catálogo. */
  readonly unitPrice: Money;
  /** `unitPrice × quantity`. Ver la nota de redondeo en `aplicarAlCarrito`. */
  readonly subtotal: Money;
}

/** Por qué un cupón no se pudo aplicar. El comprador merece saber cuál de las cuatro. */
export type ProblemaDeCupon = 'not_found' | 'not_started' | 'expired' | 'exhausted' | 'minimum';

export interface CarritoConPromociones {
  readonly lines: readonly LineaConPromociones[];
  /** Suma de los precios de lista. Es lo que va a `orders.subtotal_amount`. */
  readonly subtotal: Money;
  readonly discount: Money;
  readonly total: Money;
  readonly applied: readonly PromocionAplicada[];
  readonly couponIssue?: ProblemaDeCupon;
}

/**
 * Lo que el servidor le contesta al carrito sobre dinero.
 *
 * Es lo que devuelve la función `cart_promotions`, que es **la misma que usa
 * `create_order`**: lo que el carrito muestra y lo que el pedido cobra no pueden
 * divergir porque son un solo cálculo, no dos que hay que mantener de acuerdo.
 */
export interface PromocionesDelCarrito {
  readonly lines: readonly {
    readonly variantId: string;
    /** Precio de lista, para tacharlo cuando hay descuento. */
    readonly listUnitPrice: Money;
    readonly unitPrice: Money;
    readonly subtotal: Money;
  }[];
  readonly subtotal: Money;
  readonly discount: Money;
  readonly total: Money;
  readonly applied: readonly PromocionAplicada[];
  readonly couponIssue?: ProblemaDeCupon;
}

/**
 * Resuelve un carrito completo: promociones de catálogo por línea, después las
 * de carrito sobre el subtotal, después el cupón.
 *
 * **El descuento de catálogo se aplica por unidad y recién después se
 * multiplica.** Con un producto de ₲10 al 15 %, por unidad da ₲8 y tres unidades
 * ₲24; sobre el subtotal daría 15 % de ₲30 = ₲5, o sea ₲25. La PLP diría ₲8 cada
 * uno y el carrito cobraría ₲25 por tres. Aplicando por unidad, catálogo,
 * carrito y pedido coinciden por construcción y no por casualidad.
 *
 * El cupón se busca por igualdad exacta, insensible a mayúsculas. Sin prefijos
 * ni coincidencia parcial: sería una forma de descubrir códigos probando.
 */
export function aplicarAlCarrito(
  lineas: readonly LineaParaPromocion[],
  promos: readonly Promotion[],
  ahora: Date,
  codigo?: string,
): CarritoConPromociones {
  const moneda = lineas[0]?.listUnitPrice.currency ?? 'PYG';
  const cero: Money = { amount: 0, currency: moneda };

  // 1. Catálogo, por unidad.
  const deCatalogo = promos.filter((p) => esDeCatalogo(p) && vigente(p, ahora));
  const applied: PromocionAplicada[] = [];

  const lines = lineas.map((linea): LineaConPromociones => {
    const aplicables = deCatalogo.filter((p) => alcanza(p, linea));
    const { amount: unitPrice, applied: enLaLinea } = aplicarCadena(
      linea.listUnitPrice,
      aplicables,
    );

    for (const a of enLaLinea) {
      applied.push({ ...a, amount: multiplyMoney(a.amount, linea.quantity) });
    }

    return { ...linea, unitPrice, subtotal: multiplyMoney(unitPrice, linea.quantity) };
  });

  const subtotal = lines.reduce<Money>(
    (acc, l) => ({
      amount: acc.amount + multiplyMoney(l.listUnitPrice, l.quantity).amount,
      currency: moneda,
    }),
    cero,
  );
  const trasCatalogo = lines.reduce<Money>(
    (acc, l) => ({ amount: acc.amount + l.subtotal.amount, currency: moneda }),
    cero,
  );
  const unidades = lines.reduce((n, l) => n + l.quantity, 0);

  // 2. Promociones de carrito automáticas, sobre lo que quedó.
  const cumpleMinimos = (p: Promotion, base: Money): boolean =>
    (p.minSubtotal === undefined || base.amount >= p.minSubtotal) &&
    (p.minQuantity === undefined || unidades >= p.minQuantity);

  const deCarrito = promos.filter(
    (p) => !esDeCatalogo(p) && !p.code && vigente(p, ahora) && cumpleMinimos(p, trasCatalogo),
  );
  const { amount: trasCarrito, applied: enElCarrito } = aplicarCadena(trasCatalogo, deCarrito);
  applied.push(...enElCarrito);

  // 3. Cupón.
  let total = trasCarrito;
  let couponIssue: ProblemaDeCupon | undefined;

  if (codigo?.trim()) {
    const buscado = codigo.trim().toLowerCase();
    const cupon = promos.find((p) => p.code?.toLowerCase() === buscado);

    if (!cupon || cupon.status !== 'active') {
      couponIssue = 'not_found';
    } else if (cupon.startsAt !== undefined && ahora.getTime() < Date.parse(cupon.startsAt)) {
      couponIssue = 'not_started';
    } else if (cupon.endsAt !== undefined && ahora.getTime() >= Date.parse(cupon.endsAt)) {
      couponIssue = 'expired';
    } else if (cupon.usageLimit !== undefined && cupon.usageCount >= cupon.usageLimit) {
      couponIssue = 'exhausted';
    } else if (!cumpleMinimos(cupon, trasCarrito)) {
      couponIssue = 'minimum';
    } else {
      const descuento = descuentoSobre(cupon, trasCarrito);
      total = subtractMoney(trasCarrito, descuento);
      applied.push({
        promotionId: cupon.id,
        title: cupon.title,
        code: cupon.code!,
        discountType: cupon.discountType,
        discountValue: cupon.discountValue,
        amount: descuento,
      });
    }
  }

  return {
    lines,
    subtotal,
    discount: { amount: subtotal.amount - total.amount, currency: moneda },
    total,
    applied,
    ...(couponIssue ? { couponIssue } : {}),
  };
}
