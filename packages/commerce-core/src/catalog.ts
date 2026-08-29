import type { Money, Product } from '@pick/commerce-types';
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
  | 'best-selling';

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
  ): Promise<readonly Product[]>;

  /**
   * La home entera, ya resuelta y en orden.
   *
   * Devuelve las secciones con su contenido dentro —piezas del hero, mosaicos,
   * productos de cada carrusel— en vez de una lista que el storefront tenga que
   * completar. Así la página dibuja y no decide, y cualquier storefront que use
   * el Core obtiene la misma home sin repetir la orquestación.
   */
  home(storeId: string): Promise<readonly SeccionResuelta[]>;
  categorias(storeId: string): Promise<readonly CategoriaCatalogo[]>;
  /** Sólo las declaradas `filterable`: es lo que decide qué facetas ve la PLP. */
  facetasFiltrables(storeId: string): Promise<readonly DefinicionFaceta[]>;
}
