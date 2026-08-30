import type { Order } from '@pick/commerce-types';
import { formatMoney } from './money.ts';

/**
 * Correos transaccionales (PROJECT.md §24).
 *
 * Cuatro eventos y no los ocho de la lista: `welcome` y `back_in_stock` exigen
 * cuentas de comprador y suscripciones que no existen, y `order_preparing` es
 * ruido —al comprador le importa que salió, no que lo están empacando—. Los que
 * faltan se agregan cuando haya a quién mandárselos.
 *
 * Las plantillas son funciones puras acá y no en el adapter del proveedor: no
 * dependen de Resend, se prueban sin red, y el día que haya un segundo proveedor
 * no hay que reescribirlas.
 */

export type EventoDeNotificacion =
  'order_received' | 'order_confirmed' | 'order_shipped' | 'order_delivered';

export const EVENTOS_DE_NOTIFICACION: readonly EventoDeNotificacion[] = [
  'order_received',
  'order_confirmed',
  'order_shipped',
  'order_delivered',
];

export const ETIQUETA_EVENTO: Readonly<Record<EventoDeNotificacion, string>> = {
  order_received: 'Pedido recibido',
  order_confirmed: 'Pago confirmado',
  order_shipped: 'Pedido enviado',
  order_delivered: 'Pedido entregado',
};

export interface MensajeDeCorreo {
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
}

export interface ContextoDeCorreo {
  readonly tiendaNombre: string;
  readonly order: Order;
  /**
   * Instrucciones de transferencia. Sólo se usan al avisar que el pedido se
   * recibió y sólo si se va a pagar por transferencia: en cualquier otro caso
   * son instrucciones para pagar algo que ya se pagó.
   */
  readonly instrucciones?: string;
  readonly locale?: string;
}

/** Sin dependencias: escapa lo que va dentro del HTML del correo. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lineaDeItem(item: Order['items'][number], locale: string): string {
  const variante = item.variantTitle ? ` · ${item.variantTitle}` : '';
  return `${item.quantity} × ${item.title}${variante} — ${formatMoney(item.unitPrice, locale)}`;
}

/** Qué dice cada correo, más allá del detalle del pedido. */
function cuerpoDelEvento(
  evento: EventoDeNotificacion,
  ctx: ContextoDeCorreo,
): { asunto: string; encabezado: string; parrafo: string } {
  const n = ctx.order.number;
  switch (evento) {
    case 'order_received':
      return {
        asunto: `Recibimos tu pedido #${n} — ${ctx.tiendaNombre}`,
        encabezado: 'Recibimos tu pedido',
        parrafo:
          ctx.order.paymentStatus === 'paid'
            ? 'Ya está pago. Te avisamos cuando salga.'
            : 'Todavía no está pago. Abajo te contamos cómo completarlo.',
      };
    case 'order_confirmed':
      return {
        asunto: `Confirmamos el pago de tu pedido #${n} — ${ctx.tiendaNombre}`,
        encabezado: 'Confirmamos tu pago',
        parrafo: 'Ya estamos preparando tu pedido. Te avisamos cuando salga.',
      };
    case 'order_shipped':
      return {
        asunto: `Tu pedido #${n} está en camino — ${ctx.tiendaNombre}`,
        encabezado: 'Tu pedido salió',
        parrafo: 'Va en camino a la dirección que nos diste.',
      };
    case 'order_delivered':
      return {
        asunto: `Entregamos tu pedido #${n} — ${ctx.tiendaNombre}`,
        encabezado: 'Tu pedido llegó',
        parrafo: 'Gracias por comprar con nosotros.',
      };
    default: {
      // Un evento que nadie sabe redactar no se manda vacío: se corta acá, que
      // es donde se puede leer el nombre del evento que falta.
      const desconocido: never = evento;
      throw new Error(`No hay plantilla para el evento ${String(desconocido)}`);
    }
  }
}

/**
 * El correo de un evento, en HTML y en texto plano.
 *
 * HTML mínimo con estilos en línea: los clientes de correo ignoran las hojas de
 * estilo y muchos recortan el `<head>`. Se manda siempre la versión de texto
 * junto a la HTML — no es cortesía, es lo que separa un correo transaccional de
 * uno que termina en spam.
 */
export function plantillaDeCorreo(
  evento: EventoDeNotificacion,
  ctx: ContextoDeCorreo,
): MensajeDeCorreo {
  const { order } = ctx;
  const locale = ctx.locale ?? 'es-PY';
  const { asunto, encabezado, parrafo } = cuerpoDelEvento(evento, ctx);

  // Sólo al recibir el pedido, y sólo si se paga por transferencia.
  const instrucciones =
    evento === 'order_received' && order.paymentMethod === 'bank_transfer'
      ? ctx.instrucciones
      : undefined;

  const items = order.items.map((i) => lineaDeItem(i, locale));
  const total = formatMoney(order.total, locale);
  /*
   * El envío sólo aparece si se cobró. Un renglón que dice «Envío: Gs. 0» en el
   * correo de una tienda que no despacha es ruido; que **no** aparezca cuando sí
   * se cobró sería peor: el total no cerraría con la suma de las líneas y el
   * comprador escribiría para preguntar por qué.
   */
  const envio = order.shipping.amount > 0 ? formatMoney(order.shipping, locale) : null;
  const direccion = [order.address.street, order.address.city, order.address.reference]
    .filter(Boolean)
    .join(', ');

  const texto = [
    `${encabezado} #${order.number}`,
    '',
    parrafo,
    '',
    'Detalle:',
    ...items.map((l) => `  ${l}`),
    ...(envio ? [`  Envío: ${envio}`] : []),
    `  Total: ${total}`,
    '',
    `Enviamos a: ${direccion}`,
    ...(instrucciones
      ? [
          '',
          'Cómo pagar:',
          instrucciones,
          '',
          `Indicá el número #${order.number} al enviar el comprobante.`,
        ]
      : []),
    '',
    ctx.tiendaNombre,
  ].join('\n');

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
  <h1 style="font-size:19px;margin:0 0 4px">${escapar(encabezado)} <span style="color:#666">#${order.number}</span></h1>
  <p style="margin:0 0 20px;color:#444">${escapar(parrafo)}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tbody>
      ${order.items
        .map(
          (i) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee">${escapar(i.title)}${
          i.variantTitle ? ` <span style="color:#666">· ${escapar(i.variantTitle)}</span>` : ''
        }<br><span style="color:#666;font-size:13px">${i.quantity} × ${escapar(formatMoney(i.unitPrice, locale))}</span></td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${escapar(
          formatMoney(
            { amount: i.unitPrice.amount * i.quantity, currency: i.unitPrice.currency },
            locale,
          ),
        )}</td>
      </tr>`,
        )
        .join('\n      ')}
      ${
        envio
          ? `<tr>
        <td style="padding:6px 0;color:#666">Envío</td>
        <td style="padding:6px 0;text-align:right;color:#666;white-space:nowrap">${escapar(envio)}</td>
      </tr>`
          : ''
      }
      <tr>
        <td style="padding:10px 0;font-weight:600">Total</td>
        <td style="padding:10px 0;text-align:right;font-weight:600;white-space:nowrap">${escapar(total)}</td>
      </tr>
    </tbody>
  </table>
  <p style="margin:0 0 20px;color:#444"><strong>Enviamos a:</strong> ${escapar(direccion)}</p>
  ${
    instrucciones
      ? `<div style="background:#f6f6f6;border-radius:8px;padding:14px;margin-bottom:20px">
    <p style="margin:0 0 6px;font-weight:600">Cómo pagar</p>
    <p style="margin:0 0 8px;white-space:pre-line">${escapar(instrucciones)}</p>
    <p style="margin:0;color:#444">Indicá el número <strong>#${order.number}</strong> al enviar el comprobante.</p>
  </div>`
      : ''
  }
  <p style="margin:0;color:#666;font-size:13px">${escapar(ctx.tiendaNombre)}</p>
</div>`;

  return { asunto, html, texto };
}

/**
 * El puerto del proveedor de correo (PROJECT.md §24).
 *
 * `idempotencyKey` no es opcional: es lo que impide que un reintento le mande el
 * mismo aviso dos veces al comprador. Un proveedor que no sepa deduplicar tiene
 * que resolverlo por su cuenta, no ignorarlo.
 */
export interface NotificationProvider {
  send(correo: {
    readonly to: string;
    readonly from: string;
    readonly subject: string;
    readonly html: string;
    readonly text: string;
    readonly idempotencyKey: string;
  }): Promise<{ readonly id: string }>;
}

export interface NotificacionPendiente {
  readonly id: string;
  readonly orderId: string;
  /** Texto y no el union: la cola puede tener un evento que este código no conoce. */
  readonly event: string;
  readonly recipient: string;
  readonly order: Order;
}

export interface RepositorioNotificaciones {
  /** Toma pendientes y cuenta el intento, de una sola vez. */
  reclamar(storeId: string, limite?: number): Promise<readonly NotificacionPendiente[]>;
  marcarEnviada(storeId: string, id: string): Promise<void>;
}

/** Si este código sabe redactar ese evento. */
export function esEventoConocido(evento: string): evento is EventoDeNotificacion {
  return (EVENTOS_DE_NOTIFICACION as readonly string[]).includes(evento);
}
