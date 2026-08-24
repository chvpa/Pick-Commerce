import { useRef, useState } from 'preact/hooks';
import { addToCart } from '../cart/add-to-cart.ts';
import { cn } from '../lib/cn.ts';
import { QuantitySelector } from './QuantitySelector.tsx';

type Status = 'idle' | 'pending' | 'success' | 'error';

export interface AddToCartProps {
  variantId: string;
  /** Stock disponible. En 0 el botón queda deshabilitado con motivo visible. */
  available: number;
  label?: string;
  showQuantity?: boolean;
  className?: string;
}

/**
 * Botón de alta al carrito con sus estados obligatorios (ADR-022): pending,
 * success, error recuperable, disabled y prevención de doble submit.
 *
 * No recibe el handler por props: Astro no puede pasar funciones a una island.
 * La acción entra por el módulo `cart/add-to-cart`.
 */
export function AddToCart({
  variantId,
  available,
  label = 'Agregar al carrito',
  showQuantity = true,
  className,
}: AddToCartProps) {
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<Status>('idle');
  // Un ref, no el estado: evita que dos clicks en el mismo tick pasen los dos.
  const inFlight = useRef(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const soldOut = available <= 0;
  const busy = status === 'pending';

  async function handleClick() {
    if (inFlight.current || soldOut) return;
    inFlight.current = true;
    clearTimeout(successTimer.current);
    setStatus('pending');

    try {
      await addToCart({ variantId, quantity });
      setStatus('success');
      successTimer.current = setTimeout(() => setStatus('idle'), 2500);
    } catch {
      // Error recuperable: el botón vuelve a estar accionable para reintentar.
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {showQuantity && !soldOut ? (
        <QuantitySelector value={quantity} onChange={setQuantity} max={available} disabled={busy} />
      ) : null}

      <button
        type="button"
        onClick={handleClick}
        disabled={soldOut || busy}
        aria-busy={busy}
        className={cn(
          'inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-6',
          'text-sm font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          soldOut
            ? 'cursor-not-allowed bg-surface-sunken text-fg-subtle'
            : 'bg-accent text-accent-fg hover:bg-accent-hover',
          busy && 'cursor-wait opacity-80',
        )}
      >
        {busy ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
        ) : null}
        {soldOut ? 'Sin stock' : busy ? 'Agregando…' : label}
      </button>

      {/*
        Región viva siempre presente: si apareciera recién con el mensaje, varios
        lectores de pantalla no anunciarían el cambio.
      */}
      <p
        role="status"
        aria-live="polite"
        className={cn('min-h-5 text-sm', status === 'error' ? 'text-danger' : 'text-success')}
      >
        {status === 'success' ? 'Agregado al carrito' : null}
        {status === 'error' ? 'No se pudo agregar. Probá de nuevo.' : null}
      </p>
    </div>
  );
}
