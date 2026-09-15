/*
 * Lo que este navegador vino mirando.
 *
 * **Es el checkpoint del sustrato, no una feature.** Corre sobre la misma tabla
 * que van a leer las preferencias de la Fase 4, así que si esta consulta sale
 * bien el resto tiene de dónde comer, y si sale mal se sabe ahora y no después
 * de construir encima.
 *
 * Tres decisiones, y las tres son las mismas que ya se tomaron en otro lado:
 *
 * **Por dispositivo y no por sesión.** `session_id` dura treinta minutos, que
 * era el techo de lo que el sitio podía recordar; `device_id` dura seis meses
 * (ADR-124). Sin `device_id` —alguien que apagó la personalización— esto no
 * devuelve nada, y no hace falta escribirlo acá: el llamador no tiene qué pasar.
 *
 * **No devuelve precio**, igual que `wishlist_products` y por el mismo motivo:
 * hay un solo lugar donde se calcula lo que paga el comprador —`cart_promotions`,
 * que usan por igual el catálogo, el carrito y `create_order`— y un segundo
 * camino que lo calcule distinto es el bug que ya costó un ciclo acá. El precio
 * está a un toque, en el PDP.
 *
 * **Sí aplica las reglas de visibilidad del catálogo**, al revés que la wishlist.
 * Son listas distintas: la wishlist es algo que la persona eligió guardar, así
 * que lo que se quedó sin stock **se muestra y se dice**; esto es una ayuda para
 * seguir navegando, y ofrecer lo que no se puede comprar no ayuda a nadie.
 *
 * Sólo la secret key. El `device_id` sale de una cookie `httpOnly` que lee el
 * Worker, así que nadie puede pedir el historial de otro navegador: no hay
 * parámetro que falsificar desde afuera.
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
        select jsonb_build_object('url', m.url, 'alt', m.alt)
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

comment on function public.recently_viewed is
  'Los últimos productos que vio este navegador, comprables y sin precio. Sólo la secret key: el device_id sale de una cookie httpOnly.';

/*
 * Ni `anon` ni `authenticated`. No es una función de comprador: no hay identidad
 * que resolver, hay una cookie que sólo el Worker puede leer. Dejarla al alcance
 * de `authenticated` sería dejar que cualquiera pidiera el historial de un
 * `device_id` inventado hasta acertar uno.
 */
revoke all on function public.recently_viewed(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.recently_viewed(uuid, uuid, integer) to service_role;
