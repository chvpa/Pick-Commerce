import { useSyncExternalStore } from 'react';

/**
 * Si la pantalla es de teléfono, para decidir si el sidebar es un panel o una
 * hoja que se abre encima.
 *
 * La versión que trae shadcn arranca en `undefined` y siembra el valor real
 * dentro de un efecto, lo que dispara un render en cascada en cada montaje y
 * viola la regla de lint del repo. `useSyncExternalStore` es para exactamente
 * esto: React lee el valor cuando lo necesita y se resuscribe solo.
 */
function porDebajoDe(ancho: number): () => boolean {
  const consulta = `(max-width: ${ancho - 1}px)`;
  const suscribir = (alCambiar: () => void): (() => void) => {
    const mql = window.matchMedia(consulta);
    mql.addEventListener('change', alCambiar);
    return () => mql.removeEventListener('change', alCambiar);
  };
  return function useConsulta() {
    return useSyncExternalStore(
      suscribir,
      () => window.matchMedia(consulta).matches,
      // En el servidor no hay ventana. El Admin no tiene SSR, pero el valor por
      // defecto tiene que existir igual para que el hook no lance si alguna vez
      // lo usa una prueba fuera del navegador.
      () => false,
    );
  };
}

/** Un teléfono: los paneles de edición se abren desde abajo. */
export const useIsMobile = porDebajoDe(768);

/**
 * La navegación angosta: el sidebar pasa a una hoja que se abre con el botón de
 * menú. Es 900 y no 768 porque el handoff lo dibuja así (ADR-143): entre 768 y
 * 900, un sidebar fijo de 244 px le deja al contenido menos de 660.
 */
export const useNavegacionAngosta = porDebajoDe(900);
