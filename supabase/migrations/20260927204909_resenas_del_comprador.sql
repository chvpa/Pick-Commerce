-- El camino por el que el comprador escribe su reseña (ADR-140).
--
-- La migración anterior dejó la tabla, sus políticas y lo que lee la vitrina. Lo
-- que falta es lo que usa el navegador, y son dos cosas que **no se pueden hacer
-- desde el cliente**, las dos por el mismo motivo que ya documentó la wishlist:
--
--   1. `app.compro_y_recibio` vive en el schema `app`, y PostgREST sólo expone
--      `public`. Sin un envoltorio, el navegador no puede preguntar si puede
--      reseñar.
--   2. La reseña guarda el pedido que la justifica, y para encontrarlo hay que
--      cruzar `order_items` con `product_variants`. `product_variants` **no tiene
--      política para `authenticated`** —el catálogo lo lee el storefront con la
--      secret key—, así que ese cruce desde el cliente devuelve cero filas
--      siempre: el formulario diría «no encontramos tu pedido» con el pedido
--      entregado en la base.
--
-- Entonces dos funciones `definer`, con la identidad resuelta adentro por
-- `app.current_customer`, que sale de `auth.uid()`. Lo que el `definer` compra es
-- ver el catálogo; lo que no cambia es quién es el que escribe.
--
-- **El pedido no lo elige el cliente**, y eso es lo que importa: si el id llegara
-- en el payload, habría que validar que sea suyo, que esté entregado y que tenga
-- ese producto. Lo busca la función, así que no hay nada que validar.

create or replace function public.mi_resena(p_store_id uuid, p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'puede', app.compro_y_recibio(p_store_id, p_product_id),
    'yaEscribio', exists (
      select 1 from product_reviews r
      where r.store_id = p_store_id
        and r.product_id = p_product_id
        and r.customer_id = app.current_customer(p_store_id)
    ),
    'pendiente', exists (
      select 1 from product_reviews r
      where r.store_id = p_store_id
        and r.product_id = p_product_id
        and r.customer_id = app.current_customer(p_store_id)
        and r.status = 'pending'
    )
  );
$$;

comment on function public.mi_resena is
  'Si el comprador autenticado puede reseñar ese producto y si ya lo hizo. Para un forastero, todo en false.';

revoke all on function public.mi_resena(uuid, uuid) from public, anon;
grant execute on function public.mi_resena(uuid, uuid) to authenticated;

/*
 * Escribe la reseña del comprador de esta sesión.
 *
 * Elige el pedido entregado **más reciente** con ese producto: es el que la
 * persona tiene fresco, y con dos compras del mismo producto cualquiera de las dos
 * justifica la reseña igual.
 *
 * Los errores son del usuario y hablan como tal: quien no compró no ve este
 * formulario, así que si llega acá es porque algo se armó a mano o porque el
 * pedido cambió de estado mientras escribía.
 */
create or replace function public.escribir_resena(
  p_store_id uuid,
  p_product_id uuid,
  p_rating smallint,
  p_body text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente uuid;
  v_tenant  uuid;
  v_pedido  uuid;
  v_id      uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'La puntuación tiene que ir de 1 a 5';
  end if;

  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    raise exception 'La tienda % no existe', p_store_id;
  end if;

  v_cliente := app.current_customer(p_store_id);
  if v_cliente is null then
    raise exception 'Hay que entrar a la cuenta para poder reseñar';
  end if;

  select o.id into v_pedido
  from orders o
  join order_items i on i.order_id = o.id
  join product_variants v on v.id = i.variant_id
  where o.store_id = p_store_id
    and o.customer_id = v_cliente
    and o.status = 'delivered'
    and v.product_id = p_product_id
  order by o.created_at desc
  limit 1;

  if v_pedido is null then
    raise exception 'Sólo se puede reseñar un producto de un pedido que ya llegó';
  end if;

  insert into product_reviews
    (tenant_id, store_id, product_id, customer_id, order_id, rating, body)
  values
    (v_tenant, p_store_id, p_product_id, v_cliente, v_pedido, p_rating, nullif(btrim(p_body), ''))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.escribir_resena is
  'Escribe la reseña del comprador autenticado, con el pedido que la justifica elegido por la función y no por el cliente.';

revoke all on function public.escribir_resena(uuid, uuid, smallint, text) from public, anon;
grant execute on function public.escribir_resena(uuid, uuid, smallint, text) to authenticated;
