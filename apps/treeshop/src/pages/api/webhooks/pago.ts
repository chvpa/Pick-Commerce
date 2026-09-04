import type { APIRoute } from 'astro';
import { pagosDelGateway, tiendaActual } from '../../../lib/db.ts';
import { drenarNotificaciones, enSegundoPlano } from '../../../lib/notificaciones.ts';
import { proveedorDePago, secretoDelWebhook } from '../../../lib/proveedor-de-pago.ts';
import { falla, json } from '../_respuesta.ts';

export const prerender = false;

/**
 * El aviso del gateway: el pago salió bien o no.
 *
 * Tres cosas que no se dan por sentadas, en este orden:
 *
 * 1. **Que el aviso venga del proveedor.** Se verifica la firma antes de mirar
 *    el contenido. Sin esto, un POST desde cualquier lado marcaría pedidos como
 *    pagados, que es la forma más directa de robarle a un comercio.
 * 2. **Que el pedido sea de esta tienda.** El aviso trae su propio `storeId` y se
 *    compara con el de este despliegue: un token legítimo de otro comercio no
 *    puede escribir acá.
 * 3. **Que llegue dos veces no importe.** `record_payment` no escribe nada si el
 *    estado ya es el mismo, así que un reintento del proveedor —y todos
 *    reintentan— no produce ni un segundo evento ni un segundo correo. Es la
 *    garantía «webhook repetido no duplica efectos» del Definition of Done.
 *
 * Responde de dos formas según quién pregunte: al formulario de la página de
 * pago le devuelve una redirección, y a un cliente que habla JSON le devuelve
 * JSON. El proveedor real usará lo segundo.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!secretoDelWebhook()) {
    // Sin el secreto no hay forma de distinguir un aviso legítimo de uno
    // inventado, y aceptar cualquiera sería peor que no aceptar ninguno.
    return json({ error: 'unavailable', message: 'El cobro no está configurado.' }, 503);
  }

  const cuerpo = await request.text().catch(() => '');
  if (!cuerpo) return json({ error: 'bad_request' }, 400);

  // Un solo proveedor por ahora; el real traerá una cabecera que diga cuál es.
  const proveedor = proveedorDePago('simulated_card');
  if (!proveedor) return json({ error: 'unavailable' }, 503);

  const cabeceras: Record<string, string> = {};
  request.headers.forEach((valor, nombre) => {
    cabeceras[nombre] = valor;
  });

  const resultado = await proveedor.verifyWebhook({ body: cuerpo, headers: cabeceras });
  if (!resultado.ok) {
    // El motivo va al log, no al cuerpo: a quien esté probando firmas no se le
    // explica cuál falló.
    console.warn('[webhook-pago] rechazado:', resultado.reason);
    return json({ error: 'forbidden' }, 403);
  }

  try {
    const { storeId } = await tiendaActual();
    if (resultado.storeId !== storeId) {
      console.warn('[webhook-pago] aviso para otra tienda');
      return json({ error: 'forbidden' }, 403);
    }

    await pagosDelGateway().registrar(
      storeId,
      resultado.orderId,
      resultado.status,
      resultado.reference,
    );

    // El cambio de estado ya encoló el correo que corresponda; esto lo empuja.
    await enSegundoPlano(locals, drenarNotificaciones());

    // El formulario de la página de pago espera volver a algún lado. Un cliente
    // que habla JSON —el proveedor real, o un test— espera una respuesta.
    const esFormulario = (request.headers.get('content-type') ?? '').includes(
      'application/x-www-form-urlencoded',
    );
    if (esFormulario) {
      const destino = new URL(
        `/checkout/confirmacion?pago=${resultado.status === 'paid' ? 'aprobado' : 'rechazado'}`,
        request.url,
      );
      return new Response(null, {
        // 303 y no 302: el navegador tiene que pasar de POST a GET al seguirla.
        status: 303,
        headers: { location: destino.href, 'cache-control': 'no-store' },
      });
    }

    return json({ ok: true, status: resultado.status });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : '';
    if (mensaje.includes('cancelado')) {
      return json({ error: 'order_cancelled', message: 'El pedido está cancelado.' }, 409);
    }
    return falla('webhook-pago', error);
  }
};
