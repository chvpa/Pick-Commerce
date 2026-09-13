import type { APIRoute } from 'astro';
import { addMoney, calcularEnvio, validarCarrito } from '@pick/commerce-core';
import { checkout, envio, tiendaActual } from '../../../lib/db.ts';
import { anotar } from '../../../lib/analytics.ts';
import { cuerpoJson, falla, json, lineasRecibidas } from '../_respuesta.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../../lib/limite.ts';

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
export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await dentroDelLimite(request, 'CARRITO_LIMITE'))) return demasiadasPeticiones();

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

    /*
     * El envío, con la misma cuenta que hace `create_order`.
     *
     * Sobre `dinero.total`, que es el subtotal **ya descontado**: es contra eso
     * que se mide el umbral de envío gratis, acá y en la base. Si los dos lo
     * midieran contra cosas distintas, el checkout prometería un envío gratis
     * que la caja después cobraría.
     */
    // La zona viaja con el carrito sólo para cotizar; la que cuenta es la que
    // `create_order` lee de la dirección al confirmar.
    const zona = (cuerpo as { zone?: unknown } | undefined)?.zone;
    const costoDeEnvio = calcularEnvio(
      await envio(),
      dinero.total,
      typeof zona === 'string' ? zona : undefined,
    );

    /*
     * Los dos eventos de este endpoint.
     *
     * **`add_to_cart` sólo si la petición se declara un alta.** Acá llegan seis
     * llamadas distintas —el alta, el montaje del checkout, cada cambio del
     * carrito, aplicar y quitar cupón, y el reintento tras un 409— y un carrito
     * de una línea sin cupón es byte a byte idéntico en todas. Distinguirlas por
     * su forma sería adivinar; `intent` lo dice. El campo es opcional, así que un
     * cliente que no lo mande simplemente no se cuenta.
     *
     * Y sólo si **no hubo problemas**: cuando el stock no alcanza, `addToCart`
     * lanza y no agrega nada. Contar el intento sería contar altas que no
     * ocurrieron.
     */
    const esAlta = (cuerpo as { intent?: unknown } | undefined)?.intent === 'add';
    if (esAlta && resultado.issues.length === 0) {
      anotar(locals, 'add_to_cart', '/api/cart/validate', {
        variantId: resultado.lines[0]?.variantId,
        quantity: resultado.lines[0]?.quantity,
      });
    }

    /*
     * El cupón, cuando resolvió de verdad. El checkout revalida en cada cambio
     * del carrito y lo reenvía siempre, así que esto llega muchas veces por un
     * solo cupón: la clave de deduplicación —sesión más código— las colapsa.
     */
    if (codigo && !dinero.couponIssue && dinero.applied.length > 0) {
      anotar(locals, 'coupon_applied', '/api/cart/validate', { code: codigo });
    }

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
      shipping: costoDeEnvio,
      // Con el envío adentro, porque es lo que se va a cobrar. Mostrar el total
      // de los productos y el flete aparte, sin sumarlos, es cómo alguien llega
      // al banco con un número distinto del que vio.
      total: addMoney(dinero.total, costoDeEnvio),
      ...(dinero.applied.length > 0 ? { appliedPromotions: dinero.applied } : {}),
      ...(dinero.couponIssue ? { couponIssue: dinero.couponIssue } : {}),
    });
  } catch (error) {
    return falla('cart/validate', error);
  }
};
