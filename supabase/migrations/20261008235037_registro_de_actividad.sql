-- Configuración › Registro de actividad (ADR-160).
--
-- La tabla la lee quien administra el equipo (ADR-158), pero la pantalla
-- necesita lo que la tabla no tiene a mano: el nombre de quien hizo cada cosa
-- —`auth.users` no es consultable— y el nombre actual del producto, que una fila
-- de variante no guarda. Por eso una función, con el permiso en su primera línea.
--
-- Paginada, con el corte de página **antes** de armar las filas: el registro
-- crece con cada cambio de cada persona durante dos años.

create or replace function public.admin_activity_log(
  p_tenant         uuid,
  p_actor          uuid default null,
  p_sensitive_only boolean default false,
  p_page           integer default 1,
  p_per_page       integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_por_pagina integer := greatest(1, least(coalesce(p_per_page, 50), 200));
  v_pagina     integer := greatest(1, coalesce(p_page, 1));
  v_total      integer;
  v_items      jsonb;
begin
  if not app.has_permission(p_tenant, 'member.manage') then
    raise exception 'No tenés acceso al registro de actividad de esta organización.';
  end if;

  select count(*) into v_total
  from audit_log a
  where a.tenant_id = p_tenant
    and (p_actor is null or a.actor_id = p_actor)
    and (not coalesce(p_sensitive_only, false) or a.sensitive);

  with pagina as (
    select a.*
    from audit_log a
    where a.tenant_id = p_tenant
      and (p_actor is null or a.actor_id = p_actor)
      and (not coalesce(p_sensitive_only, false) or a.sensitive)
    order by a.created_at desc, a.id desc
    limit v_por_pagina offset (v_pagina - 1) * v_por_pagina
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', f.id,
           'at', f.created_at,
           'actorId', f.actor_id,
           -- Por `to_jsonb`: el `auth.users` de PGlite no tiene los metadatos.
           'actor', coalesce(nullif(to_jsonb(u)->'raw_user_meta_data'->>'name', ''), u.email),
           'role', f.actor_role,
           'action', f.action,
           'entity', f.entity,
           'subjectId', f.subject_id,
           'storeId', f.store_id,
           'changes', f.changes,
           'sensitive', case when f.sensitive then true end,
           -- Lo que una persona reconoce: el producto por su nombre de hoy, el
           -- resto por lo que la fila guardó.
           'label', coalesce(p.title, f.metadata->>'label'),
           'ip', f.ip,
           'userAgent', f.user_agent
         )) order by f.created_at desc, f.id desc), '[]'::jsonb)
  into v_items
  from pagina f
  left join auth.users u on u.id = f.actor_id
  left join products p
    on f.entity in ('products', 'product_variants', 'inventory_levels')
   and p.id::text = f.subject_id;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_pagina,
    'perPage', v_por_pagina,
    'pageCount', greatest(1, ceil(v_total::numeric / v_por_pagina)::integer)
  );
end;
$$;

comment on function public.admin_activity_log(uuid, uuid, boolean, integer, integer) is
  'El registro de actividad de una organización, paginado, con quién y el nombre de lo que cambió. Sólo para member.manage.';

revoke all on function public.admin_activity_log(uuid, uuid, boolean, integer, integer) from public, anon;
grant execute on function public.admin_activity_log(uuid, uuid, boolean, integer, integer) to authenticated;
