/*
 * Promociones de ocho tipos (ADR-164).
 *
 * A la de siempre —porcentaje o monto, con mínimos y cupón— se suman siete que
 * dependen de lo que hay en el carrito: llevá X pagá Y, segunda unidad, por
 * cantidad, por monto, regalo, bundle y envío gratis. La especificación sigue
 * siendo `packages/commerce-core/src/promotions.ts`; esto la refleja, y
 * `supabase/tests/promociones.test.ts` corre los mismos escenarios contra las dos.
 *
 * Qué cambia:
 * - `promotions` gana `kind` y `rules`. `discount_type` y `discount_value` quedan
 *   sólo para el descuento de siempre.
 * - `cart_promotions` gana la zona —el envío gratis depende de ella— y devuelve
 *   los regalos y si el envío es gratis. Cambia la firma, así que se borra y se
 *   crea con los mismos permisos.
 * - `create_order` bloquea también el stock de lo que se regala, agrega el
 *   regalo como una línea a precio cero y deja el envío en cero si corresponde.
 * - `order_json` dice qué línea es un regalo.
 * - `catalog_search` sólo pinta el descuento de siempre.
 *
 * Las tres funciones que se reescriben enteras parten de su **última**
 * definición (CLAUDE.md, ADR-163): `create_order` de `20260911020028`,
 * `order_json` de `20260928011955` y `catalog_search` de `20261009181957`.
 */

-- ---------------------------------------------------------------------------
-- La tabla
-- ---------------------------------------------------------------------------

alter table promotions
  add column kind text not null default 'discount'
    check (kind in ('discount', 'buy_x_pay_y', 'second_unit', 'quantity', 'tiered',
                    'gift', 'bundle', 'free_shipping')),
  -- Los parámetros de cada tipo. Su forma la fija `PromotionRules` en el core; un
  -- parámetro que falta hace que la promoción no aplique, nunca que regale.
  add column rules jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rules) = 'object');

alter table promotions
  alter column discount_type drop not null,
  alter column discount_value drop not null,
  add constraint promotions_descuento_completo
    check (kind <> 'discount' or (discount_type is not null and discount_value is not null)),
  -- Sólo un descuento o un envío gratis pueden ser cupón: un 3x2 «con código»
  -- no tiene una forma razonable de explicarse en el checkout.
  add constraint promotions_cupon_valido
    check (code is null or kind in ('discount', 'free_shipping'));

comment on column promotions.kind is
  'Tipo de promoción (ADR-164). Su semántica vive en commerce-core/promotions.ts.';

-- El regalo es una línea más del pedido, a precio cero. La marca es lo que deja
-- que el Admin y el correo digan «regalo» en vez de «Gs. 0».
alter table order_items add column is_gift boolean not null default false;

-- ---------------------------------------------------------------------------
-- Las piezas
-- ---------------------------------------------------------------------------

-- `alcanza` del core: si el target de la promoción incluye al producto.
create or replace function app.promo_alcanza(p_target jsonb, p_product uuid, p_category uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case p_target->>'kind'
    when 'all' then true
    when 'product' then coalesce(p_target->'ids' ? p_product::text, false)
    when 'category' then p_category is not null
                         and coalesce(p_target->'ids' ? p_category::text, false)
    when 'collection' then exists (
      select 1 from collection_products cp
      where cp.product_id = p_product and p_target->'ids' ? cp.collection_id::text)
    else false
  end
$$;

-- Un entero positivo de `rules`, o nulo. Nulo es «no aplica».
create or replace function app.regla_entera(p jsonb)
returns bigint
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when jsonb_typeof(p) = 'number'
         and (p::text)::numeric = trunc((p::text)::numeric)
         and (p::text)::numeric > 0
    then ((p::text)::numeric)::bigint
  end
$$;

-- Puntos básicos entre 0 y 10.000, o nulo.
create or replace function app.regla_porcentaje(p jsonb)
returns bigint
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when jsonb_typeof(p) = 'number'
         and (p::text)::numeric = trunc((p::text)::numeric)
         and (p::text)::numeric between 0 and 10000
    then ((p::text)::numeric)::bigint
  end
$$;

-- `llegaALaZona` del core: sin lista de zonas, llega a todas.
create or replace function app.promo_llega(p_rules jsonb, p_zona text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when coalesce(jsonb_typeof(p_rules->'zones'), '') <> 'array'
         or jsonb_array_length(p_rules->'zones') = 0 then true
    else p_zona is not null and exists (
      select 1 from jsonb_array_elements_text(p_rules->'zones') z
      where lower(trim(z)) = lower(trim(p_zona)))
  end
$$;

/*
 * `regalo` del core: la línea de regalo, si hay stock para darla. Se descuenta
 * lo que el carrito ya compra de esa variante y lo que ya se regaló. La variante
 * tiene que ser de la tienda; puede no estar publicada —un regalo suele ser algo
 * que no se vende—.
 */
create or replace function app.promo_regalo(
  p_promo     promotions,
  p_lineas    jsonb,
  p_regalados jsonb
) returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_variante    uuid;
  v_cantidad    bigint := app.regla_entera(p_promo.rules->'giftQuantity');
  v_disponible  bigint;
  v_comprometido bigint;
begin
  if v_cantidad is null
     or coalesce(p_promo.rules->>'giftVariantId', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_variante := (p_promo.rules->>'giftVariantId')::uuid;

  select coalesce(sum(il.available), 0) into v_disponible
  from inventory_levels il
  join product_variants v on v.id = il.variant_id
  join products p on p.id = v.product_id
  where il.variant_id = v_variante and p.store_id = p_promo.store_id;

  select coalesce((select sum((l->>'quantity')::bigint) from jsonb_array_elements(p_lineas) l
                   where (l->>'variantId')::uuid = v_variante), 0)
       + coalesce((select sum((g->>'quantity')::bigint) from jsonb_array_elements(p_regalados) g
                   where (g->>'variantId')::uuid = v_variante), 0)
  into v_comprometido;

  if v_disponible - v_comprometido < v_cantidad then
    return null;
  end if;

  return jsonb_build_object(
    'promotionId', p_promo.id, 'variantId', v_variante, 'quantity', v_cantidad);
end;
$$;

/*
 * `beneficio` del core: lo que da una promoción de carrito, o nulo si no aplica.
 * Devuelve `{amount, gift?, freeShipping?}`.
 *
 * `p_lineas` son las líneas **después del catálogo**:
 * `[{variantId, productId, categoryId, unitPrice, quantity}]`. Los tipos nuevos
 * calculan sobre esos precios y se topan en `p_actual`, lo que queda del total.
 */
create or replace function app.promo_beneficio(
  p_promo     promotions,
  p_lineas    jsonb,
  p_actual    bigint,
  p_zona      text,
  p_regalados jsonb
) returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  r        jsonb := coalesce(p_promo.rules, '{}'::jsonb);
  v_monto  bigint := 0;
  v_buy    bigint;
  v_pay    bigint;
  v_pct    bigint;
  v_n      bigint;
  v_base   bigint;
  v_desde  numeric;
  v_tier   record;
  v_regalo jsonb;
  v_alc    jsonb;
begin
  -- Las líneas que la promoción alcanza, una vez.
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', l."productId", 'unit_price', l."unitPrice", 'quantity', l.quantity)),
         '[]'::jsonb)
  into v_alc
  from jsonb_to_recordset(p_lineas)
       as l("variantId" uuid, "productId" uuid, "categoryId" uuid, "unitPrice" bigint, quantity integer)
  where app.promo_alcanza(p_promo.target, l."productId", l."categoryId");

  case p_promo.kind
  when 'discount' then
    if p_promo.discount_type is null or p_promo.discount_value is null then
      return null;
    end if;
    v_monto := app.promo_discount(p_actual, p_promo.discount_type, p_promo.discount_value);

  -- Por producto: cada `buy` unidades, las `buy - pay` más baratas son gratis.
  when 'buy_x_pay_y' then
    v_buy := app.regla_entera(r->'buy');
    v_pay := app.regla_entera(r->'pay');
    if v_buy is null or v_pay is null or v_pay >= v_buy then
      return null;
    end if;
    select coalesce(sum(u.precio), 0) into v_monto
    from (
      select a.unit_price as precio,
             row_number() over (partition by a.product_id order by a.unit_price) as rn,
             count(*) over (partition by a.product_id) as n
      from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer) cross join generate_series(1, a.quantity)
    ) u
    where u.rn <= (u.n / v_buy) * (v_buy - v_pay);

  -- Por producto: de cada par, la más barata lleva el descuento.
  when 'second_unit' then
    v_pct := app.regla_porcentaje(r->'percent');
    if v_pct is null then
      return null;
    end if;
    select coalesce(sum(app.promo_discount(u.precio, 'percentage', v_pct)), 0) into v_monto
    from (
      select a.unit_price as precio,
             row_number() over (partition by a.product_id order by a.unit_price) as rn,
             count(*) over (partition by a.product_id) as n
      from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer) cross join generate_series(1, a.quantity)
    ) u
    where u.rn <= u.n / 2;

  -- El escalón más alto alcanzado; con `mix`, la unidad más cara se cobra entera.
  when 'quantity' then
    if not exists (
      select 1 from jsonb_array_elements(coalesce(r->'tiers', '[]'::jsonb)) t
      where app.regla_entera(t->'minQuantity') is not null
        and app.regla_porcentaje(t->'percent') is not null
    ) then
      return null;
    end if;

    if r->'mix' = 'true'::jsonb then
      select count(*) into v_n
      from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer) cross join generate_series(1, a.quantity);
      select coalesce((
        select app.regla_porcentaje(t->'percent')
        from jsonb_array_elements(r->'tiers') t
        where app.regla_entera(t->'minQuantity') is not null
          and app.regla_porcentaje(t->'percent') is not null
          and app.regla_entera(t->'minQuantity') <= v_n
        order by app.regla_entera(t->'minQuantity') desc
        limit 1), 0) into v_pct;
      select coalesce(sum(app.promo_discount(u.precio, 'percentage', v_pct)), 0) into v_monto
      from (
        select a.unit_price as precio,
               row_number() over (order by a.unit_price desc) as rn
        from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer) cross join generate_series(1, a.quantity)
      ) u
      where u.rn > 1;
    else
      select coalesce(sum(app.promo_discount(u.precio, 'percentage', coalesce((
               select app.regla_porcentaje(t->'percent')
               from jsonb_array_elements(r->'tiers') t
               where app.regla_entera(t->'minQuantity') is not null
                 and app.regla_porcentaje(t->'percent') is not null
                 and app.regla_entera(t->'minQuantity') <= u.n
               order by app.regla_entera(t->'minQuantity') desc
               limit 1), 0))), 0)
      into v_monto
      from (
        select a.unit_price as precio,
               count(*) over (partition by a.product_id) as n
        from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer) cross join generate_series(1, a.quantity)
      ) u;
    end if;

  -- El escalón donde cae lo alcanzado: más que el tope del anterior, hasta el suyo.
  when 'tiered' then
    if jsonb_typeof(r->'tiers') <> 'array' or jsonb_array_length(r->'tiers') = 0
       or exists (select 1 from jsonb_array_elements(r->'tiers') t
                  where app.regla_porcentaje(t->'percent') is null) then
      return null;
    end if;
    select coalesce(sum(a.unit_price * a.quantity), 0) into v_base from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer);
    v_pct := 0;
    v_desde := 0;
    for v_tier in
      select t.valor, t.orden from jsonb_array_elements(r->'tiers') with ordinality as t(valor, orden)
      order by t.orden
    loop
      if v_base > v_desde then
        v_pct := app.regla_porcentaje(v_tier.valor->'percent');
      end if;
      -- El piso del siguiente es el tope de éste; sin tope, no hay siguiente.
      v_desde := case when jsonb_typeof(v_tier.valor->'upTo') = 'number'
                      then (v_tier.valor->>'upTo')::numeric
                      else 'Infinity'::numeric end;
    end loop;
    v_monto := app.promo_discount(v_base, 'percentage', v_pct);

  when 'gift' then
    v_buy := app.regla_entera(r->'buy');
    if v_buy is null or (select coalesce(sum(a.quantity), 0) from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer)) < v_buy then
      return null;
    end if;
    v_regalo := app.promo_regalo(p_promo, p_lineas, p_regalados);
    if v_regalo is null then
      return null;
    end if;
    return jsonb_build_object('amount', 0, 'gift', v_regalo);

  -- Productos **distintos** de la colección.
  when 'bundle' then
    v_n := app.regla_entera(r->'count');
    if v_n is null or v_n < 2
       or (select count(distinct a.product_id) from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer)) < v_n then
      return null;
    end if;
    case r->>'benefit'
    when 'percent' then
      v_pct := app.regla_porcentaje(r->'value');
      if v_pct is null then
        return null;
      end if;
      select coalesce(sum(app.promo_discount(a.unit_price, 'percentage', v_pct) * a.quantity), 0)
      into v_monto from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer);
    when 'fixed' then
      v_pct := app.regla_entera(r->'value');
      if v_pct is null then
        return null;
      end if;
      select coalesce(sum(least(v_pct, a.unit_price) * a.quantity), 0)
      into v_monto from jsonb_to_recordset(v_alc) as a(product_id uuid, unit_price bigint, quantity integer);
    when 'free_shipping' then
      return jsonb_build_object('amount', 0, 'freeShipping', true);
    when 'gift' then
      v_regalo := app.promo_regalo(p_promo, p_lineas, p_regalados);
      if v_regalo is null then
        return null;
      end if;
      return jsonb_build_object('amount', 0, 'gift', v_regalo);
    else
      return null;
    end case;

  when 'free_shipping' then
    if app.promo_llega(r, p_zona) then
      return jsonb_build_object('amount', 0, 'freeShipping', true);
    end if;
    return null;

  else
    return null;
  end case;

  v_monto := least(v_monto, p_actual);
  if v_monto <= 0 then
    return null;
  end if;
  return jsonb_build_object('amount', v_monto);
end;
$$;

-- ---------------------------------------------------------------------------
-- El carrito
-- ---------------------------------------------------------------------------

drop function public.cart_promotions(uuid, jsonb, text);

create function public.cart_promotions(
  p_store_id uuid,
  p_lines    jsonb,
  p_code     text default null,
  p_zone     text default null
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
  v_hechos      jsonb := '[]'::jsonb;
  v_regalos     jsonb := '[]'::jsonb;
  v_gratis      boolean := false;
  v_aplico      boolean := false;
  v_linea       record;
  v_promos      jsonb;
  v_cadena      jsonb;
  v_a           jsonb;
  v_p           promotions;
  v_b           jsonb;
  v_monto       bigint;
  v_cupon       promotions;
  v_issue       text;
  v_actual      bigint;
  v_desc        bigint;
  v_currency    text;
begin
  select s.currency into v_currency from stores s where s.id = p_store_id;

  -- 1. Promociones de catálogo, por línea y **por unidad**: sólo el descuento de
  -- siempre, sin condiciones de carrito. Igual que antes de ADR-164.
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
        and pr.kind = 'discount'
        and pr.code is null
        and pr.min_subtotal is null
        and pr.min_quantity is null
        and (pr.starts_at is null or v_ahora >= pr.starts_at)
        and (pr.ends_at is null or v_ahora < pr.ends_at)
        and (pr.usage_limit is null or pr.usage_count < pr.usage_limit)
        and app.promo_alcanza(pr.target, v_linea.product_id, v_linea.category_id)
    ) x;

    v_cadena := app.apply_chain(v_linea.price, v_promos);

    v_subtotal := v_subtotal + v_linea.price * v_linea.quantity;
    v_tras_cat := v_tras_cat + (v_cadena->>'amount')::bigint * v_linea.quantity;
    v_unidades := v_unidades + v_linea.quantity;

    v_lineas := v_lineas || jsonb_build_object(
      'variantId',     v_linea.variant_id,
      'listUnitPrice', v_linea.price,
      'unitPrice',     (v_cadena->>'amount')::bigint,
      'subtotal',      (v_cadena->>'amount')::bigint * v_linea.quantity
    );
    -- Lo que necesitan los tipos de carrito: el precio después del catálogo.
    v_hechos := v_hechos || jsonb_build_object(
      'variantId',  v_linea.variant_id,
      'productId',  v_linea.product_id,
      'categoryId', v_linea.category_id,
      'unitPrice',  (v_cadena->>'amount')::bigint,
      'quantity',   v_linea.quantity
    );

    for v_a in select * from jsonb_array_elements(v_cadena->'applied')
    loop
      v_applied := v_applied || (jsonb_set(
        v_a, '{amount}', to_jsonb((v_a->>'amount')::bigint * v_linea.quantity)
      ) || '{"kind": "discount"}'::jsonb);
    end loop;
  end loop;

  /*
   * 2. Promociones de carrito automáticas, por prioridad, con la regla de
   * stackability del catálogo. El descuento de siempre se encadena sobre lo que
   * queda; los tipos nuevos calculan sobre los precios después del catálogo y
   * se topan en lo que queda (`beneficio` del core).
   */
  v_actual := v_tras_cat;
  for v_p in
    select pr.* from promotions pr
    where pr.store_id = p_store_id
      and pr.status = 'active'
      and pr.code is null
      and not (pr.kind = 'discount' and pr.min_subtotal is null and pr.min_quantity is null)
      and (pr.starts_at is null or v_ahora >= pr.starts_at)
      and (pr.ends_at is null or v_ahora < pr.ends_at)
      and (pr.usage_limit is null or pr.usage_count < pr.usage_limit)
      and (pr.min_subtotal is null or v_tras_cat >= pr.min_subtotal)
      and (pr.min_quantity is null or v_unidades >= pr.min_quantity)
    order by pr.priority desc, pr.id
  loop
    if not v_p.stackable and v_aplico then
      continue;
    end if;

    v_b := app.promo_beneficio(v_p, v_hechos, v_actual, p_zone, v_regalos);
    if v_b is null then
      continue;
    end if;

    v_monto := (v_b->>'amount')::bigint;
    v_actual := greatest(0, v_actual - v_monto);
    v_applied := v_applied || jsonb_strip_nulls(jsonb_build_object(
      'promotionId',   v_p.id,
      'title',         v_p.title,
      'kind',          v_p.kind,
      'discountType',  v_p.discount_type,
      'discountValue', v_p.discount_value,
      'amount',        v_monto
    ));
    if v_b ? 'gift' then
      v_regalos := v_regalos || jsonb_build_array(v_b->'gift');
    end if;
    if coalesce((v_b->>'freeShipping')::boolean, false) then
      v_gratis := true;
    end if;
    v_aplico := true;

    exit when not v_p.stackable;
  end loop;

  -- 3. Cupón: un descuento o un envío gratis.
  if coalesce(trim(p_code), '') <> '' then
    select * into v_cupon
    from promotions
    where store_id = p_store_id and lower(code) = lower(trim(p_code));

    if v_cupon.id is null or v_cupon.status <> 'active'
       or v_cupon.kind not in ('discount', 'free_shipping') then
      v_issue := 'not_found';
    elsif v_cupon.starts_at is not null and v_ahora < v_cupon.starts_at then
      v_issue := 'not_started';
    elsif v_cupon.ends_at is not null and v_ahora >= v_cupon.ends_at then
      v_issue := 'expired';
    elsif v_cupon.usage_limit is not null and v_cupon.usage_count >= v_cupon.usage_limit then
      v_issue := 'exhausted';
    elsif (v_cupon.min_subtotal is not null and v_actual < v_cupon.min_subtotal)
       or (v_cupon.min_quantity is not null and v_unidades < v_cupon.min_quantity) then
      v_issue := 'minimum';
    elsif v_cupon.kind = 'free_shipping' then
      if app.promo_llega(v_cupon.rules, p_zone) then
        v_gratis := true;
        v_applied := v_applied || jsonb_build_object(
          'promotionId', v_cupon.id,
          'title',       v_cupon.title,
          'kind',        v_cupon.kind,
          'code',        v_cupon.code,
          'amount',      0
        );
      else
        v_issue := 'zone';
      end if;
    else
      v_desc := app.promo_discount(v_actual, v_cupon.discount_type, v_cupon.discount_value);
      v_actual := v_actual - v_desc;
      v_applied := v_applied || jsonb_build_object(
        'promotionId',   v_cupon.id,
        'title',         v_cupon.title,
        'kind',          v_cupon.kind,
        'code',          v_cupon.code,
        'discountType',  v_cupon.discount_type,
        'discountValue', v_cupon.discount_value,
        'amount',        v_desc
      );
    end if;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'currency',     v_currency,
    'lines',        v_lineas,
    'subtotal',     v_subtotal,
    'discount',     v_subtotal - v_actual,
    'total',        v_actual,
    'applied',      v_applied,
    'gifts',        v_regalos,
    'freeShipping', v_gratis,
    'couponIssue',  v_issue
  ));
end;
$$;

comment on function public.cart_promotions(uuid, jsonb, text, text) is
  'Resuelve las promociones de un carrito contra la base: líneas con su precio efectivo, subtotal, descuento, total, regalos y envío gratis. Refleja aplicarAlCarrito del core, que es su especificación (ADR-164).';

-- Los mismos permisos que la firma anterior.
revoke all on function public.cart_promotions(uuid, jsonb, text, text) from public, anon;
grant execute on function public.cart_promotions(uuid, jsonb, text, text)
  to authenticated, service_role;

-- Las piezas las llama `cart_promotions`, que es `invoker`: quien puede llamarla
-- tiene que poder llamar a ellas. Son cálculos sin escritura.
revoke all on function app.promo_alcanza(jsonb, uuid, uuid) from public, anon;
revoke all on function app.regla_entera(jsonb) from public, anon;
revoke all on function app.regla_porcentaje(jsonb) from public, anon;
revoke all on function app.promo_llega(jsonb, text) from public, anon;
revoke all on function app.promo_regalo(promotions, jsonb, jsonb) from public, anon;
revoke all on function app.promo_beneficio(promotions, jsonb, bigint, text, jsonb) from public, anon;
grant execute on function app.promo_alcanza(jsonb, uuid, uuid) to authenticated, service_role;
grant execute on function app.regla_entera(jsonb) to authenticated, service_role;
grant execute on function app.regla_porcentaje(jsonb) to authenticated, service_role;
grant execute on function app.promo_llega(jsonb, text) to authenticated, service_role;
grant execute on function app.promo_regalo(promotions, jsonb, jsonb) to authenticated, service_role;
grant execute on function app.promo_beneficio(promotions, jsonb, bigint, text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- El pedido
-- ---------------------------------------------------------------------------

create or replace function public.create_order(
  p_store_id        uuid,
  p_idempotency_key uuid,
  p_input           jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tenant     uuid;
  v_existente  uuid;
  v_linea      jsonb;
  v_problemas  jsonb := '[]'::jsonb;
  v_variante   record;
  v_nivel      record;
  v_order_id   uuid;
  v_numero     integer;
  v_customer   uuid;
  v_total      bigint := 0;
  v_currency   text;
  v_pos        integer := 0;
  v_falta      integer;
  v_toma       integer;
  v_asignacion jsonb;
  v_email      text;
  v_lineas     jsonb;
  v_promos     jsonb;
  v_descuento  bigint := 0;
  v_aplicada   jsonb;
  v_ajustes    jsonb;
  v_envio      bigint := 0;
  v_libre      bigint;
  v_zona       bigint;
  v_demo       boolean := false;
  v_regalo     jsonb;
begin
  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    raise exception 'La tienda % no existe', p_store_id;
  end if;

  -- 1. Idempotencia.
  --
  -- Antes que nada: reintentar no puede cobrar dos veces. La misma clave
  -- devuelve el pedido que ya se creó, con su mismo número.
  select id into v_existente
  from orders
  where store_id = p_store_id and idempotency_key = p_idempotency_key;

  if v_existente is not null then
    return jsonb_build_object('order', order_json(v_existente));
  end if;

  if p_input->'lines' is null or jsonb_array_length(p_input->'lines') = 0 then
    raise exception 'El pedido no tiene líneas';
  end if;

  -- Consolida por variante antes de mirar nada más.
  --
  -- Sin esto, dos líneas de la misma variante se validaban por separado —cada
  -- una contra el stock completo— y después se descontaban las dos: con 5
  -- unidades disponibles, dos líneas de 3 pasaban y el inventario terminaba en
  -- -1. Un carrito bien formado no las manda, pero el payload viene del browser
  -- y lo que llega de afuera no se supone.
  select jsonb_agg(jsonb_build_object('variantId', variant_id, 'quantity', quantity)
                   order by orden)
  into v_lineas
  from (
    select (l.valor->>'variantId')::uuid          as variant_id,
           sum((l.valor->>'quantity')::integer)   as quantity,
           min(l.orden)                           as orden
    from jsonb_array_elements(p_input->'lines') with ordinality as l(valor, orden)
    group by 1
  ) t;

  if exists (
    select 1 from jsonb_array_elements(v_lineas) l
    where (l->>'quantity')::integer < 1
  ) then
    raise exception 'Una línea del pedido tiene cantidad menor a 1';
  end if;

  -- Bloquea el inventario de todo lo pedido, en orden determinista de
  -- `variant_id`: dos checkouts simultáneos que compartan variantes las toman
  -- en el mismo orden y no se traban entre sí.
  perform il.id
  from inventory_levels il
  where il.variant_id in (
    select (l->>'variantId')::uuid from jsonb_array_elements(v_lineas) l
    union
    -- Lo que se puede regalar (ADR-164): `cart_promotions` mira su stock, y lo
    -- tiene que ver bloqueado para que dos pedidos no se lleven el último regalo.
    select (pr.rules->>'giftVariantId')::uuid
    from promotions pr
    where pr.store_id = p_store_id
      and pr.status = 'active'
      and pr.rules->>'giftVariantId'
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  order by il.variant_id, il.id
  for update;

  -- 2. Revalidación, sin escribir nada todavía.
  for v_linea in select * from jsonb_array_elements(v_lineas)
  loop
    select v.id, v.title as variant_title, v.sku, v.price, v.currency,
           p.title as product_title,
           coalesce((
             select sum(il.available)
             from inventory_levels il
             where il.variant_id = v.id
           ), 0)::integer as available
    into v_variante
    from product_variants v
    join products p on p.id = v.product_id
    -- La variante tiene que ser de **esta** tienda y de un producto publicado.
    -- `product_variants` no tiene `store_id` —sólo `tenant_id` y `product_id`—,
    -- así que el join por `products` no es un rodeo: es la única forma de
    -- acotar por tienda. Y `status = 'active'` se reimpone acá porque este
    -- camino no pasa por `catalog_search`, que es donde vivía ese filtro.
    where v.id = (v_linea->>'variantId')::uuid
      and p.store_id = p_store_id
      and p.status = 'active';

    if v_variante.id is null then
      v_problemas := v_problemas || jsonb_build_object(
        'type', 'variant_unavailable',
        'variantId', v_linea->>'variantId'
      );
    elsif v_variante.available < (v_linea->>'quantity')::integer then
      v_problemas := v_problemas || jsonb_build_object(
        'type', 'insufficient_stock',
        'variantId', v_variante.id,
        'available', greatest(v_variante.available, 0)
      );
    elsif v_currency is null then
      v_currency := v_variante.currency;
    elsif v_currency <> v_variante.currency then
      -- No es un problema que el comprador pueda corregir: es catálogo mal
      -- configurado. Se corta fuerte en vez de sumar peras con manzanas, igual
      -- que `addMoney` en el core.
      raise exception 'El carrito mezcla monedas (% y %)', v_currency, v_variante.currency;
    end if;
  end loop;

  if jsonb_array_length(v_problemas) > 0 then
    -- Ni contador consumido, ni cliente creado, ni stock tocado.
    return jsonb_build_object('error', 'invalid_cart', 'issues', v_problemas);
  end if;

  -- 2 bis. Promociones.
  --
  -- Va después de la revalidación y antes de escribir, para que un carrito
  -- inválido no consuma el tope de uso de ninguna promoción.
  v_promos := cart_promotions(
    p_store_id, v_lineas, p_input->>'couponCode', nullif(p_input->'address'->>'zone', ''));
  v_descuento := (v_promos->>'discount')::bigint;

  /*
   * El envío y el modo demo, de una sola lectura de la configuración.
   *
   * El importe se calcula **acá** y no llega en el payload, por el mismo
   * motivo que el descuento: sería el número que decide cuánto se cobra,
   * elegido por quien paga. La cuenta es la misma que hace `calcularEnvio`
   * en el core, que es la que el checkout usa para mostrarlo.
   *
   * El umbral se compara contra el subtotal **ya descontado**, que es la
   * lectura honesta de «compras desde X»: contra el subtotal sin descontar
   * se regalaría el envío por una compra que terminó costando menos.
   *
   * `jsonb_typeof` antes de castear: un `amount` que no sea número haría
   * fallar el pedido entero por un error de configuración, y la caída del
   * lado seguro es no cobrar envío.
   */
  v_ajustes := coalesce(
    (select settings from store_settings where store_id = p_store_id), '{}'::jsonb);

  -- Comparación exacta contra `true`, como `esTiendaDemo`: un `demo: "no"`
  -- guardado por error no puede apagarle los correos a una tienda real.
  --
  -- El `coalesce` no es decorativo: sin la clave, `v_ajustes->'demo'` es NULL y
  -- `NULL = 'true'` da NULL, no falso. La columna es `not null`, así que **todo
  -- pedido de toda tienda sin configurar fallaba**. Lo encontró el test, no la
  -- lectura del código.
  v_demo := coalesce(v_ajustes->'demo' = 'true'::jsonb, false);

  if v_ajustes->'shipping'->>'mode' in ('flat', 'zones')
     and jsonb_typeof(v_ajustes->'shipping'->'amount') = 'number' then
    v_envio := greatest(0, (v_ajustes->'shipping'->>'amount')::bigint);

    /*
     * Por zona: la tarifa de la zona que eligió el comprador, buscada por
     * nombre sin distinguir mayúsculas ni espacios —la misma comparación que
     * `zonaDeEnvio` en el core—. Una zona que no está en la tabla, o ninguna,
     * cobra la tarifa general de arriba y **nunca cero**: acá el silencio es un
     * comprador que no eligió, no un comercio que no configuró, y el lado
     * seguro es no regalar el envío.
     */
    if v_ajustes->'shipping'->>'mode' = 'zones' then
      select greatest(0, (z->>'amount')::bigint) into v_zona
      from jsonb_array_elements(coalesce(v_ajustes->'shipping'->'zones', '[]'::jsonb)) z
      where jsonb_typeof(z->'amount') = 'number'
        and lower(trim(z->>'name')) = lower(trim(coalesce(p_input->'address'->>'zone', '')))
      limit 1;
      if v_zona is not null then
        v_envio := v_zona;
      end if;
    end if;

    if jsonb_typeof(v_ajustes->'shipping'->'freeFrom') = 'number' then
      v_libre := (v_ajustes->'shipping'->>'freeFrom')::bigint;
      if v_libre > 0 and ((v_promos->>'subtotal')::bigint - v_descuento) >= v_libre then
        v_envio := 0;
      end if;
    end if;
  end if;

  -- Una promoción o un cupón de envío gratis (ADR-164). Ya miraron la zona.
  if coalesce((v_promos->>'freeShipping')::boolean, false) then
    v_envio := 0;
  end if;

  -- El tope de uso se consume con la condición dentro del propio update. Si otro
  -- pedido se llevó la última unidad del cupón entre la consulta y este momento,
  -- se corta: la transacción entera se deshace y el comprador vuelve a cotizar
  -- con el estado real. Preferible a cobrarle un descuento que ya no existe.
  for v_aplicada in select * from jsonb_array_elements(v_promos->'applied')
  loop
    if not app.consume_promotion((v_aplicada->>'promotionId')::uuid) then
      raise exception 'La promoción % se agotó mientras se creaba el pedido',
        v_aplicada->>'title'
        using errcode = 'lock_not_available';
    end if;
  end loop;

  -- 3. Numeración. Desde 1001: un pedido «#1» delata que es el primero.
  insert into order_counters (store_id, tenant_id, last_number)
  values (p_store_id, v_tenant, 1001)
  on conflict (store_id)
  do update set last_number = order_counters.last_number + 1
  returning last_number into v_numero;

  -- 4. Cliente. Se identifica por email dentro de la tienda: el mismo comprador
  -- volviendo no crea un cliente nuevo, y sus datos se actualizan a los últimos
  -- que declaró. El pedido igual guarda su propia copia.
  v_email := lower(trim(p_input->'customer'->>'email'));

  insert into customers (tenant_id, store_id, email, name, phone, tax_id, tax_name)
  values (
    v_tenant, p_store_id, v_email,
    p_input->'customer'->>'name',
    p_input->'customer'->>'phone',
    nullif(p_input->'customer'->>'taxId', ''),
    nullif(p_input->'customer'->>'taxName', '')
  )
  on conflict (store_id, email) do update set
    name       = excluded.name,
    phone      = excluded.phone,
    tax_id     = coalesce(excluded.tax_id, customers.tax_id),
    tax_name   = coalesce(excluded.tax_name, customers.tax_name),
    updated_at = now()
  returning id into v_customer;

  insert into orders (
    tenant_id, store_id, number, idempotency_key, payment_method,
    customer_id, customer, address, notes, total_amount, currency,
    discount_amount, applied_promotions, shipping_amount, is_demo
  ) values (
    v_tenant, p_store_id, v_numero, p_idempotency_key,
    p_input->>'paymentMethod',
    v_customer,
    jsonb_strip_nulls(jsonb_build_object(
      'name',    p_input->'customer'->>'name',
      'email',   v_email,
      'phone',   p_input->'customer'->>'phone',
      'taxId',   nullif(p_input->'customer'->>'taxId', ''),
      'taxName', nullif(p_input->'customer'->>'taxName', '')
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'street',    p_input->'address'->>'street',
      'city',      p_input->'address'->>'city',
      'zone',      nullif(p_input->'address'->>'zone', ''),
      'reference', nullif(p_input->'address'->>'reference', '')
    )),
    nullif(p_input->>'notes', ''),
    0, v_currency,
    v_descuento, coalesce(v_promos->'applied', '[]'::jsonb), v_envio, v_demo
  )
  returning id into v_order_id;

  -- 5. Líneas y descuento de stock.
  --
  -- `order_items.unit_price` guarda el **precio de lista**, que es el «precio
  -- original» que pide PROJECT.md §13. Lo descontado vive aparte, en
  -- `discount_amount` y `applied_promotions`: así el pedido puede mostrar de
  -- dónde salió cada guaraní, como una factura.
  for v_linea in select * from jsonb_array_elements(v_lineas)
  loop
    select v.id, v.title as variant_title, v.sku, v.price, v.cost, v.currency,
           p.title as product_title
    into v_variante
    from product_variants v
    join products p on p.id = v.product_id
    where v.id = (v_linea->>'variantId')::uuid
      and p.store_id = p_store_id
      and p.status = 'active';

    v_falta := (v_linea->>'quantity')::integer;
    v_asignacion := '[]'::jsonb;

    -- De la sucursal con más stock hacia abajo: deja el inventario parejo y, con
    -- una sola sucursal —que es el caso de hoy—, es simplemente «de ahí».
    for v_nivel in
      select location_id, available
      from inventory_levels
      where variant_id = v_variante.id and available > 0
      order by available desc, location_id
    loop
      exit when v_falta <= 0;
      v_toma := least(v_falta, v_nivel.available);

      update inventory_levels
      set available = available - v_toma, updated_at = now()
      where variant_id = v_variante.id and location_id = v_nivel.location_id;

      v_asignacion := v_asignacion || jsonb_build_object(
        'locationId', v_nivel.location_id, 'quantity', v_toma
      );
      v_falta := v_falta - v_toma;
    end loop;

    insert into order_items (
      tenant_id, order_id, variant_id, title, variant_title, sku,
      unit_price, unit_cost, currency, quantity, position, stock_allocation
    ) values (
      v_tenant, v_order_id, v_variante.id,
      v_variante.product_title,
      nullif(v_variante.variant_title, ''),
      v_variante.sku,
      -- El costo se copia como el precio y por el mismo motivo: el catálogo
      -- cambia, y el pedido tiene que poder decir cuánto se ganó **ese día**.
      -- `null` cuando el comercio no lo tiene cargado; el panel lo declara como
      -- cobertura faltante en vez de suponer cero.
      v_variante.price, v_variante.cost, v_variante.currency,
      (v_linea->>'quantity')::integer, v_pos, v_asignacion
    );

    v_total := v_total + v_variante.price * (v_linea->>'quantity')::integer;
    v_pos := v_pos + 1;
  end loop;

  -- El subtotal se calcula por dos caminos —acá sumando las líneas, y adentro de
  -- `cart_promotions`— y tienen que coincidir. Si divergen hay un bug en uno de
  -- los dos, y cobrar mal en silencio es peor que fallar.
  if v_total <> (v_promos->>'subtotal')::bigint then
    raise exception 'El subtotal del pedido (%) no coincide con el de las promociones (%)',
      v_total, v_promos->>'subtotal';
  end if;

  /*
   * 5 bis. Los regalos (ADR-164): una línea a precio cero que descuenta stock
   * como cualquiera, y que guarda su costo —regalar algo le cuesta al comercio, y
   * el margen tiene que verlo—. `cart_promotions` ya comprobó que alcanza, con el
   * stock bloqueado arriba; si igual faltara, se corta antes que entregar lo que
   * no hay.
   */
  for v_regalo in select * from jsonb_array_elements(coalesce(v_promos->'gifts', '[]'::jsonb))
  loop
    select v.id, v.title as variant_title, v.sku, v.cost, v.currency,
           p.title as product_title
    into v_variante
    from product_variants v
    join products p on p.id = v.product_id
    where v.id = (v_regalo->>'variantId')::uuid
      and p.store_id = p_store_id;

    v_falta := (v_regalo->>'quantity')::integer;
    v_asignacion := '[]'::jsonb;

    for v_nivel in
      select location_id, available
      from inventory_levels
      where variant_id = v_variante.id and available > 0
      order by available desc, location_id
    loop
      exit when v_falta <= 0;
      v_toma := least(v_falta, v_nivel.available);

      update inventory_levels
      set available = available - v_toma, updated_at = now()
      where variant_id = v_variante.id and location_id = v_nivel.location_id;

      v_asignacion := v_asignacion || jsonb_build_object(
        'locationId', v_nivel.location_id, 'quantity', v_toma
      );
      v_falta := v_falta - v_toma;
    end loop;

    if v_falta > 0 then
      raise exception 'No alcanza el stock del regalo %', v_variante.product_title;
    end if;

    insert into order_items (
      tenant_id, order_id, variant_id, title, variant_title, sku,
      unit_price, unit_cost, currency, quantity, position, stock_allocation, is_gift
    ) values (
      v_tenant, v_order_id, v_variante.id,
      v_variante.product_title,
      nullif(v_variante.variant_title, ''),
      v_variante.sku,
      0, v_variante.cost, v_variante.currency,
      (v_regalo->>'quantity')::integer, v_pos, v_asignacion, true
    );
    v_pos := v_pos + 1;
  end loop;

  -- El total que se cobra: productos, menos lo descontado, más el envío.
  update orders set total_amount = v_total - v_descuento + v_envio where id = v_order_id;

  insert into order_events (tenant_id, order_id, type, data)
  values (v_tenant, v_order_id, 'created', jsonb_build_object('status', 'received'));

  return jsonb_build_object('order', order_json(v_order_id));

exception
  when unique_violation then
    -- Dos peticiones con la misma clave a la vez: una gana y la otra llega acá.
    -- Devolver la ganadora es la respuesta correcta, no un error — el cliente
    -- pidió un pedido y hay exactamente un pedido.
    select id into v_existente
    from orders
    where store_id = p_store_id and idempotency_key = p_idempotency_key;

    if v_existente is null then
      raise;
    end if;
    return jsonb_build_object('order', order_json(v_existente));
end;
$$;

create or replace function public.order_json(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', o.id,
    'number', o.number,
    'status', o.status,
    'paymentMethod', o.payment_method,
    'paymentStatus', o.payment_status,
    'customer', o.customer,
    'address', o.address,
    'notes', nullif(o.notes, ''),
    -- Lo único que cambia respecto de la versión anterior: el subtotal, lo
    -- descontado y de qué promociones salió. El resto es idéntico, incluido el
    -- `strip_nulls` de las líneas —que es lo que mantiene ausentes los campos
    -- opcionales en vez de nulos— y el formato crudo de `createdAt`.
    'subtotal', jsonb_build_object('amount', o.subtotal_amount, 'currency', o.currency),
    'discount', jsonb_build_object('amount', o.discount_amount, 'currency', o.currency),
    -- Ausente cuando no hubo ninguna, no un array vacío: mismo contrato que el
    -- resto de los campos opcionales.
    'appliedPromotions', case when jsonb_array_length(o.applied_promotions) = 0 then null
                         else o.applied_promotions end,
    'shipping', jsonb_build_object('amount', o.shipping_amount, 'currency', o.currency),
    'total', jsonb_build_object('amount', o.total_amount, 'currency', o.currency),
    -- Ausente cuando no lo es, como el resto de lo opcional: un `false` en
    -- cada pedido de cada comercio sería ruido en el payload de todos.
    'isDemo', case when o.is_demo then true else null end,
    -- El enlace de acuse (ADR-142). Viaja con el pedido a la confirmación y al
    -- correo, que son los dos lugares donde quien compró lo va a necesitar.
    'accessToken', o.access_token,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'variantId', i.variant_id,
               'title', i.title,
               'variantTitle', i.variant_title,
               'sku', i.sku,
               'unitPrice', jsonb_build_object('amount', i.unit_price, 'currency', i.currency),
               'quantity', i.quantity,
               -- Ausente si no lo es, como el resto de lo opcional (ADR-164).
               'isGift', case when i.is_gift then true end
             )) order by i.position)
      from order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  ))
  from orders o
  where o.id = p_order_id
$$;

-- ---------------------------------------------------------------------------
-- El catálogo: sólo el descuento de siempre se pinta en la vidriera
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.catalog_search(p_store_id uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT ''::text, p_sort text DEFAULT 'relevance'::text, p_page integer DEFAULT 1, p_per_page integer DEFAULT 24, p_price_min bigint DEFAULT NULL::bigint, p_price_max bigint DEFAULT NULL::bigint, p_handle text DEFAULT NULL::text, p_collection text DEFAULT NULL::text, p_prefiere jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    -- De catálogo: el descuento de siempre, sin cupón ni condiciones de
    -- carrito. Un 3x2 o un regalo dependen del carrito (ADR-164).
    and pr.kind = 'discount'
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

-- El precio más bajo de cada producto, agregado **una vez**.
--
-- Era una subconsulta correlacionada —`(select min(efectivo) from precios where
-- product_id = p.id)`— dentro de `prods`. Contra una tabla habría usado el
-- índice; contra un CTE no hay índice que usar, así que Postgres recorría las
-- 5010 filas de `precios` una vez por producto: 25 millones de filas y 1,9 de
-- los 2,2 segundos que tardaba el catálogo. Medido con `explain analyze`.
--
-- Un producto sin variantes no aparece acá, y el `left join` de `prods` le deja
-- `lowest` en nulo, que es lo que devolvía el `min()` de un conjunto vacío.
minimos as (
  select product_id, min(efectivo) as lowest
  from precios
  group by product_id
),

/*
 * Unidades vendidas por producto, sin los cancelados, **una sola vez**.
 *
 * Antes era una subconsulta escalar dentro de `prods`, correlacionada por
 * producto, y `order_items` no tiene un índice que le sirva: con 2097 productos
 * en el listado de Treeshop, Postgres recorría la tabla entera 2097 veces —tres
 * millones de filas visitadas— para calcular un número que en la mayoría de los
 * pedidos ni se usa, porque sólo ordena «más vendidos». Eran 610 ms de los 1070
 * del listado, medido con `explain analyze`.
 *
 * Es la trampa que CLAUDE.md ya describe: si el valor se necesita por fila, se
 * agrega una vez en su propio CTE y se entra por join. El filtro por tienda va
 * en `orders`, que la tiene: un producto es de una sola tienda, así que el
 * resultado es el mismo que antes, fila por fila.
 */
vendidos as (
  select pv.product_id, sum(oi.quantity)::int as unidades
  from order_items oi
  join orders o on o.id = oi.order_id
  join product_variants pv on pv.id = oi.variant_id
  where o.store_id = p_store_id
    and o.status <> 'cancelled'
  group by pv.product_id
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
    p.group_position,
    c.slug as categoria,
    row_number() over (order by p.created_at, p.id) as ord,
    p.created_at,
    /*
     * Unidades vendidas, sin los cancelados. Se agrega en la consulta y **no**
     * se guarda en una columna: un contador materializado es alguien que tiene
     * que acordarse de actualizarlo, y ADR-056 ya dice a dónde lleva eso con el
     * stock. Sale de `vendidos`, que la calcula una vez para toda la tienda.
     */
    coalesce(vd.unidades, 0) as vendidas,
    -- El mínimo **efectivo**, no el de lista: de acá salen el orden por precio,
    -- el filtro de rango y los extremos de la barra.
    mp.lowest,
    -- Título y marca normalizados, materializados (ADR-125). Sobre esto se
    -- busca; antes se armaba acá, con los SKU, para cada producto en cada
    -- petición, hubiera término o no.
    p.search_doc,
    /*
     * Lo que se está moviendo esta semana (ADR-127). Sale de una tabla que
     * mantiene el recálculo, no de una cuenta en esta consulta: contar eventos
     * acá sería recorrer la tabla más grande del esquema en cada visita.
     *
     * `coalesce` a cero y no nulo: una tienda sin tráfico tiene la tabla vacía y
     * todos empatan, así que el orden queda en el del catálogo. Es el escalón
     * de respaldo de la cascada, y sale sin un `if` en ningún lado.
     */
    coalesce(pt.score, 0) as tendencia
  from products p
  left join categories c on c.id = p.category_id
  left join minimos mp on mp.product_id = p.id
  left join vendidos vd on vd.product_id = p.id
  /*
   * El filtro por tienda del join es defensa en profundidad: un id de producto es
   * único en todo el esquema, así que una fila de otra tienda no puede coincidir
   * igual. Comprobado quitándolo —ningún caso se pone en rojo—, y se deja escrito
   * para que nadie lo cuente como cobertura.
   */
  left join product_trending pt on pt.product_id = p.id and pt.store_id = p_store_id
  -- El storefront nunca ve borradores. Un select sin esto los publicaría.
  where p.store_id = p_store_id
    and p.status = 'active'
    and (p_handle is null or p.handle = p_handle)
    /*
     * Sin stock, fuera del listado. Salvo que la tienda pida mostrarlos
     * (`settings.catalog.showOutOfStock`), un producto cuyas variantes están
     * todas en cero no aparece en el catálogo, en la búsqueda, en las facetas
     * ni en las colecciones: todo pasa por acá.
     *
     * **Nunca fuera del PDP.** Con `p_handle` no se filtra: un producto que se
     * agotó sigue teniendo su página, con «Sin stock» a la vista. Un 404 en un
     * enlace que ayer funcionaba es peor que una página que dice que no hay.
     *
     * Se compara como texto y no con `::boolean`: un valor mal escrito en el
     * jsonb haría fallar el catálogo entero, y el lado seguro es ocultar.
     */
    and (
      p_handle is not null
      or coalesce(
           (select s.settings->'catalog'->>'showOutOfStock' from store_settings s
             where s.store_id = p_store_id),
           'false') = 'true'
      or exists (
        select 1
        from product_variants v
        join inventory_levels il on il.variant_id = v.id
        where v.product_id = p.id and il.available > 0
      )
    )
    /*
     * Sin foto, fuera del listado **si la tienda lo pide**
     * (`settings.catalog.hideWithoutImage`). Al revés que el stock, acá el
     * default es mostrar: que no haya stock es universal —no se vende lo que no
     * hay—, que no haya foto es merchandising, y una ferretería vende sin foto.
     * Una tienda de ropa lo enciende y lo que Camelot cargó sin fotografiar
     * deja de abrir la vitrina con seis páginas de «Sin imagen».
     *
     * Tampoco filtra por `p_handle`: la página existe, con su placeholder.
     */
    and (
      p_handle is not null
      or coalesce(
           (select s.settings->'catalog'->>'hideWithoutImage' from store_settings s
             where s.store_id = p_store_id),
           'false') <> 'true'
      or exists (select 1 from product_media m where m.product_id = p.id)
    )
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

-- Los términos de la búsqueda, normalizados como el documento: sin mayúsculas ni
-- acentos. Vacío sin búsqueda, y entonces los dos CTE que siguen no hacen nada.
terminos as (
  select distinct t.tok
  from unnest(string_to_array(app.normalizar_busqueda(trim(coalesce(p_search, ''))), ' ')) t(tok)
  where t.tok <> ''
),

-- La llave de la frase en la caché de vectores (ADR-132).
--
-- Vacía en dos casos, y en los dos el camino semántico no aporta nada: sin
-- búsqueda, y cuando la consulta **parece un código**. Un solo token con
-- dígitos —«CH-407307-01», «A12»— es una referencia, no una descripción, y ahí
-- manda lo léxico, que es exacto. «campera 2024» son dos tokens: no es un
-- código.
frase as (
  select case
    when q = '' then ''
    when q !~ ' ' and q ~ '[0-9]' then ''
    else md5(q)
  end as llave
  from (select app.normalizar_busqueda(trim(coalesce(p_search, ''))) as q) n
),

-- Los productos parecidos a la frase, si la frase ya tiene vector.
--
-- **Cero filas** cuando no hay extensión, no hay clave del comercio o nadie
-- embebió todavía: entonces esto no agrega ni quita nada y el catálogo es
-- exactamente el léxico de la Fase 3. Es un CTE y no una subconsulta
-- correlacionada a propósito: así se evalúa una vez y no una por producto.
semanticos as (
  select s.product_id, s.sim
  from frase f
  cross join lateral app.similitud_semantica(p_store_id, f.llave) s
),

-- Los productos con algún SKU que **empieza** con un término. Por prefijo y
-- exacto, no por parecido: «A12» por trigramas traería medio catálogo. Una sola
-- pasada por las variantes de la tienda en vez de un `exists` por producto.
skus as (
  select distinct v.product_id, t.tok
  from product_variants v
  join prods pr on pr.id = v.product_id
  cross join terminos t
  where starts_with(app.normalizar_busqueda(v.sku), t.tok)
),

-- Cómo coincide cada producto con cada término, y cuánto vale. Un término
-- coincide si aparece literal en el documento, si es un prefijo de SKU, o
-- —desde cuatro letras, porque con menos es ruido— si se parece lo suficiente a
-- una palabra del documento: así «zapatila» encuentra «zapatilla».
--
-- El puntaje ordena por relevancia: el SKU pesa más que lo literal, y lo
-- literal más que cualquier parecido, que vale su `word_similarity` (< 1).
coincidencias as (
  select pr.id as product_id, count(*) as n, sum(m.puntos) as puntaje
  from prods pr
  cross join terminos t
  left join skus s on s.product_id = pr.id and s.tok = t.tok
  cross join lateral (
    select case
      when s.tok is not null then 1.2
      when strpos(pr.search_doc, t.tok) > 0 then 1.0
      when length(t.tok) >= 4 then (
        select ws from (select word_similarity(t.tok, pr.search_doc)::numeric as ws) w
        where ws >= 0.5
      )
    end as puntos
  ) m
  where m.puntos is not null
  group by pr.id
),

-- Búsqueda y rango de precio: se aplican a los ítems **y** a los counts de
-- todas las facetas. A diferencia de un filtro de faceta, nunca se auto-excluyen.
base as (
  select pr.*, co.puntaje, sem.sim
  from prods pr
  left join pfacets pfr on pfr.product_id = pr.id
  left join coincidencias co on co.product_id = pr.id
  left join semanticos sem on sem.product_id = pr.id
  -- Tienen que coincidir **todos** los términos… **o** parecerse a la frase.
  --
  -- Esta línea es la fase entera: «algo para correr en invierno» no coincide
  -- con ningún término, así que sin ella el producto no entraría por más
  -- parecido que fuera. Lo semántico no es un criterio de orden, es una fuente
  -- de filas. Lo que sigue —precio, colección, facetas— se le aplica igual.
  where (
    not exists (select 1 from terminos)
    or co.n = (select count(*) from terminos)
    or sem.product_id is not null
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

/*
 * Un modelo es una sola tarjeta en el catálogo (ADR-163): el primero de su lista
 * **entre los que pasan los filtros** —con «Azul», la tarjeta es la del azul—.
 * La ventana corre sólo sobre los productos con modelo.
 */
primeros_del_modelo as (
  select x.id
  from (
    select f.id,
           row_number() over (
             partition by f.product_group_id order by f.group_position, f.ord
           ) as n
    from filtrados f
    where f.product_group_id is not null
  ) x
  where x.n = 1
),

-- Con `p_handle` se pide un producto puntual —el PDP— y ése se devuelve aunque
-- no sea el primero de su modelo.
visibles as (
  select f.*
  from filtrados f
  where f.product_group_id is null
     or p_handle is not null
     or f.id in (select id from primeros_del_modelo)
),

total as (select count(*)::int as n from visibles),

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

-- El orden de la página, calculado sobre lo barato: id, título, precio más
-- bajo y unidades vendidas, que ya están en `filtrados`.
--
-- Acá **no** se serializa nada, y eso es lo que hace barata la paginación
-- profunda. Antes el `jsonb_build_object` vivía en el mismo select que este
-- `row_number()`, así que se armaba el documento de cada fila que la ventana
-- dejaba pasar.
--
-- En la **primera** página eso no costaba: Postgres empuja el tope adentro de la
-- ventana con un `Run Condition` sobre el `row_number()`, y para a las 24 filas.
-- Pero el `Run Condition` sólo empuja el límite **superior**. En la página 100 la
-- ventana entrega 2400 filas, se arman 2400 documentos y se descartan 2376:
--
--     página 100, sin este corte   1660 ms
--     página 100, con este corte    204 ms
--
-- Medido con 5006 productos. Se revirtió una vez por haber medido sólo la
-- primera página, donde no se nota.
ordenados as (
  select
    f.*,
    row_number() over (
      order by
        case when p_sort = 'price-asc'  then f.lowest end asc  nulls last,
        case when p_sort = 'price-desc' then f.lowest end desc nulls last,
        case when p_sort = 'title-asc'  then lower(f.title) end asc,
        -- Descendentes las dos. `f.ord` desempata al final, así que lo que no
        -- vendió nada conserva el orden de descubrimiento en vez de barajarse.
        case when p_sort = 'newest'       then f.created_at end desc,
        case when p_sort = 'best-selling' then f.vendidas   end desc,
        /*
         * La cascada de «Preferencias», que es un solo `order by` y no tres
         * caminos de código (ADR-127):
         *
         * 1. lo de las marcas y categorías que viene mirando, si hay señal;
         * 2. dentro de eso —y para quien no tiene señal—, lo que se está moviendo;
         * 3. y si la tienda tampoco tiene tráfico, el orden del catálogo, que es
         *    `f.ord` al final de esta lista.
         *
         * Con `p_prefiere` vacío el primer `case` da 1 para todos y el orden
         * queda igual al de «Tendencia». No hay un `if` en el storefront eligiendo
         * camino, así que el arranque en frío no es una rama que nadie prueba: es
         * la misma consulta con el parámetro vacío.
         */
        case
          when p_sort = 'preferencias'
           and (coalesce(p_prefiere->'brand', '[]'::jsonb) ? f.brand
                or coalesce(p_prefiere->'categoria', '[]'::jsonb) ? f.categoria)
          then 0 else 1
        end asc,
        -- «Tendencia»: lo que se movió esta semana. Con la tabla vacía empatan
        -- todos en cero y desempata `f.ord`, que es el orden del catálogo.
        case when p_sort in ('trending', 'preferencias') then f.tendencia end desc,
        -- Con término de búsqueda, lo que mejor coincide primero. Sin término
        -- el puntaje es nulo para todos y el orden es el de siempre.
        /*
          Relevancia fusionada (ADR-132).

          `puntaje` es una suma sin techo sobre los términos, así que se divide
          por cuántos son para dejarlo en la misma escala que `sim`, que es
          0..1. Los pesos no son un gusto: **lo léxico siempre gana**. Un
          producto que coincide con todos los términos aporta al menos 0,5 por
          término —es el piso de `word_similarity`—, o sea 0,75 × 0,5 = 0,375,
          por encima del máximo que puede dar lo semántico solo, 0,25 × 1 =
          0,25. Un parecido nunca desplaza a una coincidencia.

          Sin vectores, `sim` es null en todas las filas y esto es el orden de
          antes multiplicado por una constante: el mismo orden.
        */
        case when p_sort = 'relevance' then
          0.75 * coalesce(f.puntaje / nullif((select count(*) from terminos), 0), 0)
          + 0.25 * coalesce(f.sim, 0)
        end desc nulls last,
        f.ord
    ) as rn
  from visibles f
),

-- La página pedida. El corte va **antes** de serializar, así que lo que sigue
-- trabaja sobre `p_per_page` filas y no sobre el catálogo entero.
pagina_items as (
  select o.*
  from ordenados o
  where o.rn > (select (page - 1) * least(p_per_page, 200) from pagina)
    and o.rn <= (select page * least(p_per_page, 200) from pagina)
),

items as (
  select jsonb_agg(
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
      /*
       * El modelo, sólo en el PDP: los productos publicados del mismo modelo,
       * en su orden, con el valor que los distingue y su primera foto. En la PLP
       * no viaja —serían 24 listas que nadie mira— (ADR-163).
       */
      'model', case when p_handle is not null and f.product_group_id is not null then (
        select jsonb_strip_nulls(jsonb_build_object(
          'display', g.display,
          'axis', g.axis,
          'axisLabel', (select d.label from attribute_definitions d
                        where d.store_id = p_store_id and d.name = g.axis
                        order by d.category_id nulls first limit 1),
          'items', coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'handle', h.handle,
                     'title', h.title,
                     'value', (select v.attributes->>g.axis from product_variants v
                               where v.product_id = h.id order by v.position limit 1),
                     'image', (select m.url from product_media m
                               where m.product_id = h.id order by m.position limit 1),
                     'current', case when h.id = f.id then true end
                   )) order by h.group_position, h.title)
            from products h
            where h.product_group_id = g.id and h.status = 'active'
          ), '[]'::jsonb)
        ))
        from product_groups g
        where g.id = f.product_group_id
      ) end,
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
    ))
    order by f.rn
  ) as docs
  from pagina_items f
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
$function$
;
