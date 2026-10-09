-- El aviso por correo de los cambios sensibles (ADR-160).
--
-- Como el de pedido nuevo (ADR-156): cada persona lo prende para sí, arranca
-- apagado, y va por la cola sin `order_id` para no aparecer entre los avisos de
-- un pedido.

alter table memberships
  add column notify_sensitive boolean not null default false;

comment on column memberships.notify_sensitive is
  'Si a esta persona le llega un correo cuando otra persona hace un cambio sensible. Sólo para quien administra el equipo.';

create or replace function public.set_my_sensitive_notice(p_tenant uuid, p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  -- Lo puede prender quien puede leer el registro: un aviso de algo que después
  -- no puede ver no le sirve a nadie.
  if not app.has_permission(p_tenant, 'member.manage') then
    raise exception 'Sólo quien administra el equipo recibe este aviso.';
  end if;

  update memberships
  set notify_sensitive = coalesce(p_on, false), updated_at = now()
  where tenant_id = p_tenant and user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_sensitive_notice(uuid, boolean) from public, anon;
grant execute on function public.set_my_sensitive_notice(uuid, boolean) to authenticated;

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
  v_store_aviso uuid;
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
    -- Del equipo, lo sensible es quién entra, quién sale y con qué rol: prender el
    -- propio aviso de pedidos no lo es.
    when 'memberships' then tg_op <> 'UPDATE' or v_cambios ? 'role'
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

  /*
   * El aviso de los cambios sensibles (ADR-160): un correo a cada persona que
   * administra el equipo y lo pidió, **menos a quien hizo el cambio** —enterarse
   * de lo propio no protege de nada—. Va por la cola, sin `order_id`, desde la
   * tienda del cambio o la primera de la organización, que es quien lo manda. Una
   * tienda en modo demostración no le escribe a nadie (ADR-108).
   */
  if v_sensible then
    v_store_aviso := coalesce(v_store, (
      select id from stores where tenant_id = v_tenant order by created_at, id limit 1
    ));

    if v_store_aviso is not null and not coalesce((
      select (settings->>'demo')::boolean from store_settings where store_id = v_store_aviso
    ), false) then
      insert into notification_outbox (tenant_id, store_id, order_id, event, recipient, payload)
      select v_tenant, v_store_aviso, null, 'team_sensitive_change', u.email,
             jsonb_build_object('actividad', jsonb_strip_nulls(jsonb_build_object(
               'id', 0,
               'at', now(),
               'actor', (select coalesce(nullif(to_jsonb(a)->'raw_user_meta_data'->>'name', ''), a.email)
                         from auth.users a where a.id = v_actor),
               'action', lower(tg_op),
               'entity', tg_table_name,
               'changes', v_cambios,
               'sensitive', true,
               'label', coalesce(v_fila->>'title', v_fila->>'sku', v_fila->>'code',
                                 case when v_fila ? 'number' then '#' || (v_fila->>'number') end)
             )))
      from memberships m
      join auth.users u on u.id = m.user_id
      where m.tenant_id = v_tenant
        and m.notify_sensitive
        and m.user_id <> v_actor
        and exists (
          select 1 from role_permissions rp
          where rp.role = m.role and rp.permission = 'member.manage'
        )
        and coalesce(u.email, '') <> '';
    end if;
  end if;

  return null;
end;
$$;
