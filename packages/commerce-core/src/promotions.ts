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
 *
 * v3 sumó siete tipos (ADR-164): cada uno es un `kind` con sus parámetros en
 * `rules`, y su semántica es una función de este archivo, no una regla
 * interpretada.
 */

/** Se archiva, no se borra: un pedido viejo tiene que poder explicar su descuento. */
export type PromotionStatus = 'draft' | 'active' | 'archived';

export type DiscountType = 'percentage' | 'fixed';

/**
 * De qué tipo es la promoción (ADR-164). `discount` es la de siempre —porcentaje
 * o monto, con `discountType` y `discountValue`—; las demás guardan lo suyo en
 * `rules`.
 */
export type PromotionKind =
  | 'discount'
  | 'buy_x_pay_y'
  | 'second_unit'
  | 'quantity'
  | 'tiered'
  | 'gift'
  | 'bundle'
  | 'free_shipping';

/** Los tipos que pueden ser cupón: el resto sólo existe automático. */
export const TIPOS_CON_CUPON: readonly PromotionKind[] = ['discount', 'free_shipping'];

/**
 * Los parámetros de cada tipo, en un solo objeto plano: es el jsonb de la
 * columna `rules`. Los porcentajes van en puntos básicos, como `discountValue`.
 *
 * Un parámetro que falta o no tiene sentido hace que la promoción **no
 * aplique**: el lado seguro de un error de configuración es no regalar nada.
 * Que no se pueda guardar así es trabajo del formulario.
 */
export interface PromotionRules {
  /** `buy_x_pay_y`: lleva `buy`, paga `pay`. `gift`: unidades que hay que comprar. */
  readonly buy?: number;
  readonly pay?: number;
  /** `second_unit`: el descuento de la segunda unidad. */
  readonly percent?: number;
  /**
   * `quantity`: desde `minQuantity` unidades, `percent`.
   * `tiered`: hasta `upTo` de compra, `percent`; el último va sin `upTo`.
   */
  readonly tiers?: readonly {
    readonly minQuantity?: number;
    readonly upTo?: number;
    readonly percent: number;
  }[];
  /** `quantity`: si suman unidades de productos distintos. */
  readonly mix?: boolean;
  /** `bundle`: cuántos productos distintos de la colección. */
  readonly count?: number;
  /** `bundle`: qué se lleva quien lo arma. */
  readonly benefit?: 'percent' | 'fixed' | 'free_shipping' | 'gift';
  /** `bundle`: puntos básicos con `percent`, monto por unidad con `fixed`. */
  readonly value?: number;
  /** `gift` y `bundle` con regalo. */
  readonly giftVariantId?: string;
  readonly giftQuantity?: number;
  /** `free_shipping`: las zonas. Ausente es todo el país. */
  readonly zones?: readonly string[];
}

/** A qué productos alcanza. `all` es toda la tienda. */
export type PromotionTarget =
  | { readonly kind: 'all' }
  | { readonly kind: 'category'; readonly ids: readonly string[] }
  | { readonly kind: 'collection'; readonly ids: readonly string[] }
  | { readonly kind: 'product'; readonly ids: readonly string[] };

export interface Promotion {
  readonly id: string;
  readonly title: string;
  readonly kind: PromotionKind;
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
  /** Sólo `discount`. */
  readonly discountType?: DiscountType;
  /** Puntos básicos si es porcentaje (1500 = 15 %); unidad mínima si es fijo. */
  readonly discountValue?: number;
  readonly rules?: PromotionRules;
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
 * el comprador lo escriba. Un 3x2 o un regalo, tampoco: dependen de lo que hay
 * en el carrito igual que un mínimo.
 */
export function esDeCatalogo(promo: Promotion): boolean {
  return (
    promo.kind === 'discount' &&
    promo.minSubtotal === undefined &&
    promo.minQuantity === undefined &&
    !promo.code
  );
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
  readonly kind: PromotionKind;
  readonly code?: string;
  readonly discountType?: DiscountType;
  readonly discountValue?: number;
  /** Cero en un regalo o un envío gratis: lo que dan no es un descuento. */
  readonly amount: Money;
}

/** El descuento de una promoción sobre un importe, sin encadenar. */
function descuentoSobre(promo: Promotion, base: Money): Money {
  const valor = promo.discountValue ?? 0;
  return promo.discountType === 'percentage'
    ? percentageOf(base, valor)
    : { amount: Math.min(valor, base.amount), currency: base.currency };
}

function aplicada(promo: Promotion, amount: Money): PromocionAplicada {
  return {
    promotionId: promo.id,
    title: promo.title,
    kind: promo.kind,
    ...(promo.code ? { code: promo.code } : {}),
    ...(promo.discountType ? { discountType: promo.discountType } : {}),
    ...(promo.discountValue !== undefined ? { discountValue: promo.discountValue } : {}),
    amount,
  };
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
    applied.push(aplicada(promo, descuento));

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
  readonly kind: PromotionKind;
  readonly status: PromotionStatus;
  readonly priority: number;
  readonly stackable: boolean;
  readonly code?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly usageLimit?: number;
  readonly discountType?: DiscountType;
  readonly discountValue?: number;
  readonly rules?: PromotionRules;
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

/** Una variante que se puede regalar, con su stock para decidir. */
export interface VarianteParaRegalar {
  readonly variantId: string;
  readonly title: string;
  readonly variantTitle?: string;
  readonly sku: string;
  readonly stock: number;
}

export interface RepositorioPromociones {
  listar(
    storeId: string,
    consulta: { readonly page?: number; readonly perPage?: number },
  ): Promise<PaginaPromociones>;
  porId(storeId: string, id: string): Promise<Promotion | null>;
  guardar(storeId: string, datos: DatosDePromocion, id?: string): Promise<string>;
  alcance(storeId: string, target: PromotionTarget): Promise<AlcanceDePromocion>;

  /**
   * Variantes de la tienda por el nombre del producto, para elegir un regalo. Veinte como
   * mucho: es un buscador, no una lista. Incluye las no publicadas, porque un
   * regalo suele ser algo que no se vende (ADR-164).
   */
  variantesParaRegalar(storeId: string, texto: string): Promise<readonly VarianteParaRegalar[]>;
  /** La variante elegida, para mostrar su nombre al editar. */
  varianteParaRegalar(storeId: string, variantId: string): Promise<VarianteParaRegalar | null>;

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

/** Por qué un cupón no se pudo aplicar. El comprador merece saber cuál. */
export type ProblemaDeCupon =
  | 'not_found'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'minimum'
  /** Un envío gratis que no llega a la zona elegida, o todavía no hay zona. */
  | 'zone';

/** Una línea a precio cero que agrega una promoción. Descuenta stock como cualquiera. */
export interface RegaloAplicado {
  readonly promotionId: string;
  readonly variantId: string;
  readonly quantity: number;
}

/** Lo que el carrito sabe además de sus líneas. */
export interface ContextoDelCarrito {
  /** La zona de envío elegida, si ya se eligió. */
  readonly zona?: string;
  /** Unidades disponibles de cada variante que se regala. Sin dato, no hay. */
  readonly stockDeRegalos?: Readonly<Record<string, number>>;
}

export interface CarritoConPromociones {
  readonly lines: readonly LineaConPromociones[];
  /** Suma de los precios de lista. Es lo que va a `orders.subtotal_amount`. */
  readonly subtotal: Money;
  readonly discount: Money;
  readonly total: Money;
  readonly applied: readonly PromocionAplicada[];
  readonly gifts: readonly RegaloAplicado[];
  /** Una promoción o un cupón dejan el envío en cero. */
  readonly freeShipping: boolean;
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
  readonly gifts: readonly RegaloAplicado[];
  readonly freeShipping: boolean;
  readonly couponIssue?: ProblemaDeCupon;
}

/**
 * Resuelve un carrito completo: promociones de catálogo por línea, después las
 * de carrito, después el cupón.
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
  contexto: ContextoDelCarrito = {},
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
  const unidadesDelCarrito = lines.reduce((n, l) => n + l.quantity, 0);

  const cumpleMinimos = (p: Promotion, base: Money): boolean =>
    (p.minSubtotal === undefined || base.amount >= p.minSubtotal) &&
    (p.minQuantity === undefined || unidadesDelCarrito >= p.minQuantity);

  /*
   * 2. Promociones de carrito automáticas, por prioridad y con la misma regla de
   * stackability que el catálogo: una que no combina aplica sólo si todavía no
   * aplicó ninguna, y corta.
   *
   * El descuento de siempre se encadena sobre lo que va quedando. Los tipos
   * nuevos se calculan sobre los precios **después del catálogo** —un 3x2 regala
   * la unidad más barata a su precio de vidriera— y se topan en lo que queda:
   * el total nunca baja de cero (ADR-164).
   */
  const gifts: RegaloAplicado[] = [];
  let freeShipping = false;
  let actual = trasCatalogo;
  let aplicoAlguna = false;

  const automaticas = ordenarPorPrioridad(
    promos.filter(
      (p) => !esDeCatalogo(p) && !p.code && vigente(p, ahora) && cumpleMinimos(p, trasCatalogo),
    ),
  );

  for (const promo of automaticas) {
    if (!promo.stackable && aplicoAlguna) continue;

    const b = beneficio(promo, lines, actual, contexto, gifts);
    if (!b) continue;

    actual = subtractMoney(actual, b.amount);
    applied.push(aplicada(promo, b.amount));
    if (b.gift) gifts.push(b.gift);
    if (b.freeShipping) freeShipping = true;
    aplicoAlguna = true;

    if (!promo.stackable) break;
  }

  // 3. Cupón: un descuento o un envío gratis.
  let total = actual;
  let couponIssue: ProblemaDeCupon | undefined;

  if (codigo?.trim()) {
    const buscado = codigo.trim().toLowerCase();
    const cupon = promos.find((p) => p.code?.toLowerCase() === buscado);

    if (!cupon || cupon.status !== 'active' || !TIPOS_CON_CUPON.includes(cupon.kind)) {
      couponIssue = 'not_found';
    } else if (cupon.startsAt !== undefined && ahora.getTime() < Date.parse(cupon.startsAt)) {
      couponIssue = 'not_started';
    } else if (cupon.endsAt !== undefined && ahora.getTime() >= Date.parse(cupon.endsAt)) {
      couponIssue = 'expired';
    } else if (cupon.usageLimit !== undefined && cupon.usageCount >= cupon.usageLimit) {
      couponIssue = 'exhausted';
    } else if (!cumpleMinimos(cupon, actual)) {
      couponIssue = 'minimum';
    } else if (cupon.kind === 'free_shipping') {
      if (llegaALaZona(cupon, contexto.zona)) {
        freeShipping = true;
        applied.push(aplicada(cupon, cero));
      } else {
        couponIssue = 'zone';
      }
    } else {
      const descuento = descuentoSobre(cupon, actual);
      total = subtractMoney(actual, descuento);
      applied.push(aplicada(cupon, descuento));
    }
  }

  return {
    lines,
    subtotal,
    discount: { amount: subtotal.amount - total.amount, currency: moneda },
    total,
    applied,
    gifts,
    freeShipping,
    ...(couponIssue ? { couponIssue } : {}),
  };
}

// ---------------------------------------------------------------------------
// Los tipos de carrito (ADR-164)
// ---------------------------------------------------------------------------

interface Beneficio {
  readonly amount: Money;
  readonly gift?: RegaloAplicado;
  readonly freeShipping?: boolean;
}

/** Las unidades de las líneas, una por una, de la más barata a la más cara. */
function unidades(lineas: readonly LineaConPromociones[]): number[] {
  return lineas
    .flatMap((l) => Array.from({ length: l.quantity }, () => l.unitPrice.amount))
    .sort((a, b) => a - b);
}

/** Las líneas agrupadas por producto: un 3x2 cuenta talles distintos de la misma media. */
function porProducto(lineas: readonly LineaConPromociones[]): LineaConPromociones[][] {
  const grupos = new Map<string, LineaConPromociones[]>();
  for (const l of lineas) grupos.set(l.productId, [...(grupos.get(l.productId) ?? []), l]);
  return [...grupos.values()];
}

function entero(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) > 0;
}

function porcentaje(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 10_000;
}

/** Si un envío gratis llega a esta zona. Sin lista, llega a todas. */
function llegaALaZona(promo: Promotion, zona: string | undefined): boolean {
  const zonas = promo.rules?.zones;
  if (!zonas || zonas.length === 0) return true;
  const buscada = zona?.trim().toLowerCase();
  return buscada !== undefined && zonas.some((z) => z.trim().toLowerCase() === buscada);
}

/**
 * Un regalo, si hay con qué darlo. Se descuenta lo que el carrito ya lleva de
 * esa variante y lo que ya se regaló: si no alcanza, la promoción no aplica —se
 * pausa sola— en vez de prometer algo que el depósito no tiene.
 */
function regalo(
  promo: Promotion,
  lineas: readonly LineaConPromociones[],
  contexto: ContextoDelCarrito,
  yaRegalado: readonly RegaloAplicado[],
): RegaloAplicado | undefined {
  const { giftVariantId, giftQuantity } = promo.rules ?? {};
  if (!giftVariantId || !entero(giftQuantity)) return undefined;
  const comprometido =
    lineas.filter((l) => l.variantId === giftVariantId).reduce((n, l) => n + l.quantity, 0) +
    yaRegalado.filter((g) => g.variantId === giftVariantId).reduce((n, g) => n + g.quantity, 0);
  const disponible = (contexto.stockDeRegalos?.[giftVariantId] ?? 0) - comprometido;
  if (disponible < giftQuantity) return undefined;
  return { promotionId: promo.id, variantId: giftVariantId, quantity: giftQuantity };
}

/** Lo que da una promoción de carrito, o nada si no aplica. */
function beneficio(
  promo: Promotion,
  lineas: readonly LineaConPromociones[],
  actual: Money,
  contexto: ContextoDelCarrito,
  yaRegalado: readonly RegaloAplicado[],
): Beneficio | undefined {
  const moneda = actual.currency;
  const cero: Money = { amount: 0, currency: moneda };
  const r = promo.rules ?? {};
  const alcanzadas = lineas.filter((l) => alcanza(promo, l));
  const pct = (precio: number, puntos: number) =>
    percentageOf({ amount: precio, currency: moneda }, puntos).amount;
  /** Un descuento calculado, topado en lo que queda. Cero no es un beneficio. */
  const dinero = (monto: number): Beneficio | undefined => {
    const tope = Math.min(monto, actual.amount);
    return tope > 0 ? { amount: { amount: tope, currency: moneda } } : undefined;
  };

  switch (promo.kind) {
    case 'discount': {
      const d = descuentoSobre(promo, actual);
      return d.amount > 0 ? { amount: d } : undefined;
    }

    // Por producto: cada `buy` unidades, las `buy - pay` más baratas son gratis.
    case 'buy_x_pay_y': {
      const { buy, pay } = r;
      if (!entero(buy) || !entero(pay) || pay >= buy) return undefined;
      let monto = 0;
      for (const grupo of porProducto(alcanzadas)) {
        const u = unidades(grupo);
        const gratis = Math.floor(u.length / buy) * (buy - pay);
        monto += u.slice(0, gratis).reduce((a, b) => a + b, 0);
      }
      return dinero(monto);
    }

    // Por producto: de cada par, la más barata lleva el descuento.
    case 'second_unit': {
      const { percent } = r;
      if (!porcentaje(percent)) return undefined;
      let monto = 0;
      for (const grupo of porProducto(alcanzadas)) {
        const u = unidades(grupo);
        for (const precio of u.slice(0, Math.floor(u.length / 2))) monto += pct(precio, percent);
      }
      return dinero(monto);
    }

    /*
     * El escalón más alto que se alcanza, sobre todas las unidades. Sin `mix`,
     * cuenta cada producto por separado. Con `mix` se suman las unidades de
     * todos, y la más cara se cobra entera: es lo que el formulario promete.
     */
    case 'quantity': {
      const escalones = (r.tiers ?? []).filter(
        (t) => entero(t.minQuantity) && porcentaje(t.percent),
      );
      if (escalones.length === 0) return undefined;
      const escalon = (n: number) =>
        escalones
          .filter((t) => t.minQuantity! <= n)
          .sort((a, b) => b.minQuantity! - a.minQuantity!)[0]?.percent ?? 0;
      const sobre = (precios: readonly number[], puntos: number) =>
        precios.reduce((a, precio) => a + pct(precio, puntos), 0);

      let monto = 0;
      if (r.mix) {
        const u = unidades(alcanzadas);
        monto = sobre(u.slice(0, -1), escalon(u.length));
      } else {
        for (const grupo of porProducto(alcanzadas)) {
          const u = unidades(grupo);
          monto += sobre(u, escalon(u.length));
        }
      }
      return dinero(monto);
    }

    // El escalón donde cae lo alcanzado: más que el tope del anterior, hasta el suyo.
    case 'tiered': {
      const escalones = r.tiers ?? [];
      if (escalones.length === 0 || !escalones.every((t) => porcentaje(t.percent))) {
        return undefined;
      }
      const base = alcanzadas.reduce((a, l) => a + l.subtotal.amount, 0);
      let puntos = 0;
      escalones.forEach((t, i) => {
        const desde = i === 0 ? 0 : (escalones[i - 1]!.upTo ?? Infinity);
        if (base > desde) puntos = t.percent;
      });
      return dinero(pct(base, puntos));
    }

    case 'gift': {
      const comprado = alcanzadas.reduce((n, l) => n + l.quantity, 0);
      if (!entero(r.buy) || comprado < r.buy) return undefined;
      const g = regalo(promo, lineas, contexto, yaRegalado);
      return g ? { amount: cero, gift: g } : undefined;
    }

    // Productos **distintos** de la colección: un bundle no se arma con tres iguales.
    case 'bundle': {
      const distintos = new Set(alcanzadas.map((l) => l.productId)).size;
      if (!entero(r.count) || r.count < 2 || distintos < r.count) return undefined;
      const { value } = r;
      switch (r.benefit) {
        case 'percent':
          if (!porcentaje(value)) return undefined;
          return dinero(
            alcanzadas.reduce((a, l) => a + pct(l.unitPrice.amount, value) * l.quantity, 0),
          );
        case 'fixed':
          if (!entero(value)) return undefined;
          return dinero(
            alcanzadas.reduce((a, l) => a + Math.min(value, l.unitPrice.amount) * l.quantity, 0),
          );
        case 'free_shipping':
          return { amount: cero, freeShipping: true };
        case 'gift': {
          const g = regalo(promo, lineas, contexto, yaRegalado);
          return g ? { amount: cero, gift: g } : undefined;
        }
        default:
          return undefined;
      }
    }

    case 'free_shipping':
      return llegaALaZona(promo, contexto.zona) ? { amount: cero, freeShipping: true } : undefined;
  }
}
