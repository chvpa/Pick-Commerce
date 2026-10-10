/*
 * Una promoción sin tipo de descuento no regala nada (ADR-164).
 *
 * Lo encontró el e2e del carrito: con un 3x2 activo, las recomendaciones del
 * carrito decían «Gs. 0». Dos causas, y se arreglan las dos:
 *
 * - `app.catalog_items`, que arma las tarjetas de las recomendaciones, leía las
 *   promociones de catálogo sin mirar `kind`: `catalog_search` y
 *   `cart_promotions` sí lo miran desde ADR-164, ésta quedó afuera. Parte de su
 *   última definición, `20260917224304`, con una línea más.
 * - `app.promo_discount` con tipo nulo caía en el `else` del monto fijo, y
 *   `least(null, base)` es `base`: el producto entero de descuento. El core
 *   devuelve cero en ese caso, que es el lado seguro. Ahora el SQL también.
 */

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
    when p_type = 'percentage' then round((p_base::numeric * coalesce(p_value, 0)) / 10000)::bigint
    -- Un monto fijo mayor que la base no puede dejar un negativo: un negativo que
    -- llega al total es plata que el comercio termina debiendo.
    when p_type = 'fixed' then least(coalesce(p_value, 0), p_base)
    -- Sin tipo, nada. Antes caía arriba y `least(null, base)` regalaba la base.
    else 0
  end;
$$;

create or replace function app.catalog_items(p_store_id uuid, p_ids uuid[])
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with
-- Los ids pedidos, con su posición. `with ordinality` es lo que conserva el
-- orden que decidió quien recomienda.
pedidos as (
  select id, orden
  from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as t(id, orden)
),

-- Los que existen, son de esta tienda y se pueden mostrar. Mismos predicados que
-- `catalog_search`, en el mismo orden y por el mismo motivo.
candidatos as (
  select p.id, p.handle, p.title, p.description, p.brand, p.tenant_id,
         p.product_group_id, p.category_id, c.slug as categoria, p.created_at, pe.orden
  from pedidos pe
  join products p on p.id = pe.id
  left join categories c on c.id = p.category_id
  where p.store_id = p_store_id
    and p.status = 'active'
    -- Sin stock no se recomienda: recomendar lo que no hay es el modo de falla
    -- por defecto de una tira. Salvo que la tienda muestre agotados (ADR-112).
    and (
      coalesce(
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
    and (
      coalesce(
        (select s.settings->'catalog'->>'hideWithoutImage' from store_settings s
          where s.store_id = p_store_id),
        'false') <> 'true'
      or exists (select 1 from product_media m where m.product_id = p.id)
    )
),

-- Promociones de catálogo vigentes de la tienda. Son pocas —un comercio tiene
-- diez, no diez mil— y se resuelven una vez, igual que en `catalog_search`.
promos as (
  select pr.id, pr.title, pr.priority, pr.stackable,
         pr.discount_type as "discountType", pr.discount_value as "discountValue",
         pr.target
  from promotions pr
  where pr.store_id = p_store_id
    and pr.status = 'active'
    -- Sólo el descuento de siempre se pinta (ADR-164). Sin esto, un 3x2 —sin
    -- tipo ni valor de descuento— dejaba las recomendaciones en Gs. 0.
    and pr.kind = 'discount'
    and pr.code is null
    and pr.min_subtotal is null
    and pr.min_quantity is null
    and (pr.starts_at is null or now() >= pr.starts_at)
    and (pr.ends_at is null or now() < pr.ends_at)
    and (pr.usage_limit is null or pr.usage_count < pr.usage_limit)
),

-- Acá está la diferencia con `catalog_search`: el `from` son los candidatos, no
-- los productos activos de la tienda.
promos_producto as (
  select p.id as product_id,
         coalesce(
           jsonb_agg(to_jsonb(pm) - 'target' order by pm.priority desc, pm.id)
             filter (where pm.id is not null),
           '[]'::jsonb
         ) as lista
  from candidatos p
  left join promos pm on (
    pm.target->>'kind' = 'all'
    or (pm.target->>'kind' = 'product'  and pm.target->'ids' ? p.id::text)
    or (pm.target->>'kind' = 'category' and p.category_id is not null
        and pm.target->'ids' ? p.category_id::text)
    or (pm.target->>'kind' = 'collection' and exists (
          select 1 from collection_products cp
          where cp.product_id = p.id and pm.target->'ids' ? cp.collection_id::text))
  )
  group by p.id
),

-- El precio efectivo de cada variante de los candidatos. El `case` saltea
-- `apply_chain` cuando no hay promoción, que es el estado normal de una tienda.
precios as (
  select v.id as variant_id, v.product_id, v.price as lista,
         case when pp.lista = '[]'::jsonb then v.price
              else (app.apply_chain(v.price, pp.lista)->>'amount')::bigint
         end as efectivo
  from product_variants v
  join promos_producto pp on pp.product_id = v.product_id
)

select coalesce(
  jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', f.id,
      'tenantId', f.tenant_id,
      'storeId', p_store_id,
      'handle', f.handle,
      'title', f.title,
      'description', f.description,
      'brand', f.brand,
      'categoryId', f.categoria,
      'productGroupId', f.product_group_id,
      'status', 'active',
      'createdAt', f.created_at,
      'unitsSold', coalesce((
        select sum(oi.quantity)
        from order_items oi
        join product_variants pv on pv.id = oi.variant_id
        join orders o on o.id = oi.order_id
        where pv.product_id = f.id and o.status <> 'cancelled'
      ), 0)::int,
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
          'price', jsonb_build_object('amount', pe.efectivo, 'currency', v.currency),
          'compareAtPrice', case
            when pe.efectivo < v.price
              then jsonb_build_object(
                'amount', greatest(v.price, coalesce(v.compare_at_price, 0)),
                'currency', v.currency)
            when v.compare_at_price is null then null
            else jsonb_build_object('amount', v.compare_at_price, 'currency', v.currency)
          end,
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
    order by f.orden
  ),
  '[]'::jsonb
)
from candidatos f;
$$;
