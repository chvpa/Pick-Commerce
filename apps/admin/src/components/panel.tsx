import type { ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { XIcon } from '@/components/iconos';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Editar una cosa corta sin perder de vista la lista.
 *
 * Reemplaza al formulario que se abría **arriba** de la lista: editar el último
 * elemento de una lista larga mandaba el formulario al tope y había que
 * desplazarse hasta arriba para escribir. La lista sigue detrás, que es la razón
 * por la que aquello se editaba en línea, pero ahora sin mover el scroll.
 *
 * **Modal en desktop, hoja desde abajo en mobile.** Es el mismo primitive de
 * Base UI con dos posiciones: en una pantalla ancha un panel lateral taparía
 * justo la columna de acciones, y en un teléfono un modal centrado con el
 * teclado abierto no entra. Se elige con el mismo hook que usa el sidebar, así
 * que las dos superficies del Admin deciden «esto es un teléfono» igual.
 *
 * Es para formularios de tres o cuatro campos. Cuando uno crezca, su lugar es
 * una página propia — producto y promoción ya la tienen.
 */
export function PanelDeEdicion({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  acciones,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  /** Guardar, cancelar y lo que haga falta. Van fijas al pie del panel. */
  acciones: ReactNode;
}) {
  const esMobile = useIsMobile();

  return (
    <Dialog.Root open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            'fixed inset-0 z-50 bg-black/20 transition-opacity duration-150',
            'data-ending-style:opacity-0 data-starting-style:opacity-0',
            'supports-backdrop-filter:backdrop-blur-xs',
          )}
        />
        <Dialog.Popup
          className={cn(
            'bg-popover text-popover-foreground fixed z-50 flex flex-col shadow-lg',
            'transition duration-200 ease-in-out',
            'data-ending-style:opacity-0 data-starting-style:opacity-0',
            esMobile
              ? [
                  // Hoja: pegada abajo, con tope de alto para que el teclado no
                  // la empuje fuera de la pantalla.
                  'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t',
                  'data-ending-style:translate-y-8 data-starting-style:translate-y-8',
                ]
              : [
                  'top-1/2 left-1/2 w-[min(32rem,calc(100vw-2rem))] max-h-[85dvh]',
                  '-translate-x-1/2 -translate-y-1/2 rounded-xl border',
                  'data-ending-style:scale-98 data-starting-style:scale-98',
                ],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="flex flex-col gap-0.5">
              <Dialog.Title className="text-base font-medium">{titulo}</Dialog.Title>
              {descripcion && (
                <Dialog.Description className="text-muted-foreground text-sm">
                  {descripcion}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              render={
                <Button variant="ghost" size="icon" aria-label="Cerrar">
                  <XIcon />
                </Button>
              }
            />
          </div>

          {/* El cuerpo desplaza, no el panel: el pie con las acciones queda
              siempre a la vista, que es todo el punto del cambio. */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            {children}
          </div>

          <div className="flex items-center justify-end gap-3 border-t px-5 py-4">{acciones}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
