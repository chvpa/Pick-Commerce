/*
 * Cuentas de comprador: dónde vive la identidad de quien compra.
 *
 * Hay **un solo Supabase**, así que hay un solo `auth.users` y lo comparten
 * todos los comercios. La pertenencia a una tienda no puede vivir ahí: va en
 * `customer_accounts`. Es el punto donde el diseño se arruina sin que nada falle
 * en el typecheck, y de ahí sale la regla que ordena todo lo demás:
 *
 *   **Las políticas de comprador nunca usan `app.current_tenants()`.**
 *
 * Esa función lee `memberships` y significa «staff del comercio». Copiar el
 * patrón del Admin acá le daría a un comprador la tienda entera —todos los
 * pedidos, todos los clientes—, y sería un cambio de una línea que pasa
 * cualquier revisión distraída. Ver ADR-121.
 *
 * Consecuencia inmediata del pool compartido: **ningún mensaje de la interfaz
 * puede revelar si un email ya existe**. Con un `auth.users` común, eso es
 * enumeración de clientes entre comercios.
 */

-- ---------------------------------------------------------------------------
-- La cuenta
-- ---------------------------------------------------------------------------

create table customer_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,
  customer_id uuid not null,

  created_at  timestamptz not null default now(),

  -- Una persona, una cuenta por tienda. Y un cliente, una cuenta: sin el
  -- segundo `unique`, dos usuarios podrían colgarse del mismo `customers` y
  -- verse los pedidos.
  unique (store_id, user_id),
  unique (store_id, customer_id),

  -- Las dos foráneas son compuestas con `tenant_id`, como todo el resto del
  -- esquema: es lo que hace imposible apuntar a una tienda o a un cliente de
  -- otra organización (ADR-063).
  constraint customer_accounts_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint customer_accounts_customer_id_fkey
    foreign key (customer_id, tenant_id) references customers (id, tenant_id) on delete cascade
);

comment on table customer_accounts is
  'Vínculo entre un usuario de auth.users y su ficha de cliente en una tienda. auth.users es del proyecto entero; esto es por tienda.';

create index customer_accounts_user_idx on customer_accounts (user_id);

alter table customer_accounts enable row level security;

-- ---------------------------------------------------------------------------
-- Quién es el comprador de esta sesión
-- ---------------------------------------------------------------------------

/*
 * La gemela de `app.current_tenants()` para el otro lado del mostrador.
 *
 * `security definer` por el mismo motivo que aquella: sin eso, leer
 * `customer_accounts` desde una política de `customer_accounts` recurre.
 */
create or replace function app.current_customer(p_store uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ca.customer_id
  from customer_accounts ca
  where ca.user_id = auth.uid() and ca.store_id = p_store
$$;

comment on function app.current_customer is
  'La ficha de cliente del usuario autenticado en esa tienda, o null. Nunca confundir con app.current_tenants, que es el staff.';

/*
 * Si un pedido es de quien está mirando.
 *
 * `order_items` y `order_events` **no tienen `store_id`**: cuelgan del pedido.
 * Sin esta función sus políticas tendrían que subconsultar `orders`, que tiene
 * RLS, y evaluar las políticas de `orders` por cada fila de ítem. Acá el salto
 * se hace una sola vez, con el índice de `orders.customer_id`.
 */
create or replace function app.es_mi_pedido(p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from orders o
    join customer_accounts ca
      on ca.store_id = o.store_id and ca.customer_id = o.customer_id
    where o.id = p_order and ca.user_id = auth.uid()
  )
$$;

comment on function app.es_mi_pedido is
  'Si el pedido pertenece a la cuenta de comprador del usuario autenticado.';

-- ---------------------------------------------------------------------------
-- Las políticas del comprador
-- ---------------------------------------------------------------------------

/*
 * Se **suman** a las del staff, no las reemplazan: en Postgres dos políticas
 * `for select` sobre la misma tabla se combinan con OR. El comercio sigue
 * viendo sus pedidos por `app.current_tenants()` y el comprador ve los suyos
 * por acá.
 *
 * Sólo lectura. Un comprador no escribe pedidos: los crea `create_order`, que
 * corre con la secret key y no pasa por RLS.
 */
create policy customer_accounts_propia on customer_accounts
  for select to authenticated
  using (user_id = auth.uid());

create policy orders_lectura_comprador on orders
  for select to authenticated
  using (customer_id is not null and customer_id = app.current_customer(store_id));

create policy order_items_lectura_comprador on order_items
  for select to authenticated
  using (app.es_mi_pedido(order_id));

create policy order_events_lectura_comprador on order_events
  for select to authenticated
  using (app.es_mi_pedido(order_id));

-- ---------------------------------------------------------------------------
-- Las direcciones guardadas
-- ---------------------------------------------------------------------------

/*
 * La fricción real de volver a comprar es tipear el departamento otra vez. La
 * forma del `address` es la misma que ya consume el envío por zona, porque
 * `create_order` lee `address.zone` (ADR-114): si fueran dos formas distintas,
 * elegir una dirección guardada no sabría calcular el envío.
 *
 * **El pedido sigue guardando su propio snapshot.** Cambiar una dirección acá no
 * puede reescribir a dónde se despachó un pedido de hace tres meses
 * (PROJECT.md §13).
 */
create table customer_addresses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,
  customer_id uuid not null,

  label       text,
  address     jsonb not null,
  is_default  boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint customer_addresses_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint customer_addresses_customer_id_fkey
    foreign key (customer_id, tenant_id) references customers (id, tenant_id) on delete cascade
);

comment on table customer_addresses is
  'Direcciones guardadas por cuenta. Misma forma que `orders.address`, que conserva su snapshot.';

create index customer_addresses_customer_idx on customer_addresses (customer_id);

alter table customer_addresses enable row level security;

/*
 * Acá sí escribe el comprador, y por eso la comprobación va en el `with check`
 * además del `using`: sin él, se podría insertar una dirección colgada de la
 * cuenta de otro.
 */
create policy customer_addresses_propias on customer_addresses
  for all to authenticated
  using (customer_id = app.current_customer(store_id))
  with check (customer_id = app.current_customer(store_id));

-- ---------------------------------------------------------------------------
-- El listado de «mis pedidos»
-- ---------------------------------------------------------------------------

/*
 * `order_json` ya sirve **un** pedido, y sirve «mi pedido» sin escribir nada
 * nuevo: es `language sql stable` y security invoker, así que lo filtra RLS con
 * las políticas de arriba. Lo que no hay es el listado, y un listado va
 * paginado y con techo como todos los del repo.
 *
 * `security invoker` a propósito: la defensa es RLS, no una comprobación escrita
 * a mano adentro. Es lo contrario de las funciones del Admin, y la diferencia
 * está en que acá sí hay un usuario con identidad real detrás (ADR-121).
 *
 * **Nunca búsqueda por `order_number`.** La numeración es secuencial por
 * comercio: un parámetro de búsqueda por número sería un enumerador de pedidos
 * ajenos con RLS como única red.
 *
 * El corte de página va **antes** de armar el documento. Con los pedidos de una
 * persona da igual, pero es el patrón que el catálogo aprendió a los golpes
 * (ADR-106) y no hay motivo para escribir el otro.
 */
create or replace function public.customer_orders(
  p_store_id uuid,
  p_page     integer default 1,
  p_per_page integer default 10
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with acotado as (
  select least(greatest(coalesce(p_per_page, 10), 1), 50) as per_page
),

mios as (
  select o.id, o.number, o.created_at, o.status, o.payment_status,
         o.total_amount, o.currency
  from orders o
  where o.store_id = p_store_id and o.customer_id is not null
),

total as (select count(*)::int as n from mios),

pagina as (
  select t.n,
         greatest(1, ceil(t.n::numeric / (select per_page from acotado))::int) as page_count
  from total t
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from pagina pg
),

recortados as (
  select m.*
  from mios m
  order by m.created_at desc, m.id
  offset ((select page from acotada) - 1) * (select per_page from acotado)
  limit (select per_page from acotado)
),

items as (
  select jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'number', r.number,
      'createdAt', r.created_at,
      'status', r.status,
      'paymentStatus', r.payment_status,
      'total', jsonb_build_object('amount', r.total_amount, 'currency', r.currency),
      'itemCount', (select coalesce(sum(i.quantity), 0)::int from order_items i where i.order_id = r.id)
    ) order by r.created_at desc, r.id
  ) as docs
  from recortados r
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', (select per_page from acotado),
  'pageCount', (select page_count from acotada)
);
$$;

comment on function public.customer_orders is
  'Los pedidos del comprador autenticado en una tienda, paginados. Security invoker: lo acota RLS.';

-- ---------------------------------------------------------------------------
-- La cola de correos acepta lo que no es un pedido
-- ---------------------------------------------------------------------------

/*
 * El código de acceso del comprador sale por esta cola, con el `EMAIL_FROM` de
 * su tienda, porque un correo al comprador tiene que salir del comercio
 * (ADR-123). Y un código de acceso no tiene pedido.
 *
 * La clave foránea es compuesta —`(order_id, tenant_id)`— y con `match simple`
 * un nulo en cualquiera de las dos columnas la deja sin comprobar, así que no
 * hay que tocarla.
 *
 * Lo que sí se pierde: las filas sin pedido **no** se van en cascada al borrar
 * un pedido. Es correcto —no cuelgan de ninguno— y hay que tenerlo en cuenta al
 * limpiar datos de prueba.
 */
alter table notification_outbox alter column order_id drop not null;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke all on function app.current_customer(uuid) from public, anon;
revoke all on function app.es_mi_pedido(uuid) from public, anon;
revoke all on function public.customer_orders(uuid, integer, integer) from public, anon;

grant execute on function app.current_customer(uuid) to authenticated;
grant execute on function app.es_mi_pedido(uuid) to authenticated;
grant execute on function public.customer_orders(uuid, integer, integer) to authenticated, service_role;

grant select on customer_accounts to authenticated;
grant select, insert, update, delete on customer_addresses to authenticated;
