-- Import de productos, y una corrección en `admin_save_product`.
--
-- **La corrección primero, porque es una pérdida de datos.** `admin_save_product`
-- reemplazaba los medios del producto siempre: borraba todos e insertaba los del
-- payload. El CSV no lleva imágenes —un archivo de texto no puede saber el ancho
-- y el alto, que son obligatorios contra CLS (ADR-034)—, así que importar sobre
-- un producto existente le habría borrado las fotos sin avisar.
--
-- Ahora vale la misma convención que ya usaba el stock: **la clave ausente
-- significa "no tocar"**, y sólo un array explícito reemplaza. Es la diferencia
-- entre "no dije nada de las imágenes" y "quiero que no tenga ninguna".

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

-- ---------------------------------------------------------------------------
-- Import
-- ---------------------------------------------------------------------------
--
-- Cada producto se guarda en su propio bloque `begin/exception`, que en plpgsql
-- es una subtransacción: **un producto que falla no arrastra a los demás**. Sin
-- eso, un SKU repetido en la fila 400 de un archivo de 500 tiraría el import
-- entero y el operador tendría que adivinar dónde quedó.
--
-- Devuelve un reporte por producto —qué entró, qué no y por qué—, que el Admin
-- muestra y ofrece descargar. Un import que sólo dice "listo" obliga a revisar
-- el catálogo a mano para saber qué pasó.

create or replace function public.import_products(
  p_store_id uuid,
  p_productos jsonb
) returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_item       jsonb;
  v_reporte    jsonb := '[]'::jsonb;
  v_id         uuid;
  v_previo     uuid;
  v_i          integer := 0;
begin
  for v_item in select * from jsonb_array_elements(p_productos)
  loop
    begin
      /*
       * En un archivo la identidad de un producto es su handle. Resolverlo acá
       * y no dentro de `admin_save_product` es deliberado: en el formulario,
       * crear con un handle que ya existe tiene que fallar con el error de la
       * restricción única, no pisar en silencio otro producto.
       */
      select id into v_previo from products
      where store_id = p_store_id and handle = v_item->>'handle';

      if v_previo is not null then
        v_item := jsonb_set(v_item, '{id}', to_jsonb(v_previo::text));
      end if;

      v_id := admin_save_product(p_store_id, v_item);

      v_reporte := v_reporte || jsonb_build_object(
        'indice', v_i,
        'handle', v_item->>'handle',
        'ok', true,
        'accion', case when v_previo is null then 'creado' else 'actualizado' end,
        'id', v_id
      );
    exception when others then
      v_reporte := v_reporte || jsonb_build_object(
        'indice', v_i,
        'handle', v_item->>'handle',
        'ok', false,
        'accion', 'rechazado',
        -- El mensaje de Postgres es lo único que sabe por qué falló: un
        -- "error al importar" genérico no le sirve a nadie.
        'error', SQLERRM
      );
    end;

    v_i := v_i + 1;
  end loop;

  return v_reporte;
end;
$$;

comment on function public.import_products is
  'Importa productos. Cada uno es atómico por separado: uno que falla no arrastra al resto. Devuelve el reporte fila por fila.';

revoke all on function public.import_products(uuid, jsonb) from public;
grant execute on function public.import_products(uuid, jsonb) to authenticated;
