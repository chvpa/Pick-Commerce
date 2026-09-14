/**
 * Lo guardado, del lado del navegador.
 *
 * Mismo patrón que el carrito (ADR-039) y por el mismo motivo: **un corazón que
 * exige registrarse para funcionar es la razón por la que nadie lo toca**. Sin
 * sesión el guardado vive acá y se fusiona al entrar; con sesión, la autoridad
 * es la base y esto queda vacío.
 *
 * Guarda ids de producto y nada más. No hay snapshot de presentación como en el
 * carrito porque no hace falta: la pantalla de guardados los resuelve contra el
 * catálogo, que es lo que además permite decir «esto ya no está disponible» en
 * vez de esconderlo.
 */

/**
 * La clave lleva versión, como la del carrito y por lo mismo: el día que la
 * forma cambie, lo viejo no se lee y la lista arranca vacía —honesto y
 * visible— en vez de hacer explotar un render.
 */
const STORAGE_KEY = 'pick:wishlist:v1';

/** Cambió lo guardado. Lo escuchan los corazones que estén en la página. */
export const WISHLIST_CHANGED_EVENT = 'pick:wishlist-changed';

let guardados: string[] | null = null;

function leer(): string[] {
  if (guardados) return guardados;

  try {
    const crudo = globalThis.localStorage?.getItem(STORAGE_KEY);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    guardados = Array.isArray(datos) ? datos.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // Storage bloqueado, lleno o con basura adentro. Ninguna de las tres puede
    // romper una página: se arranca sin nada guardado.
    guardados = [];
  }

  return guardados;
}

function escribir(siguiente: string[]): void {
  guardados = siguiente;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(siguiente));
  } catch {
    // Modo privado con storage lleno. Lo guardado vive en memoria hasta que se
    // recargue: peor que persistir, mejor que romper el clic.
  }
  globalThis.dispatchEvent?.(new CustomEvent(WISHLIST_CHANGED_EVENT));
}

export function estaGuardado(productId: string): boolean {
  return leer().includes(productId);
}

export function guardadosLocales(): readonly string[] {
  return leer();
}

/** Pone o saca. Devuelve cómo quedó, que es lo que el botón necesita pintar. */
export function alternarLocal(productId: string): boolean {
  const actuales = leer();
  const estaba = actuales.includes(productId);
  escribir(estaba ? actuales.filter((id) => id !== productId) : [...actuales, productId]);
  return !estaba;
}

/**
 * Vacía el guardado local.
 *
 * Se llama **después** de que el servidor confirmó la fusión, nunca antes: al
 * revés, un fallo de red entre una cosa y la otra se lleva puesto lo que la
 * persona había guardado sin cuenta, que es justamente lo que la fusión existe
 * para no perder.
 */
export function limpiarLocal(): void {
  escribir([]);
}

export function subscribe(escuchar: () => void): () => void {
  globalThis.addEventListener?.(WISHLIST_CHANGED_EVENT, escuchar);
  return () => globalThis.removeEventListener?.(WISHLIST_CHANGED_EVENT, escuchar);
}
