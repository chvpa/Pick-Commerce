-- Antigüedad del stock (v2 Fase 8, ADR-135).
--
-- Cuánta plata hay parada en stock, y hace cuánto. La base no guarda cuándo
-- entró cada unidad —no hay libro de movimientos de stock—, así que la
-- antigüedad es la que sí se puede saber: **días desde la última venta** de la
-- variante, o desde el alta del producto si nunca se vendió.
--
-- Por variante y no por producto, porque el stock es por variante: un producto
-- con el talle M agotado y el XXL quieto no está quieto a medias.
--
-- `security invoker`, como las demás del Admin: la acota RLS sobre `products`,
-- `product_variants`, `inventory_levels`, `order_items` y `orders`.
--
-- El valor va **a costo y a precio**, y el de costo con su cobertura (ADR-101):
-- una variante sin costo cargado no vale cero, vale «no sé».

create or replace function public.admin_inventory_aging(
  p_store_id uuid,
  p_bucket   text    default null,
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with moneda as (
  select coalesce((select currency from stores where id = p_store_id), 'PYG') as c
),

-- El stock de todas las sucursales, sumado una vez por variante.
stock as (
  select il.variant_id, sum(il.available)::int as unidades
  from inventory_levels il
  join product_variants v on v.id = il.variant_id
  join products p on p.id = v.product_id
  where p.store_id = p_store_id
  group by il.variant_id
  having sum(il.available) > 0
),

-- La última venta de cada variante, en toda la historia y sin cancelados.
-- Un CTE con join y no una subconsulta por fila (CLAUDE.md).
ultima as (
  select i.variant_id, max(o.created_at) as vendida
  from order_items i
  join orders o on o.id = i.order_id
  where o.store_id = p_store_id
    and o.status <> 'cancelled'
    and i.variant_id is not null
  group by i.variant_id
),

filas as (
  select
    v.id, v.product_id, v.sku, p.title, nullif(v.title, '') as variant_title,
    s.unidades, v.price, v.cost,
    u.vendida,
    greatest(0, extract(day from now() - coalesce(u.vendida, p.created_at)))::int as dias
  from stock s
  join product_variants v on v.id = s.variant_id
  join products p on p.id = v.product_id
  left join ultima u on u.variant_id = v.id
  -- Lo archivado ya se sacó del catálogo a propósito; lo demás, publicado o
  -- no, es plata en el depósito.
  where p.status <> 'archived'
),

tramos(tramo, orden, desde, hasta) as (
  values ('0_30', 1, 0, 30), ('31_90', 2, 31, 90), ('91_180', 3, 91, 180),
         ('180_plus', 4, 181, null)
),

con_tramo as (
  select f.*, t.tramo
  from filas f
  join tramos t on f.dias >= t.desde and (t.hasta is null or f.dias <= t.hasta)
),

resumen as (
  select t.tramo, t.orden,
         count(c.id)::int as variantes,
         coalesce(sum(c.unidades), 0)::int as unidades,
         coalesce(sum(c.unidades * c.price), 0)::bigint as a_precio,
         coalesce(sum(c.unidades * c.cost), 0)::bigint as a_costo,
         coalesce(sum(c.unidades) filter (where c.cost is not null), 0)::int as con_costo
  from tramos t
  left join con_tramo c on c.tramo = t.tramo
  group by t.tramo, t.orden
),

filtradas as (
  select * from con_tramo where p_bucket is null or tramo = p_bucket
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pc) as page, pc, n, pp
  from (
    select t.n, pp.pp, greatest(1, ceil(t.n::numeric / pp.pp)::int) as pc
    from (select count(*)::int as n from filtradas) t,
         (select greatest(1, least(coalesce(p_per_page, 20), 200)) as pp) pp
  ) x
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      -- Lo más viejo primero y, a igual antigüedad, lo que más plata tiene parada.
      row_number() over (order by f.dias desc, f.unidades * f.price desc, f.id) as rn,
      jsonb_strip_nulls(jsonb_build_object(
        'variantId', f.id,
        'productId', f.product_id,
        'sku', f.sku,
        'title', f.title,
        'variantTitle', f.variant_title,
        'stock', f.unidades,
        'days', f.dias,
        'lastSoldAt', f.vendida,
        'bucket', f.tramo,
        'priceValue', jsonb_build_object('amount', f.unidades * f.price, 'currency', (select c from moneda)),
        'costValue', case when f.cost is null then null else
          jsonb_build_object('amount', f.unidades * f.cost, 'currency', (select c from moneda)) end
      )) as doc
    from filtradas f
  ) x
  where x.rn > (select (page - 1) * pp from acotada)
    and x.rn <= (select page * pp from acotada)
)

select jsonb_build_object(
  'buckets', (
    select jsonb_agg(jsonb_build_object(
      'bucket', r.tramo,
      'variants', r.variantes,
      'units', r.unidades,
      'priceValue', jsonb_build_object('amount', r.a_precio, 'currency', (select c from moneda)),
      'costValue', jsonb_build_object('amount', r.a_costo, 'currency', (select c from moneda)),
      -- Qué parte de las unidades tiene costo cargado: sin esto, un valor a
      -- costo sobre medio catálogo parecería la mitad de lo que es.
      'costCoverage', case when r.unidades = 0 then 1
                           else round(r.con_costo::numeric / r.unidades, 4) end
    ) order by r.orden)
    from resumen r
  ),
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', (select pp from acotada),
  'pageCount', (select pc from acotada)
);
$$;

comment on function public.admin_inventory_aging(uuid, text, integer, integer) is
  'Stock por días desde la última venta, en cuatro tramos, a costo y a precio.';

revoke all on function public.admin_inventory_aging(uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_inventory_aging(uuid, text, integer, integer) to authenticated;
