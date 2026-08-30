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
  /**
   * Stock conocido la última vez que el servidor lo dijo.
   *
   * Es un techo para el selector de cantidad, no una autoridad: sin esto el
   * carrito dejaba subir a 44 unidades de un producto con 4 en stock, porque la
   * línea no llevaba el dato y el selector no tenía contra qué acotar. Lo que
   * decide de verdad sigue siendo la revalidación del checkout (ADR-009).
   */
  readonly available?: number;
}

/**
 * La clave lleva versión.
 *
 * Sin versión, el día que `CartLine` cambie de forma cada cliente con un carrito
 * guardado se encuentra con uno inservible: los consumidores lo leen con un
 * `as`, así que una línea vieja sin `price` hace explotar el render y —porque
 * Preact aborta el re-render y deja el anterior— la persona ve **«tu carrito
 * está vacío»** mientras el contador del header le dice que tiene ítems. Con
 * versión, lo viejo simplemente no se lee y el carrito arranca vacío, que es
 * honesto y visible.
 */
const STORAGE_KEY = 'pick:cart:v1';

/** Cambió el carrito. El drawer y el contador del header escuchan esto. */
export const CART_CHANGED_EVENT = 'pick:cart-changed';

/** Abrir o cerrar el drawer. Lo emite el botón del header, lo escucha el drawer. */
export const CART_TOGGLE_EVENT = 'pick:cart-toggle';

let lines: CartLine[] | null = null;

/**
 * Una apertura del drawer pedida antes de que el drawer estuviera escuchando.
 *
 * `ADD_TO_CART_EVENT` es fire-and-forget: si se emite antes de que el efecto del
 * drawer haya montado, no lo oye nadie y el evento se pierde. Las dos islands
 * hidratan por separado —el bloque de compra vive en el PDP y el drawer en el
 * layout—, así que quien hidrate primero es una carrera, y la ganaba el botón
 * cada tantas veces: el clic agregaba la línea y el drawer no abría.
 *
 * Costó encontrarlo porque falla una de cada cuatro corridas y en mobile: el
 * síntoma que se registró fue «el drawer abrió vacío», que es lo que se ve.
 *
 * La solicitud vive en el módulo, que es uno solo para todas las islands
 * —Rollup lo hoistea a un chunk compartido—, así que sobrevive a la carrera:
 * quien llegue tarde la encuentra al montar.
 */
let aperturaPendiente = false;

export function pedirAperturaDelCarrito(): void {
  aperturaPendiente = true;
}

/** Devuelve si había una apertura pendiente, y la consume. */
export function tomarAperturaPendiente(): boolean {
  const pendiente = aperturaPendiente;
  aperturaPendiente = false;
  return pendiente;
}

/**
 * Una línea del storage es una línea sólo si tiene la forma completa.
 *
 * `JSON.parse(raw) as CartLine[]` era un cast, no un parse: cualquier payload
 * parseable pero con otra forma llegaba entero a los consumidores. Con
 * `quantity` como string, el contador concatenaba —dos altas daban «021»
 * unidades—; sin `price`, el subtotal tiraba `TypeError` y la página se veía
 * vacía. Una línea que no cumple se descarta, y el resto del carrito sobrevive.
 */
function esLinea(valor: unknown): valor is CartLine {
  if (!valor || typeof valor !== 'object') return false;
  const l = valor as Record<string, unknown>;
  const precio = l.price as Record<string, unknown> | undefined;

  return (
    typeof l.variantId === 'string' &&
    l.variantId.length > 0 &&
    typeof l.quantity === 'number' &&
    Number.isFinite(l.quantity) &&
    l.quantity > 0 &&
    typeof l.title === 'string' &&
    typeof precio === 'object' &&
    precio !== null &&
    typeof precio.amount === 'number' &&
    Number.isFinite(precio.amount) &&
    typeof precio.currency === 'string'
  );
}

function leerStorage(): CartLine[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const crudo: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(crudo) ? crudo.filter(esLinea) : [];
  } catch {
    // Modo privado, storage lleno o JSON corrupto: el carrito arranca vacío en
    // vez de romper la página.
    return [];
  }
}

function load(): CartLine[] {
  // El storefront es un MPA: sin persistencia el carrito se vaciaría al navegar
  // de la PDP al catálogo. Ver ADR-039.
  lines ??= leerStorage();
  return lines;
}

/**
 * Toda escritura relee primero.
 *
 * El caché de módulo se llenaba una vez y no volvía a mirar el storage, y
 * `persist` escribe el array entero: con dos pestañas abiertas, agregar algo en
 * la segunda borraba lo de la primera —sin ningún aviso, y la pestaña vieja
 * seguía mostrando el total que ya no existía—. Releer antes de escribir hace
 * que la última escritura sume en vez de pisar.
 */
function actualizar(cambio: (actuales: CartLine[]) => CartLine[]): void {
  const siguiente = cambio(leerStorage());
  lines = siguiente;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(siguiente));
  } catch {
    // Sin persistencia el carrito sigue funcionando en memoria.
  }
  globalThis.dispatchEvent?.(new CustomEvent(CART_CHANGED_EVENT, { detail: siguiente }));
}

export function getLines(): readonly CartLine[] {
  return load();
}

export function totalQuantity(): number {
  return load().reduce((sum, line) => sum + line.quantity, 0);
}

/** Suma cantidad si la variante ya está; si no, agrega la línea al final. */
export function addLine(line: CartLine): void {
  actualizar((current) => {
    const existing = current.findIndex((l) => l.variantId === line.variantId);
    if (existing === -1) return [...current, line];

    const next = [...current];
    // La línea nueva trae el snapshot más fresco del servidor: se conserva ése,
    // no el que estaba guardado.
    next[existing] = { ...line, quantity: current[existing]!.quantity + line.quantity };
    return next;
  });
}

export function setQuantity(variantId: string, quantity: number): void {
  if (quantity <= 0) {
    removeLine(variantId);
    return;
  }
  actualizar((current) => current.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
}

export function removeLine(variantId: string): void {
  actualizar((current) => current.filter((l) => l.variantId !== variantId));
}

/**
 * Reemplaza el carrito entero. Lo usa el checkout al corregirlo contra el servidor.
 *
 * **Nunca resucita un carrito vacío**, y esa guarda es del camino de dinero.
 *
 * El checkout revalida contra el servidor y escribe acá lo que le responde. Al
 * confirmar el pedido llama a `clear()` y navega — pero una revalidación que ya
 * había leído las líneas sigue viva y resuelve **después**, con el carrito de
 * antes. El comprador terminaba en la confirmación con su pedido hecho y el
 * carrito otra vez lleno, listo para comprar lo mismo de nuevo. Falla
 * intermitente: depende de que la respuesta llegue entre el `clear()` y la
 * navegación.
 *
 * La guarda va acá y no en quien llama porque acá está la escritura: un segundo
 * llamador la heredaría, y el de hoy ya se olvidó una vez.
 *
 * Corregir es ajustar algo que existe. Un carrito vacío no tiene nada que
 * ajustar, así que la única lectura posible de «vacío» es que se vació a
 * propósito: se compró, o alguien lo vació en otra pestaña.
 */
export function replaceLines(siguientes: readonly CartLine[]): void {
  actualizar((actuales) => (actuales.length === 0 ? [] : siguientes.filter(esLinea)));
}

export function clear(): void {
  actualizar(() => []);
}

export function subscribe(listener: (lines: readonly CartLine[]) => void): () => void {
  const handler = () => listener(load());

  // `storage` sólo lo emiten las **otras** pestañas. Sin esto, dos pestañas de
  // la misma tienda muestran totales distintos hasta que se recargue una.
  const deOtraPestana = (evento: StorageEvent) => {
    if (evento.key !== null && evento.key !== STORAGE_KEY) return;
    lines = null;
    listener(load());
  };

  globalThis.addEventListener?.(CART_CHANGED_EVENT, handler);
  globalThis.addEventListener?.('storage', deOtraPestana as EventListener);
  return () => {
    globalThis.removeEventListener?.(CART_CHANGED_EVENT, handler);
    globalThis.removeEventListener?.('storage', deOtraPestana as EventListener);
  };
}
