import type { APIRoute } from 'astro';
import { validarDatosDeCheckout, zonaDeEnvio } from '@pick/commerce-core';
import { checkout, envio, pagos, tiendaActual } from '../../lib/db.ts';
import { drenarNotificaciones, enSegundoPlano } from '../../lib/notificaciones.ts';
import { anotar } from '../../lib/analytics.ts';
import { proveedorDePago } from '../../lib/proveedor-de-pago.ts';
import { cuerpoJson, falla, json, lineasRecibidas } from './_respuesta.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../lib/limite.ts';

export const prerender = false;

/** Un uuid v4 de verdad, no cualquier texto: es la clave del `unique` de la base. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Crea el pedido.
 *
 * Todo lo que decide algo pasa del lado del servidor:
 *
 * - La **tienda** sale de `tiendaActual()`. El cuerpo no trae `storeId` ni
 *   podría: sería la única forma de escribir un pedido en otro comercio.
 * - Los **precios** los lee `create_order` de la base. Del carrito sólo viajan
 *   `variantId` y `quantity`.
 * - Los **datos del cliente** se revalidan con la misma función que corre en el
 *   island. Que corra en los dos lados es el punto: el servidor no puede confiar
 *   en que el browser validó.
 * - La **forma de pago** tiene que estar habilitada para esta tienda (ADR-021).
 *
 * La clave de idempotencia la genera el checkout al montarse y la conserva entre
 * reintentos. Con la misma clave, la base devuelve el pedido que ya existe en
 * vez de crear otro: es lo que cumple «no se crea doble order por reintento
 * simple» de la Definition of Done.
 *
 * Con una forma de pago que tenga proveedor, la respuesta trae además a dónde
 * mandar al comprador. El pedido **ya existe** para entonces: se crea antes de
 * cobrar, no después. Es lo que permite que un pago rechazado deje un pedido que
 * el comercio puede rescatar por otro medio, en vez de un carrito perdido.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!(await dentroDelLimite(request, 'CHECKOUT_LIMITE'))) return demasiadasPeticiones();

  const cuerpo = await cuerpoJson(request);
  const bruto = (cuerpo ?? {}) as Record<string, unknown>;

  const clave = typeof bruto.idempotencyKey === 'string' ? bruto.idempotencyKey : '';
  if (!UUID.test(clave)) {
    return json({ error: 'bad_request', message: 'Falta la clave del pedido.' }, 400);
  }

  const { lines: lineas, invalidas } = lineasRecibidas(cuerpo);
  if (invalidas > 0) {
    return json({ error: 'bad_request', message: 'El carrito tiene líneas mal formadas.' }, 400);
  }
  if (lineas.length === 0) {
    return json({ error: 'empty_cart', message: 'Tu carrito está vacío.' }, 400);
  }

  const { datos, errores } = validarDatosDeCheckout(cuerpo);
  if (!datos) return json({ error: 'invalid_data', errores }, 400);

  try {
    const [{ storeId }, formasDePago] = await Promise.all([tiendaActual(), pagos()]);

    if (!formasDePago.enabled.includes(datos.paymentMethod)) {
      return json(
        {
          error: 'invalid_data',
          errores: { paymentMethod: 'Esa forma de pago no está disponible.' },
        },
        400,
      );
    }

    // Con envío por zona, la zona tiene que ser una de la tabla: `create_order`
    // cobraría la tarifa general a un destino inventado, y eso sería un error
    // silencioso del comprador convertido en un cobro. Mejor decirlo acá.
    const configuracionEnvio = await envio();
    if (
      configuracionEnvio.mode === 'zones' &&
      !zonaDeEnvio(configuracionEnvio, datos.address.zone)
    ) {
      return json(
        { error: 'invalid_data', errores: { zone: 'Elegí el departamento de entrega.' } },
        400,
      );
    }

    // El cupón viaja como código y se acota antes de mandarlo; el descuento lo
    // calcula `create_order` contra la base. Un monto en el payload no tiene
    // dónde entrar, igual que un precio.
    const codigo = typeof bruto.couponCode === 'string' ? bruto.couponCode.trim().slice(0, 64) : '';

    const resultado = await checkout().crearPedido(storeId, clave, {
      ...datos,
      lines: lineas,
      ...(codigo ? { couponCode: codigo } : {}),
    });

    if ('issues' in resultado) {
      // 409 y no 400: la petición estaba bien formada, el mundo cambió mientras
      // la persona compraba. El checkout usa eso para corregir el carrito y
      // dejarla reintentar con la misma clave.
      return json({ error: 'invalid_cart', issues: resultado.issues }, 409);
    }

    const { order } = resultado;

    /*
     * La compra.
     *
     * Existe para saber **qué sesión** compró — el dinero y la cantidad de
     * pedidos salen de `orders`, que es la fuente de verdad, y por eso la
     * conversión coincide con la facturación por construcción.
     *
     * Se anota en las tres ramas que devuelven 201 porque en las tres el pedido
     * ya existe. Que una de ellas sea un reintento con la misma clave de
     * idempotencia —que devuelve el pedido que ya estaba— lo resuelve la clave de
     * deduplicación, que es el id del pedido.
     */
    anotar(locals, 'checkout_completed', '/api/checkout', { orderId: order.id });

    // El aviso de «recibimos tu pedido» ya está encolado por el trigger; esto
    // sólo lo empuja. Va en segundo plano: el comprador no tiene por qué esperar
    // a que salga un correo para ver su confirmación.
    await enSegundoPlano(locals, drenarNotificaciones());

    const proveedor = proveedorDePago(datos.paymentMethod);
    if (!proveedor) return json({ order }, 201);

    try {
      const pago = await proveedor.createPayment({
        storeId,
        orderId: order.id,
        orderNumber: order.number,
        amount: order.total,
        returnUrl: new URL('/checkout/confirmacion?pago=aprobado', request.url).href,
        failureUrl: new URL('/checkout/confirmacion?pago=rechazado', request.url).href,
        webhookUrl: new URL('/api/webhooks/pago', request.url).href,
      });
      return json({ order, pago: { url: pago.url } }, 201);
    } catch (error) {
      // El pedido ya está creado y el stock descontado: devolverlo sin URL de
      // pago es mucho mejor que fallar. La confirmación lo muestra pendiente y
      // el comercio puede cobrarlo por otro medio.
      console.error('[checkout] el proveedor de pago no respondió', error);
      return json({ order }, 201);
    }
  } catch (error) {
    return falla('checkout', error);
  }
};
