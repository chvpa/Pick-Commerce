import { lazy, type FunctionComponent } from 'react';

/**
 * `React.lazy` para un módulo que exporta su componente con nombre.
 *
 * Si el chunk no se puede traer, recarga la página **una vez**. La causa
 * habitual es una pestaña abierta desde antes del último deploy: su `index.html`
 * pide los archivos con el hash viejo y Workers Assets ya no los sirve. También
 * pasa cuando el edge se queda sin certificado un rato, que es lo que hubo al
 * reatar `admin.sontres.shop`: cada pantalla que todavía no se había abierto
 * fallaba con «Failed to fetch dynamically imported module». Recargar trae el
 * `index.html` vigente y con él los nombres vigentes.
 *
 * Una sola vez por pantalla: si el fallo es otro —sin red— la segunda vez el
 * error llega al límite de errores y se ve, en vez de recargar en bucle.
 */
export function pantalla<P extends object>(
  carga: () => Promise<Record<string, unknown>>,
  nombre: string,
): FunctionComponent<P> {
  return lazy(() => cargar<P>(carga, nombre));
}

export async function cargar<P extends object>(
  carga: () => Promise<Record<string, unknown>>,
  nombre: string,
): Promise<{ default: FunctionComponent<P> }> {
  const clave = `pantalla-recargada:${nombre}`;
  try {
    const modulo = await carga();
    sessionStorage.removeItem(clave);
    return { default: modulo[nombre] as FunctionComponent<P> };
  } catch (error) {
    if (sessionStorage.getItem(clave)) throw error;
    sessionStorage.setItem(clave, '1');
    location.reload();
    // La recarga interrumpe todo; hasta que llegue, el fallback de Suspense y
    // no el límite de errores.
    return new Promise(() => {});
  }
}
