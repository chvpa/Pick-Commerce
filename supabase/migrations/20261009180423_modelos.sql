-- Los modelos: productos distintos que son el mismo artículo en otro color o
-- material (ADR-162).
--
-- `product_groups` existe desde v1 (ADR-026) y nadie lo usaba. El caso que lo
-- justificó está medido en el ERP del piloto: 457 artículos llegan como códigos
-- separados que sólo difieren en el color, y el peor llega a 52. Acá se le suma lo
-- que hace falta para administrarlo: por qué característica se diferencian, cómo
-- se muestra en la ficha, y el orden —el primero es el que va en el catálogo—.

alter table product_groups
  -- La clave de la característica que los distingue: 'color'. La de
  -- `attribute_definitions.name`, que es la que viaja en las variantes.
  add column axis text,
  add column display text not null default 'photo'
    check (display in ('photo', 'swatch', 'text'));

alter table products
  add column group_position integer not null default 0;

create index products_grupo_idx on products (product_group_id, group_position)
  where product_group_id is not null;

/*
 * Los modelos de una tienda, paginados y con una vista previa de los primeros
 * productos. `invoker`: RLS acota grupos y productos a la organización.
 */
create or replace function public.admin_product_groups(
  p_store_id uuid,
  p_q        text default null,
  p_page     integer default 1,
  p_per_page integer default 50
) returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtrados as (
    select g.*
    from product_groups g
    where g.store_id = p_store_id
      and (coalesce(p_q, '') = '' or g.name ilike '%' || p_q || '%')
  ),
  pagina as (
    select * from filtrados
    order by name, id
    limit greatest(1, least(coalesce(p_per_page, 50), 200))
    offset (greatest(1, coalesce(p_page, 1)) - 1) * greatest(1, least(coalesce(p_per_page, 50), 200))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id,
               'name', g.name,
               'axis', g.axis,
               'display', g.display,
               'count', (select count(*) from products p where p.product_group_id = g.id),
               'preview', coalesce((
                 select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                          'image', (select m.url from product_media m
                                    where m.product_id = p.id order by m.position limit 1),
                          'value', (select v.attributes->>g.axis from product_variants v
                                    where v.product_id = p.id order by v.position limit 1)
                        )) order by p.group_position, p.title)
                 from (select * from products where product_group_id = g.id
                       order by group_position, title limit 4) p
               ), '[]'::jsonb)
             ) order by g.name, g.id)
      from pagina g
    ), '[]'::jsonb)
  );
$$;

/* Los productos de un modelo, en orden, con lo que la pantalla muestra de cada uno. */
create or replace function public.admin_group_products(p_group_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', p.id,
           'title', p.title,
           'status', p.status,
           'image', (select m.url from product_media m
                     where m.product_id = p.id order by m.position limit 1),
           'value', (select v.attributes->>g.axis from product_variants v
                     where v.product_id = p.id order by v.position limit 1),
           'stock', (select coalesce(sum(i.available), 0) from inventory_levels i
                     join product_variants v on v.id = i.variant_id
                     where v.product_id = p.id)
         )) order by p.group_position, p.title), '[]'::jsonb)
  from product_groups g
  join products p on p.product_group_id = g.id
  where g.id = p_group_id;
$$;

/*
 * Quiénes son el modelo y en qué orden, de una vez: el primero del array es el
 * del catálogo. Lo que estaba y ya no viene se suelta. `invoker`: escribir
 * productos y grupos pide `catalog.write`, y RLS lo exige.
 */
create or replace function public.admin_set_group_products(p_group_id uuid, p_products uuid[])
returns void
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_store uuid;
begin
  select store_id into v_store from product_groups where id = p_group_id;
  if v_store is null then
    raise exception 'El modelo no existe.';
  end if;

  -- Un producto de otra tienda no entra, aunque sea de la misma organización.
  if exists (
    select 1 from unnest(coalesce(p_products, '{}'::uuid[])) as x(id)
    where not exists (select 1 from products p where p.id = x.id and p.store_id = v_store)
  ) then
    raise exception 'Hay un producto que no es de esta tienda.';
  end if;

  update products
  set product_group_id = null, group_position = 0, updated_at = now()
  where product_group_id = p_group_id
    and not (id = any(coalesce(p_products, '{}'::uuid[])));

  update products p
  set product_group_id = p_group_id, group_position = x.orden - 1, updated_at = now()
  from unnest(coalesce(p_products, '{}'::uuid[])) with ordinality as x(id, orden)
  where p.id = x.id
    and (p.product_group_id is distinct from p_group_id or p.group_position <> x.orden - 1);
end;
$$;

revoke all on function public.admin_product_groups(uuid, text, integer, integer) from public, anon;
revoke all on function public.admin_group_products(uuid) from public, anon;
revoke all on function public.admin_set_group_products(uuid, uuid[]) from public, anon;
grant execute on function public.admin_product_groups(uuid, text, integer, integer) to authenticated;
grant execute on function public.admin_group_products(uuid) to authenticated;
grant execute on function public.admin_set_group_products(uuid, uuid[]) to authenticated;
