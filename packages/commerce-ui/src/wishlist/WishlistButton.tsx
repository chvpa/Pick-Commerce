import { useEffect, useState } from 'preact/hooks';
import { cn } from '../lib/cn.ts';
import { alternarLocal, estaGuardado, subscribe } from './store.ts';

/**
 * El corazón.
 *
 * **Le pega al servidor aunque no haya sesión**, y esa es la decisión que
 * ordena todo lo demás. Sin cuenta el guardado vive en `localStorage` y la
 * llamada no persistiría nada — pero es la única forma de que `wishlist_add`
 * exista para el tráfico que no se registró, que es casi todo. Guardar sin
 * cuenta es exactamente el momento que la Fase 2 quiere poder recordar.
 *
 * Optimista: pinta primero y manda después. Si la llamada falla no se
 * deshace nada, porque lo local ya quedó guardado y es lo que la persona ve; lo
 * que se pierde es el evento, que es un dato nuestro y no suyo.
 */

export interface WishlistButtonProps {
  productId: string;
  /**
   * Cómo está para quien ya entró, resuelto en el servidor. Sin sesión llega
   * `undefined` y manda `localStorage`.
   */
  guardadoEnLaCuenta?: boolean;
  /** Texto al lado del ícono. Sin él es sólo el corazón, para la tarjeta. */
  etiqueta?: string;
  href?: string;
  className?: string;
}

export function WishlistButton({
  productId,
  guardadoEnLaCuenta,
  etiqueta,
  href = '/api/wishlist',
  className,
}: WishlistButtonProps) {
  const conSesion = guardadoEnLaCuenta !== undefined;

  /*
   * Arranca con lo del servidor cuando lo hay, y con `false` cuando no.
   *
   * **No lee `localStorage` en el render inicial**: el HTML lo pinta el
   * servidor, que no lo conoce, así que leerlo acá produciría un mismatch de
   * hidratación. Se lee en el efecto, como hace la confirmación del pedido.
   */
  const [guardado, setGuardado] = useState(guardadoEnLaCuenta ?? false);

  useEffect(() => {
    if (conSesion) return;
    setGuardado(estaGuardado(productId));
    // Dos corazones del mismo producto en la misma página —la tarjeta y el
    // PDP— tienen que moverse juntos.
    return subscribe(() => setGuardado(estaGuardado(productId)));
  }, [productId, conSesion]);

  function alternar(): void {
    const siguiente = conSesion ? !guardado : alternarLocal(productId);
    setGuardado(siguiente);

    void fetch(href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, accion: siguiente ? 'guardar' : 'quitar' }),
    }).catch(() => {
      // Sin sesión lo local ya quedó escrito y es lo que la persona ve. Con
      // sesión se perdió el guardado, y la próxima carga lo va a mostrar como
      // estaba: es preferible a inventar un error sobre un corazón.
    });
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={guardado}
      aria-label={etiqueta ? undefined : guardado ? 'Quitar de guardados' : 'Guardar'}
      title={guardado ? 'Quitar de guardados' : 'Guardar'}
      class={cn(
        'inline-flex cursor-pointer items-center gap-2 text-sm',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        guardado ? 'text-danger' : 'text-fg-muted hover:text-fg',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        /* Relleno cuando está guardado, contorno cuando no: es la diferencia que
           se lee de un vistazo y sin depender del color, que en daltonismo rojo
           no dice nada. */
        fill={guardado ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-width="1.8"
        class="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M12 20.5C7 17 3.5 13.9 3.5 10.2A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 8.5 2.6c0 3.7-3.5 6.8-8.5 10.3Z" />
      </svg>
      {etiqueta ? <span>{guardado ? 'Guardado' : etiqueta}</span> : null}
    </button>
  );
}
