/*
 * El sustrato de preferencias: dónde queda lo que hace un visitante.
 *
 * El problema que resuelve es de tiempo, no de features: hoy lo único que ata
 * una visita a la siguiente es `pick_sid`, una cookie de media hora deslizante,
 * así que **el techo de lo que el sitio puede recordar son treinta minutos**.
 * Cada sesión que pasa sin quedar atada a nada es una sesión de la que nunca se
 * va a poder aprender, y ese dato no se recupera después.
 *
 * Tres piezas, y la tercera es la que hace valer a las otras dos:
 *
 *   wishlist_items      lo que alguien guardó a propósito
 *   session_identities  qué sesión anónima resultó ser qué persona
 *   un índice           para poder leer lo que hizo una sesión sin un scan
 *
 * `session_identities` es la tabla que `store_events` dejó prometida en su
 * propio comentario —«se asocia a una persona sólo si algún día hay un evento de
 * identificación legítimo, y eso es otra tabla»— y que PROJECT.md §23 exige
 * separada del log anónimo. Separada de verdad: el log no gana una columna de
 * cliente, y quien quiera cruzar los dos tiene que hacerlo a propósito.
 */

-- ---------------------------------------------------------------------------
-- Lo que alguien guardó
-- ---------------------------------------------------------------------------

/*
 * Por producto y no por variante, y no es una simplificación: el corazón vive
 * en la tarjeta del catálogo, que no elige talle. Guardar una variante obligaría
 * a elegir uno para poder guardar, que es exactamente la fricción que hace que
 * nadie use una wishlist.
 */
create table wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,
  customer_id uuid not null,
  product_id  uuid not null,

  created_at  timestamptz not null default now(),

  /*
   * **El `unique` es lo que hace la fusión idempotente por construcción.**
   * Sin sesión la wishlist vive en `localStorage` y al entrar se vuelca acá con
   * un `on conflict do nothing`: volcar dos veces, o volcar algo que ya estaba,
   * no duplica nada y no hace falta escribir la lógica de «¿ya lo tenía?».
   */
  unique (store_id, customer_id, product_id),

  -- Compuestas con `tenant_id`, como todo el esquema: es lo que hace imposible
  -- guardar el producto de un comercio en la cuenta de otro (ADR-063).
  constraint wishlist_items_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint wishlist_items_customer_id_fkey
    foreign key (customer_id, tenant_id) references customers (id, tenant_id) on delete cascade,
  constraint wishlist_items_product_id_fkey
    foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade
);

comment on table wishlist_items is
  'Productos guardados por cuenta. Por producto y no por variante: el corazón vive en la tarjeta, que no elige talle.';

-- Para leer «la wishlist de esta persona», que es la única consulta que existe.
create index wishlist_items_cuenta_idx on wishlist_items (store_id, customer_id, created_at desc);

alter table wishlist_items enable row level security;

/*
 * El comprador escribe acá, así que la comprobación va en el `with check`
 * además del `using`: sin él se podría guardar un producto colgado de la cuenta
 * de otro. Es el mismo par que `customer_addresses`, y por el mismo motivo.
 *
 * **Nunca `app.current_tenants()`**: esa función significa «staff del comercio»
 * y acá el dueño de la fila es un comprador (ADR-121).
 */
create policy wishlist_items_propios on wishlist_items
  for all to authenticated
  using (customer_id = app.current_customer(store_id))
  with check (customer_id = app.current_customer(store_id));

-- ---------------------------------------------------------------------------
-- Qué sesión resultó ser qué persona
-- ---------------------------------------------------------------------------

/*
 * El vínculo que `store_events` no tiene y no va a tener.
 *
 * La clave primaria es `(store_id, session_id)` y no incluye al cliente: **una
 * sesión es de una persona**. Si dos personas usan el mismo navegador y las dos
 * entran, la última gana —el upsert pisa—, que es lo correcto: lo que ese
 * dispositivo haga de ahí en adelante es de quien está usándolo ahora.
 *
 * Al revés no: una persona tiene tantas sesiones como dispositivos y visitas, y
 * juntarlas es justamente para lo que existe esta tabla.
 *
 * **Sin políticas, a propósito.** Como `notification_outbox`: la escribe y la
 * lee la secret key del storefront, que es quien resuelve «qué vio esta
 * persona». Dársela al Admin sería darle a un operador el mapa de qué miró cada
 * cliente, y eso es una decisión de producto que todavía no se tomó — cuando se
 * tome, se agrega la política y se dice en el texto de privacidad, en ese orden.
 */
create table session_identities (
  session_id  uuid not null,
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,
  customer_id uuid not null,

  linked_at   timestamptz not null default now(),

  primary key (store_id, session_id),

  constraint session_identities_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint session_identities_customer_id_fkey
    foreign key (customer_id, tenant_id) references customers (id, tenant_id) on delete cascade
);

comment on table session_identities is
  'Qué sesión anónima resultó ser qué cliente. Separada de store_events a propósito: el log no lleva identidad (PROJECT.md §23).';

-- Para el camino que importa: «todas las sesiones de esta persona», que es lo
-- que convierte media hora de memoria en todo su historial.
create index session_identities_cliente_idx on session_identities (store_id, customer_id);

alter table session_identities enable row level security;

-- ---------------------------------------------------------------------------
-- Poder leer lo que hizo una sesión
-- ---------------------------------------------------------------------------

/*
 * Los dos índices que había son `(store_id, occurred_at desc)` y
 * `(store_id, type, occurred_at desc)`: los dos del panel, que consulta por
 * período. Ninguno sirve para «los `product_view` de esta sesión», que es la
 * consulta de «vistos recientemente» y la que van a hacer las preferencias.
 *
 * Sin él eso es un scan sobre la tabla que más crece del esquema, **en la
 * portada y en la PLP**. Es exactamente el patrón que produjo los 2,3 segundos
 * del catálogo con 5000 productos: no se nota con pocas filas y aparece cuando
 * ya es caro arreglarlo.
 *
 * `type` va en el medio porque la consulta filtra por él —`product_view`— y
 * ordena por fecha.
 */
create index store_events_sesion_idx
  on store_events (store_id, session_id, type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

grant select, insert, delete on wishlist_items to authenticated;
revoke all on wishlist_items from anon;
revoke all on session_identities from public, anon, authenticated;
