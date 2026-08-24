export interface AddToCartInput {
  readonly variantId: string;
  readonly quantity: number;
}

/** Evento que emite el botón. Permite que el storefront reaccione sin acoplarse. */
export const ADD_TO_CART_EVENT = 'pick:add-to-cart';

/**
 * Punto único por el que pasa un alta al carrito.
 *
 * En Fase 1 sólo emite el evento en el DOM: el cart service llega en Fase 5 y
 * reemplaza el cuerpo de esta función sin tocar los componentes. Existe como
 * módulo aparte, y no inline en el botón, justamente para que ese reemplazo sea
 * un solo archivo.
 *
 * El contrato ya es asíncrono a propósito: el botón debe manejar pending y error
 * desde ahora, no cuando aparezca la red.
 */
export async function addToCart(input: AddToCartInput): Promise<void> {
  if (input.quantity < 1) {
    throw new RangeError('La cantidad debe ser al menos 1');
  }

  globalThis.dispatchEvent?.(new CustomEvent(ADD_TO_CART_EVENT, { detail: input }));
}
