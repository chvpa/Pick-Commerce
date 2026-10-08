-- La historia de un pedido o de un producto, para quien trabaja con ellos
-- (ADR-159).
--
-- `audit_log` lo lee entero sólo quien administra el equipo (ADR-158). El
-- personal también necesita saber quién tocó el pedido que está despachando, así
-- que esto le da **la historia de una cosa** y nada más: sólo pedidos y
-- productos —con sus variantes y su stock—, nunca los ajustes ni el equipo, y sin
-- la IP ni el navegador, que son para revisar, no para trabajar.

create or replace function public.admin_subject_activity(
  p_store_id   uuid,
  p_subject_id uuid,
  p_limit      integer default 50
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tienda as (
    -- La pertenencia, en una línea: salteamos RLS, así que el filtro es éste.
    select id, tenant_id from stores
    where id = p_store_id and tenant_id in (select app.current_tenants())
  ),
  filas as (
    select a.*
    from audit_log a
    join tienda t on t.tenant_id = a.tenant_id
    where a.store_id = p_store_id
      and a.subject_id = p_subject_id::text
      and a.entity in ('orders', 'products', 'product_variants', 'inventory_levels')
  )
  select jsonb_build_object(
    'total', (select count(*) from filas),
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', f.id,
               'at', f.created_at,
               -- Por `to_jsonb` y no por la columna: el `auth.users` de PGlite no la
               -- tiene, y una función sql se valida al crearse.
               'actor', coalesce(nullif(to_jsonb(u)->'raw_user_meta_data'->>'name', ''), u.email),
               'role', f.actor_role,
               'action', f.action,
               'entity', f.entity,
               'changes', f.changes,
               'sensitive', case when f.sensitive then true end,
               'label', f.metadata->>'label'
             )) order by f.created_at desc, f.id desc)
      from (
        select * from filas
        order by created_at desc, id desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) f
      left join auth.users u on u.id = f.actor_id
    ), '[]'::jsonb)
  );
$$;

comment on function public.admin_subject_activity(uuid, uuid, integer) is
  'La historia de un pedido o un producto: quién, qué y cuándo, para cualquier miembro. Sin ajustes, equipo, IP ni navegador.';

revoke all on function public.admin_subject_activity(uuid, uuid, integer) from public, anon;
grant execute on function public.admin_subject_activity(uuid, uuid, integer) to authenticated;
