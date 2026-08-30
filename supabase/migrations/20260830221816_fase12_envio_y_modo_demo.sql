-- Fase 12 — el costo de envío y el modo demo.
--
-- Dos cosas que no existían y que el piloto necesita.
--
-- **El envío.** PROJECT.md §13 lo pide entre lo que un pedido debe conservar y
-- `orders` guardaba `total_amount` a secas, así que un comercio que despacha lo
-- cobraba por fuera y el pedido decía que se pagó menos de lo que se pagó. Se
-- calcula **en el servidor**, igual que el descuento: el carrito no manda un
-- importe de envío ni podría, porque sería el número que decide cuánto se cobra
-- elegido por quien paga.
--
-- **El modo demo.** Un pedido de prospecto se crea igual —tiene que verlo entrar
-- al Admin— pero queda marcado y no dispara correos.
--
-- Las tres funciones de abajo son sus definiciones **vigentes** con los cambios
-- mínimos, no reescrituras: `create_order` cambia cinco lugares, `order_json`
-- uno y el trigger dos. Verificado por diff contra las migraciones anteriores.

alter table orders
  -- En la unidad mínima de la moneda, como todo importe. `default 0` y no nulo:
  -- una tienda que no cobra envío tiene envío cero, que es un dato, y no
  -- «desconocido» — que es lo que un nulo diría y lo que obligaría a que cada
  -- lector decidiera qué hacer con él.
  add column if not exists shipping_amount bigint not null default 0,
  add column if not exists is_demo boolean not null default false;

comment on column orders.shipping_amount is
  'Costo de envío cobrado, calculado en el servidor desde store_settings.shipping.';
comment on column orders.is_demo is
  'Pedido hecho en una tienda de demostración. No dispara correos.';

-- Los pedidos de demostración se listan y se borran por acá. Parcial: en una
-- tienda real la condición es falsa en todas las filas y el índice queda vacío.
create index if not exists orders_demo_idx
  on orders (store_id, created_at desc)
  where is_demo;

-- ---------------------------------------------------------------------------
-- El subtotal vuelve a ser el subtotal
-- ---------------------------------------------------------------------------
--
-- `subtotal_amount` es una columna **generada** —`total + descuento`— y esa
-- identidad valía mientras el total era `subtotal − descuento`. Con el envío
-- adentro pasa a valer `subtotal + envío`, así que el pedido informaría un
-- subtotal de productos que incluye el flete: la ficha del pedido no cerraría
-- consigo misma.
--
-- Lo encontró el test, no la lectura del código. Es el riesgo de una columna
-- derivada: nadie tiene que acordarse de actualizarla, y por eso nadie se
-- acuerda de que existe cuando cambia la fórmula de la que depende.
--
-- Se recrea porque Postgres no permite cambiarle la expresión a una columna
-- generada. No se pierde nada: es derivada, y los pedidos anteriores tienen
-- envío cero, así que su valor no se mueve.
alter table orders drop column if exists subtotal_amount;

alter table orders add column subtotal_amount bigint
  generated always as (total_amount + discount_amount - shipping_amount) stored;

comment on column orders.subtotal_amount is
  'Suma de los precios de lista, antes de descuento y sin envío. Derivada: total + descuento - envío.';

-- ---------------------------------------------------------------------------
-- create_order: el envío entra en el total, y la tienda demo se marca
-- ---------------------------------------------------------------------------

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
  v_promos     jsonb;
  v_descuento  bigint := 0;
  v_aplicada   jsonb;
  v_ajustes    jsonb;
  v_envio      bigint := 0;
  v_libre      bigint;
  v_demo       boolean := false;
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

  -- 2 bis. Promociones.
  --
  -- Va después de la revalidación y antes de escribir, para que un carrito
  -- inválido no consuma el tope de uso de ninguna promoción.
  v_promos := cart_promotions(p_store_id, v_lineas, p_input->>'couponCode');
  v_descuento := (v_promos->>'discount')::bigint;

  /*
   * El envío y el modo demo, de una sola lectura de la configuración.
   *
   * El importe se calcula **acá** y no llega en el payload, por el mismo
   * motivo que el descuento: sería el número que decide cuánto se cobra,
   * elegido por quien paga. La cuenta es la misma que hace `calcularEnvio`
   * en el core, que es la que el checkout usa para mostrarlo.
   *
   * El umbral se compara contra el subtotal **ya descontado**, que es la
   * lectura honesta de «compras desde X»: contra el subtotal sin descontar
   * se regalaría el envío por una compra que terminó costando menos.
   *
   * `jsonb_typeof` antes de castear: un `amount` que no sea número haría
   * fallar el pedido entero por un error de configuración, y la caída del
   * lado seguro es no cobrar envío.
   */
  v_ajustes := coalesce(
    (select settings from store_settings where store_id = p_store_id), '{}'::jsonb);

  -- Comparación exacta contra `true`, como `esTiendaDemo`: un `demo: "no"`
  -- guardado por error no puede apagarle los correos a una tienda real.
  --
  -- El `coalesce` no es decorativo: sin la clave, `v_ajustes->'demo'` es NULL y
  -- `NULL = 'true'` da NULL, no falso. La columna es `not null`, así que **todo
  -- pedido de toda tienda sin configurar fallaba**. Lo encontró el test, no la
  -- lectura del código.
  v_demo := coalesce(v_ajustes->'demo' = 'true'::jsonb, false);

  if v_ajustes->'shipping'->>'mode' = 'flat'
     and jsonb_typeof(v_ajustes->'shipping'->'amount') = 'number' then
    v_envio := greatest(0, (v_ajustes->'shipping'->>'amount')::bigint);

    if jsonb_typeof(v_ajustes->'shipping'->'freeFrom') = 'number' then
      v_libre := (v_ajustes->'shipping'->>'freeFrom')::bigint;
      if v_libre > 0 and ((v_promos->>'subtotal')::bigint - v_descuento) >= v_libre then
        v_envio := 0;
      end if;
    end if;
  end if;

  -- El tope de uso se consume con la condición dentro del propio update. Si otro
  -- pedido se llevó la última unidad del cupón entre la consulta y este momento,
  -- se corta: la transacción entera se deshace y el comprador vuelve a cotizar
  -- con el estado real. Preferible a cobrarle un descuento que ya no existe.
  for v_aplicada in select * from jsonb_array_elements(v_promos->'applied')
  loop
    if not app.consume_promotion((v_aplicada->>'promotionId')::uuid) then
      raise exception 'La promoción % se agotó mientras se creaba el pedido',
        v_aplicada->>'title'
        using errcode = 'lock_not_available';
    end if;
  end loop;

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
    customer_id, customer, address, notes, total_amount, currency,
    discount_amount, applied_promotions, shipping_amount, is_demo
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
    0, v_currency,
    v_descuento, coalesce(v_promos->'applied', '[]'::jsonb), v_envio, v_demo
  )
  returning id into v_order_id;

  -- 5. Líneas y descuento de stock.
  --
  -- `order_items.unit_price` guarda el **precio de lista**, que es el «precio
  -- original» que pide PROJECT.md §13. Lo descontado vive aparte, en
  -- `discount_amount` y `applied_promotions`: así el pedido puede mostrar de
  -- dónde salió cada guaraní, como una factura.
  for v_linea in select * from jsonb_array_elements(v_lineas)
  loop
    select v.id, v.title as variant_title, v.sku, v.price, v.cost, v.currency,
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
      unit_price, unit_cost, currency, quantity, position, stock_allocation
    ) values (
      v_tenant, v_order_id, v_variante.id,
      v_variante.product_title,
      nullif(v_variante.variant_title, ''),
      v_variante.sku,
      -- El costo se copia como el precio y por el mismo motivo: el catálogo
      -- cambia, y el pedido tiene que poder decir cuánto se ganó **ese día**.
      -- `null` cuando el comercio no lo tiene cargado; el panel lo declara como
      -- cobertura faltante en vez de suponer cero.
      v_variante.price, v_variante.cost, v_variante.currency,
      (v_linea->>'quantity')::integer, v_pos, v_asignacion
    );

    v_total := v_total + v_variante.price * (v_linea->>'quantity')::integer;
    v_pos := v_pos + 1;
  end loop;

  -- El subtotal se calcula por dos caminos —acá sumando las líneas, y adentro de
  -- `cart_promotions`— y tienen que coincidir. Si divergen hay un bug en uno de
  -- los dos, y cobrar mal en silencio es peor que fallar.
  if v_total <> (v_promos->>'subtotal')::bigint then
    raise exception 'El subtotal del pedido (%) no coincide con el de las promociones (%)',
      v_total, v_promos->>'subtotal';
  end if;

  -- El total que se cobra: productos, menos lo descontado, más el envío.
  update orders set total_amount = v_total - v_descuento + v_envio where id = v_order_id;

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

-- ---------------------------------------------------------------------------
-- order_json: el pedido informa su envío
-- ---------------------------------------------------------------------------
--
-- Lo consumen el storefront, el Admin y el correo de confirmación. Sin esta
-- línea, el envío se cobra y no se muestra en ninguno de los tres.

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

-- ---------------------------------------------------------------------------
-- El trigger de correos: una tienda demo no le escribe a nadie
-- ---------------------------------------------------------------------------

create or replace function app.queue_order_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_evento text;
  v_orden  record;
begin
  if new.type = 'created' then
    v_evento := 'order_received';
  elsif new.type = 'payment_changed' and new.data->>'to' = 'paid' then
    v_evento := 'order_confirmed';
  elsif new.type = 'status_changed' and new.data->>'to' = 'shipped' then
    v_evento := 'order_shipped';
  elsif new.type = 'status_changed' and new.data->>'to' = 'delivered' then
    v_evento := 'order_delivered';
  else
    return new;
  end if;

  select id, tenant_id, store_id, customer, is_demo
    into v_orden from orders where id = new.order_id;
  if v_orden.id is null then
    return new;
  end if;

  -- Un pedido de demostración no le escribe a nadie. El prospecto lo ve
  -- entrar al Admin, que es lo que se le está mostrando, pero la dirección
  -- que escribió en la demo no recibe nada: con un dominio verificado en
  -- Resend, ese correo saldría de verdad.
  if v_orden.is_demo then
    return new;
  end if;

  -- Sin correo no hay a quién escribirle. No es un error: el checkout lo exige,
  -- pero un pedido cargado por otra vía podría no tenerlo.
  if coalesce(v_orden.customer->>'email', '') = '' then
    return new;
  end if;

  insert into notification_outbox (tenant_id, store_id, order_id, event, recipient, payload)
  values (
    v_orden.tenant_id, v_orden.store_id, v_orden.id, v_evento,
    v_orden.customer->>'email',
    jsonb_build_object('order', order_json(v_orden.id))
  );

  return new;
end;
$$;
