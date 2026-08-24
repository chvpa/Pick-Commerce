import { addLine, type CartLine } from './store.ts';

export type AddToCartInput = CartLine;

/** Se emite tras agregar. Permite abrir el drawer o disparar analytics. */
export const ADD_TO_CART_EVENT = 'pick:add-to-cart';

/**
 * Punto único por el que pasa un alta al carrito.
 *
 * Hoy escribe en el store del cliente y avisa por el DOM. En Fase 5 este cuerpo
 * pasa a llamar al cart service del servidor, que revalida stock; los
 * componentes no cambian. Existe como módulo aparte, y no inline en el botón,
 * justamente para que ese reemplazo sea un solo archivo.
 *
 * El contrato ya es asíncrono a propósito: el botón debe manejar pending y error
 * desde ahora, no cuando aparezca la red.
 */
export async function addToCart(input: AddToCartInput): Promise<void> {
  if (input.quantity < 1) {
    throw new RangeError('La cantidad debe ser al menos 1');
  }

  addLine(input);
  globalThis.dispatchEvent?.(new CustomEvent(ADD_TO_CART_EVENT, { detail: input }));
}
