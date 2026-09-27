import type { CurrencyCode, Money, Product } from '@pick/commerce-types';
import { money } from './money.ts';
import type { SeccionResuelta } from './content.ts';

/** Atributo o campo → valores seleccionados. Una faceta con varios valores es un OR. */
export type CatalogFilters = Readonly<Record<string, readonly string[]>>;

export type CatalogSort =
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'title-asc'
  /** Lo último que entró al catálogo. `relevance` es lo mismo al revés. */
  | 'newest'
  /** Por unidades vendidas, sin contar cancelados. */
  | 'best-selling'
  /**
   * Lo que se está moviendo esta semana, según `product_trending` (ADR-127).
   *
   * **Sólo existe en SQL**: `queryCatalog` recibe productos, no la señal de la
   * tienda, así que no puede ordenar por esto. La paridad de ADR-055 ya quedó
   * acotada a lo que no es el término de búsqueda (ADR-126); esto es lo segundo
   * que vive de un lado solo, y tiene sus tests propios.
   */
  | 'trending'
  /**
   * Lo que se adapta a quien mira: primero sus marcas y categorías, después lo
   * que se está moviendo, y si no hay nada de eso, el orden del catálogo. La
   * cascada entera es un `order by` (ADR-127).
   */
  | 'preferencias';

/**
 * Las marcas y categorías que alguien viene mirando.
 *
 * Es lo que devuelve `visitor_preferences` y lo único que el storefront le pasa
 * al catálogo sobre quién está del otro lado. Vacío —un visitante nuevo, un
 * crawler, alguien con la personalización apagada— es el caso normal, y entonces
 * el orden cae solo al escalón siguiente.
 */
export type PreferenciasDelVisitante = Readonly<Record<string, readonly string[]>>;

export interface CatalogQuery {
  readonly filters?: CatalogFilters;
  readonly sort?: CatalogSort;
  readonly search?: string;
  /** Rango sobre el precio más bajo del producto, en unidades mínimas. */
  readonly precioMin?: number;
  readonly precioMax?: number;
  readonly page?: number;
  readonly perPage?: number;
}

/**
 * Lo que se puede leer de una frase de búsqueda además de las palabras (ADR-137).
 *
 * `terminos` es la frase **sin** lo que se convirtió en filtro: si queda vacía,
 * la búsqueda era sólo un precio y el catálogo se filtra sin término.
 */
export interface ConsultaInterpretada {
  readonly terminos: string;
  /** En unidades mínimas, como `Money`: ya convertido con la moneda de la tienda. */
  readonly precioMin?: number;
  readonly precioMax?: number;
}

/*
 * Las tres formas de nombrar un precio, con las variantes sin acento porque nadie
 * escribe «máximo» con tilde en un buscador. El orden importa: «entre X y Y» tiene
 * que probarse antes que «más de X», que también casaría con su primera mitad.
 */
const NUMERO = String.raw`(\d[\d. ]*(?:,\d+)?)\s*(mil|k)?`;
const ENTRE = new RegExp(String.raw`\bentre\s+${NUMERO}\s+y\s+${NUMERO}`, 'i');
const HASTA = new RegExp(
  String.raw`\b(?:hasta|menos de|menor a|menores a|por debajo de|m[aá]ximo|max)\s+${NUMERO}`,
  'i',
);
const DESDE = new RegExp(
  String.raw`\b(?:desde|m[aá]s de|mayor a|mayores a|arriba de|m[ií]nimo|min)\s+${NUMERO}`,
  'i',
);

/**
 * Un número escrito como lo escribe una persona, en unidades mayores.
 *
 * El punto es separador de miles en es-PY —«200.000»— y la coma es el decimal, al
 * revés que en el `Number` de JavaScript. «200 mil» y «200k» son lo mismo.
 */
function numero(digitos: string, multiplicador: string | undefined): number {
  const limpio = digitos.replace(/[. ]/g, '').replace(',', '.');
  const valor = Number(limpio);
  if (!Number.isFinite(valor)) return Number.NaN;
  return multiplicador === undefined ? valor : valor * 1000;
}

/**
 * Saca el precio de la frase y devuelve el resto.
 *
 * Es el primer escalón de «query understanding» de PROJECT.md §21, y el único que
 * **no** necesita un LLM: «campera hasta 200 mil» es un término más un filtro que
 * el catálogo ya sabe aplicar, y sin esto «hasta», «200» y «mil» entraban como
 * palabras a buscar, donde no coinciden con nada y ensucian la relevancia.
 *
 * Un número suelto no se toca: «campera 500» puede ser un modelo, y adivinar ahí
 * costaría más de lo que arregla.
 */
export function interpretarConsulta(frase: string, moneda: CurrencyCode): ConsultaInterpretada {
  let resto = frase;
  let min: number | undefined;
  let max: number | undefined;

  const entre = ENTRE.exec(resto);
  if (entre) {
    const a = numero(entre[1]!, entre[2]);
    const b = numero(entre[3]!, entre[4]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      min = Math.min(a, b);
      max = Math.max(a, b);
      resto = resto.replace(entre[0], ' ');
    }
  }

  if (max === undefined) {
    const hasta = HASTA.exec(resto);
    if (hasta) {
      const valor = numero(hasta[1]!, hasta[2]);
      if (Number.isFinite(valor)) {
        max = valor;
        resto = resto.replace(hasta[0], ' ');
      }
    }
  }

  if (min === undefined) {
    const desde = DESDE.exec(resto);
    if (desde) {
      const valor = numero(desde[1]!, desde[2]);
      if (Number.isFinite(valor)) {
        min = valor;
        resto = resto.replace(desde[0], ' ');
      }
    }
  }

  return {
    terminos: resto.replace(/\s+/g, ' ').trim(),
    ...(min === undefined ? {} : { precioMin: money(min, moneda).amount }),
    ...(max === undefined ? {} : { precioMax: money(max, moneda).amount }),
  };
}

export interface FacetValue {
  readonly value: string;
  /** Cuántos productos quedarían si se agrega este valor a la selección actual. */
  readonly count: number;
  readonly selected: boolean;
}

export interface Facet {
  readonly name: string;
  readonly values: readonly FacetValue[];
}

export interface CatalogResult {
  readonly items: readonly Product[];
  readonly facets: readonly Facet[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

/**
 * Facetas que salen del producto, no de sus variantes.
 * El resto se proyecta desde los atributos de las variantes.
 */
const BRAND = 'brand';
const CATEGORY = 'categoria';

const DEFAULT_PER_PAGE = 24;

/** Precio más bajo entre las variantes. Es el que se muestra y por el que se ordena. */
export function lowestPrice(product: Product): Money | undefined {
  let lowest: Money | undefined;
  for (const variant of product.variants) {
    if (!lowest || variant.price.amount < lowest.amount) lowest = variant.price;
  }
  return lowest;
}

function valuesFor(product: Product, name: string): string[] {
  if (name === BRAND) return product.brand ? [product.brand] : [];
  if (name === CATEGORY) return product.categoryId ? [product.categoryId] : [];

  const values: string[] = [];
  for (const variant of product.variants) {
    const value = variant.attributes[name];
    if (value !== undefined && !values.includes(value)) values.push(value);
  }
  return values;
}

function matches(product: Product, filters: CatalogFilters, ignore?: string): boolean {
  for (const [name, selected] of Object.entries(filters)) {
    if (name === ignore || selected.length === 0) continue;
    const values = valuesFor(product, name);
    // Varios valores de la misma faceta son un OR; facetas distintas, un AND.
    if (!selected.some((value) => values.includes(value))) return false;
  }
  return true;
}

/**
 * El rango de precio no es una faceta: se aplica a los ítems **y** a los counts
 * de todas las facetas, y nunca se auto-excluye.
 */
function matchesPrecio(product: Product, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  const precio = lowestPrice(product)?.amount;
  if (precio === undefined) return false;
  return (min === undefined || precio >= min) && (max === undefined || precio <= max);
}

function matchesSearch(product: Product, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (needle === '') return true;
  const haystack = [product.title, product.brand ?? '', ...product.variants.map((v) => v.sku)]
    .join(' ')
    .toLocaleLowerCase();
  return needle.split(/\s+/).every((token) => haystack.includes(token));
}

/**
 * Facetas con sus counts.
 *
 * El count de cada faceta se calcula **ignorando su propia selección**, y
 * aplicando la del resto. Es lo que hace que, con "color: Azul" activo, el
 * usuario siga viendo cuántos productos hay en Negro: si se aplicara también el
 * filtro de color, todas las demás opciones darían cero y la faceta quedaría
 * inservible.
 */
export function buildFacets(
  products: readonly Product[],
  filters: CatalogFilters = {},
  search = '',
  precioMin?: number,
  precioMax?: number,
): Facet[] {
  const names: string[] = [];
  for (const product of products) {
    if (product.brand && !names.includes(BRAND)) names.push(BRAND);
    if (product.categoryId && !names.includes(CATEGORY)) names.push(CATEGORY);
    for (const variant of product.variants) {
      for (const name of Object.keys(variant.attributes)) {
        if (!names.includes(name)) names.push(name);
      }
    }
  }

  const facetas = names.map((name) => {
    const counts = new Map<string, number>();
    const order: string[] = [];

    for (const product of products) {
      if (!matchesSearch(product, search)) continue;
      if (!matchesPrecio(product, precioMin, precioMax)) continue;
      if (!matches(product, filters, name)) continue;

      for (const value of valuesFor(product, name)) {
        if (!counts.has(value)) order.push(value);
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }

    const selected = filters[name] ?? [];
    return {
      name,
      values: order.map((value) => ({
        value,
        count: counts.get(value) ?? 0,
        selected: selected.includes(value),
      })),
    };
  });

  // Una faceta sin ningún valor es un accordion vacío: no ayuda a filtrar ni a
  // deshacer nada. La faceta cuyo filtro está activo nunca queda vacía, porque
  // se excluye a sí misma del conteo.
  return facetas.filter((faceta) => faceta.values.length > 0);
}

function compare(a: Product, b: Product, sort: CatalogSort): number {
  if (sort === 'title-asc') return a.title.localeCompare(b.title, 'es');

  if (sort === 'price-asc' || sort === 'price-desc') {
    const pa = lowestPrice(a)?.amount ?? Number.MAX_SAFE_INTEGER;
    const pb = lowestPrice(b)?.amount ?? Number.MAX_SAFE_INTEGER;
    return sort === 'price-asc' ? pa - pb : pb - pa;
  }

  /*
   * Los dos descienden, y lo que falta vale cero, así que cae al final. No se
   * usa `Date.parse(x ?? '')`: eso da `NaN`, la resta también, y el comparador
   * devolvería 0 —«son iguales»— en vez de mandarlo al fondo. Entre los que
   * empatan manda el orden de descubrimiento, porque `sort` es estable.
   */
  if (sort === 'newest') {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  }

  if (sort === 'best-selling') return (b.unitsSold ?? 0) - (a.unitsSold ?? 0);

  return 0;
}

/**
 * Resuelve una consulta de catálogo: filtra, ordena, pagina y calcula facetas.
 *
 * Esta implementación recorre un array porque el catálogo todavía es mock. Lo
 * que importa es el **contrato**: filtros, orden y paginación se resuelven
 * antes de devolver los ítems, nunca en el browser (ADR-024). En Fase 4 el
 * cuerpo pasa a ser una query a Postgres y la firma no cambia.
 */
export function queryCatalog(
  products: readonly Product[],
  query: CatalogQuery = {},
): CatalogResult {
  const {
    filters = {},
    sort = 'relevance',
    search = '',
    precioMin,
    precioMax,
    page = 1,
    perPage = DEFAULT_PER_PAGE,
  } = query;

  const filtered = products.filter(
    (p) =>
      matchesSearch(p, search) && matchesPrecio(p, precioMin, precioMax) && matches(p, filters),
  );
  const sorted =
    sort === 'relevance' ? filtered : [...filtered].sort((a, b) => compare(a, b, sort));

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  // Una página fuera de rango devuelve la última con resultados, no una vacía:
  // pasa al quitar filtros estando en la página 5.
  const safePage = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const start = (safePage - 1) * perPage;

  return {
    items: sorted.slice(start, start + perPage),
    facets: buildFacets(products, filters, search, precioMin, precioMax),
    total,
    page: safePage,
    perPage,
    pageCount,
  };
}

// --- Puerto del catálogo ------------------------------------------------------

/** Resultado de una consulta más el rango de precios de la tienda. */
export interface ResultadoCatalogo extends CatalogResult {
  /** Mínimo y máximo del catálogo entero, para armar los buckets de precio. */
  readonly priceMin: number | null;
  readonly priceMax: number | null;
}

export interface CategoriaCatalogo {
  /**
   * El Admin lo necesita para guardar: `products.category_id` es un UUID. La
   * faceta del storefront, en cambio, viaja por slug, que es lo que aparece en
   * la URL. No son intercambiables.
   */
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly image?: {
    readonly url: string;
    readonly alt: string;
    readonly width: number;
    readonly height: number;
  };
}

/** Faceta que la tienda declaró filtrable. Ver PROJECT.md §35. */
export interface DefinicionFaceta {
  readonly name: string;
  readonly label: string;
  readonly position: number;
}

/**
 * Contrato de acceso al catálogo. El adapter lo implementa contra Postgres.
 *
 * Es asíncrono mientras `queryCatalog` sigue siendo síncrono a propósito: esa
 * función queda como **especificación ejecutable** de la semántica, y los tests
 * comparan la implementación real contra ella. Ver ADR-055.
 */
export interface RepositorioCatalogo {
  buscar(storeId: string, query: CatalogQuery): Promise<ResultadoCatalogo>;
  porHandle(storeId: string, handle: string): Promise<Product | null>;
  /**
   * Productos de una colección manual, por handle.
   *
   * La home los usa para su carrusel. Una colección **dinámica** no pasa por
   * acá: sus `rules` tienen la forma de `CatalogFilters` y se resuelven con
   * `buscar`. Ver ADR-056.
   */
  /**
   * Los productos de una colección, manual o dinámica.
   *
   * `sort` va explícito y no lo deduce el SQL de la colección: que una consulta
   * cambie de orden según un dato que el llamador no ve es lo que hace difícil
   * de seguir una función. La colección declara su orden y el storefront lo pasa.
   */
  porColeccion(
    storeId: string,
    handle: string,
    limite: number,
    sort?: CatalogSort,
    /** Sólo lo usa el orden «preferencias». Vacío es el caso normal. */
    prefiere?: PreferenciasDelVisitante,
  ): Promise<readonly Product[]>;

  /**
   * La home entera, ya resuelta y en orden.
   *
   * Devuelve las secciones con su contenido dentro —piezas del hero, mosaicos,
   * productos de cada carrusel— en vez de una lista que el storefront tenga que
   * completar. Así la página dibuja y no decide, y cualquier storefront que use
   * el Core obtiene la misma home sin repetir la orquestación.
   */
  home(
    storeId: string,
    /**
     * Lo que viene mirando quien pide la portada. Va acá y no adentro del
     * adapter porque el dispositivo lo conoce el Worker —lee la cookie— y no la
     * base.
     */
    prefiere?: PreferenciasDelVisitante,
  ): Promise<readonly SeccionResuelta[]>;
  categorias(storeId: string): Promise<readonly CategoriaCatalogo[]>;
  /** Sólo las declaradas `filterable`: es lo que decide qué facetas ve la PLP. */
  facetasFiltrables(storeId: string): Promise<readonly DefinicionFaceta[]>;
}

// ---------------------------------------------------------------------------
// Reseñas (ADR-140)
// ---------------------------------------------------------------------------

/**
 * Una reseña publicada, como la ve la vitrina.
 *
 * `inicial` y no el nombre: publicar el nombre completo de un comprador en una
 * página pública no es algo que nadie haya aceptado al comprar.
 */
export interface ResenaPublica {
  readonly id: string;
  readonly rating: number;
  readonly body: string | null;
  readonly inicial: string | null;
  readonly fecha: string;
}

/** Lo que el PDP necesita para dibujar las reseñas de un producto. */
export interface ResenasDeProducto {
  readonly total: number;
  /** Con una decimal, o `null` si no hay ninguna publicada. */
  readonly promedio: number | null;
  readonly items: readonly ResenaPublica[];
}

/** Las estrellas, como texto, para el rótulo accesible de un promedio. */
export function textoDeEstrellas(promedio: number | null, total: number): string {
  if (promedio === null || total === 0) return 'Todavía no tiene reseñas';
  return `${promedio} de 5, sobre ${total} ${total === 1 ? 'reseña' : 'reseñas'}`;
}
