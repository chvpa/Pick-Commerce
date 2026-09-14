import type { AstroCookies } from 'astro';
import { clienteDeAuth } from '@pick/adapter-supabase';
import { conexionPublica, faltaParaLasCuentas } from './cuenta.ts';

/**
 * La sesión del comprador, en una cookie que el navegador no puede leer.
 *
 * **Los tokens no bajan al browser.** El storefront no manda supabase-js al
 * cliente —no hay ningún `.js` que los necesite— así que guardarlos en
 * `localStorage`, que es lo que hace supabase-js por defecto, sería regalar una
 * sesión a cualquier XSS sin ganar nada. Con `httpOnly` el JWT vive en el
 * Worker, que es el único que consulta la base (ADR-121).
 *
 * Van los dos tokens en una sola cookie porque se usan juntos: el de acceso
 * dura una hora y el de refresco es lo que permite renovarlo sin volver a pedir
 * un código. Un JWT de Supabase ronda los 800 bytes, así que los dos entran
 * cómodos en el límite de 4 KB.
 */

export const COOKIE_DE_CUENTA = 'pick_cuenta';

/**
 * Treinta días, que es lo que dura el refresco de Supabase por defecto.
 *
 * La cookie no puede durar más que el token que lleva adentro: una cookie viva
 * con un refresco muerto es una sesión que parece abierta y falla en la primera
 * lectura.
 */
const DIAS = 30;

export interface SesionDeComprador {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export function guardarSesion(cookies: AstroCookies, sesion: SesionDeComprador): void {
  cookies.set(COOKIE_DE_CUENTA, JSON.stringify(sesion), {
    path: '/',
    httpOnly: true,
    secure: true,
    // `lax` y no `strict`: con `strict` la cookie no viaja cuando se llega desde
    // otro sitio, así que volver del correo o de la pasarela mostraría la cuenta
    // cerrada. `lax` no manda la cookie en POST de otro origen, que es lo que
    // interesa.
    sameSite: 'lax',
    maxAge: DIAS * 24 * 60 * 60,
  });
}

/** La sesión guardada, o `null` si no hay o si la cookie está rota. */
export function leerSesion(cookies: AstroCookies): SesionDeComprador | null {
  const crudo = cookies.get(COOKIE_DE_CUENTA)?.value;
  if (!crudo) return null;

  try {
    const { accessToken, refreshToken } = JSON.parse(crudo) as Partial<SesionDeComprador>;
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;
    return { accessToken, refreshToken };
  } catch {
    // Una cookie ilegible es una sesión cerrada, no un error: puede ser una
    // versión vieja del formato en el navegador de alguien que ya estaba dentro.
    return null;
  }
}

export function cerrarSesion(cookies: AstroCookies): void {
  cookies.delete(COOKIE_DE_CUENTA, { path: '/' });
}

/**
 * El token con el que leer, renovado si hacía falta. `null` si no hay sesión.
 *
 * **El refresco pasa del lado del servidor**, que es la contrapartida de tener
 * la cookie `httpOnly`: el token de acceso dura una hora y no hay supabase-js en
 * el navegador que lo renueve solo. Lo hace `setSession`, que decide sola —mira
 * el `exp` del token, sin red— y sólo sale a pedir uno nuevo cuando venció.
 *
 * Va sobre un cliente de un solo uso por lo mismo que `canjearCodigo`:
 * `setSession` le deja la sesión puesta al cliente sobre el que corre, y el del
 * storefront está memoizado por isolate.
 *
 * Cuando el refresco falla —el token de refresco venció, o alguien cerró la
 * sesión desde otro lado— la cookie **se borra**. Dejarla puesta haría que cada
 * página intentara renovar de nuevo, un viaje a Supabase por visita, para
 * terminar mostrando lo mismo.
 */
export async function tokenDelComprador(cookies: AstroCookies): Promise<string | null> {
  const sesion = leerSesion(cookies);
  if (!sesion) return null;

  // Sin la clave publicable no hay con qué renovar. No se borra la cookie: el
  // problema es del despliegue, no de la sesión, y volverá a servir en cuanto se
  // cargue el secreto.
  if (faltaParaLasCuentas()) return null;

  try {
    const { data, error } = await clienteDeAuth(conexionPublica()).auth.setSession({
      access_token: sesion.accessToken,
      refresh_token: sesion.refreshToken,
    });

    if (error || !data.session) {
      cerrarSesion(cookies);
      return null;
    }

    // Sólo si cambió: reescribir la cookie en cada visita le agrega una cabecera
    // `set-cookie` a todas las respuestas sin motivo.
    if (data.session.refresh_token !== sesion.refreshToken) {
      guardarSesion(cookies, {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      });
    }

    return data.session.access_token;
  } catch (error) {
    // Que Supabase no conteste no puede dejar una página en 500. Se muestra la
    // cuenta cerrada y la cookie se conserva, porque la sesión puede estar viva.
    console.error('[sesion] no se pudo renovar', error);
    return null;
  }
}
