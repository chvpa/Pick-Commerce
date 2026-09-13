import type { AstroCookies } from 'astro';

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
