-- Fase 9 — el descuento se calcula en el servidor.
--
-- La regla que ya estaba escrita en el encabezado de `create_order` —«el payload
-- dice qué y cuánto, jamás a qué precio»— se extiende al descuento: el checkout
-- puede mandar el **código** del cupón, nunca el monto. Si el monto viniera del
-- browser, cualquiera se regala la tienda entera editando un fetch.
--
-- `cart_promotions` es la implementación autoritativa y refleja a
-- `aplicarAlCarrito` del core, que es la especificación (ADR-055). Un test de
-- PGlite corre los mismos casos contra las dos y falla si divergen: dos
-- implementaciones del mismo cálculo de dinero que nadie compara son dos precios
-- distintos esperando su momento.

-- ---------------------------------------------------------------------------
-- Las dos piezas del cálculo
-- ---------------------------------------------------------------------------

-- El descuento de una promoción sobre un importe, sin encadenar.
--
-- El porcentaje va sobre `numeric` y **no sobre float**, y el motivo no es la
-- precisión sino el modo de redondeo: `round(double precision)` de Postgres
-- redondea al par —15 % de ₲30 son 4,5 y da **4**— mientras que
-- `round(numeric)` se aleja del cero y da **5**, que es lo mismo que hace
-- `Math.round` en el core. Comprobado con las dos formas sobre los mismos
-- valores; el float sólo coincide cuando el resultado no cae justo en la mitad.
-- Con `numeric` la paridad con el core es por construcción.
create or replace function app.promo_discount(
  p_base  bigint,
  p_type  text,
  p_value bigint
) returns bigint
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_type = 'percentage' then round((p_base::numeric * p_value) / 10000)::bigint
    -- Un monto fijo mayor que la base no puede dejar un negativo: un negativo que
    -- llega al total es plata que el comercio termina debiendo.
    else least(p_value, p_base)
  end;
$$;

-- Encadena promociones ya filtradas y ordenadas sobre un importe.
--
-- La regla de stackability, igual que `aplicarCadena` del core: se recorren por
-- prioridad; una que no combina se aplica sólo si todavía no se aplicó ninguna,
-- y corta la cadena.
create or replace function app.apply_chain(
  p_base   bigint,
  p_promos jsonb
) returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actual  bigint := p_base;
  v_applied jsonb  := '[]'::jsonb;
  v_promo   jsonb;
  v_desc    bigint;
begin
  for v_promo in select * from jsonb_array_elements(p_promos)
  loop
    if not (v_promo->>'stackable')::boolean and jsonb_array_length(v_applied) > 0 then
      continue;
    end if;

    v_desc := app.promo_discount(v_actual, v_promo->>'discountType', (v_promo->>'discountValue')::bigint);
    if v_desc <= 0 then
      continue;
    end if;

    v_actual := v_actual - v_desc;
    v_applied := v_applied || jsonb_build_object(
      'promotionId',   v_promo->>'id',
      'title',         v_promo->>'title',
      'discountType',  v_promo->>'discountType',
      'discountValue', (v_promo->>'discountValue')::bigint,
      'amount',        v_desc
    );

    exit when not (v_promo->>'stackable')::boolean;
  end loop;

  return jsonb_build_object('amount', v_actual, 'applied', v_applied);
end;
$$;

-- ---------------------------------------------------------------------------
-- El carrito completo
-- ---------------------------------------------------------------------------
--
-- `p_lines` es `[{variantId, quantity}]`. El resto —precio de lista, categoría y
-- colecciones del producto— sale de la base: es lo mismo que hace el resto de
-- `create_order` y por el mismo motivo.
--
-- Devuelve `{subtotal, discount, total, applied, couponIssue?}`.

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
  v_linea       record;
  v_promos      jsonb;
  v_cadena      jsonb;
  v_a           jsonb;
  v_de_carrito  jsonb;
  v_cupon       record;
  v_issue       text;
  v_total       bigint;
  v_desc        bigint;
begin
  -- 1. Promociones de catálogo, por línea y **por unidad**.
  --
  -- Por unidad y no sobre el subtotal de la línea: con un producto de ₲10 al
  -- 15 %, por unidad son ₲8 y tres unidades ₲24; sobre el subtotal serían ₲25. La
  -- PLP diría 8 cada uno y el pedido cobraría 25 por tres.
  for v_linea in
    select v.id as variant_id, v.price, p.id as product_id, p.category_id,
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
    'subtotal',    v_subtotal,
    'discount',    v_subtotal - v_total,
    'total',       v_total,
    'applied',     v_applied,
    'couponIssue', v_issue
  ));
end;
$$;

comment on function public.cart_promotions is
  'Resuelve las promociones de un carrito contra la base. Refleja aplicarAlCarrito del core, que es su especificación.';

revoke all on function public.cart_promotions(uuid, jsonb, text) from public, anon;
grant execute on function public.cart_promotions(uuid, jsonb, text) to authenticated, service_role;

-- Los grants van función por función y no con un `on all functions`.
--
-- La Fase 3 hizo `grant execute on all functions in schema app to authenticated`,
-- que es una **foto del momento**: no alcanza a las funciones creadas después, y
-- `service_role` nunca tuvo siquiera `usage` sobre el schema. El síntoma es un
-- `permission denied for schema app` desde adentro de `create_order`, o sea en
-- la creación de un pedido y no al aplicar la migración.
grant usage on schema app to service_role;
grant execute on function app.promo_discount(bigint, text, bigint) to authenticated, service_role;
grant execute on function app.apply_chain(bigint, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Consumir un cupón sin que dos pedidos simultáneos pasen los dos
-- ---------------------------------------------------------------------------
--
-- La condición va **dentro** del update. Un `select` del contador seguido de un
-- `update` deja pasar dos pedidos simultáneos con el último cupón, y el segundo
-- descuenta sin derecho: es el mismo error de carrera que ADR-065 evita en la
-- creación del pedido con el `unique` de la clave de idempotencia.
--
-- Devuelve `true` si consumió. El llamador decide qué hacer con `false`.
create or replace function app.consume_promotion(p_id uuid) returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  update promotions
  set usage_count = usage_count + 1, updated_at = now()
  where id = p_id
    and (usage_limit is null or usage_count < usage_limit);

  get diagnostics v_filas = row_count;
  return v_filas = 1;
end;
$$;

-- `security definer` porque el contador es del sistema, no del comercio: quien
-- crea el pedido es un comprador anónimo desde el storefront, que no es miembro
-- de ninguna organización y no tiene por qué poder escribir en `promotions`.
-- Sin esto, el tope de uso sólo se consumiría cuando el pedido lo crea alguien
-- con `promotion.write`, que es exactamente nadie en un checkout.
alter function app.consume_promotion(uuid) security definer;

grant execute on function app.consume_promotion(uuid) to authenticated, service_role;
