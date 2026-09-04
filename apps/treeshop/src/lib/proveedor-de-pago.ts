import { getSecret } from 'astro:env/server';
import { METODO_SIMULADO, proveedorSimulado } from '@pick/adapter-payment-simulated';
import type { PaymentProvider } from '@pick/commerce-core';

/**
 * Qué proveedor resuelve cada forma de pago.
 *
 * `bank_transfer` **no está acá, y no es un olvido**: no hay nada que cobrar en
 * línea. El pedido queda pendiente y una persona mira el comprobante, así que un
 * `PaymentProvider` para transferencia sería un adaptador vacío alrededor de una
 * ausencia. Que devuelva `null` es la respuesta correcta.
 *
 * Hoy hay un solo proveedor y es simulado (ADR-080). Cuando aparezca uno real,
 * se agrega una línea acá y su adapter en `packages/adapter-payment-*`; nada
 * más de este archivo cambia.
 */
export function proveedorDePago(metodo: string): PaymentProvider | null {
  if (metodo !== METODO_SIMULADO) return null;

  const secret = secretoDelWebhook();
  // Sin el secreto no se pueden firmar ni verificar los avisos, y un pago que no
  // se puede verificar es peor que no ofrecerlo.
  return secret ? proveedorSimulado({ secret }) : null;
}

export function secretoDelWebhook(): string | undefined {
  try {
    return getSecret('PAYMENT_WEBHOOK_SECRET') || undefined;
  } catch {
    return undefined;
  }
}
