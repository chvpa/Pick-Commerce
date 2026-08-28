import type { NotificationProvider } from '@pick/commerce-core';

/**
 * Correos por Resend (ADR-016).
 *
 * Sin el SDK: la superficie que se usa es **un** endpoint —`POST /emails`— y el
 * paquete oficial es un envoltorio de `fetch` alrededor de eso. Agregar una
 * dependencia para cuarenta líneas la hace más difícil de auditar, no menos, y
 * el stack cerrado nombra al proveedor, no a su cliente.
 *
 * Contrato verificado contra la documentación de Resend, no desde la memoria:
 * el header de idempotencia se llama `Idempotency-Key`, vence a las 24 horas y
 * admite hasta 256 caracteres. Se le pasa el id de la fila de la cola, que es
 * estable entre reintentos: si el proceso muere entre enviar y marcar, el
 * siguiente intento manda la misma clave y Resend no entrega dos veces.
 *
 * Los 24 horas importan: una fila que quede pendiente más que eso y se reintente
 * sí puede duplicar. El tope de cinco intentos hace que eso no ocurra en la
 * práctica —los cinco pasan en minutos— pero está dicho.
 */

const ENDPOINT = 'https://api.resend.com/emails';

/** Resend acota la clave; el id de una fila entra de sobra, pero no se asume. */
const LARGO_MAXIMO_DE_CLAVE = 256;

export function proveedorResend(opciones: { apiKey: string }): NotificationProvider {
  const { apiKey } = opciones;

  return {
    async send(correo): Promise<{ id: string }> {
      const respuesta = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'Idempotency-Key': correo.idempotencyKey.slice(0, LARGO_MAXIMO_DE_CLAVE),
        },
        body: JSON.stringify({
          from: correo.from,
          to: correo.to,
          subject: correo.subject,
          html: correo.html,
          // Las dos versiones siempre: un correo transaccional sin texto plano
          // tiene bastante más probabilidad de terminar en spam.
          text: correo.text,
        }),
      });

      if (!respuesta.ok) {
        // El detalle va al mensaje porque este error lo lee un log del servidor,
        // nunca un comprador. Sin él, un 422 por dominio sin verificar es
        // indistinguible de una clave vencida.
        const detalle = await respuesta.text().catch(() => '');
        throw new Error(
          `No se pudo enviar el correo (${respuesta.status}): ${detalle.slice(0, 300)}`,
        );
      }

      const cuerpo = (await respuesta.json()) as { id?: string };
      return { id: cuerpo.id ?? '' };
    },
  };
}
