import { addLine, pedirAperturaDelCarrito, type CartLine } from './store.ts';

export type AddToCartInput = CartLine;

/** Se emite tras agregar. Permite abrir el drawer o disparar analytics. */
export const ADD_TO_CART_EVENT = 'pick:add-to-cart';

/** Se rechazó el alta y el motivo se puede mostrar. */
export class ProblemaDeStock extends Error {}

interface RespuestaValidacion {
  lines?: {
    variantId: string;
    title: string;
    variantTitle?: string;
    price: { amount: number; currency: string };
    available: number;
    imageUrl?: string;
    quantity: number;
  }[];
  issues?: { type: string; variantId: string; available?: number }[];
}

/**
 * Punto único por el que pasa un alta al carrito.
 *
 * Pregunta al servidor antes de guardar, y guarda **lo que el servidor
 * responde**: título, precio y stock salen de la base, no del HTML que la página
 * serializó cuando se renderizó. Eso arregla de paso que un precio cambiado
 * quedara viejo en el carrito.
 *
 * La degradación no es uniforme, y la diferencia importa:
 *
 * - Un **rechazo** —la variante no existe, no está publicada o no hay stock— es
 *   una respuesta: se lanza y el botón muestra su error. Agregar igual sería
 *   mentirle a la persona.
 * - Un **fallo de red o del servidor** no dice nada sobre el producto. Ahí se
 *   agrega al espejo local igual, porque el checkout revalida siempre (ADR-009)
 *   y quedarse sin poder comprar por un 502 pasajero es peor que un carrito
 *   optimista.
 */
export async function addToCart(input: AddToCartInput): Promise<void> {
  if (input.quantity < 1) {
    throw new RangeError('La cantidad debe ser al menos 1');
  }

  let confirmada: CartLine = input;

  try {
    const respuesta = await fetch('/api/cart/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      /*
       * `intent` es lo único que distingue un alta de una revalidación.
       *
       * A `/api/cart/validate` llegan seis llamadas distintas —ésta, el montaje
       * del checkout, cada cambio del carrito, aplicar y quitar cupón, y el
       * reintento tras un 409— y un carrito de una línea sin cupón es byte a byte
       * idéntico en todas. Sin este campo, contar altas sería adivinar por la
       * forma del cuerpo.
       *
       * El endpoint lo ignora salvo para el evento, así que es aditivo: nada se
       * rompe si falta.
       */
      body: JSON.stringify({
        lines: [{ variantId: input.variantId, quantity: input.quantity }],
        intent: 'add',
      }),
    });

    if (respuesta.ok) {
      const datos = (await respuesta.json()) as RespuestaValidacion;
      const problema = datos.issues?.[0];

      if (problema) {
        throw new ProblemaDeStock(
          problema.type === 'insufficient_stock'
            ? problema.available && problema.available > 0
              ? `Quedan ${problema.available} unidades.`
              : 'Se agotó mientras mirabas.'
            : 'Este producto ya no está disponible.',
        );
      }

      const linea = datos.lines?.[0];
      if (linea) {
        confirmada = {
          variantId: linea.variantId,
          quantity: input.quantity,
          // El título del carrito incluye la variante, como lo arma la página.
          title: input.title,
          price: linea.price,
          available: linea.available,
          ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        };
      }
    }
    // Una respuesta no-ok cae al alta optimista, como el fallo de red.
  } catch (error) {
    if (error instanceof ProblemaDeStock) throw error;
    // Red caída, servidor en 500, JSON roto: no sabemos nada del producto, así
    // que no se le impide comprar. El checkout revalida.
  }

  addLine(confirmada);

  // La solicitud primero, el evento después: el drawer puede no estar
  // escuchando todavía, y así la encuentra igual al montar.
  pedirAperturaDelCarrito();
  globalThis.dispatchEvent?.(new CustomEvent(ADD_TO_CART_EVENT, { detail: confirmada }));
}
