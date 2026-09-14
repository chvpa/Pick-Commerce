/*
 * La pantalla de guardados.
 *
 * **Por qué no alcanza `catalog_search`**, que es la pregunta obvia: esa función
 * aplica las reglas de visibilidad del catálogo —activo, con stock si la tienda
 * lo pide, con foto si la tienda lo pide— y acá hacen justo lo contrario de lo
 * que se necesita. Un producto guardado puede quedar fuera del catálogo por
 * archivado, por quedarse sin stock o por perder su foto, y **desaparecerlo en
 * silencio parece un bug de la wishlist**: la persona guardó algo y ya no está.
 * Lo que hay que hacer es mostrarlo y decir que no está disponible.
 *
 * **Y por qué no devuelve precio.** Porque hay un solo lugar donde se calcula lo
 * que paga el comprador —`cart_promotions`, que usan por igual el catálogo, el
 * carrito y `create_order`— y un segundo camino que lo calcule distinto es
 * exactamente el bug que ya costó un ciclo acá: el carrito mostraba el precio de
 * lista mientras el catálogo mostraba el rebajado. El precio está a un toque de
 * distancia, en el PDP, y ahí no puede discrepar consigo mismo.
 *
 * `security invoker`: lo acota RLS por `wishlist_items`, que es del comprador.
 * La defensa está en la base y no en una comprobación escrita a mano acá
 * adentro (ADR-121).
 */

create or replace function public.wishlist_products(p_store_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
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
        /*
         * «Disponible» es lo mismo que el catálogo entiende por comprable:
         * publicado y con al menos una unidad en alguna sucursal. No se mira la
         * configuración de la tienda —si oculta los sin stock o los sin foto—
         * porque acá no se oculta nada: el dato es para el rótulo.
         */
        'available', p.status = 'active' and exists (
          select 1
          from product_variants v
          join inventory_levels il on il.variant_id = v.id
          where v.product_id = p.id and il.available > 0
        ),
        'savedAt', w.created_at
      ) order by w.created_at desc
    ),
    '[]'::jsonb
  )
  from wishlist_items w
  join products p on p.id = w.product_id
  where w.store_id = p_store_id;
$$;

comment on function public.wishlist_products is
  'Los productos guardados del comprador autenticado. Muestra lo no disponible en vez de esconderlo, y no devuelve precio: ese lo calcula el catálogo.';

revoke all on function public.wishlist_products(uuid) from public, anon;
grant execute on function public.wishlist_products(uuid) to authenticated;
