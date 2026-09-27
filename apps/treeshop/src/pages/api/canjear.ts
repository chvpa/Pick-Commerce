import type { APIRoute } from 'astro';
import { canjearPremio } from '../../lib/cuenta.ts';
import { hayCuentas } from '../../lib/db.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../lib/limite.ts';
import { tokenDelComprador } from '../../lib/sesion.ts';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Canjear un premio con puntos (ADR-141).
 *
 * Formulario y redirect, como las reseñas y por lo mismo: es un `<form>` sin
 * JavaScript. Vuelve a «Mis puntos» con `?canje=<código>` —que es lo único que la
 * persona vino a buscar— o con `?error=<motivo>`.
 *
 * **El motivo del rechazo se muestra tal como lo dice la base**, y eso es deliberado:
 * `canjear_premio` habla en el idioma de quien lo va a leer —«te faltan puntos: tenés
 * 40 y este premio cuesta 60», «ese premio se agotó»—, así que traducirlo acá sería
 * escribir los mismos mensajes dos veces y perder el número.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!(await hayCuentas())) return new Response(null, { status: 404 });
  if (!(await dentroDelLimite(request, 'CARRITO_LIMITE'))) return demasiadasPeticiones();

  const formulario = await request.formData().catch(() => null);
  const rewardId = String(formulario?.get('rewardId') ?? '');

  const conError = (motivo: string) =>
    redirect(`/cuenta/puntos?error=${encodeURIComponent(motivo)}`, 303);

  if (!UUID.test(rewardId)) return conError('Ese premio no existe.');

  const token = await tokenDelComprador(cookies);
  if (!token) return redirect('/cuenta', 302);

  try {
    const { codigo } = await canjearPremio(token, rewardId);
    return redirect(`/cuenta/puntos?canje=${encodeURIComponent(codigo)}`, 303);
  } catch (error) {
    console.error('[canjear] no se pudo canjear', error);
    return conError((error as Error).message);
  }
};
