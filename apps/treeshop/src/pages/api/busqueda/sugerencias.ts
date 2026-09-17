import type { APIRoute } from 'astro';
import { sugerenciasDeBusqueda } from '../../../lib/db.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../../lib/limite.ts';
import { json } from '../_respuesta.ts';

export const prerender = false;

/** Más no es una búsqueda sino un pegado, y no vale la consulta. */
const LARGO_MAXIMO = 80;

/**
 * Sugerencias mientras se escribe.
 *
 * **No anota ningún evento.** Se llama una vez por pausa al tipear: contarla
 * como `search` inflaría las búsquedas con cada palabra a medio escribir. La
 * búsqueda se anota cuando se envía, en el catálogo, como siempre.
 *
 * GET y con su propio freno, más holgado que el del carrito: una persona que
 * escribe rápido pide una cada 150 ms de pausa, no cada tecla.
 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!(await dentroDelLimite(request, 'BUSQUEDA_LIMITE'))) return demasiadasPeticiones();

  const q = (url.searchParams.get('q') ?? '').trim().slice(0, LARGO_MAXIMO);
  if (q.length < 2) return json({ sugerencias: [] });

  return json({ sugerencias: await sugerenciasDeBusqueda(q) });
};
