import type { APIRoute } from 'astro';
import { guardarFavoritos, quitarFavorito } from '../../lib/cuenta.ts';
import { hayCuentas } from '../../lib/db.ts';
import { anotar } from '../../lib/analytics.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../lib/limite.ts';
import { tokenDelComprador } from '../../lib/sesion.ts';
import { cuerpoJson, falla, json } from './_respuesta.ts';

export const prerender = false;

/** El id de producto tiene que ser un uuid: es la clave de la clave foránea. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Cuántos ids acepta una fusión. Una wishlist de mil es un script, no una persona. */
const TOPE_DE_FUSION = 100;

/**
 * Guardar, quitar, y fusionar lo guardado sin cuenta al entrar.
 *
 * **Responde 200 aunque no haya sesión**, y esa es la decisión de diseño: sin
 * cuenta el guardado vive en `localStorage` y acá no se persiste nada, pero el
 * evento sí se registra. Si el corazón sólo llamara al servidor para quien ya
 * tiene cuenta, `wishlist_add` existiría para casi nadie y estaría contando otra
 * cosa que el resto del embudo. Guardar sin cuenta es exactamente el momento que
 * la Fase 2 quiere poder recordar.
 *
 * Comparte el freno del carrito en vez de pedir uno propio: tocar un corazón y
 * agregar al carrito son de la misma frecuencia, y un binding más es un número
 * más que mantener.
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!(await hayCuentas())) return new Response(null, { status: 404 });
  if (!(await dentroDelLimite(request, 'CARRITO_LIMITE'))) return demasiadasPeticiones();

  const cuerpo = (await cuerpoJson(request)) as {
    accion?: unknown;
    productId?: unknown;
    productIds?: unknown;
  } | null;

  const accion = cuerpo?.accion;
  if (accion !== 'guardar' && accion !== 'quitar' && accion !== 'fusionar') {
    return json({ error: 'bad_request', message: 'Acción desconocida.' }, 400);
  }

  const ids =
    accion === 'fusionar'
      ? (Array.isArray(cuerpo?.productIds) ? cuerpo.productIds : [])
          .filter((id): id is string => typeof id === 'string' && UUID.test(id))
          .slice(0, TOPE_DE_FUSION)
      : typeof cuerpo?.productId === 'string' && UUID.test(cuerpo.productId)
        ? [cuerpo.productId]
        : [];

  if (ids.length === 0 && accion !== 'fusionar') {
    return json({ error: 'bad_request', message: 'Falta el producto.' }, 400);
  }

  /*
   * El evento va **antes** de saber si hay sesión y sin depender de que la
   * escritura salga bien: es una medición, no una consecuencia. La fusión no
   * cuenta —lo que se fusiona ya se contó cuando se guardó sin cuenta— y quitar
   * tampoco, que no es uno de los diez eventos de PROJECT.md §22.
   */
  if (accion === 'guardar') {
    anotar(locals, 'wishlist_add', '/api/wishlist', { productId: ids[0] });
  }

  const token = await tokenDelComprador(cookies);
  if (!token) return json({ ok: true, guardado: false });

  try {
    if (accion === 'quitar') await quitarFavorito(token, ids[0]!);
    else await guardarFavoritos(token, ids);

    return json({ ok: true, guardado: accion !== 'quitar' });
  } catch (error) {
    return falla('wishlist', error);
  }
};
