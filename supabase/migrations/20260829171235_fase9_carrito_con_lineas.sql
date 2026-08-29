-- Fase 9 — `cart_promotions` devuelve además el precio efectivo de cada línea.
--
-- Sin esto quedó una incoherencia que apareció al conectar el catálogo: la PLP
-- mostraba ₲120.000 con un 20 % activo, el carrito mostraba ₲150.000 porque leía
-- `product_variants.price` a secas, y `create_order` cobraba ₲120.000. Tres
-- números para lo mismo, y el del medio es el que el comprador mira antes de
-- decidir.
--
-- La salida gana `lines`, y el endpoint del carrito pasa a tomar el dinero de
-- acá en vez de sumarlo por su cuenta. Es la **misma función** que usa
-- `create_order`, así que lo que el carrito muestra y lo que el pedido cobra no
-- pueden divergir: es un solo cálculo, no dos que hay que mantener de acuerdo.

create or replace function public.cart_promotions(
  p_store_id uuid,
  p_lines    jsonb,
  p_code     text default null
) returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_ahora       timestamptz := now();
  v_subtotal    bigint := 0;
  v_tras_cat    bigint := 0;
  v_unidades    integer := 0;
  v_applied     jsonb := '[]'::jsonb;
  v_lineas      jsonb := '[]'::jsonb;
  v_linea       record;
  v_promos      jsonb;
  v_cadena      jsonb;
  v_a           jsonb;
  v_de_carrito  jsonb;
  v_cupon       record;
  v_issue       text;
  v_total       bigint;
  v_desc        bigint;
  v_currency    text;
begin
  -- La moneda de la tienda. Sale de acá y no del adapter para que el consumidor
  -- no tenga que deducirla: `create_order` ya exige que todo el carrito comparta
  -- una sola, así que tomar la de la tienda no es una simplificación.
  select s.currency into v_currency from stores s where s.id = p_store_id;
  -- 1. Promociones de catálogo, por línea y **por unidad**.
  --
  -- Por unidad y no sobre el subtotal de la línea: con un producto de ₲10 al
  -- 15 %, por unidad son ₲8 y tres unidades ₲24; sobre el subtotal serían ₲25. La
  -- PLP diría 8 cada uno y el pedido cobraría 25 por tres.
  for v_linea in
    select v.id as variant_id, v.price, v.currency, p.id as product_id, p.category_id,
           (l->>'quantity')::integer as quantity
    from jsonb_array_elements(p_lines) l
    join product_variants v on v.id = (l->>'variantId')::uuid
    join products p on p.id = v.product_id
    where p.store_id = p_store_id and p.status = 'active'
  loop
    select coalesce(jsonb_agg(to_jsonb(x) order by x.priority desc, x.id), '[]'::jsonb)
    into v_promos
    from (
      select pr.id, pr.title, pr.stackable, pr.priority,
             pr.discount_type as "discountType", pr.discount_value as "discountValue"
      from promotions pr
      where pr.store_id = p_store_id
        and pr.status = 'active'
        -- De catálogo: sin condiciones de carrito. Con ellas no se puede evaluar
        -- por línea, y son las que aplican más abajo sobre el subtotal.
        and pr.code is null
        and pr.min_subtotal is null
        and pr.min_quantity is null
        and (pr.starts_at is null or v_ahora >= pr.starts_at)
        and (pr.ends_at is null or v_ahora < pr.ends_at)
        and (pr.usage_limit is null or pr.usage_count < pr.usage_limit)
        and (
          pr.target->>'kind' = 'all'
          or (pr.target->>'kind' = 'product'  and pr.target->'ids' ? v_linea.product_id::text)
          or (pr.target->>'kind' = 'category' and v_linea.category_id is not null
              and pr.target->'ids' ? v_linea.category_id::text)
          or (pr.target->>'kind' = 'collection' and exists (
                select 1 from collection_products cp
                where cp.product_id = v_linea.product_id
                  and pr.target->'ids' ? cp.collection_id::text))
        )
    ) x;

    v_cadena := app.apply_chain(v_linea.price, v_promos);

    v_subtotal := v_subtotal + v_linea.price * v_linea.quantity;
    v_tras_cat := v_tras_cat + (v_cadena->>'amount')::bigint * v_linea.quantity;
    v_unidades := v_unidades + v_linea.quantity;

    -- El precio efectivo por línea, para que el carrito muestre exactamente lo
    -- que se va a cobrar. `listUnitPrice` viaja al lado para poder tacharlo.
    v_lineas := v_lineas || jsonb_build_object(
      'variantId',     v_linea.variant_id,
      'listUnitPrice', v_linea.price,
      'unitPrice',     (v_cadena->>'amount')::bigint,
      'subtotal',      (v_cadena->>'amount')::bigint * v_linea.quantity
    );

    -- Lo aplicado se acumula por línea, no por unidad: es lo que va al snapshot
    -- del pedido, y por unidad diría que descontó un tercio de lo que descontó.
    for v_a in select * from jsonb_array_elements(v_cadena->'applied')
    loop
      v_applied := v_applied || jsonb_set(
        v_a, '{amount}', to_jsonb((v_a->>'amount')::bigint * v_linea.quantity)
      );
    end loop;
  end loop;

  -- 2. Promociones de carrito automáticas, sobre lo que quedó.
  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority desc, x.id), '[]'::jsonb)
  into v_de_carrito
  from (
    select pr.id, pr.title, pr.stackable, pr.priority,
           pr.discount_type as "discountType", pr.discount_value as "discountValue"
    from promotions pr
    where pr.store_id = p_store_id
      and pr.status = 'active'
      and pr.code is null
      and (pr.min_subtotal is not null or pr.min_quantity is not null)
      and (pr.starts_at is null or v_ahora >= pr.starts_at)
      and (pr.ends_at is null or v_ahora < pr.ends_at)
      and (pr.usage_limit is null or pr.usage_count < pr.usage_limit)
      and (pr.min_subtotal is null or v_tras_cat >= pr.min_subtotal)
      and (pr.min_quantity is null or v_unidades >= pr.min_quantity)
  ) x;

  v_cadena := app.apply_chain(v_tras_cat, v_de_carrito);
  v_total := (v_cadena->>'amount')::bigint;
  v_applied := v_applied || (v_cadena->'applied');

  -- 3. Cupón.
  --
  -- Igualdad exacta insensible a mayúsculas. Sin prefijos ni coincidencia
  -- parcial: sería una forma de descubrir códigos probando.
  if coalesce(trim(p_code), '') <> '' then
    select * into v_cupon
    from promotions
    where store_id = p_store_id and lower(code) = lower(trim(p_code));

    if v_cupon.id is null or v_cupon.status <> 'active' then
      v_issue := 'not_found';
    elsif v_cupon.starts_at is not null and v_ahora < v_cupon.starts_at then
      v_issue := 'not_started';
    elsif v_cupon.ends_at is not null and v_ahora >= v_cupon.ends_at then
      v_issue := 'expired';
    elsif v_cupon.usage_limit is not null and v_cupon.usage_count >= v_cupon.usage_limit then
      v_issue := 'exhausted';
    elsif (v_cupon.min_subtotal is not null and v_total < v_cupon.min_subtotal)
       or (v_cupon.min_quantity is not null and v_unidades < v_cupon.min_quantity) then
      v_issue := 'minimum';
    else
      v_desc := app.promo_discount(v_total, v_cupon.discount_type, v_cupon.discount_value);
      v_total := v_total - v_desc;
      v_applied := v_applied || jsonb_build_object(
        'promotionId',   v_cupon.id,
        'title',         v_cupon.title,
        'code',          v_cupon.code,
        'discountType',  v_cupon.discount_type,
        'discountValue', v_cupon.discount_value,
        'amount',        v_desc
      );
    end if;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'currency',    v_currency,
    'lines',       v_lineas,
    'subtotal',    v_subtotal,
    'discount',    v_subtotal - v_total,
    'total',       v_total,
    'applied',     v_applied,
    'couponIssue', v_issue
  ));
end;
$$;

comment on function public.cart_promotions is
  'Resuelve las promociones de un carrito contra la base: líneas con su precio efectivo, subtotal, descuento y total. Refleja aplicarAlCarrito del core, que es su especificación.';
