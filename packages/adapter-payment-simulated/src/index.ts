import type {
  PaymentProvider,
  PaymentRedirect,
  PaymentRequest,
  WebhookResult,
} from '@pick/commerce-core';

/**
 * Un gateway de pago **simulado**, y declarado como tal en todas partes.
 *
 * No imita a Bancard, ni a Pagopar, ni a nadie: inventar el comportamiento de un
 * proveedor real desde la memoria es exactamente lo que produce adapters que
 * fallan recién en producción, con plata de por medio. Cuando haya credenciales
 * de sandbox de un proveedor de verdad, se escribe su adapter contra su
 * documentación y este queda para desarrollo.
 *
 * Lo que **sí** ejercita, y por eso vale la pena que exista:
 *
 * - el checkout redirigiendo a una página de pago externa;
 * - un webhook firmado que hay que verificar antes de creerle;
 * - el mismo webhook llegando dos veces;
 * - un pago rechazado, que es el camino que nadie prueba y siempre está roto.
 *
 * Lo que **no** valida: conciliación real, cuotas, monedas del proveedor,
 * tiempos de acreditación, ni ninguno de los modos de fallo que sólo aparecen
 * cuando hay un tercero del otro lado.
 *
 * No guarda estado. Todo lo que el flujo necesita viaja dentro de un token
 * firmado, así que no hace falta ninguna tabla de intentos de pago: el gateway
 * real va a traer su propio identificador y su propia forma de consultarlo.
 */

const CODIFICADOR = new TextEncoder();

interface DatosDelPago {
  readonly orderId: string;
  readonly storeId: string;
  readonly orderNumber: number;
  readonly amount: number;
  readonly currency: string;
  readonly returnUrl: string;
  readonly failureUrl: string;
  readonly webhookUrl: string;
  readonly reference: string;
  /** Presente sólo en los tokens que produce la página de pago. */
  readonly status?: 'paid' | 'failed';
}

function aBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto: string): Uint8Array {
  const relleno = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(relleno.padEnd(Math.ceil(relleno.length / 4) * 4, '='));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

async function clave(secreto: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    CODIFICADOR.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Firma los datos y los devuelve como `payload.firma`.
 *
 * El payload viaja en claro —no es secreto, es el pedido que el comprador está
 * mirando— y lo que la firma garantiza es que nadie le cambió el monto ni el
 * resultado por el camino.
 */
export async function firmarToken(datos: DatosDelPago, secreto: string): Promise<string> {
  const payload = aBase64Url(CODIFICADOR.encode(JSON.stringify(datos)));
  const firma = await crypto.subtle.sign('HMAC', await clave(secreto), CODIFICADOR.encode(payload));
  return `${payload}.${aBase64Url(new Uint8Array(firma))}`;
}

/**
 * Verifica y devuelve los datos, o `null`.
 *
 * `crypto.subtle.verify` compara en tiempo constante, que es lo que evita que se
 * pueda adivinar una firma midiendo cuánto tarda el rechazo.
 */
export async function verificarToken(
  token: string,
  secreto: string,
): Promise<DatosDelPago | null> {
  const corte = token.lastIndexOf('.');
  if (corte <= 0) return null;

  const payload = token.slice(0, corte);
  const firma = token.slice(corte + 1);

  try {
    const valida = await crypto.subtle.verify(
      'HMAC',
      await clave(secreto),
      deBase64Url(firma) as unknown as ArrayBuffer,
      CODIFICADOR.encode(payload),
    );
    if (!valida) return null;
    return JSON.parse(new TextDecoder().decode(deBase64Url(payload))) as DatosDelPago;
  } catch {
    // Base64 roto, JSON roto, lo que sea: un token que no se puede leer es un
    // token que no se acepta.
    return null;
  }
}

/** El identificador del método en `settings.payments.enabled`. */
export const METODO_SIMULADO = 'simulated_card';

export function proveedorSimulado(opciones: { secret: string }): PaymentProvider {
  const { secret } = opciones;

  return {
    id: METODO_SIMULADO,

    async createPayment(request: PaymentRequest): Promise<PaymentRedirect> {
      const reference = `sim_${crypto.randomUUID()}`;
      const token = await firmarToken(
        {
          orderId: request.orderId,
          storeId: request.storeId,
          orderNumber: request.orderNumber,
          amount: request.amount.amount,
          currency: request.amount.currency,
          returnUrl: request.returnUrl,
          failureUrl: request.failureUrl,
          webhookUrl: request.webhookUrl,
          reference,
        },
        secret,
      );

      // La página de pago vive en el propio storefront: un gateway real la sirve
      // él, pero el simulado no tiene dónde, y montar un segundo despliegue para
      // esto sería absurdo. La URL se arma relativa a la de retorno para que
      // funcione igual en local, en preview y en producción.
      const url = new URL('/pago/simulado', request.returnUrl);
      url.search = `?token=${encodeURIComponent(token)}`;
      return { url: url.href, reference };
    },

    async getPaymentStatus(): Promise<null> {
      // Declarado: este proveedor no guarda estado, así que no puede responderlo.
      // Devolver `pending` sería inventar.
      return null;
    },

    async verifyWebhook(request): Promise<WebhookResult> {
      const token = leerToken(request.body);
      if (!token) return { ok: false, reason: 'El aviso no trae token' };

      const datos = await verificarToken(token, secret);
      if (!datos) return { ok: false, reason: 'La firma no es válida' };
      if (datos.status !== 'paid' && datos.status !== 'failed') {
        return { ok: false, reason: 'El aviso no dice cómo terminó el pago' };
      }

      return {
        ok: true,
        orderId: datos.orderId,
        storeId: datos.storeId,
        status: datos.status,
        reference: datos.reference,
      };
    },

    async healthCheck(): Promise<boolean> {
      return secret.length > 0;
    },
  };
}

/**
 * El token puede llegar como JSON o como formulario.
 *
 * La página de pago lo manda con un `<form>` —para que funcione sin JavaScript—
 * y los tests lo mandan como JSON. Los dos son el mismo aviso.
 */
function leerToken(body: string): string | null {
  const crudo = body.trim();
  if (!crudo) return null;

  if (crudo.startsWith('{')) {
    try {
      const objeto = JSON.parse(crudo) as { token?: unknown };
      return typeof objeto.token === 'string' ? objeto.token : null;
    } catch {
      return null;
    }
  }

  const token = new URLSearchParams(crudo).get('token');
  return token && token.length > 0 ? token : null;
}

/**
 * Acuña el token que la página de pago le manda al webhook.
 *
 * Conserva todo lo que venía del token de entrada y le agrega cómo terminó: el
 * webhook recibe un aviso firmado por el mismo secreto, igual que si viniera de
 * un proveedor.
 */
export async function firmarResultado(
  datos: DatosDelPago,
  status: 'paid' | 'failed',
  secreto: string,
): Promise<string> {
  return firmarToken({ ...datos, status }, secreto);
}

export type { DatosDelPago };
