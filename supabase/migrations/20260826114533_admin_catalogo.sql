-- Funciones del Admin: listar productos y guardarlos.
--
-- Las dos son `security invoker`, o sea que **RLS decide**: el Admin las llama
-- con el JWT del usuario, y las políticas de catálogo exigen `catalog.write`
-- para escribir. La función no verifica permisos por su cuenta, y no debe: dos
-- lugares donde decidir lo mismo terminan diciendo cosas distintas (ADR-052).

-- ---------------------------------------------------------------------------
-- Listado
-- ---------------------------------------------------------------------------
--
-- No se reusa `catalog_search`: el Admin necesita ver borradores y archivados,
-- que esa función excluye por diseño. Y necesita lo que un operador mira en una
-- tabla —cuántas variantes, cuánto stock, desde qué precio—, que el storefront
-- no muestra.
--
-- La búsqueda es la misma idea que en el storefront: todos los términos deben
-- aparecer en título, handle, marca o algún SKU. Buscar por SKU es como un
-- comercio encuentra un producto, y con PostgREST solo no se puede filtrar el
-- padre por una columna de la tabla embebida.

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
    greatest(1, ceil(t.n::numeric / greatest(1, p_per_page))::int) as page_count,
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
  where x.rn > (select (page - 1) * p_per_page from acotada)
    and x.rn <= (select page * p_per_page from acotada)
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', p_per_page,
  'pageCount', (select page_count from acotada)
);
$$;

comment on function public.admin_products is
  'Listado de productos del Admin: incluye borradores y archivados, busca por título, handle, marca y SKU.';

revoke all on function public.admin_products(uuid, text, text, integer, integer) from public;
grant execute on function public.admin_products(uuid, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Guardado
-- ---------------------------------------------------------------------------
--
-- Un producto son cuatro tablas: `products`, `product_variants`, `product_media`
-- e `inventory_levels`. Desde el browser eso serían cuatro peticiones sin
-- transacción, y una que falle a mitad deja el producto inconsistente —variantes
-- borradas y las nuevas sin crear—. Adentro de una función es atómico.
--
-- Es también el cuerpo que reusará el import de CSV: una fila del archivo es
-- exactamente este payload.

create or replace function public.admin_save_product(
  p_store_id uuid,
  p_producto jsonb
) returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant   uuid;
  v_location uuid;
  v_id       uuid := nullif(p_producto->>'id', '')::uuid;
  v_fuentes  jsonb;
  v_actual   products;
  v_variante jsonb;
  v_medio    jsonb;
  v_vid      uuid;
  v_i        integer := 0;
  v_ids      uuid[] := '{}';
begin
  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    raise exception 'La tienda % no existe', p_store_id;
  end if;

  -- El stock necesita una sucursal. Se usa la primera de la tienda mientras el
  -- Admin no tenga selector: inventar una acá escondería que falta configurarla.
  select id into v_location
  from locations
  where store_id = p_store_id
  order by created_at, id
  limit 1;

  if v_id is not null then
    select * into v_actual from products where id = v_id and store_id = p_store_id;
    if v_actual.id is null then
      raise exception 'El producto % no existe en esta tienda', v_id;
    end if;
  end if;

  v_fuentes := coalesce(v_actual.field_sources, '{}'::jsonb);

  /*
   * Los campos que posee el ERP no se pisan, aunque lleguen en el payload. El
   * formulario ya los deshabilita, pero el frontend no es la capa de
   * autorización: una petición armada a mano llegaría igual. Ver ADR-009.
   */
  if v_id is null then
    insert into products (
      tenant_id, store_id, handle, title, description, brand, category_id, status
    ) values (
      v_tenant,
      p_store_id,
      p_producto->>'handle',
      p_producto->>'title',
      nullif(p_producto->>'description', ''),
      nullif(p_producto->>'brand', ''),
      nullif(p_producto->>'categoryId', '')::uuid,
      coalesce(p_producto->>'status', 'draft')::product_status
    )
    returning id into v_id;
  else
    update products set
      handle      = p_producto->>'handle',
      title       = case when v_fuentes->>'title' = 'ERP' then v_actual.title
                    else p_producto->>'title' end,
      description = case when v_fuentes->>'description' = 'ERP' then v_actual.description
                    else nullif(p_producto->>'description', '') end,
      brand       = case when v_fuentes->>'brand' = 'ERP' then v_actual.brand
                    else nullif(p_producto->>'brand', '') end,
      category_id = nullif(p_producto->>'categoryId', '')::uuid,
      status      = coalesce(p_producto->>'status', 'draft')::product_status,
      updated_at  = now()
    where id = v_id;
  end if;

  -- Variantes. `position` es el orden del array: la PLP muestra la primera y su
  -- precio es el que ve el cliente (ADR-056).
  for v_variante in select * from jsonb_array_elements(coalesce(p_producto->'variants', '[]'::jsonb))
  loop
    v_vid := nullif(v_variante->>'id', '')::uuid;

    if v_vid is null then
      insert into product_variants (
        tenant_id, product_id, sku, barcode, title, position,
        price, currency, compare_at_price, cost, attributes
      ) values (
        v_tenant, v_id,
        v_variante->>'sku',
        nullif(v_variante->>'barcode', ''),
        v_variante->>'title',
        v_i,
        (v_variante->>'price')::bigint,
        coalesce(v_variante->>'currency', 'PYG'),
        nullif(v_variante->>'compareAtPrice', '')::bigint,
        nullif(v_variante->>'cost', '')::bigint,
        coalesce(v_variante->'attributes', '{}'::jsonb)
      )
      returning id into v_vid;
    else
      update product_variants set
        sku              = v_variante->>'sku',
        barcode          = nullif(v_variante->>'barcode', ''),
        title            = v_variante->>'title',
        position         = v_i,
        -- El precio es el campo que un ERP posee más seguido.
        price            = case when v_fuentes->>'price' = 'ERP' then price
                           else (v_variante->>'price')::bigint end,
        currency         = coalesce(v_variante->>'currency', 'PYG'),
        compare_at_price = nullif(v_variante->>'compareAtPrice', '')::bigint,
        cost             = nullif(v_variante->>'cost', '')::bigint,
        attributes       = coalesce(v_variante->'attributes', '{}'::jsonb),
        updated_at       = now()
      where id = v_vid and product_id = v_id;
    end if;

    -- El stock sólo se toca si el payload lo trae: omitirlo no es "cero".
    if v_location is not null and v_variante ? 'stock' then
      insert into inventory_levels (tenant_id, variant_id, location_id, available)
      values (v_tenant, v_vid, v_location, (v_variante->>'stock')::integer)
      on conflict (variant_id, location_id)
      do update set available = excluded.available, updated_at = now();
    end if;

    v_ids := v_ids || v_vid;
    v_i := v_i + 1;
  end loop;

  if array_length(v_ids, 1) is null then
    raise exception 'Un producto necesita al menos una variante';
  end if;

  -- Lo que ya no está en el payload se borró en el formulario.
  delete from product_variants where product_id = v_id and not (id = any(v_ids));

  -- El medio no tiene identidad propia para el usuario: se reemplaza entero.
  delete from product_media where product_id = v_id;
  v_i := 0;
  for v_medio in select * from jsonb_array_elements(coalesce(p_producto->'media', '[]'::jsonb))
  loop
    insert into product_media (tenant_id, product_id, url, alt, width, height, position)
    values (
      v_tenant, v_id,
      v_medio->>'url',
      coalesce(v_medio->>'alt', ''),
      (v_medio->>'width')::integer,
      (v_medio->>'height')::integer,
      v_i
    );
    v_i := v_i + 1;
  end loop;

  return v_id;
end;
$$;

comment on function public.admin_save_product is
  'Alta y edición de un producto con sus variantes, medios y stock, en una sola transacción. Respeta los campos que posee el ERP.';

revoke all on function public.admin_save_product(uuid, jsonb) from public;
grant execute on function public.admin_save_product(uuid, jsonb) to authenticated;
