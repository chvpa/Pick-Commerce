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

export const mockCategories = [
  {
    label: 'Camperas',
    href: '/catalogo?categoria=camperas',
    image: { url: '/products/campera.jpg', alt: '', width: 900, height: 1200 },
  },
  {
    label: 'Calzado',
    href: '/catalogo?categoria=calzado',
    image: { url: '/products/zapatilla.jpg', alt: '', width: 900, height: 1200 },
  },
  {
    label: 'Remeras',
    href: '/catalogo?categoria=remeras',
    image: { url: '/products/remera.jpg', alt: '', width: 900, height: 1200 },
  },
  {
    label: 'Accesorios',
    href: '/catalogo?categoria=accesorios',
    image: { url: '/products/campera-3.jpg', alt: '', width: 900, height: 1200 },
  },
] as const;
