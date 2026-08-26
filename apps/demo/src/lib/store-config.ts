import type { SeoContexto } from '@pick/commerce-core';

/**
 * Configuración del storefront.
 *
 * Cada storefront declara la suya: el Core no conoce el dominio ni el nombre
 * del comercio. En Fase 3 esto pasa a leerse de `store_settings` por tenant;
 * hoy vive acá para no bloquear.
 */
export const SITE_URL = import.meta.env.SITE ?? 'https://pick-demo.pages.dev';

export const seoContexto: SeoContexto = {
  siteUrl: SITE_URL,
  storeName: 'Pick Demo',
};

export const features = {
  /**
   * Dejar entrar a los crawlers de IA. Por defecto sí: que los productos
   * aparezcan en respuestas de IA vale más que el riesgo de scraping, y el
   * comercio que no lo quiera lo apaga acá. Ver ADR-046.
   */
  allowAiCrawlers: true,
} as const;

/**
 * Barra de anuncio del sitio. Va encima del header, que es donde se espera:
 * es contexto de toda la tienda, no contenido de una página.
 * `null` la apaga.
 */
export const ANUNCIO: { texto: string; href?: string } | null = {
  texto: 'Envío gratis en compras superiores a Gs. 500.000',
  href: '/catalogo',
};

/**
 * Colección que la home destaca. Es una decisión del comercio, no del Core: otro
 * storefront puede destacar "novedades" o una campaña.
 */
export const COLECCION_DESTACADA = 'ofertas';

/** Rutas que no aportan a la indexación y sí dispersan autoridad. */
export const RUTAS_PRIVADAS = ['/carrito', '/checkout', '/cuenta'] as const;
