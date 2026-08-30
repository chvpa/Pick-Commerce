-- Fase 12 — ninguna función paginada tenía techo.
--
-- `p_per_page` llegaba tal cual desde el cliente y se usaba para calcular la
-- página. La grave es `catalog_search`: es **pública y sin sesión**, así que una
-- ruta de SEO podía pedir un millón de filas y quedarse con el pool de
-- conexiones por el que después pasa el checkout. Las `admin_*` exigen sesión y
-- permiso, así que son defensa en profundidad — pero el agujero es el mismo y se
-- tapa igual.
--
-- El cambio es una sustitución mecánica: cada **uso** de `p_per_page` en el
-- cuerpo pasa a `least(p_per_page, 200)`, y la declaración del parámetro no se
-- toca. Que se aplique también donde se devuelve `perPage` no es un descuido: si
-- alguien pide 100.000 y recibe 200, el número que vuelve tiene que ser el que
-- se usó, o la paginación del cliente queda haciendo cuentas con un tamaño que
-- no existió.
--
-- Las definiciones son las **vigentes** de cada función, no reescrituras.
-- Verificado por diff: cada línea que cambia difiere sólo por el `least`.


-- ---------------------------------------------------------------------------
-- catalog_search
-- ---------------------------------------------------------------------------

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
    (select min(pe.efectivo) from precios pe where pe.product_id = p.id) as lowest,
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

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
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
      ) as rn,
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
      )) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * least(p_per_page, 200) from pagina)
    and x.rn <= (select page * least(p_per_page, 200) from pagina)
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


-- ---------------------------------------------------------------------------
-- admin_products
-- ---------------------------------------------------------------------------

create or replace function public.admin_products(
  p_store_id uuid,
  p_query    text    default '',
  p_status   text    default null,
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with base as (
  select
    p.*,
    lower(
      p.title || ' ' || p.handle || ' ' || coalesce(p.brand, '') || ' ' ||
      coalesce((select string_agg(v.sku, ' ') from product_variants v where v.product_id = p.id), '')
    ) as hay
  from products p
  where p.store_id = p_store_id
    and (p_status is null or p.status = p_status::product_status)
),

filtrados as (
  select b.*
  from base b
  where p_query = '' or not exists (
    select 1
    from unnest(string_to_array(lower(trim(p_query)), ' ')) t(tok)
    where t.tok <> '' and position(t.tok in b.hay) = 0
  )
),

total as (select count(*)::int as n from filtrados),

pagina as (
  select
    greatest(1, ceil(t.n::numeric / greatest(1, least(p_per_page, 200)))::int) as page_count,
    t.n
  from total t
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from pagina pg
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    -- Lo último editado primero: es lo que el operador acaba de tocar.
    select
      row_number() over (order by f.updated_at desc, f.id) as rn,
      jsonb_strip_nulls(jsonb_build_object(
        'id', f.id,
        'handle', f.handle,
        'title', f.title,
        'status', f.status,
        'brand', f.brand,
        'updatedAt', f.updated_at,
        'variantes', (select count(*)::int from product_variants v where v.product_id = f.id),
        -- Espejo del ERP: informativo, nunca autoridad. Ver ADR-009.
        'stock', (
          select coalesce(sum(il.available), 0)::int
          from inventory_levels il
          join product_variants v on v.id = il.variant_id
          where v.product_id = f.id
        ),
        'precioDesde', (select min(v.price) from product_variants v where v.product_id = f.id),
        'currency', (
          select v.currency from product_variants v
          where v.product_id = f.id order by v.position limit 1
        ),
        'imagen', (
          select m.url from product_media m
          where m.product_id = f.id order by m.position limit 1
        )
      )) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * least(p_per_page, 200) from acotada)
    and x.rn <= (select page * least(p_per_page, 200) from acotada)
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', least(p_per_page, 200),
  'pageCount', (select page_count from acotada)
);
$$;


-- ---------------------------------------------------------------------------
-- admin_orders
-- ---------------------------------------------------------------------------

create or replace function public.admin_orders(
  p_store_id uuid,
  p_query    text    default '',
  p_status   text    default null,
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with base as (
  select
    o.*,
    lower(
      '#' || o.number::text || ' ' ||
      coalesce(o.customer->>'name', '') || ' ' ||
      coalesce(o.customer->>'email', '') || ' ' ||
      coalesce(o.customer->>'phone', '')
    ) as hay
  from orders o
  where o.store_id = p_store_id
    and (p_status is null or o.status = p_status::order_status)
),

filtrados as (
  select b.* from base b
  where p_query = '' or not exists (
    select 1
    from unnest(string_to_array(lower(trim(p_query)), ' ')) t(tok)
    where t.tok <> '' and position(t.tok in b.hay) = 0
  )
),

total as (select count(*)::int as n from filtrados),

pagina as (
  select greatest(1, ceil(t.n::numeric / greatest(1, least(p_per_page, 200)))::int) as page_count, t.n
  from total t
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from pagina pg
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      row_number() over (order by f.created_at desc, f.id) as rn,
      jsonb_strip_nulls(jsonb_build_object(
        'id', f.id,
        'number', f.number,
        'createdAt', f.created_at,
        'customerName', f.customer->>'name',
        'total', jsonb_build_object('amount', f.total_amount, 'currency', f.currency),
        'status', f.status,
        'paymentStatus', f.payment_status,
        'itemCount', (select coalesce(sum(i.quantity), 0)::int from order_items i where i.order_id = f.id)
      )) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * least(p_per_page, 200) from acotada)
    and x.rn <= (select page * least(p_per_page, 200) from acotada)
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', least(p_per_page, 200),
  'pageCount', (select page_count from acotada)
);
$$;


-- ---------------------------------------------------------------------------
-- admin_customers
-- ---------------------------------------------------------------------------

create or replace function public.admin_customers(
  p_store_id    uuid,
  p_query       text    default '',
  p_customer_id uuid    default null,
  p_page        integer default 1,
  p_per_page    integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with base as (
  select
    c.*,
    lower(c.name || ' ' || c.email || ' ' || c.phone) as hay,
    (select count(*)::int from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as pedidos,
    (select coalesce(sum(o.total_amount), 0)::bigint from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as gastado,
    (select max(o.created_at) from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as ultimo
  from customers c
  where c.store_id = p_store_id
    and (p_customer_id is null or c.id = p_customer_id)
),

filtrados as (
  select b.* from base b
  where p_query = '' or not exists (
    select 1
    from unnest(string_to_array(lower(trim(p_query)), ' ')) t(tok)
    where t.tok <> '' and position(t.tok in b.hay) = 0
  )
),

total as (select count(*)::int as n from filtrados),

pagina as (
  select greatest(1, ceil(t.n::numeric / greatest(1, least(p_per_page, 200)))::int) as page_count, t.n
  from total t
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from pagina pg
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      -- Los que compraron hace poco primero; los que nunca compraron, al final.
      row_number() over (order by f.ultimo desc nulls last, f.created_at desc, f.id) as rn,
      jsonb_strip_nulls(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'email', f.email,
        'phone', f.phone,
        'taxId', f.tax_id,
        'taxName', f.tax_name,
        'createdAt', f.created_at,
        'orderCount', f.pedidos,
        'totalSpent', jsonb_build_object(
          'amount', f.gastado,
          'currency', coalesce((select currency from stores where id = p_store_id), 'PYG')
        ),
        'lastOrderAt', f.ultimo
      )) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * least(p_per_page, 200) from acotada)
    and x.rn <= (select page * least(p_per_page, 200) from acotada)
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', least(p_per_page, 200),
  'pageCount', (select page_count from acotada)
);
$$;


-- ---------------------------------------------------------------------------
-- admin_product_performance
-- ---------------------------------------------------------------------------

create or replace function public.admin_product_performance(
  p_store_id uuid,
  p_from     timestamptz,
  p_to       timestamptz,
  p_modo     text default 'vendidos',
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with moneda as (
  select coalesce((select currency from stores where id = p_store_id), 'PYG') as code
),

vendidos as (
  select o.id
  from orders o
  where o.store_id = p_store_id
    and o.created_at >= p_from
    and o.created_at <  p_to
    and o.status <> 'cancelled'
),

-- Lo vendido en el período, agrupado por el snapshot de la línea. Por el
-- snapshot y no por `variant_id`, igual que el top del resumen: el pedido guarda
-- lo que se vendió ese día, y si después le cambian el título a la variante el
-- histórico no se reescribe.
movidos as (
  select
    i.sku,
    min(i.title)                                   as title,
    min(i.variant_title)                           as variant_title,
    sum(i.quantity)::int                           as unidades,
    sum(i.unit_price * i.quantity)::bigint         as ingresos,
    sum(case when i.unit_cost is not null
             then (i.unit_price - i.unit_cost) * i.quantity end)::bigint as margen,
    sum(case when i.unit_cost is not null
             then i.unit_price * i.quantity end)::bigint                 as con_costo
  from order_items i
  join vendidos v on v.id = i.order_id
  group by i.sku
),

/*
 * Las variantes publicadas que no vendieron nada.
 *
 * `left join` contra lo movido y se queda con lo que no matcheó. El stock se
 * suma de todas las sucursales, que es como lo mira quien decide una liquidación.
 */
quietos as (
  select
    v.sku,
    p.title                                    as title,
    nullif(v.title, '')                        as variant_title,
    0                                          as unidades,
    0::bigint                                  as ingresos,
    null::bigint                               as margen,
    0::bigint                                  as con_costo,
    coalesce((
      select sum(il.available) from inventory_levels il where il.variant_id = v.id
    ), 0)::int                                 as stock
  from product_variants v
  join products p on p.id = v.product_id
  where p.store_id = p_store_id
    and p.status = 'active'
    and not exists (select 1 from movidos m where m.sku = v.sku)
),

elegidos as (
  select sku, title, variant_title, unidades, ingresos, margen, con_costo,
         null::int as stock
  from movidos
  where p_modo = 'vendidos'
  union all
  select sku, title, variant_title, unidades, ingresos, margen, con_costo, stock
  from quietos
  where p_modo = 'sin_movimiento'
),

total as (select count(*)::int as n from elegidos),

-- La página, acotada al rango válido: pedir la 99 de tres devuelve la última y
-- no una lista vacía, que se confunde con «no hay nada».
paginado as (
  select
    greatest(1, least(p_page, greatest(1, ceil((select n from total)::numeric / least(p_per_page, 200))::int))) as page
),

filas as (
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'sku', e.sku,
           'title', e.title,
           'variantTitle', e.variant_title,
           'unidades', e.unidades,
           'ingresos', jsonb_build_object('amount', e.ingresos, 'currency', (select code from moneda)),
           -- `null` y no cero cuando no hay costo: cero es un margen y «no sé» no
           -- lo es.
           'margen', case when coalesce(e.con_costo, 0) = 0 then null else jsonb_build_object(
             'amount', coalesce(e.margen, 0), 'currency', (select code from moneda)
           ) end,
           'stock', e.stock
         )) order by e.orden) as doc
  from (
    select e.*,
           row_number() over (
             order by
               case when p_modo = 'vendidos' then e.unidades end desc,
               e.title,
               e.sku
           ) as orden
    from elegidos e
  ) e
  where e.orden > ((select page from paginado) - 1) * least(p_per_page, 200)
    and e.orden <= (select page from paginado) * least(p_per_page, 200)
)

select jsonb_build_object(
  'items', coalesce((select doc from filas), '[]'::jsonb),
  'total', (select n from total),
  'page', (select page from paginado),
  'perPage', least(p_per_page, 200),
  'pageCount', greatest(1, ceil((select n from total)::numeric / least(p_per_page, 200))::int)
);
$$;
