import type { Money, Order } from '@pick/commerce-types';

/**
 * El puerto de los medios de pago (PROJECT.md §14).
 *
 * Existe para que Orders no se acople a ningún proveedor: el checkout pide un
 * cobro y recibe a dónde mandar al comprador, sin saber si del otro lado hay
 * Bancard, Pagopar o el simulado de desarrollo.
 *
 * Se abstrae desde v1 aunque hoy haya una sola implementación, que es una de las
 * excepciones declaradas a la regla anti-overengineering: se sabe que va a haber
 * varios, y el mercado paraguayo tiene al menos cuatro candidatos.
 *
 * **La transferencia bancaria no pasa por acá.** No hay nada que cobrar en
 * línea: el pedido queda pendiente y una persona mira el comprobante. Un
 * `PaymentProvider` para transferencia sería un adaptador vacío alrededor de una
 * ausencia.
 */

export interface PaymentRequest {
  readonly storeId: string;
  readonly orderId: string;
  /** El número legible: es lo que el comprador reconoce en la pantalla del pago. */
  readonly orderNumber: number;
  readonly amount: Money;
  /** A dónde vuelve el browser si el pago sale bien. */
  readonly returnUrl: string;
  /** A dónde vuelve si lo rechazan. */
  readonly failureUrl: string;
  /** A dónde avisa el proveedor, de servidor a servidor. */
  readonly webhookUrl: string;
}

export interface PaymentRedirect {
  /** La página del proveedor donde se paga. */
  readonly url: string;
  /**
   * El identificador del cobro **del lado del proveedor**. Se guarda con el
   * evento del pedido: el día que un pago no cuadre, es lo único que permite
   * buscarlo en el panel del proveedor.
   */
  readonly reference: string;
}

export type WebhookResult =
  | {
      readonly ok: true;
      readonly orderId: string;
      readonly storeId: string;
      readonly status: 'paid' | 'failed';
      readonly reference: string;
    }
  | { readonly ok: false; readonly reason: string };

export interface PaymentProvider {
  /** Coincide con el id del método en `settings.payments.enabled`. */
  readonly id: string;

  createPayment(request: PaymentRequest): Promise<PaymentRedirect>;

  /**
   * Consulta el estado a demanda. Devuelve `null` cuando el proveedor no puede
   * responderlo —el simulado no guarda estado— y eso es distinto de «no se
   * sabe»: quien la llame tiene que decidir qué hace con un `null`, en vez de
   * recibir un `pending` inventado.
   */
  getPaymentStatus(reference: string): Promise<'pending' | 'paid' | 'failed' | null>;

  /**
   * Verifica que el aviso venga del proveedor y no de cualquiera.
   *
   * Recibe el cuerpo **crudo**, no parseado: casi todas las firmas se calculan
   * sobre los bytes exactos, y volver a serializar un objeto cambia el orden de
   * las claves y rompe la comprobación.
   */
  verifyWebhook(request: {
    readonly body: string;
    readonly headers: Readonly<Record<string, string>>;
  }): Promise<WebhookResult>;

  healthCheck(): Promise<boolean>;

  /**
   * Opcional a propósito: no todos los proveedores dejan cancelar un cobro
   * pendiente, y prometerlo en la interfaz obligaría a los que no pueden a
   * mentir con un no-op. Quien lo necesite pregunta si existe.
   */
  cancelPayment?(reference: string): Promise<void>;
}

export interface RepositorioPagos {
  /**
   * Registra lo que informó el proveedor. Idempotente del otro lado: el mismo
   * estado no vuelve a escribir nada, que es lo que hace inofensivo el reintento
   * de un webhook.
   */
  registrar(
    storeId: string,
    orderId: string,
    estado: 'paid' | 'failed',
    referencia: string,
    nota?: string,
  ): Promise<Order>;
}
