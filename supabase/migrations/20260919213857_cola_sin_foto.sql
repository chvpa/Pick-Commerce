/*
 * La cola de lo que no se ve: `admin_products_without_photo` (v2 Fase 5).
 *
 * Treeshop tenía 1258 productos con stock y sin foto al empezar la fase, y la
 * tienda los oculta (ADR-112): son productos que se podrían vender y nadie ve.
 * Esta es la lista con la que se sale a fotografiarlos, así que el orden es lo
 * que importa: **primero lo que tiene stock**, porque una foto de algo agotado
 * no vende nada hoy.
 *
 * Trae además las tres cuentas que dicen si el trabajo avanza —activos,
 * listables y sin foto con stock— y cuántos se recuperaron en la última
 * semana. Es el tercer punto del Definition of Done: que la cuenta de listables
 * suba y se pueda decir cuánto.
 *
 * `security invoker`, como `admin_products`: lo acota RLS sobre `products`,
 * `product_media` e `inventory_levels`, que tienen política para el equipo del
 * comercio.
 */

create or replace function public.admin_products_without_photo(
  p_store_id uuid,
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with
activos as (
  select p.id, p.handle, p.title, p.brand, p.created_at,
         exists (select 1 from product_media m where m.product_id = p.id) as con_foto,
         coalesce((
           select sum(il.available)::int
           from product_variants v
           join inventory_levels il on il.variant_id = v.id
           where v.product_id = p.id
         ), 0) as stock
  from products p
  where p.store_id = p_store_id
    and p.status = 'active'
),

pendientes as (
  select * from activos where not con_foto
),

paginacion as (
  select
    greatest(1, ceil(count(*)::numeric / greatest(1, least(p_per_page, 100)))::int) as page_count,
    count(*)::int as n
  from pendientes
),

pagina as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from paginacion pg
),

/*
 * Primero lo que se puede vender hoy, y dentro de eso lo que más stock tiene:
 * es donde una foto rinde más. El id desempata para que dos páginas nunca
 * repitan un producto.
 */
ordenados as (
  select pe.*, row_number() over (order by (pe.stock > 0) desc, pe.stock desc, pe.id) as rn
  from pendientes pe
),

items as (
  select jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', o.id,
      'handle', o.handle,
      'title', o.title,
      'brand', o.brand,
      'stock', o.stock,
      -- El SKU ayuda a encontrar el producto en el depósito, que es donde se
      -- saca la foto. Con varias variantes, el primero alcanza para ubicarlo.
      'sku', (select v.sku from product_variants v where v.product_id = o.id
               order by v.position limit 1)
    ))
    order by o.rn
  ) as docs
  from ordenados o, pagina pg
  where o.rn > (pg.page - 1) * least(p_per_page, 100)
    and o.rn <= pg.page * least(p_per_page, 100)
),

/*
 * Recuperados en la última semana: productos cuya primera foto se subió en
 * esos siete días **desde el Admin**. Se descartan por ruta las que trajo un
 * importador —`/camelot/`, `/erp/`, `/seed/`—, que no son trabajo de nadie en
 * la tienda (ADR-082: la convención de la ruta es la política).
 */
recuperados as (
  select count(*)::int as n
  from (
    select m.product_id, min(m.created_at) as primera
    from product_media m
    join products p on p.id = m.product_id
    where p.store_id = p_store_id
      and m.url not like '%/camelot/%'
      and m.url not like '%/erp/%'
      and m.url not like '%/seed/%'
    group by m.product_id
  ) x
  where x.primera >= now() - interval '7 days'
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from pagina),
  'page', (select page from pagina),
  'perPage', least(p_per_page, 100),
  'pageCount', (select page_count from pagina),
  'cuentas', jsonb_build_object(
    'activos', (select count(*) from activos),
    'listables', (select count(*) from activos where con_foto and stock > 0),
    'sinFotoConStock', (select count(*) from activos where not con_foto and stock > 0),
    'recuperadosSemana', (select n from recuperados)
  )
);
$$;

comment on function public.admin_products_without_photo is
  'Los productos activos sin foto, primero los que tienen stock, con las cuentas de la vitrina (v2 Fase 5).';

revoke all on function public.admin_products_without_photo(uuid, integer, integer) from public, anon;
grant execute on function public.admin_products_without_photo(uuid, integer, integer)
  to authenticated, service_role;
