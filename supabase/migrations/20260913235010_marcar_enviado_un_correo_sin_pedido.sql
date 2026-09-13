-- Un correo sin pedido se puede marcar como enviado.
--
-- `mark_notification_sent` hacía dos cosas: marcaba la fila y dejaba un
-- `email_sent` en la timeline del pedido (ADR-102, para que un aviso que no sale
-- deje de perderse). La segunda asumía que toda fila de la cola tiene un pedido,
-- que era cierto hasta que el código de acceso entró a la misma cola con
-- `order_id` nulo (ADR-123).
--
-- **El modo de fallo era peor que un error.** El correo se mandaba —Resend ya
-- había aceptado— y recién después fallaba el marcado, así que la fila quedaba
-- pendiente y el siguiente drenaje la volvía a mandar. Un comprador que pide un
-- código recibía el mismo correo hasta cinco veces, una por visita al sitio.
-- Medido contra el proyecto real: la fila quedó en `sent_at is null` con el
-- correo entregado, y en la cola habían quedado dos filas de prueba con 3 y 1
-- intentos gastados de la misma forma.
--
-- La corrección es la guarda que faltaba. Un código de acceso **no** deja
-- entrada en ninguna timeline, y está bien que así sea: no hay pedido donde
-- ponerla, y el Admin no tiene por qué ver cuándo entra cada comprador.

create or replace function public.mark_notification_sent(
  p_store_id uuid,
  p_id       uuid
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_fila record;
begin
  update notification_outbox
  set sent_at = now()
  where id = p_id and store_id = p_store_id and sent_at is null
  returning * into v_fila;

  -- Ya estaba marcada: no se registra el envío dos veces en la timeline.
  if v_fila.id is null then
    return;
  end if;

  -- Sin pedido no hay timeline donde anotarlo. La fila queda marcada igual, que
  -- es lo único que impide que el correo se repita.
  if v_fila.order_id is null then
    return;
  end if;

  insert into order_events (tenant_id, order_id, type, data)
  values (
    v_fila.tenant_id, v_fila.order_id, 'email_sent',
    jsonb_build_object('event', v_fila.event, 'to', v_fila.recipient)
  );
end;
$$;

comment on function public.mark_notification_sent is
  'Marca un correo como enviado y lo deja en la timeline del pedido, si lo tiene. Idempotente.';
