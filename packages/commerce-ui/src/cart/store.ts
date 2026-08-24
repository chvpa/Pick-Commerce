import type { Money } from '@pick/commerce-types';

export interface CartLine {
  readonly variantId: string;
  readonly quantity: number;
  /**
   * Snapshot de presentación. El carrito guarda cómo se veía el producto al
   * agregarlo, igual que hará la orden (PROJECT.md §13): así el drawer no
   * necesita volver al catálogo, y un cambio de título o precio no reescribe
   * retroactivamente lo que el cliente vio.
   */
  readonly title: string;
  readonly price: Money;
  readonly imageUrl?: string;
}

const STORAGE_KEY = 'pick:cart';

/** Cambió el carrito. El drawer y el contador del header escuchan esto. */
export const CART_CHANGED_EVENT = 'pick:cart-changed';

let lines: CartLine[] | null = null;

function load(): CartLine[] {
  if (lines) return lines;
  // El storefront es un MPA: sin persistencia el carrito se vaciaría al navegar
  // de la PDP al catálogo. Ver ADR-039.
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    lines = raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    // Modo privado, storage lleno o JSON corrupto: el carrito arranca vacío en
    // vez de romper la página.
    lines = [];
  }
  return lines;
}

function persist(next: CartLine[]): void {
  lines = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin persistencia el carrito sigue funcionando en memoria.
  }
  globalThis.dispatchEvent?.(new CustomEvent(CART_CHANGED_EVENT, { detail: next }));
}

export function getLines(): readonly CartLine[] {
  return load();
}

export function totalQuantity(): number {
  return load().reduce((sum, line) => sum + line.quantity, 0);
}

/** Suma cantidad si la variante ya está; si no, agrega la línea al final. */
export function addLine(line: CartLine): void {
  const current = load();
  const existing = current.findIndex((l) => l.variantId === line.variantId);

  if (existing === -1) {
    persist([...current, line]);
    return;
  }

  const next = [...current];
  next[existing] = { ...current[existing]!, quantity: current[existing]!.quantity + line.quantity };
  persist(next);
}

export function setQuantity(variantId: string, quantity: number): void {
  if (quantity <= 0) {
    removeLine(variantId);
    return;
  }
  persist(load().map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
}

export function removeLine(variantId: string): void {
  persist(load().filter((l) => l.variantId !== variantId));
}

export function subscribe(listener: (lines: readonly CartLine[]) => void): () => void {
  const handler = () => listener(load());
  globalThis.addEventListener?.(CART_CHANGED_EVENT, handler);
  return () => globalThis.removeEventListener?.(CART_CHANGED_EVENT, handler);
}
