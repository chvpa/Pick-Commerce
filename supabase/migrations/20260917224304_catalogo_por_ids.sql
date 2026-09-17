/*
 * El documento del producto, compartido: `app.catalog_items` (ADR-127).
 *
 * La Fase 4 necesita pedir «estos productos, en este orden» para las tiras de
 * recomendados. El ROADMAP pedía un `p_ids uuid[]` en `catalog_search`; se
 * descartó con dos mediciones que ya están en el repo: un filtro análogo duplicó
 * el costo del listado (20260914165331) y el camino acotado cuesta 355 ms porque
 * `promos_producto` y `precios` se calculan sobre la tienda entera aunque se pida
 * un solo producto.
 *
 * Acá los mismos CTE **están acotados a los ids pedidos desde la primera línea**,
 * así que una tira de ocho paga por ocho productos.
 *
 * Lo que devuelve es **el mismo documento** que un ítem de `catalog_search`, y eso
 * es deuda conocida: son dos copias de la misma serialización. La defensa es un
 * test de equivalencia —el mismo producto por los dos caminos tiene que dar el
 * mismo jsonb—, porque el modo de fallo es silencioso: una promoción que se aplica
 * en el listado y no en la tira no rompe nada, sólo muestra otro precio (ADR-050).
 *
 * Dos propiedades que son de la función y no de quien la llama:
 *
 * 1. **Devuelve en el orden del arreglo.** Quien recomienda ya decidió el orden.
 * 2. **Omite lo que el catálogo esconde** —borrador, agotado, y sin foto si la
 *    tienda lo pide—. Así «ninguna lista recomendada muestra un producto que el
 *    catálogo esconde» no es una regla que cada pantalla tenga que recordar.
 *
 * Vive en el schema `app` porque no es una API del storefront: es la pieza que
 * comparten las funciones que sí lo son. `anon` no tiene `usage` sobre `app`, así
 * que PostgREST no la alcanza.
 */

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

comment on function app.catalog_items is
  'El documento del producto para una lista de ids, en ese orden y sin lo que el catálogo esconde. Comparte la serialización con catalog_search (ADR-127).';

/*
 * Nace con el `execute` de `PUBLIC`. `anon` no tiene `usage` sobre `app`, así que
 * no la alcanzaría igual, pero el revoke se escribe: es más barato que acordarse.
 */
revoke all on function app.catalog_items(uuid, uuid[]) from public, anon;
grant execute on function app.catalog_items(uuid, uuid[]) to service_role;
