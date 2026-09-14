import type { APIRoute } from 'astro';
import { cerrarSesion } from '../../../lib/sesion.ts';

export const prerender = false;

/**
 * Cierra la sesión borrando la cookie.
 *
 * **No revoca el token del lado de Supabase**, y es a propósito: `signOut`
 * cerraría la sesión de esa persona en *todos* sus dispositivos, que no es lo
 * que pide quien toca «Salir» en una computadora prestada. El token de acceso
 * que queda huérfano vale hasta una hora y nadie lo tiene: vivía en una cookie
 * `httpOnly` que el navegador acaba de tirar.
 *
 * Sin rate limit: borrar una cookie propia no es una superficie de abuso.
 *
 * Contesta con una redirección y no con JSON porque el botón de salir es un
 * `<form method="post">` sin una línea de JavaScript. Salir es lo último que
 * puede depender de que una island haya cargado: quien está en una computadora
 * prestada necesita que funcione siempre.
 *
 * 303 y no 302: obliga al navegador a pedir la página siguiente con GET. Con 302
 * algunos repiten el POST al recargar.
 */
export const POST: APIRoute = ({ cookies, redirect }) => {
  cerrarSesion(cookies);
  return redirect('/cuenta', 303);
};
