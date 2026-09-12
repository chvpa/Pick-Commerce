import { useEffect, useState } from 'preact/hooks';
import { cn } from '../lib/cn.ts';
import { CART_TOGGLE_EVENT, subscribe, totalQuantity } from './store.ts';

export interface CartButtonProps {
  /** Página de carrito. Es a dónde lleva el control cuando no hay JavaScript. */
  href?: string;
  /**
   * Dibuja un ícono en vez de la palabra «Carrito».
   *
   * El nombre accesible no cambia: el `aria-label` dice lo mismo que decía el
   * texto, más las unidades. Un ícono sin nombre es un botón mudo para quien
   * navega con lector de pantalla.
   */
  icono?: boolean;
  className?: string;
}

/**
 * Control del carrito en el header.
 *
 * Es un `<a>`, no un `<button>`: sin hidratar sigue siendo un link que lleva a
 * `/carrito`. Cuando hidrata intercepta el click y abre el drawer, que es mejor
 * experiencia. Un `<button>` sin hidratar sería un control muerto.
 */
export function CartButton({ href = '/carrito', icono = false, className }: CartButtonProps) {
  const [count, setCount] = useState(0);
  const [hidratado, setHidratado] = useState(false);

  // Se lee después de montar: el HTML del servidor no conoce el localStorage y
  // arrancar con el total real provocaría un mismatch de hidratación.
  useEffect(() => {
    setHidratado(true);
    setCount(totalQuantity());
    return subscribe(() => setCount(totalQuantity()));
  }, []);

  const unidades = count === 0 ? 'vacío' : `${count} ${count === 1 ? 'unidad' : 'unidades'}`;

  return (
    <a
      href={href}
      aria-label={icono ? `Carrito: ${unidades}` : undefined}
      onClick={(event) => {
        // Sólo se intercepta si el drawer puede abrirse. Se respetan los
        // modificadores para no romper "abrir en pestaña nueva".
        if (!hidratado || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        globalThis.dispatchEvent(new CustomEvent(CART_TOGGLE_EVENT));
      }}
      className={cn(
        'relative cursor-pointer rounded-md text-sm transition-colors hover:bg-surface-sunken',
        icono ? 'flex h-10 w-10 items-center justify-center' : 'px-3 py-2',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
    >
      {icono ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ) : (
        'Carrito'
      )}
      {count > 0 ? (
        <span
          className={cn(
            'rounded-full bg-accent text-2xs font-medium text-accent-fg tabular-nums',
            icono
              ? 'absolute top-0.5 right-0.5 min-w-4 px-1 text-center leading-4'
              : 'ml-1 px-1.5 py-0.5',
          )}
        >
          {count}
        </span>
      ) : null}
      {/* Con ícono el nombre ya lo da el `aria-label`; repetirlo lo diría dos veces. */}
      {icono ? null : <span className="sr-only">{unidades}</span>}
    </a>
  );
}
