import { useEffect, useState } from 'preact/hooks';
import { cn } from '../lib/cn.ts';
import { subscribe, totalQuantity } from './store.ts';

export interface CartButtonProps {
  /** Página de carrito. Es a dónde lleva el control cuando no hay JavaScript. */
  href?: string;
  className?: string;
}

/**
 * Control del carrito en el header.
 *
 * Es un `<a>`, no un `<button>`: sin hidratar sigue siendo un link que lleva a
 * `/carrito`. Cuando hidrata intercepta el click y abre el drawer, que es mejor
 * experiencia. Un `<button>` sin hidratar sería un control muerto.
 */
export function CartButton({ href = '/carrito', className }: CartButtonProps) {
  const [count, setCount] = useState(0);
  const [hidratado, setHidratado] = useState(false);

  // Se lee después de montar: el HTML del servidor no conoce el localStorage y
  // arrancar con el total real provocaría un mismatch de hidratación.
  useEffect(() => {
    setHidratado(true);
    setCount(totalQuantity());
    return subscribe(() => setCount(totalQuantity()));
  }, []);

  return (
    <a
      href={href}
      onClick={(event) => {
        // Sólo se intercepta si el drawer puede abrirse. Se respetan los
        // modificadores para no romper "abrir en pestaña nueva".
        if (!hidratado || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        globalThis.dispatchEvent(new CustomEvent('pick:cart-toggle'));
      }}
      className={cn(
        'relative cursor-pointer rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-sunken',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
    >
      Carrito
      {count > 0 ? (
        <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-2xs font-medium text-accent-fg tabular-nums">
          {count}
        </span>
      ) : null}
      <span className="sr-only">
        {count === 0 ? 'vacío' : `${count} ${count === 1 ? 'unidad' : 'unidades'}`}
      </span>
    </a>
  );
}
