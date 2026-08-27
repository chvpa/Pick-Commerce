-- Cargar stock en una tienda sin sucursales falla, en vez de descartarse.
--
-- `admin_save_product` guardaba el producto y salteaba el bloque de inventario
-- cuando la tienda no tenía ninguna fila en `locations`, devolviendo el id como
-- si nada hubiera pasado. El operador veía éxito y navegaba; el producto quedaba
-- invendible, con un síntoma —"Sin stock" en todo el catálogo— que no apunta a
-- la causa.
--
-- Sólo cambia ese `if`. El resto del cuerpo es idéntico al vigente: las
-- migraciones son append-only, así que la función se reemplaza entera con
-- `create or replace` desde un archivo nuevo en vez de editar el viejo.

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

    -- Igual que con el producto: en el import la identidad de una variante es su
    -- SKU, que es único por tenant.
    if v_vid is null and v_variante->>'sku' is not null then
      select v.id into v_vid
      from product_variants v
      where v.product_id = v_id and v.sku = v_variante->>'sku';
    end if;

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
    if v_variante ? 'stock' then
      -- Sin sucursal no hay dónde guardarlo. Antes esto se salteaba en silencio:
      -- la función devolvía el id como si todo hubiera salido bien, el Admin
      -- mostraba éxito y navegaba, y el producto quedaba invendible para siempre
      -- —"Sin stock" en la PLP, botón deshabilitado en el PDP— sin que nada
      -- apuntara a la causa. En un import de 500 filas, las 500 decían ok. El
      -- comentario de al lado decía que inventar una sucursal escondería que
      -- falta configurarla; saltearla la escondía igual.
      if v_location is null then
        raise exception 'La tienda no tiene ninguna sucursal, y sin sucursal el stock no se puede guardar. Crear una en locations antes de cargar stock.';
      end if;

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

  -- Lo que ya no está en el payload se borró en el formulario. En un import, el
  -- archivo es la verdad para los productos que nombra.
  delete from product_variants where product_id = v_id and not (id = any(v_ids));

  -- Sin la clave `media` no se toca nada. Con un array —aunque esté vacío— se
  -- reemplaza entero: el medio no tiene identidad propia para el usuario.
  if p_producto ? 'media' then
    delete from product_media where product_id = v_id;
    v_i := 0;
    for v_medio in select * from jsonb_array_elements(p_producto->'media')
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
  end if;

  return v_id;
end;
$$;

comment on function public.admin_save_product is
  'Alta y edición de un producto con sus variantes, medios y stock, en una sola transacción. Falla si trae stock y la tienda no tiene sucursal.';

revoke all on function public.admin_save_product(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_product(uuid, jsonb) to authenticated;
