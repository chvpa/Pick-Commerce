import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Si la pantalla es de teléfono, para decidir si el sidebar es un panel o una
 * hoja que se abre encima.
 *
 * La versión que trae shadcn arranca en `undefined` y siembra el valor real
 * dentro de un efecto, lo que dispara un render en cascada en cada montaje y
 * viola la regla de lint del repo. `useSyncExternalStore` es para exactamente
 * esto: React lee el valor cuando lo necesita y se resuscribe solo.
 */
function suscribir(alCambiar: () => void): () => void {
  const mql = window.matchMedia(CONSULTA);
  mql.addEventListener('change', alCambiar);
  return () => mql.removeEventListener('change', alCambiar);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    // En el servidor no hay ventana. El Admin no tiene SSR, pero el valor por
    // defecto tiene que existir igual para que el hook no lance si alguna vez lo
    // usa una prueba fuera del navegador.
    () => false,
  );
}
