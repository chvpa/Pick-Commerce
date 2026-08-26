import type { APIRoute } from 'astro';
import { sitemapIndexXml } from '@pick/commerce-core';
import { seoContexto } from '../lib/store-config.ts';

/**
 * Índice de sitemaps.
 *
 * Es a donde apunta `robots.txt`, y el nombre es el que ya usaba
 * `@astrojs/sitemap`: cambiarlo dejaría el enlace roto en los buscadores que ya
 * lo tienen registrado.
 *
 * Se prerenderiza: la lista de sitemaps no depende de los datos, sólo el
 * contenido de cada uno.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(sitemapIndexXml(seoContexto, ['/sitemap-0.xml']), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
