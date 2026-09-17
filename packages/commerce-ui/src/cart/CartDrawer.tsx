import { useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from '../recipes/button.ts';
import { ADD_TO_CART_EVENT } from './add-to-cart.ts';
import { CartContents } from './CartContents.tsx';
import { CartRecommendations } from './CartRecommendations.tsx';
import {
  CART_TOGGLE_EVENT,
  getLines,
  subscribe,
  tomarAperturaPendiente,
  type CartLine,
} from './store.ts';

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
    // Si alguien pidió abrir antes de que esta island montara, el evento ya pasó
    // y no lo oyó nadie. La solicitud sí sobrevive.
    if (tomarAperturaPendiente()) setOpen(true);

    const onAdded = () => setOpen(true);
    const onToggle = () => setOpen((v) => !v);
    globalThis.addEventListener(ADD_TO_CART_EVENT, onAdded);
    globalThis.addEventListener(CART_TOGGLE_EVENT, onToggle);
    return () => {
      globalThis.removeEventListener(ADD_TO_CART_EVENT, onAdded);
      globalThis.removeEventListener(CART_TOGGLE_EVENT, onToggle);
    };
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

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

        <CartContents lines={lines} locale={locale} checkoutHref={checkoutHref} />
        {/* Debajo del resumen: primero lo que la persona vino a hacer. */}
        <CartRecommendations locale={locale} activo={open} />
      </div>
    </dialog>
  );
}
