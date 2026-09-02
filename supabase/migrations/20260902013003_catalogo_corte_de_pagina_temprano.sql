-- El catálogo pagina antes de serializar, y esta vez con el motivo correcto
--
-- Restaura el corte de página temprano que la migración anterior había quitado.
-- Se lo quitó porque no cambiaba el tiempo de la primera página, y esa medición
-- era cierta pero incompleta: **sólo se midió la primera página**.
--
--     primera página, sin el corte   231 ms      con el corte   238 ms
--     página 100,     sin el corte  1660 ms      con el corte   204 ms
--
-- La diferencia es el `Run Condition` de Postgres 17, que empuja adentro de la
-- ventana el límite **superior** del `row_number()` y no el inferior. En la
-- primera página el tope es 24 y la ventana para ahí sola. En la página 100 la
-- ventana entrega 2400 filas y el filtro de abajo descarta 2376 **después** de
-- haberles armado el documento.
--
-- Las cuatro migraciones de esta serie, en orden, son el registro de cómo se
-- llegó acá. No se colapsan en una: la que no sirvió y la que se revirtió por el
-- motivo equivocado son las que explican por qué el resultado tiene esta forma.

create or replace function public.catalog_search(
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
-- La colección pedida, si la hay. `rules` nulo la hace manual.
coleccion as (
  select col.id, col.rules, col.sort
  from collections col
  where p_collection is not null
    and col.store_id = p_store_id
    and col.handle = p_collection
),

-- Promociones de catálogo vigentes de la tienda. Son pocas —un comercio tiene
-- diez, no diez mil—, así que se resuelven una vez por consulta y se cruzan,
-- en vez de evaluarse producto por producto.
promos as (
  select pr.id, pr.title, pr.priority, pr.stackable,
         pr.discount_type as "discountType", pr.discount_value as "discountValue",
         pr.target
  from promotions pr
  where pr.store_id = p_store_id
    and pr.status = 'active'
    -- De catálogo: sin cupón ni condiciones de carrito.
    and pr.code is null
    and pr.min_subtotal is null
    and pr.min_quantity is null
    and (pr.starts_at is null or now() >= pr.starts_at)
    and (pr.ends_at is null or now() < pr.ends_at)
    and (pr.usage_limit is null or pr.usage_count < pr.usage_limit)
),

-- Las que alcanzan a cada producto, ya ordenadas para encadenar. El `filter`
-- deja `[]` en los productos sin promoción, que es lo que permite saltear el
-- cálculo más abajo.
promos_producto as (
  select p.id as product_id,
         coalesce(
           jsonb_agg(to_jsonb(pm) - 'target' order by pm.priority desc, pm.id)
             filter (where pm.id is not null),
           '[]'::jsonb
         ) as lista
  from products p
  left join promos pm on (
    pm.target->>'kind' = 'all'
    or (pm.target->>'kind' = 'product'  and pm.target->'ids' ? p.id::text)
    or (pm.target->>'kind' = 'category' and p.category_id is not null
        and pm.target->'ids' ? p.category_id::text)
    or (pm.target->>'kind' = 'collection' and exists (
          select 1 from collection_products cp
          where cp.product_id = p.id and pm.target->'ids' ? cp.collection_id::text))
  )
  where p.store_id = p_store_id and p.status = 'active'
  group by p.id
),

-- El precio efectivo de cada variante.
--
-- El `case` no es una optimización cosmética: sin promociones vigentes —que es
-- el estado normal de una tienda— `lista` es `[]` para todos y no se llama a
-- `apply_chain` ni una vez, así que la consulta cuesta lo mismo que antes.
precios as (
  select v.id as variant_id, v.product_id, v.price as lista,
         case when pp.lista = '[]'::jsonb then v.price
              else (app.apply_chain(v.price, pp.lista)->>'amount')::bigint
         end as efectivo
  from product_variants v
  join promos_producto pp on pp.product_id = v.product_id
),

-- El precio más bajo de cada producto, agregado **una vez**.
--
-- Era una subconsulta correlacionada —`(select min(efectivo) from precios where
-- product_id = p.id)`— dentro de `prods`. Contra una tabla habría usado el
-- índice; contra un CTE no hay índice que usar, así que Postgres recorría las
-- 5010 filas de `precios` una vez por producto: 25 millones de filas y 1,9 de
-- los 2,2 segundos que tardaba el catálogo. Medido con `explain analyze`.
--
-- Un producto sin variantes no aparece acá, y el `left join` de `prods` le deja
-- `lowest` en nulo, que es lo que devolvía el `min()` de un conjunto vacío.
minimos as (
  select product_id, min(efectivo) as lowest
  from precios
  group by product_id
),

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
    p.created_at,
    /*
     * Unidades vendidas, sin los cancelados. Se agrega en la consulta y **no**
     * se guarda en una columna: un contador materializado es alguien que tiene
     * que acordarse de actualizarlo, y ADR-056 ya dice a dónde lleva eso con el
     * stock. El join va por `variant_id` porque `order_items` no referencia al
     * producto: guarda la variante y una copia de lo que se vendió.
     */
    coalesce((
      select sum(oi.quantity)
      from order_items oi
      join product_variants pv on pv.id = oi.variant_id
      join orders o on o.id = oi.order_id
      where pv.product_id = p.id and o.status <> 'cancelled'
    ), 0)::int as vendidas,
    -- El mínimo **efectivo**, no el de lista: de acá salen el orden por precio,
    -- el filtro de rango y los extremos de la barra.
    mp.lowest,
    -- Sobre esto busca el usuario: título, marca y SKUs, como en el core.
    lower(
      p.title || ' ' || coalesce(p.brand, '') || ' ' ||
      coalesce((select string_agg(v.sku, ' ') from product_variants v where v.product_id = p.id), '')
    ) as hay
  from products p
  left join categories c on c.id = p.category_id
  left join minimos mp on mp.product_id = p.id
  -- El storefront nunca ve borradores. Un select sin esto los publicaría.
  where p.store_id = p_store_id
    and p.status = 'active'
    and (p_handle is null or p.handle = p_handle)
    -- La pertenencia **manual** se resuelve acá. La dinámica no: sus reglas son
    -- filtros de faceta y necesitan los valores del producto, que se calculan
    -- más abajo. Se aplica en `base`.
    and (
      p_collection is null
      or (select rules from coleccion) is not null
      or exists (
        select 1
        from collection_products cp
        join coleccion c on c.id = cp.collection_id
        where cp.product_id = p.id
      )
    )
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
  left join pfacets pfr on pfr.product_id = pr.id
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
  -- Las reglas de una colección dinámica. Misma forma que `p_filters` —varios
  -- valores de una faceta son un OR, facetas distintas un AND— pero acá, junto
  -- a la búsqueda y al precio, para que **no se auto-excluyan** del conteo de
  -- facetas: la colección tiene que seguir acotada cuando el visitante filtra.
  and not exists (
    select 1
    from jsonb_each(coalesce((select rules from coleccion), '{}'::jsonb)) r(k, vals)
    where jsonb_array_length(r.vals) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(r.vals) t(v)
        where coalesce(pfr.fv -> r.k, '[]'::jsonb) ? t.v
      )
  )
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
    greatest(1, ceil(t.n::numeric / greatest(1, least(p_per_page, 200)))::int) as page_count,
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

-- El orden de la página, calculado sobre lo barato: id, título, precio más
-- bajo y unidades vendidas, que ya están en `filtrados`.
--
-- Acá **no** se serializa nada, y eso es lo que hace barata la paginación
-- profunda. Antes el `jsonb_build_object` vivía en el mismo select que este
-- `row_number()`, así que se armaba el documento de cada fila que la ventana
-- dejaba pasar.
--
-- En la **primera** página eso no costaba: Postgres empuja el tope adentro de la
-- ventana con un `Run Condition` sobre el `row_number()`, y para a las 24 filas.
-- Pero el `Run Condition` sólo empuja el límite **superior**. En la página 100 la
-- ventana entrega 2400 filas, se arman 2400 documentos y se descartan 2376:
--
--     página 100, sin este corte   1660 ms
--     página 100, con este corte    204 ms
--
-- Medido con 5006 productos. Se revirtió una vez por haber medido sólo la
-- primera página, donde no se nota.
ordenados as (
  select
    f.*,
    row_number() over (
      order by
        case when p_sort = 'price-asc'  then f.lowest end asc  nulls last,
        case when p_sort = 'price-desc' then f.lowest end desc nulls last,
        case when p_sort = 'title-asc'  then lower(f.title) end asc,
        -- Descendentes las dos. `f.ord` desempata al final, así que lo que no
        -- vendió nada conserva el orden de descubrimiento en vez de barajarse.
        case when p_sort = 'newest'       then f.created_at end desc,
        case when p_sort = 'best-selling' then f.vendidas   end desc,
        f.ord
    ) as rn
  from filtrados f
),

-- La página pedida. El corte va **antes** de serializar, así que lo que sigue
-- trabaja sobre `p_per_page` filas y no sobre el catálogo entero.
pagina_items as (
  select o.*
  from ordenados o
  where o.rn > (select (page - 1) * least(p_per_page, 200) from pagina)
    and o.rn <= (select page * least(p_per_page, 200) from pagina)
),

items as (
  select jsonb_agg(
    -- `strip_nulls`: el contrato del core dice "ausente", no "nulo".
    jsonb_strip_nulls(jsonb_build_object(
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
      'createdAt', f.created_at,
      'unitsSold', f.vendidas,
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
          -- El precio que paga el comprador. Con una promoción vigente es el
          -- rebajado; sin ninguna, el de lista.
          'price', jsonb_build_object('amount', pe.efectivo, 'currency', v.currency),
          -- El tachado. Si la variante ya traía uno propio del catálogo y era
          -- mayor, gana ése: tachar el de lista mostraría un ahorro más chico
          -- que el real. Y si no hubo descuento, se conserva el de siempre.
          'compareAtPrice', case
            when pe.efectivo < v.price
              then jsonb_build_object(
                'amount', greatest(v.price, coalesce(v.compare_at_price, 0)),
                'currency', v.currency)
            when v.compare_at_price is null then null
            else jsonb_build_object('amount', v.compare_at_price, 'currency', v.currency)
          end,
          'cost', case when v.cost is null then null
                  else jsonb_build_object('amount', v.cost, 'currency', v.currency) end,
          -- Espejo de inventario: la suma de las sucursales. Nunca es
          -- autoridad si el ERP posee el stock. Ver ADR-009.
          'availableQuantity', coalesce((
            select sum(il.available)::int from inventory_levels il where il.variant_id = v.id
          ), 0),
          'attributes', v.attributes
        ) order by v.position)
        from product_variants v
        join precios pe on pe.variant_id = v.id
        where v.product_id = f.id
      ), '[]'::jsonb)
    ))
    order by f.rn
  ) as docs
  from pagina_items f
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

-- Renombrado desde `precios`, que ahora es el CTE de precios efectivos por
-- variante. Estos son los extremos de la barra de rango, y salen de `lowest`,
-- así que siguen al precio con descuento sin más cambios.
extremos as (
  select min(lowest) as pmin, max(lowest) as pmax from prods
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'facets', coalesce((select docs from facetas), '[]'::jsonb),
  'total', (select n from pagina),
  'page', (select page from pagina),
  'perPage', least(p_per_page, 200),
  'pageCount', (select page_count from pagina),
  'priceMin', (select pmin from extremos),
  'priceMax', (select pmax from extremos)
);
$$;

