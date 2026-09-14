/*
 * `wishlist_products` pasa a `security definer`, y el motivo es una asimetría
 * del esquema que no se ve leyendo la función.
 *
 * Nació `security invoker`, copiando el patrón de `customer_orders`, con la
 * idea de que la defensa fuera RLS y no una comprobación escrita adentro
 * (ADR-121). Con `customer_orders` eso funciona porque **todas** las tablas que
 * toca —`orders`, `order_items`— tienen política de comprador. Ésta además
 * entra a `products`, `product_media`, `product_variants` e
 * `inventory_levels`, que **no la tienen**: el catálogo lo lee el storefront con
 * la secret key, que saltea RLS (ADR-052).
 *
 * O sea que la unión devolvía cero filas para el comprador, siempre. La
 * pantalla de guardados decía «Todavía no guardaste ningún producto» con dos
 * productos guardados en la base, y no había ningún error en ningún lado: lo
 * encontró mirar la página, no el tipo ni el test.
 *
 * `catalog_search` es invoker por lo mismo y por eso devuelve vacío a cualquier
 * autenticado: el storefront siempre la llama con la secret key. Acá no se
 * puede hacer eso, porque quién es el comprador sale de su JWT.
 *
 * Entonces `definer`, con el filtro escrito a mano y en una sola línea:
 * `w.customer_id = app.current_customer(p_store_id)`. La identidad la sigue
 * decidiendo la sesión —`app.current_customer` resuelve `auth.uid()`— y lo único
 * que el `definer` compra es poder mirar el catálogo. Un forastero recibe `[]`.
 */

create or replace function public.wishlist_products(p_store_id uuid)
returns jsonb
language sql
stable
security definer
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
  where w.store_id = p_store_id
    -- La línea que reemplaza a RLS, y la única que decide algo acá.
    and w.customer_id = app.current_customer(p_store_id);
$$;

comment on function public.wishlist_products is
  'Los productos guardados del comprador autenticado. Definer para poder leer el catálogo, acotada por app.current_customer. Muestra lo no disponible en vez de esconderlo, y no devuelve precio.';
