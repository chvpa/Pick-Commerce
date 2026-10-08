import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { CheckCircleIcon } from '@/components/iconos';

/**
 * El aviso que confirma una acción rápida: «Pedido marcado como pagado».
 *
 * Es el toast del handoff (ADR-143): oscuro, abajo al centro, con un check verde,
 * y se va solo a los 2,6 segundos. **Uno a la vez**: el nuevo reemplaza al
 * anterior. Una pila de avisos es para un sistema que hace cosas en segundo
 * plano; acá cada aviso responde a algo que la persona acaba de tocar, y lo que
 * importa es el último.
 *
 * No reemplaza el estado de la pantalla: un error se muestra donde ocurrió, con
 * su salida. El aviso es para lo que salió bien y no cambia nada a la vista.
 *
 * `role="status"` para que un lector de pantalla lo lea sin robar el foco.
 */

const DURACION_MS = 2600;

const AvisoContext = createContext<((mensaje: string) => void) | null>(null);

export function ProveedorDeAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<{ mensaje: string; id: number } | null>(null);

  const avisar = useCallback((mensaje: string) => setAviso({ mensaje, id: Date.now() }), []);

  // Se cuenta desde el último aviso: uno nuevo reinicia el reloj.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), DURACION_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  return (
    <AvisoContext value={avisar}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4"
      >
        {aviso && (
          <div
            key={aviso.id}
            className="animate-in fade-in-0 slide-in-from-bottom-2 flex items-center gap-2.5 rounded-[10px] bg-[#0e1525] px-4 py-3 text-[13.5px] font-medium text-white shadow-modal"
          >
            <CheckCircleIcon className="size-[18px] text-[#7ee2b0]" />
            {aviso.mensaje}
          </div>
        )}
      </div>
    </AvisoContext>
  );
}

/** Muestra un aviso abajo al centro. Sólo para confirmar algo que salió bien. */
export function useAvisar(): (mensaje: string) => void {
  const avisar = use(AvisoContext);
  if (!avisar) throw new Error('useAvisar necesita estar dentro de ProveedorDeAvisos');
  return avisar;
}
