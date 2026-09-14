/**
 * Cuentas de comprador, prendidas o apagadas por tienda.
 *
 * El interruptor vive en `store_settings.settings` y **no** en `feature_flags`,
 * que existe desde la Fase 3 y no tiene un solo lector: `store_settings` ya se
 * memoiza una vez por request y ya es donde están los otros interruptores del
 * comercio. Un lector nuevo escrito desde cero para una tabla vacía sería
 * infraestructura sin usuario.
 *
 * Apagado es el valor por defecto, y eso importa: un comercio que no las
 * habilitó vende exactamente igual que antes, sin una entrada de más en el
 * encabezado ni una página que prometa algo que su correo no puede entregar.
 */
export function cuentasHabilitadas(settings: unknown): boolean {
  return (settings as { accounts?: unknown } | null)?.accounts === true;
}
