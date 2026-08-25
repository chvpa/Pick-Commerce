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

/** Rutas que no aportan a la indexación y sí dispersan autoridad. */
export const RUTAS_PRIVADAS = ['/carrito', '/checkout', '/cuenta'] as const;
