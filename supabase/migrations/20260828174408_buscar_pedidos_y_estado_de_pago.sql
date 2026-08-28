-- Dos cosas que faltaban en la operación de pedidos.

-- ---------------------------------------------------------------------------
-- Buscar «#1028» no encontraba nada
-- ---------------------------------------------------------------------------
--
-- La tabla del Admin muestra el número con almohadilla, así que quien busca el
-- pedido que está mirando escribe `#1028`, y el heno sólo tenía `1028`. Cero
-- resultados, sin ninguna pista de por qué: se lee como «el buscador no anda».
--
-- Alcanza con guardar el número **con** la almohadilla, porque el filtro busca
-- subcadenas: `1028` sigue apareciendo dentro de `#1028`. Los dos funcionan con
-- un solo carácter de cambio.

create or replace function public.admin_orders(
  p_store_id uuid,
  p_query    text    default '',
  p_status   text    default null,
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with base as (
  select
    o.*,
    lower(
      '#' || o.number::text || ' ' ||
      coalesce(o.customer->>'name', '') || ' ' ||
      coalesce(o.customer->>'email', '') || ' ' ||
      coalesce(o.customer->>'phone', '')
    ) as hay
  from orders o
  where o.store_id = p_store_id
    and (p_status is null or o.status = p_status::order_status)
),

filtrados as (
  select b.* from base b
  where p_query = '' or not exists (
    select 1
    from unnest(string_to_array(lower(trim(p_query)), ' ')) t(tok)
    where t.tok <> '' and position(t.tok in b.hay) = 0
  )
),

total as (select count(*)::int as n from filtrados),

pagina as (
  select greatest(1, ceil(t.n::numeric / greatest(1, p_per_page))::int) as page_count, t.n
  from total t
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from pagina pg
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      row_number() over (order by f.created_at desc, f.id) as rn,
      jsonb_strip_nulls(jsonb_build_object(
        'id', f.id,
        'number', f.number,
        'createdAt', f.created_at,
        'customerName', f.customer->>'name',
        'total', jsonb_build_object('amount', f.total_amount, 'currency', f.currency),
        'status', f.status,
        'paymentStatus', f.payment_status,
        'itemCount', (select coalesce(sum(i.quantity), 0)::int from order_items i where i.order_id = f.id)
      )) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * p_per_page from acotada)
    and x.rn <= (select page * p_per_page from acotada)
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', p_per_page,
  'pageCount', (select page_count from acotada)
);
$$;

comment on function public.admin_orders is
  'Listado paginado de pedidos del Admin. Busca por número —con o sin almohadilla—, nombre, correo y teléfono.';

revoke all on function public.admin_orders(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.admin_orders(uuid, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar un pedido como pagado
-- ---------------------------------------------------------------------------
--
-- Con transferencia bancaria, cobrar es una persona mirando un comprobante. El
-- pedido nacía `pending` y no había forma de moverlo: la columna existía desde
-- Fase 5 y ninguna pantalla la tocaba.
--
-- Es una función y no un update directo —que las políticas ya permitirían—
-- porque el cambio tiene que quedar en la timeline. Quién marcó un pedido como
-- pagado y cuándo es exactamente lo que se va a querer saber el día que el
-- dinero no aparezca.
--
-- Invoker, como el resto de las `admin_*`: RLS exige `order.write`.

create or replace function public.admin_set_payment_status(
  p_store_id uuid,
  p_order_id uuid,
  p_status   text,
  p_note     text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_orden record;
  v_nuevo payment_status := p_status::payment_status;
begin
  select * into v_orden from orders where id = p_order_id and store_id = p_store_id;
  if v_orden.id is null then
    raise exception 'El pedido no existe en esta tienda';
  end if;

  if v_orden.payment_status = v_nuevo then
    return order_json(p_order_id);
  end if;

  -- Un pedido cancelado no cambia de estado, y tampoco de estado de pago: si
  -- hubo que devolver plata, eso es un refund, y los refunds están fuera del
  -- core (ADR-008). Marcarlo pagado acá sólo produciría una contabilidad que no
  -- coincide con nada.
  if v_orden.status = 'cancelled' then
    raise exception 'Un pedido cancelado no puede cambiar su estado de pago';
  end if;

  update orders set payment_status = v_nuevo, updated_at = now() where id = p_order_id;

  insert into order_events (tenant_id, order_id, type, data)
  values (
    v_orden.tenant_id, p_order_id, 'payment_changed',
    jsonb_strip_nulls(jsonb_build_object(
      'from', v_orden.payment_status, 'to', v_nuevo, 'note', nullif(p_note, '')
    ))
  );

  return order_json(p_order_id);
end;
$$;

comment on function public.admin_set_payment_status is
  'Marca un pedido como pagado o pendiente y lo registra en la timeline. Un pedido cancelado no cambia.';

revoke all on function public.admin_set_payment_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_set_payment_status(uuid, uuid, text, text) to authenticated;
