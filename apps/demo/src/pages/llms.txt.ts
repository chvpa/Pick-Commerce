import type { APIRoute } from 'astro';
import { llmsTxt } from '@pick/commerce-core';
import { mockCategories } from '../lib/mock-catalog.ts';
import { seoContexto } from '../lib/store-config.ts';

export const prerender = true;

/**
 * Índice para agentes de IA (llmstxt.org).
 *
 * Lista las entradas al catálogo, no cada producto: el spec pide contenido
 * curado, y un catálogo real haría un archivo inmanejable. El detalle de cada
 * producto ya está en el JSON-LD de su PDP.
 */
export const GET: APIRoute = () =>
  new Response(
    llmsTxt({
      ctx: seoContexto,
      resumen:
        'Tienda de ropa y accesorios técnicos. Catálogo con filtros por marca, color y talle, y precios en guaraníes.',
      secciones: [
        {
          titulo: 'Catálogo',
          enlaces: [
            {
              texto: 'Todos los productos',
              ruta: '/catalogo',
              nota: 'filtrable por marca, color y talle, con precios y disponibilidad',
            },
            ...mockCategories.map((c) => ({ texto: c.label, ruta: c.href })),
          ],
        },
        {
          titulo: 'Sobre la tienda',
          enlaces: [
            { texto: 'Inicio', ruta: '/', nota: 'destacados y categorías' },
            { texto: 'Preguntas frecuentes', ruta: '/preguntas-frecuentes' },
            { texto: 'Políticas', ruta: '/politicas', nota: 'envíos, cambios y privacidad' },
          ],
        },
      ],
    }),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
