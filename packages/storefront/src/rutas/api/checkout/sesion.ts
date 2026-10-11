import type { APIRoute } from 'astro';
import { validarContacto } from '@pick/commerce-core';
import { clienteDelStorefront, tiendaActual } from '../../../lib/db.ts';
import { cuerpoJson, falla, json, lineasRecibidas, UUID } from '../../../lib/respuesta.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../../lib/limite.ts';

// On-demand: lo declara la integración con `prerender: false` (ADR-165).

/**
 * Guarda la sesión del checkout: el contacto del primer paso (ADR-167).
 *
 * El island la manda al pasar «Tus datos», sin esperarla: comprar no depende de
 * que esto responda. Es lo que permite escribirle a quien no terminó.
 *
 * - La **clave** es la de idempotencia del pedido. Volver a pasar el paso —con
 *   «Cambiar»— pisa la misma sesión, y el pedido que se cree con esa clave la
 *   borra (el trigger de la migración).
 * - El **contacto** se valida con la regla del pedido, en el core. Nada más del
 *   formulario viaja: el documento es de la factura.
 * - Las **líneas** van como en el carrito, variante y cantidad; los precios y
 *   los títulos los pone la base cuando alguien las lea.
 *
 * Tiene su propio freno, y no el del checkout: compartido, cada compra gastaba
 * dos y a quien compra desde la IP de una oficina le tocaba la mitad. Y lo
 * necesita: un script que la llene de correos ajenos haría que la tienda les
 * escriba.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!(await dentroDelLimite(request, 'SESION_LIMITE'))) return demasiadasPeticiones();

  const cuerpo = await cuerpoJson(request);
  const clave = (cuerpo as { idempotencyKey?: unknown } | undefined)?.idempotencyKey;
  const { lines, invalidas } = lineasRecibidas(cuerpo);

  if (
    typeof clave !== 'string' ||
    !UUID.test(clave) ||
    invalidas > 0 ||
    lines.length === 0 ||
    // Quien las lea las cruza con las variantes: un id que no es uuid rompería esa lectura.
    lines.some((l) => !UUID.test(l.variantId))
  ) {
    return json({ error: 'bad_request', message: 'La sesión está mal formada.' }, 400);
  }

  const { contacto, errores } = validarContacto(cuerpo);
  if (!contacto) return json({ error: 'invalid_data', errores }, 400);

  try {
    const { tenantId, storeId } = await tiendaActual();
    const { error } = await clienteDelStorefront()
      .from('checkout_sessions')
      .upsert(
        {
          tenant_id: tenantId,
          store_id: storeId,
          id: clave,
          ...contacto,
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id,id' },
      );
    if (error) throw new Error(`No se pudo guardar la sesión: ${error.message}`);
    return new Response(null, { status: 204 });
  } catch (error) {
    return falla('checkout/sesion', error);
  }
};
