-- Fase 7: cobro por gateway, correos transaccionales y medios propios.
--
-- Tres cosas que no existían y una que existía a medias:
--
--   `record_payment`        el camino del **webhook**. `admin_set_payment_status`
--                           no sirve: es `security invoker` con grant sólo a
--                           `authenticated`, y un webhook llega con la secret
--                           key, que no tiene membresías que consultar.
--
--   `notification_outbox`   la cola de correos, llenada por un trigger sobre
--                           `order_events`. Encolar en la misma transacción que
--                           el evento es lo que hace imposible «se creó el
--                           pedido pero no se encoló el aviso».
--
--   bucket `product-media`  medios propios, que es lo que cierra P-002: sin un
--                           host estable no hay nada que autorizar en el
--                           optimizador de imágenes (ADR-079).

-- ---------------------------------------------------------------------------
-- Un pago puede fallar
-- ---------------------------------------------------------------------------
--
-- `refunded` **no** se agrega: devolver plata es un refund y los refunds están
-- fuera del core (ADR-008). Un estado que nada sabe producir es una promesa
-- vacía en un `select`.
--
-- Postgres no deja usar un valor de enum en la misma transacción que lo crea.
-- Acá no muerde: nada en esta migración hace DML con 'failed', y el cuerpo de
-- una función es texto que no se evalúa al crearla.

alter type payment_status add value if not exists 'failed';

-- ---------------------------------------------------------------------------
-- Registrar un pago que informó el gateway
-- ---------------------------------------------------------------------------
--
-- Gemela de `admin_set_payment_status` en criterios, distinta en quién la llama
-- y en que guarda la referencia del proveedor. Se concede **sólo** a
-- `service_role`: la invoca el storefront desde el webhook, nunca un browser.
--
-- Idempotente por diseño, que es el requisito del webhook: reintentar con el
-- mismo estado devuelve el pedido y no escribe nada. Un proveedor que reintenta
-- —y todos reintentan— no puede producir dos eventos ni dos correos.

create or replace function public.record_payment(
  p_store_id  uuid,
  p_order_id  uuid,
  p_status    text,
  p_reference text,
  p_note      text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_orden record;
  v_nuevo payment_status;
begin
  -- Un gateway informa que cobró o que no pudo. Volver a 'pending' no es algo
  -- que un proveedor sepa decir, y aceptarlo permitiría «descobrar» un pedido
  -- desde afuera.
  if p_status not in ('paid', 'failed') then
    raise exception 'Un pago sólo se registra como paid o failed, no como %', p_status;
  end if;
  v_nuevo := p_status::payment_status;

  select * into v_orden from orders where id = p_order_id and store_id = p_store_id;
  if v_orden.id is null then
    raise exception 'El pedido no existe en esta tienda';
  end if;

  -- El webhook repetido termina acá: sin evento, sin fila en la cola de correos.
  if v_orden.payment_status = v_nuevo then
    return order_json(p_order_id);
  end if;

  if v_orden.status = 'cancelled' then
    raise exception 'Un pedido cancelado no puede cambiar su estado de pago';
  end if;

  update orders set payment_status = v_nuevo, updated_at = now() where id = p_order_id;

  insert into order_events (tenant_id, order_id, type, data)
  values (
    v_orden.tenant_id, p_order_id, 'payment_changed',
    jsonb_strip_nulls(jsonb_build_object(
      'from', v_orden.payment_status,
      'to', v_nuevo,
      'reference', nullif(p_reference, ''),
      'note', nullif(p_note, '')
    ))
  );

  return order_json(p_order_id);
end;
$$;

comment on function public.record_payment is
  'Registra el resultado de un pago informado por el gateway. Idempotente: el mismo estado no vuelve a escribir.';

revoke all on function public.record_payment(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_payment(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- La cola de correos
-- ---------------------------------------------------------------------------
--
-- Un outbox y no una llamada HTTP desde la base. `pg_net` existe en el proyecto,
-- pero mandar el correo desde el trigger metería la URL y la clave del proveedor
-- dentro de una migración, y sobre todo **no correría en PGlite**: la suite de
-- aislamiento aplica todas las migraciones, así que una dependencia de extensión
-- ahí deja los 155 tests sin poder arrancar.
--
-- Con la cola, encolar es SQL puro y transaccional —se encola con el evento o no
-- pasa ninguna de las dos cosas— y enviar es trabajo de la aplicación, donde los
-- secretos ya viven y donde se puede reintentar.
--
-- Sin políticas a propósito: nadie más que la secret key toca esto. Un correo
-- pendiente contiene el pedido entero, incluida la dirección del comprador.

create table notification_outbox (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizations (id) on delete cascade,
  store_id   uuid not null,
  order_id   uuid not null,

  -- order_received | order_confirmed | order_shipped | order_delivered.
  -- Texto y no enum: agregar un aviso no debería costar una migración, igual
  -- que en `order_events.type`.
  event      text not null,
  recipient  text not null,

  -- El pedido serializado **al encolar**. El drenador no vuelve a consultar
  -- nada: el correo cuenta lo que pasó cuando pasó, no lo que el pedido sea
  -- cuando el correo salga.
  payload    jsonb not null default '{}'::jsonb,

  attempts   integer not null default 0,
  sent_at    timestamptz,
  created_at timestamptz not null default now(),

  unique (id, tenant_id),
  constraint notification_outbox_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  -- En cascada con el pedido: borrar un pedido de prueba se lleva sus avisos, y
  -- el teardown del e2e no necesita saber que esta tabla existe.
  constraint notification_outbox_order_id_fkey
    foreign key (order_id, tenant_id) references orders (id, tenant_id) on delete cascade
);

comment on table notification_outbox is
  'Correos transaccionales pendientes. La llena un trigger sobre order_events; la vacía el storefront.';

-- Índice parcial: lo único que se consulta es «qué falta mandar», y una vez
-- enviada la fila deja de interesar.
create index notification_outbox_pendientes_idx
  on notification_outbox (store_id, created_at)
  where sent_at is null;

alter table notification_outbox enable row level security;
revoke all on notification_outbox from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Qué evento del pedido produce qué correo
-- ---------------------------------------------------------------------------
--
-- `security definer` y no es un detalle: este trigger corre dentro de
-- `admin_set_order_status`, que es `security invoker`, o sea con el rol del
-- operador del Admin. Ese rol no tiene ningún permiso sobre `notification_outbox`
-- —la tabla no tiene políticas—, así que sin definer el insert fallaría y con él
-- se caería el cambio de estado entero.
--
-- Los tipos que no producen correo salen sin encolar, y ahí está el corte del
-- ciclo: `mark_notification_sent` inserta un evento `email_sent`, que vuelve a
-- disparar este trigger. Al no estar en el mapeo, no encola nada. Que el corte
-- sea la ausencia de una rama y no una condición explícita es lo que hace que un
-- tipo nuevo sea seguro por defecto.

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

  select id, tenant_id, store_id, customer into v_orden from orders where id = new.order_id;
  if v_orden.id is null then
    return new;
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

comment on function app.queue_order_notification is
  'Encola el correo que corresponde a un evento de pedido. Los tipos sin correo salen sin encolar, y eso corta el ciclo de email_sent.';

revoke all on function app.queue_order_notification() from public, anon, authenticated;

create trigger order_events_queue_notification
  after insert on order_events
  for each row execute function app.queue_order_notification();

-- ---------------------------------------------------------------------------
-- Reclamar y marcar
-- ---------------------------------------------------------------------------
--
-- El intento se cuenta **al reclamar**, no al fallar. Es lo que hace que un
-- drenaje que se muere a mitad —el Worker se corta, la red se cae— no deje la
-- fila reintentándose para siempre: ya gastó su turno.
--
-- Dos drenajes simultáneos pueden reclamar la misma fila; contra eso no hay lock
-- sino la clave de idempotencia que el proveedor de correo recibe con el id de
-- la fila. La defensa está donde se envía, no donde se reclama.

create or replace function public.claim_notifications(
  p_store_id uuid,
  p_limit    integer default 20
) returns setof notification_outbox
language sql
set search_path = public, pg_temp
as $$
  update notification_outbox
  set attempts = attempts + 1
  where id in (
    select id
    from notification_outbox
    where store_id = p_store_id
      and sent_at is null
      -- Cinco intentos y se abandona. Una dirección que no existe no va a
      -- empezar a existir, y reintentarla eternamente esconde a las demás.
      and attempts < 5
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  returning *;
$$;

comment on function public.claim_notifications is
  'Toma correos pendientes de una tienda y cuenta el intento. El tope de intentos evita que una fila muerta ocupe la cola.';

revoke all on function public.claim_notifications(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(uuid, integer) to service_role;

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

  insert into order_events (tenant_id, order_id, type, data)
  values (
    v_fila.tenant_id, v_fila.order_id, 'email_sent',
    jsonb_build_object('event', v_fila.event, 'to', v_fila.recipient)
  );
end;
$$;

comment on function public.mark_notification_sent is
  'Marca un correo como enviado y lo deja en la timeline del pedido. Idempotente.';

revoke all on function public.mark_notification_sent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_notification_sent(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Medios propios
-- ---------------------------------------------------------------------------
--
-- Guardado con un `do` porque PGlite no tiene el schema `storage`: sin la
-- guarda, esta migración dejaría la suite de aislamiento sin poder arrancar.
--
-- El bucket es **público**: el catálogo de una tienda se ve sin credenciales, y
-- servir imágenes por URL firmada obligaría a renovarlas en cada render. Lo que
-- las políticas protegen es quién **escribe**.
--
-- La convención del path hace el trabajo: `{tenant_id}/{lo que sea}`. El primer
-- directorio es el tenant y la política lo castea a uuid, así que un path fuera
-- de convención no falla la comparación, falla el casteo. Verificado contra el
-- proyecto real que `postgres` puede crear estas políticas pese a que
-- `storage.objects` sea de `supabase_storage_admin`.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'product-media', 'product-media', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'product_media_lectura'
  ) then
    execute $p$
      create policy product_media_lectura on storage.objects
        for select to authenticated
        using (bucket_id = 'product-media')
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'product_media_subida'
  ) then
    execute $p$
      create policy product_media_subida on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'product-media'
          and app.has_permission(((storage.foldername(name))[1])::uuid, 'catalog.write')
        )
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'product_media_baja'
  ) then
    execute $p$
      create policy product_media_baja on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'product-media'
          and app.has_permission(((storage.foldername(name))[1])::uuid, 'catalog.write')
        )
    $p$;
  end if;
end $$;
