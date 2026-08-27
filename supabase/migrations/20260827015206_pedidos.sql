-- Clientes y pedidos.
--
-- Pick Commerce vende y orquesta pedidos; no factura, no emite notas de crédito
-- y no procesa reembolsos (ADR-007, ADR-008, PROJECT.md §13). Este schema
-- modela lo que la Fase 5 necesita para convertir un carrito en un pedido, y
-- nada más.
--
-- Las claves foráneas llevan el tenant desde el primer día, por ADR-063: un
-- pedido no puede referenciar la variante de otro comercio, y no depende de que
-- alguien se acuerde de filtrar.

-- ---------------------------------------------------------------------------
-- Estados
-- ---------------------------------------------------------------------------

-- Los operativos de PROJECT.md §13, en inglés como `product_status`: los
-- identificadores van en inglés y las etiquetas en español las pone el core.
create type order_status as enum (
  'received', 'confirmed', 'preparing', 'ready',
  'shipped', 'in_transit', 'delivered', 'cancelled'
);

-- Mínimo alcanzable en Fase 5: sin pasarela, un pedido nace pendiente y se marca
-- pagado a mano cuando llega la transferencia. `refunded` y `failed` se agregan
-- con `alter type` cuando Fase 7 traiga el gateway; declararlos ahora sería
-- prometer estados que nada puede alcanzar.
create type payment_status as enum ('pending', 'paid');

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
--
-- Mínimo y por tienda. El checkout es un evento legítimo de identificación
-- (PROJECT.md §23), así que un guest checkout crea o actualiza su cliente por
-- email. No hay login de comprador en esta fase: `customers` no se une a
-- `auth.users`.
--
-- Los datos fiscales son de Paraguay y opcionales: un consumidor final no da
-- RUC. Van acá y **también** copiados en el pedido, porque el pedido conserva lo
-- que el cliente declaró ese día.

create table customers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizations (id) on delete cascade,
  store_id   uuid not null,
  email      text not null,
  name       text not null,
  phone      text not null,
  tax_id     text,
  tax_name   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, email),
  unique (id, tenant_id),
  constraint customers_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table customers is
  'Clientes por tienda, identificados por email. Sin login: el checkout es guest.';

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------

create table orders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references organizations (id) on delete cascade,
  store_id        uuid not null,

  -- Número legible por comercio, para que el cliente y el operador hablen del
  -- mismo pedido. No es el id: un uuid no se dicta por teléfono.
  number          integer not null,

  -- La clave del intento de compra, no del click. La genera el checkout al
  -- montarse y la conserva entre reintentos: un `unique` acá es lo que impide
  -- el pedido doble. Ver ADR-065.
  idempotency_key uuid not null,

  status          order_status   not null default 'received',

  -- Declarativo y no enum (ADR-021): los medios habilitados salen de la
  -- configuración de la tienda, y agregar uno no puede exigir una migración.
  payment_method  text           not null,
  payment_status  payment_status not null default 'pending',

  -- Referencia blanda: si el cliente se borra, el pedido sobrevive. Lo que el
  -- pedido necesita saber del cliente ya está copiado abajo.
  customer_id     uuid,

  -- Snapshot de lo que el cliente escribió. El pedido conserva eso y no lo que
  -- el cliente sea hoy (PROJECT.md §13): cambiar un teléfono no reescribe la
  -- dirección a la que se despachó un pedido de hace tres meses.
  customer        jsonb not null,
  address         jsonb not null,

  notes           text,

  -- Minor units, como todo el dinero del sistema.
  total_amount    bigint not null,
  currency        text   not null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (store_id, number),
  unique (store_id, idempotency_key),
  unique (id, tenant_id),
  constraint orders_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint orders_customer_id_fkey
    foreign key (customer_id, tenant_id) references customers (id, tenant_id)
    on delete set null (customer_id)
);

-- El listado del Admin es siempre "los últimos primero".
create index orders_listado_idx on orders (store_id, created_at desc, id);

comment on table orders is
  'Pedidos. `customer` y `address` son snapshots inmutables de lo declarado al comprar.';

-- ---------------------------------------------------------------------------
-- Líneas
-- ---------------------------------------------------------------------------
--
-- Todo lo que se muestra está copiado. Un pedido no vuelve al catálogo a
-- averiguar cuánto costaba: el precio de ese día es un hecho, y el producto
-- puede haber cambiado de precio, de título o haber sido archivado.

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations (id) on delete cascade,
  order_id      uuid not null,

  -- Blanda a propósito: un producto se archiva, nunca se borra (ADR-060), pero
  -- si alguna vez desaparece el pedido tiene que seguir contando su historia.
  variant_id    uuid,

  title         text not null,
  variant_title text,
  sku           text not null,
  unit_price    bigint not null,
  currency      text not null,
  quantity      integer not null check (quantity > 0),
  position      integer not null,

  -- De qué sucursal salió cada unidad: `[{"locationId": "...", "quantity": 2}]`.
  -- Sin esto, cancelar un pedido tendría que adivinar dónde devolver el stock, y
  -- con más de una sucursal adivinaría mal.
  stock_allocation jsonb not null default '[]'::jsonb,

  constraint order_items_order_id_fkey
    foreign key (order_id, tenant_id) references orders (id, tenant_id) on delete cascade,
  constraint order_items_variant_id_fkey
    foreign key (variant_id, tenant_id) references product_variants (id, tenant_id)
    on delete set null (variant_id)
);

create index order_items_order_idx on order_items (order_id, position);

-- ---------------------------------------------------------------------------
-- Timeline
-- ---------------------------------------------------------------------------
--
-- Append-only por convención: no hay política de update ni de delete, así que
-- ni siquiera un owner puede reescribir la historia de un pedido desde la app.
-- Mismo criterio que `audit_log`.

create table order_events (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizations (id) on delete cascade,
  order_id   uuid not null,
  type       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint order_events_order_id_fkey
    foreign key (order_id, tenant_id) references orders (id, tenant_id) on delete cascade
);

create index order_events_order_idx on order_events (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Numeración
-- ---------------------------------------------------------------------------
--
-- Tabla propia y no una columna en `stores`: la migración queda puramente
-- aditiva y revertirla es un `drop`, sin tocar nada de las fases anteriores.
--
-- Una secuencia de Postgres sería más rápida pero deja huecos —consume el
-- número aunque la transacción falle—, y un pedido que no existe entre el 1004 y
-- el 1006 es una llamada del comercio preguntando qué pasó. Acá el número se
-- consume dentro de la misma transacción que crea el pedido: si el pedido se
-- cae, el número vuelve.
--
-- El costo es que dos checkouts simultáneos de la misma tienda se serializan en
-- esta fila. A la escala de un comercio no se nota; si algún día se nota, la
-- salida es una secuencia por tienda y aceptar los huecos.

create table order_counters (
  store_id    uuid primary key,
  tenant_id   uuid not null references organizations (id) on delete cascade,
  -- El último número usado, no el próximo: así el upsert que lo incrementa
  -- devuelve directamente el número del pedido que se está creando.
  last_number integer not null,
  constraint order_counters_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table order_counters is
  'Último número de pedido usado por tienda. Se consume dentro de la transacción del pedido, así que no deja huecos.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- El patrón del repo: leer exige membresía, escribir exige el permiso. El
-- permiso `order.write` ya existía en `role_permissions` desde la Fase 3 —owner,
-- admin y staff— esperando exactamente estas tablas.
--
-- Ojo con lo que esto **no** cubre: el storefront escribe con la secret key, que
-- saltea RLS por completo. Ahí la capa es otra y está en `create_order`. Ver
-- ADR-052.

alter table customers      enable row level security;
alter table orders         enable row level security;
alter table order_items    enable row level security;
alter table order_events   enable row level security;
alter table order_counters enable row level security;

create policy customers_lectura on customers
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy customers_escritura on customers
  for all to authenticated
  using (app.has_permission(tenant_id, 'order.write'))
  with check (app.has_permission(tenant_id, 'order.write'));

create policy orders_lectura on orders
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy orders_escritura on orders
  for all to authenticated
  using (app.has_permission(tenant_id, 'order.write'))
  with check (app.has_permission(tenant_id, 'order.write'));

create policy order_items_lectura on order_items
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy order_items_escritura on order_items
  for all to authenticated
  using (app.has_permission(tenant_id, 'order.write'))
  with check (app.has_permission(tenant_id, 'order.write'));

create policy order_events_lectura on order_events
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

-- La timeline se lee y se agrega, nunca se edita ni se borra: un historial que
-- el actor puede reescribir no sirve como historial.
create policy order_events_insercion on order_events
  for insert to authenticated
  with check (app.has_permission(tenant_id, 'order.write'));

create policy order_counters_lectura on order_counters
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on customers, orders, order_items to authenticated;
grant select, insert on order_events to authenticated;
-- El contador lo maneja `create_order`; el Admin no lo toca.
grant select on order_counters to authenticated;

-- `anon` es el rol del browser. Ninguna de estas tablas le corresponde: el
-- checkout escribe desde el servidor.
revoke all on customers, orders, order_items, order_events, order_counters from anon;
