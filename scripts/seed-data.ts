import { money } from '@pick/commerce-core';
import type { Product } from '@pick/commerce-types';

/**
 * Catálogo de la tienda de demostración.
 *
 * Es la fuente única desde que el storefront lee de la base: antes estos datos
 * vivían en `apps/demo/src/lib/mock-catalog.ts`, que ya no existe.
 *
 * Los valores no son decorativos. Los tests de navegación afirman "2 productos"
 * para color Negro y "Gs. 389.000" para la campera; si el seed cambiara esos
 * números, los tests dejarían de significar algo.
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

const TENANT = { tenantId: IDS.tenant, storeId: IDS.store } as const;

/** Categorías, con la imagen que muestra la home. `slug` es lo que viaja en la URL. */
const CATALOGO_CATEGORIAS = [
  {
    name: 'Camperas',
    slug: 'camperas',
    image: { url: '/products/campera.jpg', alt: '', width: 900, height: 1200 },
  },
  {
    name: 'Calzado',
    slug: 'calzado',
    image: { url: '/products/zapatilla.jpg', alt: '', width: 900, height: 1200 },
  },
  {
    name: 'Remeras',
    slug: 'remeras',
    image: { url: '/products/remera.jpg', alt: '', width: 900, height: 1200 },
  },
  {
    name: 'Accesorios',
    slug: 'accesorios',
    image: { url: '/products/campera-3.jpg', alt: '', width: 900, height: 1200 },
  },
] as const;

const CATALOGO: readonly Product[] = [
  {
    ...TENANT,
    id: 'p1',
    handle: 'campera-cortaviento',
    categoryId: 'camperas',
    title: 'Campera cortaviento',
    status: 'active',
    brand: 'Norte',
    images: [
      { url: '/products/campera.jpg', alt: 'Campera cortaviento azul', width: 900, height: 1200 },
      {
        url: '/products/campera-2.jpg',
        alt: 'Campera cortaviento azul, vista de espalda',
        width: 900,
        height: 1200,
      },
      {
        url: '/products/campera-3.jpg',
        alt: 'Campera cortaviento azul, detalle del cuello',
        width: 900,
        height: 1200,
      },
    ],
    variants: [
      {
        id: 'v1',
        sku: 'NRT-CAM-001-AZ-M',
        title: 'Azul / M',
        price: money(389000, 'PYG'),
        compareAtPrice: money(550000, 'PYG'),
        availableQuantity: 4,
        attributes: { color: 'Azul', size: 'M' },
      },
      {
        id: 'v1b',
        sku: 'NRT-CAM-001-AZ-L',
        title: 'Azul / L',
        price: money(389000, 'PYG'),
        compareAtPrice: money(550000, 'PYG'),
        availableQuantity: 0,
        attributes: { color: 'Azul', size: 'L' },
      },
      {
        id: 'v1c',
        sku: 'NRT-CAM-001-NE-M',
        title: 'Negro / M',
        price: money(410000, 'PYG'),
        availableQuantity: 2,
        attributes: { color: 'Negro', size: 'M' },
      },
      {
        id: 'v1d',
        sku: 'NRT-CAM-001-NE-L',
        title: 'Negro / L',
        price: money(410000, 'PYG'),
        availableQuantity: 6,
        attributes: { color: 'Negro', size: 'L' },
      },
    ],
  },
  {
    ...TENANT,
    id: 'p2',
    handle: 'zapatilla-urbana',
    categoryId: 'calzado',
    title: 'Zapatilla urbana de cuero',
    status: 'active',
    brand: 'Ruta',
    images: [
      {
        url: '/products/zapatilla.jpg',
        alt: 'Zapatilla urbana de cuero negra',
        width: 900,
        height: 1200,
      },
    ],
    variants: [
      {
        id: 'v2',
        sku: 'RUT-ZAP-220-41',
        title: '41',
        price: money(720000, 'PYG'),
        availableQuantity: 12,
        attributes: { size: '41', color: 'Negro' },
      },
    ],
  },
  {
    ...TENANT,
    id: 'p3',
    handle: 'remera-algodon',
    categoryId: 'remeras',
    title: 'Remera de algodón peinado',
    status: 'active',
    brand: 'Norte',
    images: [
      { url: '/products/remera.jpg', alt: 'Remera de algodón blanca', width: 900, height: 1200 },
    ],
    variants: [
      {
        id: 'v3',
        sku: 'NRT-REM-010-L',
        title: 'L',
        price: money(135000, 'PYG'),
        compareAtPrice: money(180000, 'PYG'),
        availableQuantity: 0,
        attributes: { size: 'L', color: 'Blanco' },
      },
    ],
  },
  {
    ...TENANT,
    id: 'p4',
    handle: 'mochila-tecnica',
    categoryId: 'accesorios',
    title: 'Mochila técnica 28 L',
    status: 'active',
    brand: 'Ruta',
    images: [],
    variants: [
      {
        id: 'v4',
        sku: 'RUT-MOC-028',
        title: 'Única',
        price: money(455000, 'PYG'),
        /*
         * Holgado a propósito: es el producto que consume el smoke de pagos, y
         * ahí compran cuatro tests × dos viewports en la misma corrida. Ningún
         * test afirma sobre este número, a diferencia de los de la campera.
         */
        availableQuantity: 40,
        attributes: { color: 'Verde' },
      },
    ],
  },
];

export const ORGANIZACION = { id: IDS.tenant, name: 'Pick Demo', slug: 'pick-demo' };

export const TIENDA = {
  id: IDS.store,
  tenant_id: IDS.tenant,
  name: 'Pick Demo',
  slug: 'principal',
  // Es lo que resuelve el tenant en runtime. Debe coincidir con el dominio que
  // el storefront declara en `STOREFRONT_DOMAIN`.
  domain: 'pick-commerce.chvpa-contacto.workers.dev',
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

export const CATEGORIAS = CATALOGO_CATEGORIAS.map((c, i) => ({
  id: uuid('c1', i),
  tenant_id: IDS.tenant,
  store_id: IDS.store,
  name: c.name,
  slug: c.slug,
  position: i,
  image: c.image,
}));

/**
 * Definiciones de atributos con sus flags (PROJECT.md §35).
 *
 * `genero` se declara sin que ninguna variante lo use todavía: la definición
 * existe, y la faceta aparece cuando haya productos que la declaren. Es lo que
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
 * Productos, variantes, media e inventario.
 *
 * Los `created_at` son crecientes y explícitos: fijan el orden de "relevance" y
 * el de descubrimiento de facetas. Sin ellos el orden dependería del plan de
 * ejecución de Postgres y los tests serían intermitentes.
 */
export const PRODUCTOS = CATALOGO.map((p, i) => ({
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

export const VARIANTES = CATALOGO.flatMap((p, i) =>
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

export const MEDIA = CATALOGO.flatMap((p, i) =>
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

export const INVENTARIO = CATALOGO.flatMap((p, i) =>
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
    // La destaca la home. Ver `COLECCION_DESTACADA` en el storefront.
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
export const COLECCION_PRODUCTOS = CATALOGO.map((p, i) => ({ p, i }))
  .filter(({ p }) => p.variants.some((v) => v.compareAtPrice))
  .map(({ i }, orden) => ({
    tenant_id: IDS.tenant,
    collection_id: IDS.coleccionManual,
    product_id: uuid('d1', i),
    position: orden,
  }));

/** Configuración de moneda y pagos de la tienda (PROJECT.md §33 y §34). */
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
    /*
     * Declarativo (ADR-021). Transferencia es el único método sin pasarela, que
     * es lo que hay hasta Fase 7: el pedido nace pendiente de pago y el comercio
     * lo confirma cuando ve la transferencia.
     *
     * Va explícito aunque el core caiga a lo mismo por defecto, porque las
     * instrucciones sí son de la tienda: sin ellas, la pantalla de confirmación
     * no puede decirle al cliente dónde pagar.
     */
    payments: {
      // La demo ofrece los dos para que se vea el flujo con pasarela. El
      // simulado no cobra nada y está declarado como prueba en toda la interfaz
      // (ADR-080).
      enabled: ['bank_transfer', 'simulated_card'],
      default: 'bank_transfer',
      bankTransfer: {
        instructions:
          'Transferí el total a la cuenta 123-456789 del Banco Demo, a nombre de Pick Demo S.A. ' +
          'Enviá el comprobante por WhatsApp al 0981 123 456 indicando el número de pedido.',
      },
    },
  },
};
