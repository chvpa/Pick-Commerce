import { formatMoney } from '@pick/commerce-core';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from '../recipes/button.ts';
import { removeLine, setQuantity, type CartLine } from './store.ts';
import { QuantitySelector } from '../product/QuantitySelector.tsx';

export interface CartContentsProps {
  lines: readonly CartLine[];
  locale?: string;
  checkoutHref?: string;
  /** Dónde mandar a quien tiene el carrito vacío. */
  catalogHref?: string;
  className?: string;
}

/**
 * Líneas del carrito con su resumen.
 *
 * Se extrajo del drawer cuando apareció la página `/carrito`: son dos vistas
 * del mismo contenido. Recibe las líneas por prop en vez de leer el store, para
 * que quien la use decida cuándo suscribirse.
 */
export function CartContents({
  lines,
  locale,
  checkoutHref = '/checkout',
  catalogHref = '/catalogo',
  className,
}: CartContentsProps) {
  const total = lines.reduce((sum, l) => sum + l.price.amount * l.quantity, 0);
  const currency = lines[0]?.price.currency;

  if (lines.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-4 px-5 py-12',
          className,
        )}
      >
        <p className="text-sm text-fg-muted">Tu carrito está vacío</p>
        <a href={catalogHref} className={buttonVariants({ variant: 'secondary' })}>
          Ver el catálogo
        </a>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-1 flex-col', className)}>
      <ul className="flex-1 divide-y divide-border overflow-y-auto">
        {lines.map((line) => (
          <li key={line.variantId} className="flex gap-3 px-5 py-4">
            {line.imageUrl ? (
              <img
                src={line.imageUrl}
                alt=""
                width={64}
                height={85}
                loading="lazy"
                decoding="async"
                className="h-[85px] w-16 shrink-0 rounded-sm object-cover"
              />
            ) : null}

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-sm leading-snug font-medium">{line.title}</p>
              <p className="text-sm text-fg-muted">{formatMoney(line.price, locale)}</p>

              <div className="flex items-center gap-3">
                <QuantitySelector
                  value={line.quantity}
                  onChange={(q) => setQuantity(line.variantId, q)}
                  min={1}
                />
                <button
                  type="button"
                  onClick={() => removeLine(line.variantId)}
                  className="cursor-pointer text-xs text-fg-subtle underline hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Quitar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {currency ? (
        <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-fg-muted">Subtotal</span>
            <span className="text-base font-medium" aria-live="polite">
              {formatMoney({ amount: total, currency }, locale)}
            </span>
          </div>
          {/* El stock se revalida en checkout, siempre. Ver ADR-009. */}
          <p className="text-xs text-fg-subtle">
            El envío y la disponibilidad se confirman en el checkout.
          </p>
          <a href={checkoutHref} className={buttonVariants({ size: 'lg' })}>
            Ir al checkout
          </a>
        </div>
      ) : null}
    </div>
  );
}
