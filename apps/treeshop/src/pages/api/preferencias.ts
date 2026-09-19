import type { APIRoute } from 'astro';
import {
  COOKIE_DE_DISPOSITIVO,
  COOKIE_SIN_PERSONALIZACION,
  olvidarEsteDispositivo,
} from '../../lib/analytics.ts';
import { olvidarMisPreferencias } from '../../lib/cuenta.ts';
import { paginaDeCuenta } from '../../lib/sesion.ts';

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
    /*
     * Y el resumen de la cuenta, si quien apaga entró a la suya. El texto de
     * privacidad promete que apagar borra **las dos cosas**; que además no
     * vuelva lo sostiene el recálculo, que ignora las visitas sin `device_id`.
     *
     * Un fallo acá no puede dejar el interruptor sin apagar: se registra y se
     * sigue, porque la cookie —que es lo que corta la señal nueva— ya se borra
     * abajo.
     */
    const { habilitado, token } = await paginaDeCuenta(cookies);
    if (habilitado && token) {
      try {
        await olvidarMisPreferencias(token);
      } catch (error) {
        console.error('[preferencias] no se pudo borrar el perfil de la cuenta', error);
      }
    }

    /*
     * Y lo ya registrado de este navegador deja de estar atado a él. Sin esto el
     * recálculo lo vuelve a armar con las visitas viejas, que siguen ahí hasta
     * 180 días: apagar habría durado hasta la corrida siguiente.
     */
    const dispositivo = cookies.get(COOKIE_DE_DISPOSITIVO)?.value;
    if (dispositivo) {
      try {
        await olvidarEsteDispositivo(dispositivo);
      } catch (error) {
        console.error('[preferencias] no se pudo desatar el dispositivo', error);
      }
    }

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
