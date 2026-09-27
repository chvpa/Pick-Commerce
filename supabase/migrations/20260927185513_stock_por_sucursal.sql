-- El stock se guarda en la sucursal que el Admin nombra, no en la primera.
--
-- Tres hallazgos del backlog, del 2026-08-26 y 27, que son el mismo:
--
--   1. «El Admin escribe el stock en la primera sucursal de la tienda»: con más
--      de un depósito, el ajuste va al que no es.
--   2. «El Admin lee el stock sumado de todas las sucursales y lo escribe a una
--      sola»: con dos sucursales, cada guardado que no toca el campo infla el
--      total —30 → 50 → 70—, porque el formulario lee la suma y la reescribe
--      como si fuera de una.
--   3. «Un negativo en una sucursal se compensa contra otra en la suma»: el
--      descuadre queda invisible en todas las lecturas, que es exactamente lo
--      que el espejo del ERP quería evitar (ADR-009).
--
-- Los tres se cierran con una sola decisión: **el payload nombra la sucursal**.
-- `stockPorSucursal` es un mapa `{ "<location_id>": unidades }` y sólo las
-- sucursales que trae se escriben; las que no, quedan como están. Así el
-- formulario nunca escribe una suma, y un negativo se ve donde está.
--
-- El número suelto `stock` se conserva porque el import de CSV tiene una sola
-- columna de stock y no puede tener más —el mismo esquema valida el formulario y
-- el archivo—, pero ahora **falla si la tienda tiene más de una sucursal** en
-- vez de elegir una. Esa es la parte que importa: con una sucursal, que es el
-- caso de todas las tiendas de hoy, nada cambia; con dos, un llamador que no
-- nombre la sucursal recibe un error en lugar de corromper el inventario en
-- silencio. Un espejo que miente es peor que un espejo que se cae.
--
-- Borrar una sucursal sigue sin existir en el Admin, y por eso acá no hay
-- guarda: `inventory_levels.location_id` es `on delete cascade`, así que un
-- borrado se llevaría el stock, pero también se lo lleva el borrado de la tienda
-- y ése tiene que seguir funcionando —lo usa el teardown del e2e—. Cuando haya
-- que cerrar una sucursal, la pregunta de diseño es a dónde va su stock, y eso
-- no se adivina ahora.
--
-- El resto del cuerpo es idéntico al vigente. Las migraciones son append-only,
-- así que la función se reemplaza entera desde un archivo nuevo.

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
  'Alta y edición de un producto con sus variantes, medios y stock, en una sola transacción. El stock va por `stockPorSucursal` —un mapa de sucursal a unidades— o por un número suelto, que sólo vale si la tienda tiene una sola sucursal.';

-- ---------------------------------------------------------------------------
-- Las sucursales, con lo que hay en cada una
-- ---------------------------------------------------------------------------
--
-- `locations` se lee sin función —RLS ya acota por membresía—, pero PostgREST no
-- agrupa, y sin el total por sucursal la pantalla no dice lo único que hace falta
-- saber antes de mover stock: cuánto hay acá y cuánto allá. `negativos` es el
-- tercer hallazgo del backlog puesto a la vista: en la suma, un -2 en una
-- sucursal y un 5 en otra son 3, y el descuadre desaparece.
--
-- `security invoker`: las dos tablas que toca tienen política de lectura para
-- `authenticated`, así que no hace falta `definer` y el aislamiento lo sigue
-- poniendo RLS.
create or replace function public.admin_locations(p_store_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'isPickupPoint', s.is_pickup_point,
        'unidades', s.unidades,
        'negativos', s.negativos
      )
      order by s.created_at, s.id
    ),
    '[]'::jsonb
  )
  from (
    select l.id, l.name, l.is_pickup_point, l.created_at,
           coalesce(sum(il.available), 0)::int as unidades,
           count(il.id) filter (where il.available < 0)::int as negativos
    from locations l
    left join inventory_levels il on il.location_id = l.id
    where l.store_id = p_store_id
    group by l.id, l.name, l.is_pickup_point, l.created_at
  ) s;
$$;

comment on function public.admin_locations is
  'Las sucursales de una tienda con su stock total y cuántas variantes tienen stock negativo.';

revoke all on function public.admin_locations(uuid) from public, anon;
grant execute on function public.admin_locations(uuid) to authenticated;
