'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { XIcon } from '@/components/iconos';
import { cn } from '@/lib/utils';

/**
 * Un panel modal para editar algo sin salir de la pantalla: una variante, una
 * foto.
 *
 * `Dialog` y no `AlertDialog`: acá cerrar con Escape o tocando afuera es
 * esperable, porque lo que se edita adentro vive en el formulario de la página y
 * nada se pierde al cerrarlo. Para «¿borro esto?» sigue estando `AlertDialog`.
 */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props & { children: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className={cn(
          'fixed inset-0 z-50 bg-[rgba(14,21,37,0.32)] transition-opacity duration-150',
          'data-ending-style:opacity-0 data-starting-style:opacity-0',
        )}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'bg-popover text-popover-foreground fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[520px]',
          'max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl shadow-modal',
          'flex flex-col transition duration-150',
          'data-ending-style:scale-95 data-ending-style:opacity-0',
          'data-starting-style:scale-95 data-starting-style:opacity-0',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

/** El título y la cruz de cerrar, con la línea de abajo. */
function DialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex items-center justify-between gap-3 border-b border-[#f0f1f4] px-5 py-4',
        className,
      )}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="Cerrar"
        className="text-ink-3 hover:text-foreground flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none hover:bg-[#f4f5f8] focus-visible:ring-3 focus-visible:ring-[#e4e9fc]"
      >
        <XIcon className="size-[15px]" />
      </DialogPrimitive.Close>
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base font-semibold', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex items-center gap-2 border-t border-[#f0f1f4] bg-[#fafbfc] px-5 py-3',
        className,
      )}
      {...props}
    />
  );
}

const DialogClose = DialogPrimitive.Close;

export { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle };
