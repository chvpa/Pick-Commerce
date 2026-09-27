import type { APIRoute } from 'astro';
import { escribirResena } from '../../lib/cuenta.ts';
import { hayCuentas } from '../../lib/db.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../lib/limite.ts';
import { tokenDelComprador } from '../../lib/sesion.ts';

export const prerender = false;

/** El id de producto tiene que ser un uuid: es la clave de la clave foránea. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * La reseña que escribe el comprador (ADR-140).
 *
 * **Recibe un formulario y responde con un redirect**, no JSON: es un `<form>` sin
 * JavaScript, así que el navegador tiene que quedar en una página y no mirando un
 * objeto. Vuelve al PDP con `?resena=ok` o `?resena=error`, que es lo que la
 * sección de reseñas lee para decir qué pasó.
 *
 * Nada se valida acá más que la forma: quién puede reseñar qué lo decide
 * `escribir_resena` en la base, que además elige el pedido que la justifica. Un
 * chequeo de permiso escrito también acá sería el segundo lugar donde vive la misma
 * regla, y el que se olvida de actualizar.
 *
 * Comparte el freno del carrito: escribir una reseña es menos frecuente que
 * agregar al carrito, así que su límite alcanza y no hay un binding más que
 * mantener.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!(await hayCuentas())) return new Response(null, { status: 404 });
  if (!(await dentroDelLimite(request, 'CARRITO_LIMITE'))) return demasiadasPeticiones();

  const formulario = await request.formData().catch(() => null);
  const productId = String(formulario?.get('productId') ?? '');
  const rating = Number(formulario?.get('rating') ?? 0);
  const body = String(formulario?.get('body') ?? '').trim();

  /*
   * A dónde volver. Se acepta sólo una ruta de este sitio: con la URL entera del
   * formulario, cualquiera podría armar un POST que redirige a otro dominio.
   */
  const crudo = String(formulario?.get('volverA') ?? '');
  const volverA = /^\/[\w\-/]*$/.test(crudo) ? crudo : '/';

  if (!UUID.test(productId) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return redirect(`${volverA}?resena=error#resenas`, 303);
  }

  const token = await tokenDelComprador(cookies);
  if (!token) return redirect(`${volverA}?resena=error#resenas`, 303);

  try {
    await escribirResena(token, productId, rating, body === '' ? null : body);
    return redirect(`${volverA}?resena=ok#resenas`, 303);
  } catch (error) {
    console.error('[resenas] no se pudo escribir', error);
    return redirect(`${volverA}?resena=error#resenas`, 303);
  }
};
