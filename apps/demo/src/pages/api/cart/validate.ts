import type { APIRoute } from 'astro';
import { validarCarrito } from '@pick/commerce-core';
import { checkout, tiendaActual } from '../../../lib/db.ts';
import { cuerpoJson, falla, json, lineasRecibidas } from '../_respuesta.ts';

export const prerender = false;

/**
 * El cart service: qué de este carrito se puede comprar de verdad.
 *
 * Lo llama `addToCart` antes de guardar una línea, y el checkout al montarse.
 * Devuelve las líneas con **los datos del servidor** —precio y stock de la
 * base— y los problemas de las que no entran.
 *
 * No escribe nada y no reserva nada: es una foto. La autoridad la tiene
 * `create_order`, que revalida dentro de su transacción (ADR-009, ADR-065).
 *
 * La tienda sale de `tiendaActual()` y **nunca del cuerpo**: es lo único que
 * acota los datos en este camino, porque la secret key saltea RLS (ADR-052).
 */
export const POST: APIRoute = async ({ request }) => {
  const { lines: lineas, invalidas } = lineasRecibidas(await cuerpoJson(request));
  if (invalidas > 0) {
    return json({ error: 'bad_request', message: 'El carrito tiene líneas mal formadas.' }, 400);
  }
  if (lineas.length === 0) return json({ lines: [], issues: [], total: null });

  try {
    const { storeId } = await tiendaActual();
    const variantes = await checkout().variantesParaCarrito(
      storeId,
      lineas.map((l) => l.variantId),
    );

    const resultado = validarCarrito(lineas, variantes);

    return json({
      lines: resultado.lines.map((l) => ({
        variantId: l.variantId,
        title: l.title,
        ...(l.variantTitle ? { variantTitle: l.variantTitle } : {}),
        sku: l.sku,
        price: l.price,
        available: l.available,
        quantity: l.quantity,
        subtotal: l.subtotal,
      })),
      issues: resultado.issues,
      total: resultado.lines.length > 0 ? resultado.total : null,
    });
  } catch (error) {
    return falla('cart/validate', error);
  }
};
