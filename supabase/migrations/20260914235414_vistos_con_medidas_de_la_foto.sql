/*
 * La foto de «vistos recientemente» viaja con sus medidas.
 *
 * Sin `width` y `height`, `<Image />` de Astro no puede reservar el espacio y la
 * tira empuja el contenido al cargar cada foto. Es el CLS que ese componente
 * existe para evitar, y lo cazo el typecheck: `ProductImage` las pide.
 *
 * Lo demas queda igual que en 20260914235234.
 */

create or replace function public.recently_viewed(
  p_store_id  uuid,
  p_device_id uuid,
  p_limit     integer default 8
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with vistos as (
  /*
   * El último `product_view` de cada producto, no todos.
   *
   * `distinct on` con ese orden es lo que colapsa veinte visitas al mismo
   * producto en una sola entrada, con su fecha más reciente. Sin eso, mirar un
   * producto cinco veces lo repetiría cinco en la tira.
   */
  select distinct on (e.data->>'productId')
         (e.data->>'productId')::uuid as product_id,
         e.occurred_at
  from store_events e
  where e.store_id = p_store_id
    and e.device_id = p_device_id
    and e.type = 'product_view'
    and e.data->>'productId' is not null
  order by e.data->>'productId', e.occurred_at desc
),

-- Recién acá se recorta, y recién acá se mira el catálogo: filtrar primero por
-- lo que la persona vio deja una lista de diez, no de tres mil.
ordenados as (
  select v.product_id, v.occurred_at
  from vistos v
  order by v.occurred_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 24)
)

select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'handle', p.handle,
      'title', p.title,
      'brand', p.brand,
      'image', (
        select jsonb_build_object('url', m.url, 'alt', m.alt, 'width', m.width, 'height', m.height)
        from product_media m
        where m.product_id = p.id
        order by m.position
        limit 1
      ),
      'viewedAt', o.occurred_at
    ) order by o.occurred_at desc
  ),
  '[]'::jsonb
)
from ordenados o
join products p on p.id = o.product_id
-- Publicado y comprable: lo que ya no se puede comprar no se ofrece.
where p.store_id = p_store_id
  and p.status = 'active'
  and exists (
    select 1
    from product_variants v
    join inventory_levels il on il.variant_id = v.id
    where v.product_id = p.id and il.available > 0
  );
$$;
