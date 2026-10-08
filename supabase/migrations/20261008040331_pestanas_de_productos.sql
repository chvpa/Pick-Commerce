/*
 * Productos por pestaña (v3 Fase 2).
 *
 * El handoff ordena el catálogo en pestañas con su conteo —todos, publicados,
 * borradores, sin foto, stock quieto, archivados—, y «sin foto» y «stock quieto»
 * dejan de ser pantallas aparte para ser dos maneras de mirar la misma lista.
 * Dos de esas pestañas no son un estado: dependen de las fotos, del stock y de
 * las ventas. Esas señales se cuentan una vez por producto en
 * `app.senales_de_productos`, y qué cae en cada pestaña lo dice
 * `app.producto_en_pestana`: la lista y el conteo no pueden contar distinto.
 */

-- ---------------------------------------------------------------------------
-- Las señales de cada producto
-- ---------------------------------------------------------------------------

/*
 * Una fila por producto de la tienda. Cada agregado va en su propio CTE y entra
 * por join, una vez: una subconsulta por fila contra `order_items` era lo que
 * hacía lento el catálogo (CLAUDE.md).
 *
 * `con_stock` es la regla del storefront —alguna sucursal con unidades—, y
 * `stock` la suma, que es lo que se muestra. Los días sin vender se cuentan
 * desde la última venta no cancelada de cualquiera de sus variantes, o desde el
 * alta si nunca se vendió: la misma lectura que la antigüedad del stock
 * (ADR-135), por producto en vez de por variante.
 */
create or replace function app.senales_de_productos(p_store_id uuid)
returns table (
  product_id      uuid,
  status          public.product_status,
  con_foto        boolean,
  con_stock       boolean,
  stock           integer,
  dias_sin_vender integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  with stock as (
    select v.product_id,
           sum(il.available)::int as unidades,
           bool_or(il.available > 0) as hay
    from inventory_levels il
    join product_variants v on v.id = il.variant_id
    join products p on p.id = v.product_id
    where p.store_id = p_store_id
    group by v.product_id
  ),
  ventas as (
    select v.product_id, max(o.created_at) as ultima
    from order_items i
    join orders o on o.id = i.order_id
    join product_variants v on v.id = i.variant_id
    where o.store_id = p_store_id
      and o.status <> 'cancelled'
    group by v.product_id
  ),
  fotos as (
    select distinct m.product_id
    from product_media m
    join products p on p.id = m.product_id
    where p.store_id = p_store_id
  )
  select
    p.id,
    p.status,
    f.product_id is not null,
    coalesce(s.hay, false),
    coalesce(s.unidades, 0),
    greatest(0, extract(day from now() - coalesce(ve.ultima, p.created_at)))::int
  from products p
  left join stock s on s.product_id = p.id
  left join ventas ve on ve.product_id = p.id
  left join fotos f on f.product_id = p.id
  where p.store_id = p_store_id;
$$;

comment on function app.senales_de_productos(uuid) is
  'Fotos, stock y días sin vender de cada producto de una tienda, contados una vez (v3 Fase 2). Invoker: RLS acota.';

revoke all on function app.senales_de_productos(uuid) from public, anon;
grant execute on function app.senales_de_productos(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La definición de cada pestaña
-- ---------------------------------------------------------------------------

create or replace function app.producto_en_pestana(
  p_status    public.product_status,
  p_con_foto  boolean,
  p_con_stock boolean,
  p_dias      integer,
  p_pestana   text
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_pestana
    when 'publicados' then p_status = 'active'
    when 'borradores' then p_status = 'draft'
    when 'archivados' then p_status = 'archived'
    -- Publicado y sin ninguna foto: la misma cola que la tarea del Inicio.
    when 'sinfoto'    then p_status = 'active' and not p_con_foto
    /*
     * Con stock y más de 90 días sin venderse: los dos tramos de arriba de la
     * antigüedad (ADR-135). Lo archivado ya se sacó del catálogo a propósito.
     */
    when 'quieto'     then p_status <> 'archived' and p_con_stock and p_dias > 90
    -- 'todos', o cualquier otra cosa: sin filtro.
    else true
  end;
$$;

comment on function app.producto_en_pestana(public.product_status, boolean, boolean, integer, text) is
  'Si un producto está en una pestaña de la lista de Productos (v3 Fase 2). Pura: no lee tablas.';

revoke all on function app.producto_en_pestana(public.product_status, boolean, boolean, integer, text)
  from public, anon;
grant execute on function app.producto_en_pestana(public.product_status, boolean, boolean, integer, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La lista de productos
-- ---------------------------------------------------------------------------

/*
 * Firma nueva con los parámetros nuevos al final y con default, como la de
 * pedidos: el Admin desplegado manda los cinco de antes y sigue funcionando. La
 * vieja se borra para que PostgREST no tenga dos sobrecargas entre las que
 * elegir.
 */
drop function if exists public.admin_products(uuid, text, text, integer, integer);

create or replace function public.admin_products(
  p_store_id uuid,
  p_query    text    default '',
  p_status   text    default null,
  p_page     integer default 1,
  p_per_page integer default 20,
  p_tab      text    default null,
  p_category uuid    default null,
  p_brand    text    default null,
  -- 'sin' (cero o menos), 'pocos' (de 1 a 5) o 'con' (más de cero).
  p_stock    text    default null
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with senales as (
  select * from app.senales_de_productos(p_store_id)
),

-- La categoría elegida y todas las de abajo: los productos cuelgan de la hoja.
categorias as (
  with recursive arbol as (
    select c.id from categories c where c.id = p_category and c.store_id = p_store_id
    union all
    select c.id from categories c join arbol a on c.parent_id = a.id
  )
  select id from arbol
),

base as (
  select
    p.id, p.updated_at, s.stock, s.dias_sin_vender,
    lower(
      p.title || ' ' || p.handle || ' ' || coalesce(p.brand, '') || ' ' ||
      coalesce((select string_agg(v.sku, ' ') from product_variants v where v.product_id = p.id), '')
    ) as hay
  from products p
  join senales s on s.product_id = p.id
  where p.store_id = p_store_id
    and (p_status is null or p.status = p_status::product_status)
    and app.producto_en_pestana(s.status, s.con_foto, s.con_stock, s.dias_sin_vender, p_tab)
    and (p_category is null or p.category_id in (select id from categorias))
    and (p_brand is null or p.brand = p_brand)
    and (
      p_stock is null
      or (p_stock = 'sin' and s.stock <= 0)
      or (p_stock = 'pocos' and s.stock between 1 and 5)
      or (p_stock = 'con' and s.stock > 0)
    )
),

filtrados as (
  select b.*
  from base b
  where coalesce(p_query, '') = '' or not exists (
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

/*
 * El corte de página va antes de armar las filas, por la regla de CLAUDE.md
 * sobre `row_number()`: antes se armaba el documento de cada producto que pasaba
 * el filtro y se descartaban todos menos veinte.
 *
 * El orden es el de la pregunta de cada pestaña: lo quieto, lo más viejo
 * primero; lo sin foto, lo que tiene stock primero —una foto lo vuelve a
 * vender—; el resto, lo último que se tocó.
 */
numeradas as (
  select
    f.id,
    row_number() over (
      order by
        case when p_tab = 'quieto' then f.dias_sin_vender end desc nulls last,
        case when p_tab = 'sinfoto' then f.stock end desc nulls last,
        f.updated_at desc,
        f.id
    ) as rn
  from filtrados f
),

de_la_pagina as (
  select n.id, n.rn
  from numeradas n, acotada a
  where n.rn >  (a.page - 1) * least(p_per_page, 200)
    and n.rn <= a.page * least(p_per_page, 200)
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      d.rn,
      jsonb_strip_nulls(jsonb_build_object(
        'id', p.id,
        'handle', p.handle,
        'title', p.title,
        'status', p.status,
        'brand', p.brand,
        'updatedAt', p.updated_at,
        -- La hoja y su padre: «Prendas › Camperas». Más arriba no suma.
        'categoria', (
          select coalesce(padre.name || ' › ', '') || c.name
          from categories c
          left join categories padre on padre.id = c.parent_id
          where c.id = p.category_id
        ),
        'variantes', (select count(*)::int from product_variants v where v.product_id = p.id),
        -- Espejo del ERP: informativo, nunca autoridad. Ver ADR-009.
        'stock', s.stock,
        'diasSinVender', s.dias_sin_vender,
        'precioDesde', (select min(v.price) from product_variants v where v.product_id = p.id),
        'currency', (
          select v.currency from product_variants v
          where v.product_id = p.id order by v.position limit 1
        ),
        'imagen', (
          select m.url from product_media m
          where m.product_id = p.id order by m.position limit 1
        )
      )) as doc
    from de_la_pagina d
    join products p on p.id = d.id
    join senales s on s.product_id = p.id
  ) x
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', least(p_per_page, 200),
  'pageCount', (select page_count from acotada)
);
$$;

comment on function public.admin_products(uuid, text, text, integer, integer, text, uuid, text, text) is
  'El catálogo del Admin, por pestaña, categoría, marca, stock y búsqueda, paginado en el servidor (v3 Fase 2).';

revoke all on function public.admin_products(uuid, text, text, integer, integer, text, uuid, text, text) from public, anon;
grant execute on function public.admin_products(uuid, text, text, integer, integer, text, uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lo que la pantalla necesita además de la página
-- ---------------------------------------------------------------------------

/*
 * Cuántos hay en cada pestaña, cuántos se ven en la tienda y las marcas para el
 * filtro, en una consulta.
 *
 * «Se ven» es la regla de `catalog_search`, que es su dueña: publicado, con
 * stock salvo que la tienda muestre lo agotado, y con foto si la tienda oculta lo
 * que no tiene. Un test compara las dos cuentas.
 */
create or replace function public.admin_product_counts(p_store_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with senales as (
    select * from app.senales_de_productos(p_store_id)
  ),
  ajustes as (
    select
      coalesce((select s.settings->'catalog'->>'showOutOfStock' from store_settings s
                 where s.store_id = p_store_id), 'false') = 'true' as muestra_agotados,
      coalesce((select s.settings->'catalog'->>'hideWithoutImage' from store_settings s
                 where s.store_id = p_store_id), 'false') = 'true' as oculta_sin_foto
  )
  select jsonb_build_object(
    'todos', (select count(*) from senales)::int,
    'publicados', (select count(*) from senales s
                    where app.producto_en_pestana(s.status, s.con_foto, s.con_stock, s.dias_sin_vender, 'publicados'))::int,
    'borradores', (select count(*) from senales s
                    where app.producto_en_pestana(s.status, s.con_foto, s.con_stock, s.dias_sin_vender, 'borradores'))::int,
    'sinfoto', (select count(*) from senales s
                 where app.producto_en_pestana(s.status, s.con_foto, s.con_stock, s.dias_sin_vender, 'sinfoto'))::int,
    'quieto', (select count(*) from senales s
                where app.producto_en_pestana(s.status, s.con_foto, s.con_stock, s.dias_sin_vender, 'quieto'))::int,
    'archivados', (select count(*) from senales s
                    where app.producto_en_pestana(s.status, s.con_foto, s.con_stock, s.dias_sin_vender, 'archivados'))::int,
    'seVen', (select count(*) from senales s, ajustes a
               where s.status = 'active'
                 and (a.muestra_agotados or s.con_stock)
                 and (not a.oculta_sin_foto or s.con_foto))::int,
    'ocultaSinFoto', (select oculta_sin_foto from ajustes),
    -- Para el filtro. Con techo: una tienda con miles de marcas no es un menú.
    'marcas', coalesce((
      select jsonb_agg(m.brand order by m.brand)
      from (
        select distinct p.brand
        from products p
        where p.store_id = p_store_id and coalesce(p.brand, '') <> ''
        order by p.brand
        limit 500
      ) m
    ), '[]'::jsonb)
  );
$$;

comment on function public.admin_product_counts(uuid) is
  'Cuántos productos hay en cada pestaña, cuántos se ven y qué marcas hay (v3 Fase 2). Invoker: RLS acota.';

revoke all on function public.admin_product_counts(uuid) from public, anon;
grant execute on function public.admin_product_counts(uuid) to authenticated, service_role;
