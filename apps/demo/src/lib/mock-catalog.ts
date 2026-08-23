import { money } from '@pick/commerce-core';
import type { Product } from '@pick/commerce-types';

/**
 * Catálogo mock para desarrollar el storefront sin backend, como habilita el
 * ROADMAP en Fase 2. Se reemplaza por el CatalogService cuando exista; el tipo
 * `Product` es el mismo, así que los componentes no cambian.
 */
const TENANT = { tenantId: 'demo', storeId: 'demo-store' } as const;

export const mockProducts: readonly Product[] = [
  {
    ...TENANT,
    id: 'p1',
    handle: 'campera-cortaviento',
    title: 'Campera cortaviento',
    status: 'active',
    brand: 'Norte',
    images: [{ url: '/products/campera.svg', alt: 'Campera cortaviento azul' }],
    variants: [
      {
        id: 'v1',
        sku: 'NRT-CAM-001-M',
        title: 'M',
        price: money(389000, 'PYG'),
        compareAtPrice: money(550000, 'PYG'),
        availableQuantity: 4,
        attributes: { size: 'M', color: 'Azul' },
      },
    ],
  },
  {
    ...TENANT,
    id: 'p2',
    handle: 'zapatilla-urbana',
    title: 'Zapatilla urbana de cuero',
    status: 'active',
    brand: 'Ruta',
    images: [{ url: '/products/zapatilla.svg', alt: 'Zapatilla urbana de cuero negra' }],
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
    title: 'Remera de algodón peinado',
    status: 'active',
    brand: 'Norte',
    images: [{ url: '/products/remera.svg', alt: 'Remera de algodón blanca' }],
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
        availableQuantity: 7,
        attributes: { color: 'Verde' },
      },
    ],
  },
];
