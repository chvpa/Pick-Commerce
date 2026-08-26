import type { APIRoute } from 'astro';
import { sitemapXml, type EntradaSitemap } from '@pick/commerce-core';
import { catalogo, tiendaActual } from '../lib/db.ts';
import { seoContexto } from '../lib/store-config.ts';

/**
 * Sitemap del sitio.
 *
 * Se emite on-demand y no con `@astrojs/sitemap`: esa integración sólo conoce
 * las rutas que existen al construir, y desde ADR-057 los productos se resuelven
 * on-demand. Un sitemap sin productos no sirve para nada.
 */
export const prerender = false;

/**
 * `/catalogo` queda fuera a propósito: sus variantes filtradas son la misma
 * colección con otro orden, y listarlas dispersa la autoridad de la página. Los
 * productos se descubren desde los enlaces de la PLP y desde acá.
 */
const ESTATICAS = ['/', '/preguntas-frecuentes', '/politicas'];

/** Por consulta. El protocolo admite 50.000 URLs por archivo. */
const TAMANO = 500;
const MAXIMO = 50_000;

export const GET: APIRoute = async () => {
  const { storeId } = await tiendaActual();

  const entradas: EntradaSitemap[] = ESTATICAS.map((ruta) => ({ ruta }));

  // Paginado, no un select gigante: el catálogo puede crecer (ADR-024).
  let page = 1;
  for (;;) {
    const resultado = await catalogo.buscar(storeId, { perPage: TAMANO, page });
    for (const producto of resultado.items) {
      entradas.push({ ruta: `/productos/${producto.handle}` });
    }
    if (page >= resultado.pageCount || entradas.length >= MAXIMO) break;
    page += 1;
  }

  if (entradas.length >= MAXIMO) {
    // Que se sepa: un sitemap truncado en silencio se lee como completo.
    console.warn(`sitemap: se alcanzó el límite de ${MAXIMO} URLs; faltan páginas por listar.`);
  }

  return new Response(sitemapXml(seoContexto, entradas), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Un catálogo no cambia entre dos visitas de un crawler.
      'cache-control': 'public, max-age=3600',
    },
  });
};
