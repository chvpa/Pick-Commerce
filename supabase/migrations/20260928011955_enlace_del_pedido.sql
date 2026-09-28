-- El enlace del pedido, para quien compró sin cuenta (ADR-142).
--
-- Quien compra como invitada ve la confirmación una vez: se guarda en el
-- `sessionStorage` de esa pestaña, así que cerrarla, o volver al día siguiente,
-- deja la pantalla vacía. El pedido existe igual, y no había forma de volver a
-- verlo sin crear una cuenta.
--
-- **Por número no se puede**, y no es un olvido: la numeración es secuencial por
-- tienda, así que `/pedido/41` abriría el pedido de otra persona con sólo probar.
-- Entonces cada pedido lleva un **token propio**, y el enlace es número más token.
-- Quien tiene el enlace ve ese pedido y ninguno más.
--
-- El token es texto aleatorio de 64 caracteres hexadecimales —dos uuid v4, 244
-- bits—, generado con `gen_random_uuid()`, que es del núcleo de Postgres: nada
-- de `pgcrypto`, que la suite de aislamiento no tiene. Los pedidos que ya
-- existen reciben el suyo al agregarse la columna: un default volátil se evalúa
-- fila por fila, no una vez para todas.

alter table orders
  add column if not exists access_token text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

comment on column orders.access_token is
  'El secreto del enlace de acuse de un pedido. Quien lo tiene ve ese pedido y ninguno más (ADR-142).';

/*
 * `order_json` gana el token.
 *
 * Todo lo que lo lee ya podía ver el pedido entero: el checkout al crearlo, el
 * comprador con cuenta y el equipo del comercio. Así que el token no le abre
 * nada a nadie que no lo tuviera abierto, y viaja solo a la confirmación y al
 * correo sin un segundo camino.
 *
 * El resto del cuerpo es idéntico al de `20260830221816_fase12_envio_y_modo_demo.sql`.
 */
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
               'quantity', i.quantity
             )) order by i.position)
      from order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  ))
  from orders o
  where o.id = p_order_id
$$;

/*
 * El pedido por su enlace.
 *
 * Lo llama el storefront con la secret key, así que **sólo `service_role`** la
 * puede ejecutar: a `authenticated` no le hace falta —el comprador con cuenta ya
 * ve sus pedidos por RLS— y concedérsela ampliaría la superficie de la suite de
 * aislamiento sin necesidad.
 *
 * Un número que no existe, un token equivocado y un pedido de otra tienda dan
 * **la misma** respuesta, `null`, a propósito: distinguirlos diría si ese número
 * existe.
 */
create or replace function public.order_by_token(
  p_store_id uuid,
  p_number integer,
  p_token text
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select order_json(o.id)
  from orders o
  where o.store_id = p_store_id
    and o.number = p_number
    and o.access_token = p_token
    -- Un token vacío o corto no puede coincidir por accidente con nada.
    and length(coalesce(p_token, '')) = 64;
$$;

comment on function public.order_by_token is
  'El pedido de una tienda por su número y su token de acuse, o null. Para el storefront, con la secret key.';

revoke all on function public.order_by_token(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.order_by_token(uuid, integer, text) to service_role;
