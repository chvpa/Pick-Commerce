-- `catalog_search` gana `p_collection`: acota la consulta a los productos de una
-- colección manual.
--
-- Sin esto las colecciones sembradas no las puede leer nadie, y la home tendría
-- que traerse los primeros N productos y filtrar "los que estén en oferta" en la
-- página. Con un catálogo real eso deja el carrusel vacío sin que nadie se
-- entere, que es justo el modo de fallo silencioso que ADR-050 obliga a evitar.
--
-- Sólo membresía explícita. Una colección **dinámica** se resuelve pasando su
-- `rules` como `p_filters`: la forma es exactamente `CatalogFilters`, así que no
-- hace falta un segundo mecanismo acá dentro (ADR-056).
--
-- Es `drop` y no `create or replace` porque cambia la aridad: `create or
-- replace` con otra cantidad de parámetros deja una sobrecarga en vez de
-- reemplazar, y PostgREST no sabría cuál llamar. Sin datos de por medio.

drop function if exists public.catalog_search(
  uuid, jsonb, text, text, integer, integer, bigint, bigint, text
);

create function public.catalog_search(
  p_store_id  uuid,
  p_filters   jsonb  default '{}'::jsonb,
  p_search    text   default '',
  p_sort      text   default 'relevance',
  p_page      integer default 1,
  p_per_page  integer default 24,
  p_price_min bigint default null,
  p_price_max bigint default null,
  -- Con handle la respuesta se acota a ese producto. Existe para que el PDP no
  -- necesite otra consulta con su propia serialización, que podría divergir de
  -- la PLP en qué considera publicado o en cómo suma el stock.
  p_handle    text   default null,
  -- Handle de una colección manual. El orden sigue siendo el de la consulta:
  -- `collection_products.position` es orden editorial y se usará cuando exista
  -- una pantalla que lo muestre.
  p_collection text  default null
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with
-- Productos publicados de la tienda. `ord` fija el orden de "relevance" y es
-- también el orden en que se descubren las facetas, igual que en el core.
prods as (
  select
    p.id,
    p.handle,
    p.title,
    p.description,
    p.brand,
    p.tenant_id,
    p.product_group_id,
    c.slug as categoria,
    row_number() over (order by p.created_at, p.id) as ord,
    (select min(v.price) from product_variants v where v.product_id = p.id) as lowest,
    -- Sobre esto busca el usuario: título, marca y SKUs, como en el core.
    lower(
      p.title || ' ' || coalesce(p.brand, '') || ' ' ||
      coalesce((select string_agg(v.sku, ' ') from product_variants v where v.product_id = p.id), '')
    ) as hay
  from products p
  left join categories c on c.id = p.category_id
  -- El storefront nunca ve borradores. Un select sin esto los publicaría.
  where p.store_id = p_store_id
    and p.status = 'active'
    and (p_handle is null or p.handle = p_handle)
    and (p_collection is null or exists (
      select 1
      from collection_products cp
      join collections col on col.id = cp.collection_id
      where cp.product_id = p.id
        and col.store_id = p_store_id
        and col.handle = p_collection
    ))
),

-- Pares producto × faceta × valor, deduplicados: un producto cuenta una sola
-- vez por valor aunque tres de sus variantes lo repitan.
--
-- `disc` es el orden de descubrimiento —producto, y dentro de él la posición de
-- la variante—, que define en qué orden se listan los valores de una faceta.
pav as (
  select distinct on (product_id, name, value) product_id, name, value, disc
  from (
    select pr.id as product_id, 'brand'::text as name, pr.brand as value,
           pr.ord * 100000 as disc
    from prods pr where pr.brand is not null
    union all
    select pr.id, 'categoria', pr.categoria, pr.ord * 100000
    from prods pr where pr.categoria is not null
    union all
    select pr.id, a.key, a.value, pr.ord * 100000 + v.position
    from prods pr
    join product_variants v on v.product_id = pr.id
    cross join lateral jsonb_each_text(v.attributes) a
  ) x
  order by product_id, name, value, disc
),

-- Valores por producto y faceta, para evaluar los filtros sin recorrer `pav`
-- una vez por condición.
pfacets as (
  select product_id, jsonb_object_agg(name, valores) as fv
  from (
    select product_id, name, jsonb_agg(value) as valores
    from pav
    group by product_id, name
  ) g
  group by product_id
),

-- Búsqueda y rango de precio: se aplican a los ítems **y** a los counts de
-- todas las facetas. A diferencia de un filtro de faceta, nunca se auto-excluyen.
base as (
  select pr.*
  from prods pr
  where (
    p_search = '' or not exists (
      -- Todos los términos deben aparecer. `position(... in ...)` y no ILIKE:
      -- es coincidencia literal de subcadena, igual que `includes` en JS, sin
      -- tener que escapar `%` ni `_`.
      select 1
      from unnest(string_to_array(lower(trim(p_search)), ' ')) t(tok)
      where t.tok <> '' and position(t.tok in pr.hay) = 0
    )
  )
  and (p_price_min is null or pr.lowest >= p_price_min)
  and (p_price_max is null or pr.lowest <= p_price_max)
),

-- Productos que pasan todos los filtros de faceta. Varios valores de una misma
-- faceta son un OR; facetas distintas, un AND.
filtrados as (
  select b.*
  from base b
  left join pfacets pf on pf.product_id = b.id
  where not exists (
    select 1
    from jsonb_each(p_filters) f(k, vals)
    where jsonb_array_length(f.vals) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(f.vals) t(v)
        where coalesce(pf.fv -> f.k, '[]'::jsonb) ? t.v
      )
  )
),

total as (select count(*)::int as n from filtrados),

paginacion as (
  select
    greatest(1, ceil(t.n::numeric / greatest(1, p_per_page))::int) as page_count,
    t.n
  from total t
),

pagina as (
  -- Una página fuera de rango devuelve la última con resultados, no una vacía:
  -- pasa al quitar filtros estando en la página 5.
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from paginacion pg
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      row_number() over (
        order by
          case when p_sort = 'price-asc'  then f.lowest end asc  nulls last,
          case when p_sort = 'price-desc' then f.lowest end desc nulls last,
          case when p_sort = 'title-asc'  then lower(f.title) end asc,
          f.ord
      ) as rn,
      jsonb_build_object(
        'id', f.id,
        -- `Product` extiende `TenantScoped`: el scope viaja con cada ítem en vez
        -- de que quien llama tenga que acordarse de inyectarlo.
        'tenantId', f.tenant_id,
        'storeId', p_store_id,
        'handle', f.handle,
        'title', f.title,
        'description', f.description,
        'brand', f.brand,
        'categoryId', f.categoria,
        'productGroupId', f.product_group_id,
        'status', 'active',
        'images', coalesce((
          select jsonb_agg(jsonb_build_object(
            'url', m.url, 'alt', m.alt, 'width', m.width, 'height', m.height
          ) order by m.position)
          from product_media m where m.product_id = f.id
        ), '[]'::jsonb),
        'variants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', v.id,
            'sku', v.sku,
            'barcode', v.barcode,
            'title', v.title,
            'price', jsonb_build_object('amount', v.price, 'currency', v.currency),
            'compareAtPrice', case when v.compare_at_price is null then null
                              else jsonb_build_object('amount', v.compare_at_price, 'currency', v.currency) end,
            'cost', case when v.cost is null then null
                    else jsonb_build_object('amount', v.cost, 'currency', v.currency) end,
            -- Espejo de inventario: la suma de las sucursales. Nunca es
            -- autoridad si el ERP posee el stock. Ver ADR-009.
            'availableQuantity', coalesce((
              select sum(il.available)::int from inventory_levels il where il.variant_id = v.id
            ), 0),
            'attributes', v.attributes
          ) order by v.position)
          from product_variants v where v.product_id = f.id
        ), '[]'::jsonb)
      ) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * p_per_page from pagina)
    and x.rn <= (select page * p_per_page from pagina)
),

-- Counts por faceta, **ignorando la propia selección de esa faceta**. Con
-- "color: Negro" activo, la faceta color sigue mostrando cuántos hay en Azul;
-- si se aplicara su propio filtro, todas las demás opciones darían cero y la
-- faceta quedaría inservible.
conteos as (
  select
    pv.name,
    pv.value,
    count(distinct pv.product_id)::int as count,
    min(pv.disc) as vdisc
  from pav pv
  join base b on b.id = pv.product_id
  left join pfacets pf on pf.product_id = pv.product_id
  where not exists (
    select 1
    from jsonb_each(p_filters) f(k, vals)
    where f.k <> pv.name
      and jsonb_array_length(f.vals) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(f.vals) t(v)
        where coalesce(pf.fv -> f.k, '[]'::jsonb) ? t.v
      )
  )
  group by pv.name, pv.value
),

facetas as (
  select jsonb_agg(
    jsonb_build_object('name', f.name, 'values', f.values)
    order by f.orden
  ) as docs
  from (
    select
      c.name,
      -- brand y categoria primero, como en el core; el resto por orden de
      -- descubrimiento.
      case c.name when 'brand' then 0 when 'categoria' then 1 else 2 end * 1000000000
        + min(c.vdisc) as orden,
      jsonb_agg(
        jsonb_build_object(
          'value', c.value,
          'count', c.count,
          'selected', coalesce(p_filters -> c.name, '[]'::jsonb) ? c.value
        ) order by c.vdisc
      ) as values
    from conteos c
    group by c.name
  ) f
),

precios as (
  select min(lowest) as pmin, max(lowest) as pmax from prods
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'facets', coalesce((select docs from facetas), '[]'::jsonb),
  'total', (select n from pagina),
  'page', (select page from pagina),
  'perPage', p_per_page,
  'pageCount', (select page_count from pagina),
  'priceMin', (select pmin from precios),
  'priceMax', (select pmax from precios)
);
$$;

comment on function public.catalog_search is
  'Consulta de catálogo: filtros, búsqueda, orden, paginación y facetas en un round-trip. Replica queryCatalog del core; los tests comparan ambas.';

-- El storefront la llama con la secret key y el Admin con el JWT del usuario.
-- `anon` no: el browser no consulta el catálogo directamente.
revoke all on function public.catalog_search(uuid, jsonb, text, text, integer, integer, bigint, bigint, text, text) from public;
grant execute on function public.catalog_search(uuid, jsonb, text, text, integer, integer, bigint, bigint, text, text) to authenticated;
