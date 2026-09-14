import type { APIRoute } from 'astro';
import { COOKIE_DE_DISPOSITIVO, COOKIE_SIN_PERSONALIZACION } from '../../lib/analytics.ts';

export const prerender = false;

/** Un año: la decisión de no personalizar tiene que durar más que el perfil. */
const DIAS = 365;

/**
 * Prende y apaga la personalización.
 *
 * **Es un interruptor, no un aviso de cookies.** Un banner lo descarta todo el
 * mundo sin leerlo y no da una elección real; esto vive en la página de
 * privacidad, dice qué hace y se puede volver atrás.
 *
 * Recibe un formulario y contesta una redirección: no hay una línea de
 * JavaScript de por medio, así que funciona igual con el navegador que sea.
 *
 * Apagar **borra** `pick_did`, no lo deja de usar. Sin eso, volver a prender
 * recuperaría un historial que la persona creyó haber cortado. Lo vuelve a hacer
 * el middleware en cada visita mientras la preferencia esté puesta, que es lo
 * que cierra la carrera con una pestaña abierta de antes.
 *
 * La cookie de la preferencia dura **más** que el perfil —un año contra seis
 * meses— a propósito: que la elección caduque antes que lo que apaga sería
 * volver a prenderla sola.
 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const apagar = form.get('accion') === 'apagar';

  if (apagar) {
    cookies.set(COOKIE_SIN_PERSONALIZACION, '1', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: DIAS * 24 * 60 * 60,
    });
    cookies.delete(COOKIE_DE_DISPOSITIVO, { path: '/' });
  } else {
    cookies.delete(COOKIE_SIN_PERSONALIZACION, { path: '/' });
  }

  // 303 para que el navegador pida la página siguiente con GET: con 302,
  // algunos repiten el POST al recargar.
  return redirect(
    `/politicas?personalizacion=${apagar ? 'apagada' : 'prendida'}#personalizacion`,
    303,
  );
};
