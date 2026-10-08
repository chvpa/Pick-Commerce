-- Un correo al equipo por cada pedido que entra (ADR-156).
--
-- Hasta acá todo correo de la cola iba a quien compró. Éste va a las personas del
-- comercio que lo pidieron en «Mi cuenta», una fila por persona.
--
-- **Apagado por defecto.** Prenderlo para todos al desplegar le empezaría a
-- escribir a cuentas que nunca lo pidieron, y sin dominio verificado en Resend
-- el correo sólo llega al dueño de la cuenta: el resto fallaría cinco veces.
--
-- **Sin `order_id`**, con el pedido en el payload, como el código de acceso. Las
-- tres vistas de «avisos que no salieron» —el Inicio, la bandeja de pedidos y el
-- detalle del pedido— filtran por `order_id`, y un correo al equipo que no salió
-- no es un comprador que se quedó sin aviso: mostrarlo ahí diría lo contrario de
-- lo que pasó.

alter table memberships
  add column notify_new_order boolean not null default false;

comment on column memberships.notify_new_order is
  'Si esta persona recibe un correo por cada pedido nuevo de esta organización. Lo decide ella, en Mi cuenta.';

/*
 * Cada persona prende o apaga **sus** avisos, en su organización. `definer`
 * porque escribir `memberships` es de quien administra el equipo, y esto no
 * puede depender de eso: el personal también decide qué le llega. La identidad
 * va en la línea del `where`.
 */
create or replace function public.set_my_new_order_notice(p_tenant uuid, p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update memberships
  set notify_new_order = coalesce(p_on, false), updated_at = now()
  where tenant_id = p_tenant and user_id = auth.uid();

  if not found then
    raise exception 'No sos parte de esa organización.';
  end if;
end;
$$;

comment on function public.set_my_new_order_notice(uuid, boolean) is
  'Prende o apaga el correo de pedido nuevo de quien llama, en una organización suya.';

revoke all on function public.set_my_new_order_notice(uuid, boolean) from public, anon;
grant execute on function public.set_my_new_order_notice(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- El trigger de correos, con el aviso al equipo
-- ---------------------------------------------------------------------------

create or replace function app.queue_order_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_evento text;
  v_orden  record;
begin
  if new.type = 'created' then
    v_evento := 'order_received';
  elsif new.type = 'payment_changed' and new.data->>'to' = 'paid' then
    v_evento := 'order_confirmed';
  elsif new.type = 'status_changed' and new.data->>'to' = 'shipped' then
    v_evento := 'order_shipped';
  elsif new.type = 'status_changed' and new.data->>'to' = 'delivered' then
    v_evento := 'order_delivered';
  else
    return new;
  end if;

  select id, tenant_id, store_id, customer, is_demo
    into v_orden from orders where id = new.order_id;
  if v_orden.id is null then
    return new;
  end if;

  -- Un pedido de demostración no le escribe a nadie (ADR-108): ni al comprador
  -- ni al equipo, que lo ve entrar en el Admin.
  if v_orden.is_demo then
    return new;
  end if;

  -- Al equipo, antes de mirar el correo del comprador: que el comprador no lo
  -- haya dejado no es motivo para que la tienda no se entere.
  if v_evento = 'order_received' then
    insert into notification_outbox (tenant_id, store_id, order_id, event, recipient, payload)
    select v_orden.tenant_id, v_orden.store_id, null, 'team_new_order', u.email,
           jsonb_build_object('order', order_json(v_orden.id))
    from memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = v_orden.tenant_id
      and m.notify_new_order
      and coalesce(u.email, '') <> '';
  end if;

  -- Sin correo no hay a quién escribirle. No es un error: el checkout lo exige,
  -- pero un pedido cargado por otra vía podría no tenerlo.
  if coalesce(v_orden.customer->>'email', '') = '' then
    return new;
  end if;

  insert into notification_outbox (tenant_id, store_id, order_id, event, recipient, payload)
  values (
    v_orden.tenant_id, v_orden.store_id, v_orden.id, v_evento,
    v_orden.customer->>'email',
    jsonb_build_object('order', order_json(v_orden.id))
  );

  return new;
end;
$$;
