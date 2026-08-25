import type { APIRoute } from 'astro';
import { robotsTxt } from '@pick/commerce-core';
import { features, RUTAS_PRIVADAS, seoContexto } from '../lib/store-config.ts';

/** Se prerenderiza: la política no cambia entre peticiones. */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    robotsTxt({
      ctx: seoContexto,
      allowAiCrawlers: features.allowAiCrawlers,
      disallow: RUTAS_PRIVADAS,
    }),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
