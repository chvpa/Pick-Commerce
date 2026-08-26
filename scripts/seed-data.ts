import { mockCategories, mockProducts } from '../apps/demo/src/lib/mock-catalog.ts';

/**
 * Datos del storefront de demostración.
 *
 * Toma los productos del mock que hoy consume el demo: una sola fuente mientras
 * las dos cosas coexisten. Cuando el storefront lea de la base, el contenido se
 * muda acá y el mock desaparece.
 *
 * Reproducirlo **exactamente** no es capricho: los tests de navegación afirman
 * "2 productos" para color Negro y "Gs. 389.000" para la campera. Si el seed
 * inventara datos, esos números dejarían de significar algo.
 */

/** UUIDs fijos: el seed es idempotente por clave primaria, sin lookups. */
export const IDS = {
  tenant: '5eed0000-0000-4000-8000-000000000001',
  store: '5eed0000-0000-4000-8000-000000000002',
  location: '5eed0000-0000-4000-8000-000000000003',
  coleccionManual: '5eed0000-0000-4000-8000-000000000004',
  coleccionDinamica: '5eed0000-0000-4000-8000-000000000005',
} as const;

function uuid(prefijo: string, n: number): string {
  // El primer segmento son 8 caracteres hexadecimales: `5eed` más el prefijo
  // de dos que identifica la tabla, completado con ceros.
  return `5eed${prefijo.padEnd(4, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const ORGANIZACION = { id: IDS.tenant, name: 'Pick Demo', slug: 'pick-demo' };

export const TIENDA = {
  id: IDS.store,
  tenant_id: IDS.tenant,
  name: 'Pick Demo',
  slug: 'principal',
  // Es lo que resuelve el tenant en runtime. Debe coincidir con el dominio que
  // el storefront declara en su configuración.
  domain: 'pick-demo.pages.dev',
  currency: 'PYG',
  locale: 'es-PY',
};

export const SUCURSAL = {
  id: IDS.location,
  tenant_id: IDS.tenant,
  store_id: IDS.store,
  name: 'Depósito central',
  is_pickup_point: false,
};

export const CATEGORIAS = mockCategories.map((c, i) => ({
  id: uuid('c1', i),
  tenant_id: IDS.tenant,
  store_id: IDS.store,
  name: c.label,
  // El href del mock es `/catalogo?categoria=<slug>`; el slug es lo que el
  // producto referencia y lo que viaja en la URL.
  slug: new URL(c.href, 'https://x').searchParams.get('categoria')!,
  position: i,
  image: c.image,
}));

/**
 * Definiciones de atributos con sus flags (PROJECT.md §35).
 *
 * `genero` se declara sin que ninguna variante lo use todavía: la definición
 * existe, la faceta aparece cuando haya productos que la declaren. Es lo que
 * cierra el ítem de género sin inventar datos en el catálogo.
 */
export const ATRIBUTOS = [
  {
    id: uuid('a1', 0),
    name: 'color',
    label: 'Color',
    position: 0,
    filterable: true,
    searchable: false,
    sortable: false,
    visible_pdp: true,
    visible_card: true,
  },
  {
    id: uuid('a1', 1),
    name: 'size',
    label: 'Talle',
    position: 1,
    filterable: true,
    searchable: false,
    sortable: false,
    visible_pdp: true,
    visible_card: false,
  },
  {
    id: uuid('a1', 2),
    name: 'genero',
    label: 'Género',
    position: 2,
    filterable: true,
    searchable: false,
    sortable: false,
    visible_pdp: true,
    visible_card: false,
  },
].map((a) => ({ ...a, tenant_id: IDS.tenant, store_id: IDS.store, category_id: null }));

const slugDeCategoria = new Map(CATEGORIAS.map((c) => [c.slug, c.id]));

/**
 * Productos, variantes, media e inventario derivados del mock.
 *
 * Los `created_at` son crecientes y explícitos: fijan el orden de "relevance" y
 * el de descubrimiento de facetas. Sin ellos el orden dependería del plan de
 * ejecución de Postgres y los tests serían intermitentes.
 */
export const PRODUCTOS = mockProducts.map((p, i) => ({
  id: uuid('d1', i),
  tenant_id: IDS.tenant,
  store_id: IDS.store,
  handle: p.handle,
  title: p.title,
  description: p.description ?? null,
  brand: p.brand ?? null,
  category_id: p.categoryId ? (slugDeCategoria.get(p.categoryId) ?? null) : null,
  status: 'active',
  created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
}));

export const VARIANTES = mockProducts.flatMap((p, i) =>
  p.variants.map((v, j) => ({
    id: uuid('e1', i * 100 + j),
    tenant_id: IDS.tenant,
    product_id: uuid('d1', i),
    sku: v.sku,
    barcode: v.barcode ?? null,
    title: v.title,
    position: j,
    price: v.price.amount,
    currency: v.price.currency,
    compare_at_price: v.compareAtPrice?.amount ?? null,
    cost: v.cost?.amount ?? null,
    attributes: v.attributes,
  })),
);

export const MEDIA = mockProducts.flatMap((p, i) =>
  p.images.map((img, j) => ({
    id: uuid('f1', i * 100 + j),
    tenant_id: IDS.tenant,
    product_id: uuid('d1', i),
    url: img.url,
    alt: img.alt,
    width: img.width,
    height: img.height,
    position: j,
  })),
);

export const INVENTARIO = mockProducts.flatMap((p, i) =>
  p.variants.map((v, j) => ({
    id: uuid('01', i * 100 + j),
    tenant_id: IDS.tenant,
    variant_id: uuid('e1', i * 100 + j),
    location_id: IDS.location,
    available: v.availableQuantity,
  })),
);

/** Una manual y una dinámica: la dinámica es una consulta guardada. */
export const COLECCIONES = [
  {
    id: IDS.coleccionManual,
    tenant_id: IDS.tenant,
    store_id: IDS.store,
    title: 'Ofertas',
    handle: 'ofertas',
    rules: null,
  },
  {
    id: IDS.coleccionDinamica,
    tenant_id: IDS.tenant,
    store_id: IDS.store,
    title: 'Marca Norte',
    handle: 'norte',
    // La forma es exactamente `CatalogFilters`: la resuelve el mismo
    // `catalog_search` que la PLP.
    rules: { brand: ['Norte'] },
  },
];

/** La colección manual lista los productos que están en oferta. */
export const COLECCION_PRODUCTOS = mockProducts
  .map((p, i) => ({ p, i }))
  .filter(({ p }) => p.variants.some((v) => v.compareAtPrice))
  .map(({ i }, orden) => ({
    tenant_id: IDS.tenant,
    collection_id: IDS.coleccionManual,
    product_id: uuid('d1', i),
    position: orden,
  }));

/** Configuración de moneda de la tienda (PROJECT.md §33). */
export const CONFIGURACION = {
  store_id: IDS.store,
  tenant_id: IDS.tenant,
  settings: {
    currency: {
      base: 'PYG',
      enabled: false,
      displayCurrencies: ['PYG'],
      checkoutCurrency: 'PYG',
      rounding: 'commerce-default',
    },
  },
};
