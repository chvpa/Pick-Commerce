-- Creación de pedidos y operación desde el Admin.
--
-- Tres funciones con dos caminos de autorización distintos, y la diferencia
-- importa (ADR-052):
--
--   `create_order`  la llama el **storefront** con la secret key, que saltea
--                   RLS. Se concede sólo a `service_role`, y se revoca
--                   explícitamente a `anon` y `authenticated`: sin ese revoke,
--                   `anon` la conservaría por un default privilege de Supabase
--                   (ADR-064) y sería invocable desde cualquier browser.
--
--   `admin_*`       las llama el **Admin** con el JWT del usuario. Son
--                   `security invoker`, o sea que RLS decide: las políticas de
--                   pedidos exigen `order.write`. La función no verifica
--                   permisos por su cuenta, y no debe.

-- ---------------------------------------------------------------------------
-- Serialización de un pedido
-- ---------------------------------------------------------------------------
--
-- Una sola definición de "cómo se ve un pedido" para las tres funciones. Sin
-- esto, la forma que devuelve el checkout y la que devuelve el Admin divergen en
-- cuanto alguien toque una.
--
-- `jsonb_strip_nulls` por ADR-059: un campo opcional llega **ausente**, nunca
-- nulo. TypeScript distingue `undefined` de `null` y el PDP ya se rompió una vez
-- por esto.

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
    'total', jsonb_build_object('amount', o.total_amount, 'currency', o.currency),
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

comment on function public.order_json is
  'Forma canónica de un pedido para el storefront y el Admin. Campos opcionales ausentes, nunca nulos.';

revoke all on function public.order_json(uuid) from public, anon;
grant execute on function public.order_json(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Crear un pedido
-- ---------------------------------------------------------------------------
--
-- Todo lo que puede salir mal comercialmente pasa acá, así que la función hace
-- las cuatro cosas en una sola transacción:
--
--   1. Idempotencia. La misma clave devuelve el mismo pedido, sin crear otro ni
--      descontar stock dos veces.
--   2. Revalidación. Las variantes se resuelven contra **esta** tienda y sólo si
--      el producto está activo. Si algo no da, se devuelven los problemas y no
--      se escribe **nada**.
--   3. Precios de la base. El payload dice qué y cuánto, jamás a qué precio: el
--      precio sale de `product_variants` dentro de esta misma transacción.
--   4. Descuento de stock, registrando de qué sucursal salió cada unidad.
--
-- Sobre el punto 4, que es la decisión discutible: hoy **todo** el stock es
-- propio —no existe ningún adapter de ERP— así que si la creación del pedido no
-- descontara, la revalidación sería teatro: dos personas comprando la última
-- unidad pasarían las dos, siempre. Cuando el stock sea del ERP (Fase 8) esto se
-- revisa por capabilities, que es lo que manda ADR-009: sin `supportsReservations`
-- no se promete cero overselling.
--
-- El payload:
--   { customer: {name, email, phone, taxId?, taxName?},
--     address:  {street, city, reference?},
--     notes?, paymentMethod,
--     lines: [{variantId, quantity}] }
--
-- Devuelve `{order: ...}` o `{error: 'invalid_cart', issues: [...]}`.

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
    customer_id, customer, address, notes, total_amount, currency
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
      'reference', nullif(p_input->'address'->>'reference', '')
    )),
    nullif(p_input->>'notes', ''),
    0, v_currency
  )
  returning id into v_order_id;

  -- 5. Líneas y descuento.
  for v_linea in select * from jsonb_array_elements(v_lineas)
  loop
    select v.id, v.title as variant_title, v.sku, v.price, v.currency,
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
      unit_price, currency, quantity, position, stock_allocation
    ) values (
      v_tenant, v_order_id, v_variante.id,
      v_variante.product_title,
      nullif(v_variante.variant_title, ''),
      v_variante.sku,
      v_variante.price, v_variante.currency,
      (v_linea->>'quantity')::integer, v_pos, v_asignacion
    );

    v_total := v_total + v_variante.price * (v_linea->>'quantity')::integer;
    v_pos := v_pos + 1;
  end loop;

  update orders set total_amount = v_total where id = v_order_id;

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

comment on function public.create_order is
  'Crea un pedido revalidando stock y precios contra la base, descontando inventario e idempotente por clave.';

-- Sólo el storefront, que usa la secret key. El `from public` no alcanza:
-- Supabase concede EXECUTE directamente a `anon` (ADR-064).
revoke all on function public.create_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Listado del Admin
-- ---------------------------------------------------------------------------
--
-- Mismo patrón que `admin_products`: paginado en el servidor, búsqueda por
-- todos los términos, página acotada al rango válido. Un operador busca por
-- número o por nombre del cliente, así que la búsqueda cubre las dos.

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
      o.number::text || ' ' ||
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
  'Listado paginado de pedidos del Admin, con búsqueda por número, nombre, email y teléfono.';

revoke all on function public.admin_orders(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.admin_orders(uuid, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Cambiar el estado
-- ---------------------------------------------------------------------------
--
-- La única regla de transición es que `cancelled` es terminal. El resto se mueve
-- libre a propósito: un operador que marcó "enviado" por error tiene que poder
-- volver atrás, y la timeline deja constancia de los dos movimientos. Una
-- máquina de estados rígida acá sólo produciría pedidos trabados que se
-- destraban editando la base a mano.
--
-- Cancelar devuelve el stock exactamente a donde estaba, usando la asignación
-- que guardó cada línea al crearse.

create or replace function public.admin_set_order_status(
  p_store_id uuid,
  p_order_id uuid,
  p_status   text,
  p_note     text default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_orden    record;
  v_nuevo    order_status := p_status::order_status;
  v_item     record;
  v_parte    jsonb;
begin
  select * into v_orden from orders where id = p_order_id and store_id = p_store_id;
  if v_orden.id is null then
    raise exception 'El pedido no existe en esta tienda';
  end if;

  if v_orden.status = v_nuevo then
    return order_json(p_order_id);
  end if;

  if v_orden.status = 'cancelled' then
    raise exception 'Un pedido cancelado no puede cambiar de estado';
  end if;

  if v_nuevo = 'cancelled' then
    for v_item in select id, variant_id, stock_allocation from order_items where order_id = p_order_id
    loop
      for v_parte in select * from jsonb_array_elements(v_item.stock_allocation)
      loop
        update inventory_levels
        set available = available + (v_parte->>'quantity')::integer, updated_at = now()
        where variant_id = v_item.variant_id
          and location_id = (v_parte->>'locationId')::uuid;
      end loop;
    end loop;
  end if;

  update orders set status = v_nuevo, updated_at = now() where id = p_order_id;

  insert into order_events (tenant_id, order_id, type, data)
  values (
    v_orden.tenant_id, p_order_id, 'status_changed',
    jsonb_strip_nulls(jsonb_build_object(
      'from', v_orden.status, 'to', v_nuevo, 'note', nullif(p_note, '')
    ))
  );

  return order_json(p_order_id);
end;
$$;

comment on function public.admin_set_order_status is
  'Cambia el estado de un pedido y lo registra en la timeline. Cancelar restituye el stock a su sucursal.';

revoke all on function public.admin_set_order_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, uuid, text, text) to authenticated;
