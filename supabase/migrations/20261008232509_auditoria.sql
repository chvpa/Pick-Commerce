-- El registro de actividad: quién cambió qué, con el valor de antes y el de
-- después (ADR-158).
--
-- Hasta acá `audit_log` lo escribían dos funciones a mano —la tasa de cambio y la
-- credencial de IA—. Desde acá lo escribe un trigger en las siete tablas donde
-- un cambio cuesta plata o acceso, así que ninguna pantalla nueva puede
-- olvidarse de registrar.
--
-- **Sólo lo que hace una persona.** Lo que escribe el sistema —el checkout que
-- descuenta stock, los importadores, la cola de correos— ya tiene su rastro
-- (`order_events`, los logs de sincronización) y entra con la secret key, sin
-- `auth.uid()`. Mezclarlo enterraría lo que este registro existe para mostrar:
-- qué hizo alguien del equipo. Y deja a `create_order` sin costo: el trigger sale
-- en la primera línea.

alter table audit_log
  add column store_id    uuid,
  -- Lo que una persona mira para entender el cambio: el producto de una
  -- variante o de un stock, el pedido, la promoción, la tienda de un ajuste.
  add column subject_id  text,
  add column actor_role  member_role,
  -- `{campo: [antes, después]}`. Nulo al crear o borrar: ahí el cambio es la fila.
  add column changes     jsonb,
  add column sensitive   boolean not null default false,
  add column ip          text,
  add column user_agent  text;

create index audit_log_sujeto_idx on audit_log (tenant_id, subject_id, created_at desc);

comment on column audit_log.sensitive is
  'Pedidos anulados o con el pago cambiado a mano, promociones borradas, la cuenta de cobro y el equipo: lo que se revisa primero.';

-- ---------------------------------------------------------------------------
-- La captura
-- ---------------------------------------------------------------------------

create or replace function app.auditar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_viejo    jsonb;
  v_nuevo    jsonb;
  v_fila     jsonb;
  v_cambios  jsonb;
  v_clave    text;
  v_tenant   uuid;
  v_store    uuid;
  v_sujeto   text;
  v_headers  jsonb;
  v_sensible boolean := false;
  v_rol      member_role;
  -- Lo que cambia solo, lo que se calcula y lo que es secreto: `access_token` es
  -- la llave del enlace del pedido (ADR-142) y no puede quedar en un registro
  -- que se exporta.
  c_ignorar constant text[] := array[
    'id', 'tenant_id', 'created_at', 'updated_at', 'search_doc', 'last_sync_at',
    'sync_error', 'access_token', 'idempotency_key', 'usage_count'
  ];
begin
  if v_actor is null then
    return null;
  end if;

  v_viejo := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_nuevo := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_fila := coalesce(v_nuevo, v_viejo);

  if tg_op = 'UPDATE' then
    v_cambios := '{}'::jsonb;
    for v_clave in select jsonb_object_keys(v_nuevo) loop
      continue when v_clave = any(c_ignorar);

      if tg_table_name = 'store_settings' and v_clave = 'settings' then
        -- Los ajustes van por sección: «cambió settings» no le dice nada a nadie.
        v_cambios := v_cambios || coalesce((
          select jsonb_object_agg('settings.' || k,
                                  jsonb_build_array(v_viejo->'settings'->k, v_nuevo->'settings'->k))
          from (
            select jsonb_object_keys(coalesce(v_viejo->'settings', '{}') || coalesce(v_nuevo->'settings', '{}')) as k
          ) s
          where (v_viejo->'settings'->k) is distinct from (v_nuevo->'settings'->k)
        ), '{}'::jsonb);
      elsif (v_viejo->v_clave) is distinct from (v_nuevo->v_clave) then
        v_cambios := v_cambios
          || jsonb_build_object(v_clave, jsonb_build_array(v_viejo->v_clave, v_nuevo->v_clave));
      end if;
    end loop;

    -- Un guardado que no cambió nada no es actividad.
    if v_cambios = '{}'::jsonb then
      return null;
    end if;
  end if;

  v_tenant := (v_fila->>'tenant_id')::uuid;

  case tg_table_name
    when 'product_variants' then
      v_sujeto := v_fila->>'product_id';
      select store_id into v_store from products where id = (v_fila->>'product_id')::uuid;
    when 'inventory_levels' then
      select v.product_id::text into v_sujeto from product_variants v where v.id = (v_fila->>'variant_id')::uuid;
      select store_id into v_store from locations where id = (v_fila->>'location_id')::uuid;
    when 'store_settings' then
      v_sujeto := v_fila->>'store_id';
      v_store := (v_fila->>'store_id')::uuid;
    when 'memberships' then
      v_sujeto := v_fila->>'user_id';
    else
      v_sujeto := v_fila->>'id';
      v_store := (v_fila->>'store_id')::uuid;
  end case;

  -- Al crear o borrar no hay cambios, y `null ? clave` es null: sin el coalesce
  -- la fila no entraría, porque la columna no admite nulos.
  v_sensible := coalesce(case tg_table_name
    when 'orders' then
      v_cambios ? 'payment_status'
      or (v_cambios ? 'status' and v_nuevo->>'status' = 'cancelled')
      or tg_op = 'DELETE'
    when 'promotions' then tg_op = 'DELETE'
    when 'store_settings' then coalesce(v_cambios ? 'settings.payments', false)
    when 'memberships' then true
    else false
  end, false);

  select role into v_rol from memberships where tenant_id = v_tenant and user_id = v_actor;

  -- PostgREST deja los encabezados de la petición en `request.headers`. Sin
  -- PostgREST —una consulta directa— no hay, y la fila queda sin IP: no se
  -- inventa una.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  insert into audit_log (
    tenant_id, store_id, actor_id, actor_role, action, entity, entity_id, subject_id,
    changes, sensitive, ip, user_agent, metadata
  ) values (
    v_tenant, v_store, v_actor, v_rol, lower(tg_op), tg_table_name,
    coalesce(v_fila->>'id', v_fila->>'store_id'), v_sujeto,
    v_cambios, v_sensible,
    nullif(trim(split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1)), ''),
    v_headers->>'user-agent',
    -- Con qué nombre se reconoce lo que cambió, para la lista: el título, el SKU,
    -- el código o el número.
    jsonb_strip_nulls(jsonb_build_object(
      'label', coalesce(v_fila->>'title', v_fila->>'sku', v_fila->>'code',
                        case when v_fila ? 'number' then '#' || (v_fila->>'number') end)
    ))
  );

  return null;
end;
$$;

revoke all on function app.auditar() from public, anon, authenticated;

create trigger auditar after insert or update or delete on products
  for each row execute function app.auditar();
create trigger auditar after insert or update or delete on product_variants
  for each row execute function app.auditar();
create trigger auditar after insert or update or delete on inventory_levels
  for each row execute function app.auditar();
create trigger auditar after insert or update or delete on orders
  for each row execute function app.auditar();
create trigger auditar after insert or update or delete on promotions
  for each row execute function app.auditar();
create trigger auditar after insert or update or delete on store_settings
  for each row execute function app.auditar();
create trigger auditar after insert or update or delete on memberships
  for each row execute function app.auditar();

-- ---------------------------------------------------------------------------
-- Append-only, por dos lados
-- ---------------------------------------------------------------------------
--
-- Sin privilegios de escritura para nadie de la API —la escriben funciones
-- `definer`— y un trigger que rechaza editar o borrar aunque alguien tenga el
-- privilegio. Pasan tres cosas y nada más: la purga de los dos años, la
-- organización que se borra entera, y el actor que queda en nulo cuando se borra
-- su usuario, que es lo que hace la clave foránea.

revoke insert, update, delete, truncate on audit_log from public, anon, authenticated, service_role;

create or replace function app.auditoria_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.purga_de_auditoria', true) = 'on'
       and old.created_at < now() - interval '2 years' then
      return old;
    end if;
    if not exists (select 1 from organizations where id = old.tenant_id) then
      return old;
    end if;
    raise exception 'El registro de actividad no se borra.';
  end if;

  if old.actor_id is not null and new.actor_id is null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'El registro de actividad no se edita.';
end;
$$;

create or replace function app.auditoria_sin_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El registro de actividad no se vacía.';
end;
$$;

revoke all on function app.auditoria_inmutable() from public, anon, authenticated;
revoke all on function app.auditoria_sin_truncate() from public, anon, authenticated;

create trigger audit_log_inmutable before update or delete on audit_log
  for each row execute function app.auditoria_inmutable();
create trigger audit_log_sin_truncate before truncate on audit_log
  for each statement execute function app.auditoria_sin_truncate();

-- ---------------------------------------------------------------------------
-- Dos años, y lo purga el sistema
-- ---------------------------------------------------------------------------

create or replace function app.purgar_auditoria()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_borradas integer;
begin
  perform set_config('app.purga_de_auditoria', 'on', true);
  delete from audit_log where created_at < now() - interval '2 years';
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function app.purgar_auditoria() from public, anon, authenticated, service_role;

-- Una vez por mes. Guardado: PGlite no tiene pg_cron, y sin el guardia la suite
-- de aislamiento no arrancaría.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('purgar-auditoria', '0 4 1 * *', 'select app.purgar_auditoria()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quién lo lee
-- ---------------------------------------------------------------------------
--
-- Antes cualquier miembro. Con el valor de antes y el de después adentro, eso
-- le mostraría al personal los datos de cobro que no puede leer en los ajustes.
-- La tabla la lee quien administra el equipo; la historia de un pedido o un
-- producto se sirve por su propia función.

drop policy if exists audit_log_lectura on audit_log;
create policy audit_log_lectura on audit_log
  for select to authenticated
  using (app.has_permission(tenant_id, 'member.manage'));
