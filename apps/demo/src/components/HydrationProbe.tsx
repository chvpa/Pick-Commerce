import { useState } from 'preact/hooks';

/**
 * Island mínima de Fase 0: confirma que Preact hidrata y que sólo este
 * componente envía JavaScript al browser. Se elimina cuando existan islands
 * reales (Add to Cart, filtros, cart drawer) en Fase 1/2.
 */
export function HydrationProbe() {
  const [count, setCount] = useState(0);

  return (
    <button
      type="button"
      onClick={() => setCount((n) => n + 1)}
      class="cursor-pointer rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
    >
      Island hidratada · {count}
    </button>
  );
}
