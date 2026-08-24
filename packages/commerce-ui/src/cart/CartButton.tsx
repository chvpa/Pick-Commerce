import { useEffect, useState } from 'preact/hooks';
import { cn } from '../lib/cn.ts';
import { subscribe, totalQuantity } from './store.ts';

export interface CartButtonProps {
  className?: string;
}

/** Abre el drawer y muestra cuántas unidades hay. Vive en el header. */
export function CartButton({ className }: CartButtonProps) {
  const [count, setCount] = useState(0);

  // Se lee después de montar: el HTML del servidor no conoce el localStorage y
  // arrancar con el total real provocaría un mismatch de hidratación.
  useEffect(() => {
    setCount(totalQuantity());
    return subscribe(() => setCount(totalQuantity()));
  }, []);

  return (
    <button
      type="button"
      onClick={() => globalThis.dispatchEvent(new CustomEvent('pick:cart-toggle'))}
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
    </button>
  );
}
