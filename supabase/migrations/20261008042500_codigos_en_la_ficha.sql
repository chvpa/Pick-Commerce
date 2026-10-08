/*
 * Los códigos en la ficha del producto (v3 Fase 2).
 *
 * La ficha nueva del Admin muestra los tres códigos de un producto, cada uno en
 * su nivel, como los dejó la migración de los códigos del ERP: el SKU del modelo
 * en el producto, y el código interno y el de barras en cada variante. Las
 * columnas existían; `admin_save_product` no escribía las dos primeras.
 *
 * Se escriben sólo si el payload las trae —el import de CSV no las conoce, y
 * omitirlas no es borrarlas— y nunca si el campo es del ERP (ADR-009).
 */

create or replace function public.admin_save_product(
  p_store_id uuid,
  p_producto jsonb
) returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant     uuid;
  v_location   uuid;
  v_sucursales integer;
  v_sucursal   record;
  v_id         uuid := nullif(p_producto->>'id', '')::uuid;
  v_fuentes    jsonb;
  v_actual     products;
  v_variante   jsonb;
  v_medio      jsonb;
  v_vid        uuid;
  v_i          integer := 0;
  v_ids        uuid[] := '{}';
begin
  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    raise exception 'La tienda % no existe', p_store_id;
  end if;

  -- La sucursal del número suelto: sólo se usa cuando hay exactamente una, así
  -- que «la primera» y «la única» son lo mismo. Inventar una acá escondería que
  -- falta configurarla.
  select count(*) into v_sucursales from locations where store_id = p_store_id;

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
      tenant_id, store_id, handle, title, description, brand, category_id, status, sku
    ) values (
      v_tenant,
      p_store_id,
      p_producto->>'handle',
      p_producto->>'title',
      nullif(p_producto->>'description', ''),
      nullif(p_producto->>'brand', ''),
      nullif(p_producto->>'categoryId', '')::uuid,
      coalesce(p_producto->>'status', 'draft')::product_status,
      nullif(trim(p_producto->>'sku'), '')
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
      /*
       * El código del modelo sólo se toca si el payload lo trae: el import de CSV
       * no lo conoce, y omitirlo no es borrarlo. Si es del ERP, tampoco.
       */
      sku         = case
                      when v_fuentes->>'sku' = 'ERP' or not (p_producto ? 'sku') then v_actual.sku
                      else nullif(trim(p_producto->>'sku'), '')
                    end,
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
        tenant_id, product_id, sku, barcode, internal_code, title, position,
        price, currency, compare_at_price, cost, attributes
      ) values (
        v_tenant, v_id,
        v_variante->>'sku',
        nullif(v_variante->>'barcode', ''),
        nullif(trim(v_variante->>'internalCode'), ''),
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
        internal_code    = case
                             when v_fuentes->>'internal_code' = 'ERP'
                               or not (v_variante ? 'internalCode') then internal_code
                             else nullif(trim(v_variante->>'internalCode'), '')
                           end,
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
    -- Y si el dueño del stock es el ERP, tampoco se toca, aunque venga en el
    -- payload. Se saltea en silencio igual que el precio unas líneas más
    -- arriba: el formulario manda el stock de todas las variantes en cada
    -- guardado, así que cortar acá dejaría sin poder editar el título de un
    -- producto del ERP.
    if coalesce(v_fuentes->>'stock', '') <> 'ERP' then
      if v_variante ? 'stockPorSucursal' then
        -- Una entrada por sucursal, y sólo las que vienen: la sucursal que el
        -- payload no nombra no se toca. Es lo que permite editar el stock de un
        -- depósito sin leer —ni reescribir— el de los otros.
        for v_sucursal in
          select key as id, value as unidades
          from jsonb_each_text(v_variante->'stockPorSucursal')
        loop
          -- Una sucursal de otra tienda entraría con el `tenant_id` de ésta y
          -- quedaría fuera de toda lectura. La FK compuesta lo atajaría sólo si
          -- además fuera de otro tenant.
          if not exists (
            select 1 from locations
            where id = (v_sucursal.id)::uuid and store_id = p_store_id
          ) then
            raise exception 'La sucursal % no es de esta tienda', v_sucursal.id;
          end if;

          insert into inventory_levels (tenant_id, variant_id, location_id, available)
          values (v_tenant, v_vid, (v_sucursal.id)::uuid, (v_sucursal.unidades)::integer)
          on conflict (variant_id, location_id)
          do update set available = excluded.available, updated_at = now();
        end loop;

      elsif v_variante ? 'stock' then
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

        if v_sucursales > 1 then
          raise exception 'La tienda tiene % sucursales, así que el stock tiene que decir a cuál va. Un número suelto iría a una cualquiera.', v_sucursales;
        end if;

        insert into inventory_levels (tenant_id, variant_id, location_id, available)
        values (v_tenant, v_vid, v_location, (v_variante->>'stock')::integer)
        on conflict (variant_id, location_id)
        do update set available = excluded.available, updated_at = now();
      end if;
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
  'Alta y edición de un producto con sus variantes, medios, stock y códigos, en una sola transacción. El stock va por `stockPorSucursal` —un mapa de sucursal a unidades— o por un número suelto, que sólo vale si la tienda tiene una sola sucursal. El SKU del modelo (`sku`) y el código del ERP de cada variante (`internalCode`) se escriben sólo si vienen, y nunca si son del ERP.';
