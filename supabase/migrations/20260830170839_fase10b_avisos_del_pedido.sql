-- Fase 10 Etapa B — el estado de los avisos, visible desde el pedido.
--
-- Deuda de la Fase 7 que el ROADMAP tenía anotada: un correo que falla cinco
-- veces se abandona **en silencio**. Queda en `notification_outbox` con
-- `attempts = 5` y nadie se entera; hoy sólo se ve consultando la base.
--
-- Importa porque el comprador queda esperando un aviso que nunca sale, y el
-- comercio cree que salió: «te confirmamos el pedido» es parte de la venta, no
-- una cortesía.
--
-- **Va en el detalle del pedido y no en una pantalla de cola.** Es donde el
-- operador está cuando le importa —está mirando ese pedido porque el cliente
-- preguntó— y no obliga a cruzar dos listas. Una bandeja de la cola entera sería
-- otra pantalla para un problema que se atiende de a un pedido.

/*
 * `security definer`, y por eso la pertenencia se comprueba acá.
 *
 * `notification_outbox` no tiene políticas a propósito: guarda el pedido
 * serializado con la dirección del comprador, y sólo la clave secreta lo toca.
 * Esta función expone **metadatos** —qué aviso, a quién, cuántos intentos, si
 * salió— y nunca el payload.
 *
 * Saltear RLS significa que el filtro por organización es esta línea y ninguna
 * otra. Sin ella, cualquier usuario del Admin leería la cola de cualquier
 * comercio pasando un id.
 */
create or replace function public.admin_order_notifications(
  p_store_id uuid,
  p_order_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'event', n.event,
        'recipient', n.recipient,
        'attempts', n.attempts,
        'sentAt', n.sent_at,
        'createdAt', n.created_at
      ) order by n.created_at
    ),
    '[]'::jsonb
  )
  from notification_outbox n
  where n.store_id = p_store_id
    and n.order_id = p_order_id
    and n.tenant_id in (select app.current_tenants());
$$;

comment on function public.admin_order_notifications is
  'Estado de los avisos de un pedido. Metadatos, nunca el payload: la cola guarda la dirección del comprador.';

revoke all on function public.admin_order_notifications(uuid, uuid) from public, anon;
grant execute on function public.admin_order_notifications(uuid, uuid) to authenticated;
