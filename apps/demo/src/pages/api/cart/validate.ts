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
  const cuerpo = await cuerpoJson(request);
  const { lines: lineas, invalidas } = lineasRecibidas(cuerpo);
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

    if (resultado.lines.length === 0) {
      return json({ lines: [], issues: resultado.issues, total: null });
    }

    /*
     * El dinero **no** lo suma este endpoint: lo resuelve `cart_promotions`, que
     * es la misma función que usa `create_order`. Sumar acá por separado fue
     * exactamente lo que produjo la incoherencia que este cambio arregla —la PLP
     * mostraba el precio con descuento, el carrito el de lista y el pedido
     * cobraba el primero—, y volvería a producirla en cuanto las reglas cambien.
     *
     * Se pide sólo por las líneas que pasaron la validación de stock, igual que
     * el pedido, que rechaza el carrito entero si alguna no da.
     */
    const recibido = (cuerpo as { couponCode?: unknown } | undefined)?.couponCode;
    // Se acota antes de mandarlo: un código es corto, y lo que llega del browser
    // no se supone. La comparación exacta la hace la base.
    const codigo =
      typeof recibido === 'string' && recibido.trim() !== ''
        ? recibido.trim().slice(0, 64)
        : undefined;
    const dinero = await checkout().promocionesDelCarrito(
      storeId,
      resultado.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      codigo,
    );
    const porVariante = new Map(dinero.lines.map((l) => [l.variantId, l]));

    return json({
      lines: resultado.lines.map((l) => {
        const conDescuento = porVariante.get(l.variantId);
        return {
          variantId: l.variantId,
          title: l.title,
          ...(l.variantTitle ? { variantTitle: l.variantTitle } : {}),
          sku: l.sku,
          price: conDescuento?.unitPrice ?? l.price,
          // Sólo cuando hay algo que tachar: el contrato del resto de los campos
          // opcionales es "ausente", no "igual al precio".
          ...(conDescuento && conDescuento.unitPrice.amount < conDescuento.listUnitPrice.amount
            ? { compareAtPrice: conDescuento.listUnitPrice }
            : {}),
          available: l.available,
          quantity: l.quantity,
          subtotal: conDescuento?.subtotal ?? l.subtotal,
        };
      }),
      issues: resultado.issues,
      subtotal: dinero.subtotal,
      discount: dinero.discount,
      total: dinero.total,
      ...(dinero.applied.length > 0 ? { appliedPromotions: dinero.applied } : {}),
      ...(dinero.couponIssue ? { couponIssue: dinero.couponIssue } : {}),
    });
  } catch (error) {
    return falla('cart/validate', error);
  }
};
