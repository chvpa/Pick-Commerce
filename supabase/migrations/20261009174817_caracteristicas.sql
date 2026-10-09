-- Las características de los productos, administrables (ADR-161).
--
-- `attribute_definitions` existe desde la Fase 2 de v1 y decide qué facetas tiene
-- el catálogo (`filterable`), pero no tenía pantalla: se sembraba por script. El
-- handoff le suma lo que hace falta para administrarlas: de qué tipo es, qué
-- opciones tiene, si se usa para variantes y si es obligatoria.
--
-- `name` es la clave con la que el valor viaja en `product_variants.attributes`
-- y en la URL del filtro. **No se edita** —cambiarla dejaría a todas las
-- variantes con una clave que nadie declara—; lo que se edita es `label`.

alter table attribute_definitions
  add column kind text not null default 'options'
    check (kind in ('options', 'color', 'text')),
  add column options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  add column for_variants boolean not null default false,
  add column required boolean not null default false;

comment on column attribute_definitions.kind is
  'options: una lista cerrada; color: una lista que se muestra con su muestra; text: cada producto la completa a mano.';
comment on column attribute_definitions.required is
  'No se publica un producto sin completarla. La comprueba el guardado del producto, no la pantalla.';

/*
 * Las que ya existen viven en las variantes —es el único lugar donde había
 * atributos—, así que son de variantes. Sus opciones son los valores que ya
 * tienen, para que la pantalla no arranque vacía con un catálogo cargado.
 */
update attribute_definitions d
set for_variants = true,
    kind = case when d.name = 'color' then 'color' else 'options' end,
    options = coalesce((
      select jsonb_agg(s.valor order by s.valor)
      from (
        select distinct v.attributes->>d.name as valor
        from product_variants v
        join products p on p.id = v.product_id
        where p.store_id = d.store_id
          and v.attributes ? d.name
        limit 200
      ) s
      where coalesce(s.valor, '') <> ''
    ), '[]'::jsonb);

/*
 * Cuántos productos usan cada característica, para decirlo antes de borrarla.
 * `invoker`: lee con la sesión de quien llama, y RLS ya acota productos y
 * variantes a su organización.
 */
create or replace function public.admin_attribute_usage(p_store_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(s.clave, s.productos), '{}'::jsonb)
  from (
    select k.clave, count(distinct v.product_id) as productos
    from product_variants v
    join products p on p.id = v.product_id
    cross join lateral jsonb_object_keys(v.attributes) as k(clave)
    where p.store_id = p_store_id
    group by k.clave
  ) s;
$$;

revoke all on function public.admin_attribute_usage(uuid) from public, anon;
grant execute on function public.admin_attribute_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo obligatorio se comprueba al guardar
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_product(
  p_store_id uuid,
  p_producto jsonb
) returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_faltan   text;
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

  /*
   * Las características obligatorias (ADR-161): un producto publicado las tiene
   * completas en todas sus variantes. Va acá y no en la pantalla porque por acá
   * pasan el formulario y el import de CSV, y al final porque recién ahora están
   * las variantes que vinieron en el payload.
   */
  if (select status from products where id = v_id) = 'active' then
    select string_agg(d.label, ', ' order by d.position, d.label)
    into v_faltan
    from attribute_definitions d
    where d.store_id = p_store_id
      and d.required
      and (d.category_id is null
           or d.category_id = (select category_id from products where id = v_id))
      and exists (
        select 1 from product_variants v
        where v.product_id = v_id
          and coalesce(v.attributes->>d.name, '') = ''
      );

    if v_faltan is not null then
      raise exception 'Para publicarlo falta completar: %', v_faltan;
    end if;
  end if;

  return v_id;
end;
$$;
