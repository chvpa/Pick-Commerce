import { getSecret } from 'astro:env/server';
import {
  EVENTO_CODIGO,
  enlaceDelPedido,
  esEventoConocido,
  plantillaDeCodigo,
  plantillaDeCorreo,
  type MensajeDeCorreo,
  type NotificacionPendiente,
  type NotificationProvider,
} from '@pick/commerce-core';
import { proveedorResend } from '@pick/adapter-resend';
import { notificaciones, pagos, tiendaActual } from './db.ts';
import { SITE_URL } from './store-config.ts';

/**
 * El envío de los correos que la base encoló.
 *
 * La cola la llena un trigger dentro de la misma transacción que el evento del
 * pedido, así que «se creó el pedido pero no se avisó» es imposible. Lo que pasa
 * acá es sólo vaciarla.
 *
 * Se drena llamando a esta función, no pegándole a una URL: un Worker de
 * Cloudflare **no puede hacerse fetch a sí mismo** —da error 1042— así que el
 * checkout y el webhook la invocan directo. El único que entra por HTTP es el
 * Admin, que vive en otro dominio.
 */

/** Cuántos se intentan por drenaje. Cortar acotado evita agotar el tiempo del Worker. */
const POR_TANDA = 20;

/**
 * El proveedor de correo, o `null` si no hay clave.
 *
 * Sin clave el storefront funciona igual: se venden pedidos y la cola crece. Es
 * una degradación deliberada — que no se pueda avisar no es motivo para que no
 * se pueda comprar.
 */
export function proveedorDeCorreo(): NotificationProvider | null {
  const apiKey = leerSecreto('RESEND_API_KEY');
  return apiKey ? proveedorResend({ apiKey }) : null;
}

function leerSecreto(nombre: string): string | undefined {
  try {
    return getSecret(nombre) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * El remitente.
 *
 * Sin dominio verificado, Resend sólo entrega desde `onboarding@resend.dev` y
 * sólo a la casilla del dueño de la cuenta. Alcanza para desarrollo; para
 * escribirle a compradores reales hay que verificar un dominio y cargar
 * `EMAIL_FROM`.
 */
function remitente(): string {
  return leerSecreto('EMAIL_FROM') ?? 'Pick Commerce <onboarding@resend.dev>';
}

/**
 * Qué correo es esta fila, o `null` si este código no sabe redactarlo.
 *
 * La cola dejó de ser sólo de pedidos: el código de acceso sale por acá porque
 * es lo único del sistema que manda con el `EMAIL_FROM` de cada tienda, y un
 * correo al comprador tiene que salir de su comercio (ADR-123).
 */
function redactar(
  pendiente: NotificacionPendiente,
  tiendaNombre: string,
  locale: string,
  instrucciones?: string,
): MensajeDeCorreo | null {
  if (pendiente.event === EVENTO_CODIGO) {
    const codigo = pendiente.datos?.codigo;
    const minutos = pendiente.datos?.minutos;
    if (typeof codigo !== 'string' || typeof minutos !== 'number') return null;
    return plantillaDeCodigo({ tiendaNombre, codigo, minutos });
  }

  if (!esEventoConocido(pendiente.event) || !pendiente.order) return null;

  /*
   * El enlace para volver a ver el pedido (ADR-142), en todos los correos de
   * pedido. Sale del `SITE_URL` de esta app, que es la dirección pública de la
   * tienda: es la misma de donde salen el canonical y el sitemap.
   */
  const enlace = enlaceDelPedido(SITE_URL, pendiente.order);

  return plantillaDeCorreo(pendiente.event, {
    tiendaNombre,
    order: pendiente.order,
    locale,
    ...(instrucciones ? { instrucciones } : {}),
    ...(enlace ? { enlaceDelPedido: enlace } : {}),
  });
}

/**
 * Manda lo que haya pendiente. Devuelve cuántos salieron.
 *
 * Cada fallo se registra y se sigue con el siguiente: un correo con una
 * dirección inválida no puede trabar la cola de los demás. El intento ya se
 * contó al reclamar, así que la fila se reintentará hasta el tope y después se
 * abandona.
 */
export async function drenarNotificaciones(): Promise<number> {
  const proveedor = proveedorDeCorreo();
  if (!proveedor) return 0;

  const { storeId, name, locale } = await tiendaActual();
  const repo = notificaciones();
  const pendientes = await repo.reclamar(storeId, POR_TANDA);
  if (pendientes.length === 0) return 0;

  const formasDePago = await pagos();
  let enviados = 0;

  for (const pendiente of pendientes) {
    try {
      const mensaje = redactar(pendiente, name, locale, formasDePago.bankTransfer?.instructions);

      if (!mensaje) {
        // Se marca igual: una fila que este código no sabe redactar se
        // reintentaría para siempre, y taparía a las que sí.
        console.warn(`[notificaciones] sin plantilla para ${pendiente.event}, se descarta`);
        await repo.marcarEnviada(storeId, pendiente.id);
        continue;
      }

      await proveedor.send({
        to: pendiente.recipient,
        from: remitente(),
        subject: mensaje.asunto,
        html: mensaje.html,
        text: mensaje.texto,
        // El id de la fila: estable entre reintentos, así que si el proceso
        // muere entre enviar y marcar, el próximo intento no duplica el aviso.
        idempotencyKey: pendiente.id,
      });

      await repo.marcarEnviada(storeId, pendiente.id);
      enviados++;
    } catch (error) {
      console.error(`[notificaciones] ${pendiente.event} a ${pendiente.recipient}`, error);
    }
  }

  return enviados;
}

/**
 * Deja la promesa corriendo después de responder.
 *
 * En Workers, todo lo que no se registre con `waitUntil` se cancela al devolver
 * la respuesta. Sin esto, el correo se cortaría a mitad de camino en cuanto el
 * comprador viera la confirmación.
 *
 * Es `locals.cfContext` y no `locals.runtime.ctx`: el adapter movió el contexto
 * en Astro 6, y la forma vieja no falla al compilar sino al ejecutarse —lanza un
 * error que explica el cambio—. Lo destapó el primer pago de prueba.
 *
 * El `await` de respaldo es para `astro dev`, donde no hay runtime de
 * Cloudflare: ahí cuesta latencia, pero es desarrollo.
 */
export async function enSegundoPlano(locals: App.Locals, trabajo: Promise<unknown>): Promise<void> {
  const ctx = locals.cfContext;
  if (ctx?.waitUntil) {
    ctx.waitUntil(trabajo);
    return;
  }
  await trabajo.catch((error: unknown) => {
    console.error('[notificaciones] fallo en segundo plano', error);
  });
}
