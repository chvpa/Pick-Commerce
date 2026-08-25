import type { Money, Product } from '@pick/commerce-types';

/** Atributo o campo → valores seleccionados. Una faceta con varios valores es un OR. */
export type CatalogFilters = Readonly<Record<string, readonly string[]>>;

export type CatalogSort = 'relevance' | 'price-asc' | 'price-desc' | 'title-asc';

export interface CatalogQuery {
  readonly filters?: CatalogFilters;
  readonly sort?: CatalogSort;
  readonly search?: string;
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

  return names.map((name) => {
    const counts = new Map<string, number>();
    const order: string[] = [];

    for (const product of products) {
      if (!matchesSearch(product, search)) continue;
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
}

function compare(a: Product, b: Product, sort: CatalogSort): number {
  if (sort === 'title-asc') return a.title.localeCompare(b.title, 'es');

  if (sort === 'price-asc' || sort === 'price-desc') {
    const pa = lowestPrice(a)?.amount ?? Number.MAX_SAFE_INTEGER;
    const pb = lowestPrice(b)?.amount ?? Number.MAX_SAFE_INTEGER;
    return sort === 'price-asc' ? pa - pb : pb - pa;
  }

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
    page = 1,
    perPage = DEFAULT_PER_PAGE,
  } = query;

  const filtered = products.filter((p) => matchesSearch(p, search) && matches(p, filters));
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
    facets: buildFacets(products, filters, search),
    total,
    page: safePage,
    perPage,
    pageCount,
  };
}
