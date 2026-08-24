import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMoney } from '@pick/commerce-core';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from '../recipes/button.ts';
import { ADD_TO_CART_EVENT } from './add-to-cart.ts';
import { getLines, removeLine, setQuantity, subscribe, type CartLine } from './store.ts';
import { QuantitySelector } from '../product/QuantitySelector.tsx';

export interface CartDrawerProps {
  locale?: string;
  checkoutHref?: string;
  className?: string;
}

/**
 * Drawer del carrito.
 *
 * Usa `<dialog>` nativo con `showModal()`: el browser aporta trampa de foco,
 * cierre con Escape, backdrop e `inert` sobre el resto de la página. Escribir
 * todo eso a mano sería más código y peor accesibilidad.
 *
 * Se comunica con el botón de compra por eventos del DOM, no por props: Astro
 * no comparte estado entre islands, y `CartDrawer` vive en el layout mientras
 * `AddToCart` vive en el PDP.
 */
export function CartDrawer({ locale, checkoutHref = '/checkout', className }: CartDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [lines, setLines] = useState<readonly CartLine[]>([]);
  const [open, setOpen] = useState(false);

  // El primer render debe coincidir con el HTML del servidor, que no puede
  // conocer el localStorage. Se leen las líneas recién montado para no
  // provocar un mismatch de hidratación.
  useEffect(() => {
    setLines(getLines());
    return subscribe(setLines);
  }, []);

  useEffect(() => {
    const onAdded = () => setOpen(true);
    const onToggle = () => setOpen((v) => !v);
    globalThis.addEventListener(ADD_TO_CART_EVENT, onAdded);
    globalThis.addEventListener('pick:cart-toggle', onToggle);
    return () => {
      globalThis.removeEventListener(ADD_TO_CART_EVENT, onAdded);
      globalThis.removeEventListener('pick:cart-toggle', onToggle);
    };
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const total = lines.reduce((sum, l) => sum + l.price.amount * l.quantity, 0);
  const currency = lines[0]?.price.currency;

  return (
    <dialog
      ref={dialog}
      aria-label="Carrito"
      onClose={() => setOpen(false)}
      // El click en el backdrop llega al propio dialog, no a su contenido.
      onClick={(event) => {
        if (event.target === dialog.current) setOpen(false);
      }}
      className={cn(
        'ml-auto h-dvh max-h-none w-full max-w-md border-l border-border bg-surface p-0 text-fg',
        'backdrop:bg-black/40',
        className,
      )}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Carrito</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar carrito"
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'px-2' })}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
            <p className="text-sm text-fg-muted">Tu carrito está vacío</p>
          </div>
        ) : (
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
        )}

        {lines.length > 0 && currency ? (
          <footer className="flex flex-col gap-3 border-t border-border px-5 py-4">
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
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
