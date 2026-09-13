/**
 * El email que llega en el cuerpo, normalizado.
 *
 * En minúsculas porque `customers` tiene `unique (store_id, email)` y
 * `create_order` guarda el email en minúsculas desde la Fase 5: entrar con
 * `Ana@…` y haber comprado como `ana@…` tiene que ser la misma persona, o la
 * cuenta aparece sin los pedidos que sí hizo.
 */
export function emailRecibido(cuerpo: unknown): string {
  const valor = (cuerpo as { email?: unknown })?.email;
  return typeof valor === 'string' ? valor.trim().toLowerCase().slice(0, 254) : '';
}

/** La misma forma mínima que valida el checkout, a propósito: es el mismo dato. */
export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
