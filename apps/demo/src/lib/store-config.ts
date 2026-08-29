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

/*
 * Acá vivía `COLECCION_DESTACADA = 'ofertas'`.
 *
 * El comentario decía que era «una decisión del comercio, no del Core», y tenía
 * razón en el diagnóstico y no en el remedio: era una decisión del comercio
 * guardada en el código, así que cambiarla exigía desplegar y toda tienda tenía
 * que llamar igual a su colección destacada. Ahora las secciones de la home son
 * colecciones con `home_position`, y se administran.
 */

/**
 * Rutas que no aportan a la indexación y sí dispersan autoridad.
 *
 * `/api` no es una página: son endpoints que sólo responden a POST, así que un
 * crawler sólo puede gastar presupuesto ahí para recibir un 405.
 */
export const RUTAS_PRIVADAS = ['/carrito', '/checkout', '/cuenta', '/api'] as const;
