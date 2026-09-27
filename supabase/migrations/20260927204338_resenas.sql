-- Reseñas de producto, verificadas contra la compra (ADR-140).
--
-- La Fase 8 de v2 las necesita como dependencia de la fidelidad —una reseña es
-- una de las dos formas de ganar puntos— pero no son una pieza del programa: son
-- lo que hace que un producto sin descripción tenga algo escrito, y lo único del
-- catálogo que el comercio no escribe.
--
-- Cuatro reglas, y ninguna es cosmética:
--
--   1. **Sólo reseña quien compró y recibió.** Se comprueba contra `order_items`
--      con el pedido en `delivered`: no hay forma de opinar de algo que no llegó.
--      Eso es lo que hace que la estrella valga y es lo que una tienda no puede
--      fingir sin fabricar pedidos.
--   2. **Una por persona y por producto.** Sin el único, diez reseñas de la misma
--      cuenta suben un promedio sin que nadie mienta.
--   3. **Nace pendiente.** Texto de un tercero en la vitrina de otro sin que nadie
--      lo lea es un riesgo que no se le pide a un comercio; publicarla es una
--      acción del Admin. La contra es real y está aceptada: sin moderación, las
--      reseñas no aparecen.
--   4. **La estrella no se toca nunca.** Ni el Admin ni nadie edita `rating` ni
--      `body`: se publica o se rechaza. Poder corregir una reseña es poder
--      escribirla, y entonces deja de ser una reseña.

-- ---------------------------------------------------------------------------
-- El estado
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'review_status') then
    create type review_status as enum ('pending', 'published', 'rejected');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- La tabla
-- ---------------------------------------------------------------------------

create table if not exists product_reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,
  product_id  uuid not null,
  -- La ficha de cliente, como en la wishlist: la identidad de compra de esa
  -- tienda, no el usuario de `auth.users`, que es del proyecto entero.
  customer_id uuid not null,
  -- La prueba. Si el pedido se borra, la reseña se va con él: sin prueba no es
  -- una reseña verificada, y dejarla huérfana sería sostener una estrella que ya
  -- no se puede justificar.
  order_id    uuid not null references orders (id) on delete cascade,

  rating      smallint not null check (rating between 1 and 5),
  -- Opcional: una estrella sola es una reseña válida y pedir texto baja mucho
  -- cuántas se escriben. El tope existe para que el campo no sea un blog.
  body        text check (body is null or char_length(btrim(body)) between 1 and 1000),

  status      review_status not null default 'pending',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (store_id, customer_id, product_id),

  -- Compuestas con `tenant_id`, como todo el esquema: es lo que hace imposible
  -- apuntar a un producto o a un cliente de otra organización (ADR-063).
  constraint product_reviews_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint product_reviews_product_id_fkey
    foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade,
  constraint product_reviews_customer_id_fkey
    foreign key (customer_id, tenant_id) references customers (id, tenant_id) on delete cascade
);

comment on table product_reviews is
  'Reseñas de producto escritas por quien compró y recibió. Nacen pendientes; el Admin publica o rechaza, y nunca edita el texto ni la estrella.';

-- El PDP pide las publicadas de un producto, y es la consulta caliente.
create index if not exists product_reviews_producto_idx
  on product_reviews (product_id, status, created_at desc);

create index if not exists product_reviews_tienda_idx
  on product_reviews (store_id, status, created_at desc);

alter table product_reviews enable row level security;

-- ---------------------------------------------------------------------------
-- Quién puede reseñar qué
-- ---------------------------------------------------------------------------

/*
 * Si el comprador de esta sesión compró ese producto y ya lo recibió.
 *
 * `security definer` por la asimetría que ADR-121 y la corrección de la wishlist
 * ya documentaron: `order_items` tiene política de comprador, pero
 * `product_variants` **no** —el catálogo lo lee el storefront con la secret key—,
 * así que la unión daría cero filas siempre y nadie podría reseñar nada, sin un
 * error en ningún lado.
 *
 * La identidad la sigue decidiendo la sesión: `app.current_customer` resuelve
 * `auth.uid()`. Lo único que el `definer` compra es poder mirar el catálogo.
 */
create or replace function app.compro_y_recibio(p_store_id uuid, p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from orders o
    join order_items i on i.order_id = o.id
    join product_variants v on v.id = i.variant_id
    where o.store_id = p_store_id
      and o.customer_id = app.current_customer(p_store_id)
      and o.status = 'delivered'
      and v.product_id = p_product_id
  );
$$;

comment on function app.compro_y_recibio is
  'Si el comprador autenticado tiene un pedido entregado con ese producto. Es la condición para poder reseñarlo.';

revoke all on function app.compro_y_recibio(uuid, uuid) from public, anon;
grant execute on function app.compro_y_recibio(uuid, uuid) to authenticated;

/*
 * El comprador escribe la suya y la lee, publicada o no: tiene que poder ver que
 * quedó registrada aunque todavía nadie la haya mirado. Lo que no puede es
 * cambiarle el estado ni pisar la de otro.
 *
 * `insert` y `select`, sin `update` ni `delete`: una reseña que se puede editar
 * después de publicada es una reseña que dice otra cosa que la que se aprobó.
 */
create policy product_reviews_propia on product_reviews
  for select to authenticated
  using (customer_id = app.current_customer(store_id));

create policy product_reviews_escribe_quien_compro on product_reviews
  for insert to authenticated
  with check (
    customer_id = app.current_customer(store_id)
    and app.compro_y_recibio(store_id, product_id)
    -- El estado no lo elige quien escribe: entra pendiente y punto.
    and status = 'pending'
  );

/*
 * El equipo del comercio ve todas las de sus tiendas y sólo puede cambiar el
 * estado. `catalog.write` y no un permiso nuevo: moderar es curar el catálogo, y
 * hoy ningún rol distingue las dos cosas.
 *
 * Que no se pueda editar el texto no lo dice esta política —Postgres no tiene
 * permisos por columna en RLS— sino la función que el Admin llama, que es la
 * única forma que tiene de escribir: `update` directo no está concedido.
 */
create policy product_reviews_lectura_del_equipo on product_reviews
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

-- ---------------------------------------------------------------------------
-- Lo que lee la vitrina
-- ---------------------------------------------------------------------------

/*
 * Las reseñas publicadas de un producto, con su promedio.
 *
 * La llama el storefront con la secret key, que saltea RLS, así que es `invoker`:
 * un autenticado que la llamara recibiría sólo lo que sus políticas le permiten.
 * El nombre de quien escribió **no sale**: la reseña muestra la inicial y nada
 * más. Publicar el nombre completo de un comprador en una página pública no es
 * algo que nadie haya aceptado al comprar.
 */
create or replace function public.product_reviews_publicas(
  p_store_id uuid,
  p_product_id uuid,
  p_limite integer default 20
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with publicadas as (
    select r.id, r.rating, r.body, r.created_at,
           -- La inicial del nombre del cliente, o nada. `left` sobre un nombre
           -- vacío devuelve '', que es lo mismo que no decir nadie.
           upper(left(coalesce(c.name, ''), 1)) as inicial
    from product_reviews r
    left join customers c on c.id = r.customer_id
    where r.store_id = p_store_id
      and r.product_id = p_product_id
      and r.status = 'published'
    order by r.created_at desc
    limit least(greatest(coalesce(p_limite, 20), 1), 100)
  )
  select jsonb_build_object(
    'total', (
      select count(*)::int from product_reviews r
      where r.store_id = p_store_id and r.product_id = p_product_id and r.status = 'published'
    ),
    -- Redondeado a una decimal: es la precisión que se muestra, y devolver
    -- 4.333333 invita a que cada pantalla redondee distinto.
    'promedio', (
      select round(avg(r.rating)::numeric, 1)
      from product_reviews r
      where r.store_id = p_store_id and r.product_id = p_product_id and r.status = 'published'
    ),
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'rating', p.rating,
            'body', p.body,
            'inicial', nullif(p.inicial, ''),
            'fecha', p.created_at
          ) order by p.created_at desc
        )
        from publicadas p
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function public.product_reviews_publicas is
  'Las reseñas publicadas de un producto con su promedio y su total. Devuelve la inicial de quien escribió, nunca el nombre.';

revoke all on function public.product_reviews_publicas(uuid, uuid, integer) from public, anon;
grant execute on function public.product_reviews_publicas(uuid, uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lo que usa el Admin para moderar
-- ---------------------------------------------------------------------------

/*
 * La cola de moderación, paginada como todo listado que puede crecer (ADR-024).
 *
 * `security definer` por lo mismo que la de la vitrina al revés: entra a
 * `products` y a `customers` cruzando con una tabla que sí tiene política, y el
 * Admin la llama con la publishable key. El filtro de identidad va escrito acá:
 * la tienda tiene que ser de una organización donde quien llama tiene membresía.
 */
create or replace function public.admin_product_reviews(
  p_store_id uuid,
  p_status text default null,
  p_page integer default 1,
  p_per_page integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with permitido as (
    select s.id, s.tenant_id
    from stores s
    where s.id = p_store_id and s.tenant_id in (select app.current_tenants())
  ),
  filtradas as (
    select r.*
    from product_reviews r
    join permitido pe on pe.id = r.store_id
    where p_status is null or r.status = p_status::review_status
  ),
  total as (select count(*)::int as n from filtradas),
  acotada as (
    select least(greatest(1, coalesce(p_page, 1)), greatest(1, ceil(t.n::numeric / p_per_page)::int)) as page,
           greatest(1, ceil(t.n::numeric / p_per_page)::int) as page_count,
           t.n
    from total t
  ),
  items as (
    select jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'productId', f.product_id,
        'producto', p.title,
        'handle', p.handle,
        'rating', f.rating,
        'body', f.body,
        'status', f.status,
        'cliente', c.name,
        'fecha', f.created_at
      ) order by f.created_at desc
    ) as docs
    from (
      select f.*, row_number() over (order by f.created_at desc, f.id) as rn
      from filtradas f
    ) f
    join products p on p.id = f.product_id
    left join customers c on c.id = f.customer_id
    where f.rn > (select (page - 1) * p_per_page from acotada)
      and f.rn <= (select page * p_per_page from acotada)
  )
  select jsonb_build_object(
    'items', coalesce((select docs from items), '[]'::jsonb),
    'total', (select n from acotada),
    'page', (select page from acotada),
    'perPage', p_per_page,
    'pageCount', (select page_count from acotada),
    'pendientes', (
      select count(*)::int from product_reviews r
      join permitido pe on pe.id = r.store_id
      where r.status = 'pending'
    )
  );
$$;

comment on function public.admin_product_reviews is
  'La cola de reseñas del Admin, paginada, con el recuento de pendientes.';

revoke all on function public.admin_product_reviews(uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_product_reviews(uuid, text, integer, integer) to authenticated;

/*
 * Publicar o rechazar. **Es lo único que el Admin puede escribir de una reseña.**
 *
 * No hay `update` concedido sobre la tabla, así que el texto y la estrella no se
 * pueden tocar ni a mano ni por error: una reseña editable no es una reseña.
 * Devuelve cuántas cambiaron, que es lo que la pantalla informa.
 */
create or replace function public.admin_moderate_reviews(
  p_store_id uuid,
  p_ids uuid[],
  p_status text
)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant  uuid;
  v_cuantas integer;
begin
  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    raise exception 'La tienda % no existe', p_store_id;
  end if;

  if not app.has_permission(v_tenant, 'catalog.write') then
    raise exception 'No tenés permiso para moderar reseñas en esta tienda';
  end if;

  if p_status not in ('published', 'rejected', 'pending') then
    raise exception 'Estado de reseña desconocido: %', p_status;
  end if;

  update product_reviews
  set status = p_status::review_status, updated_at = now()
  where store_id = p_store_id and id = any(p_ids);

  get diagnostics v_cuantas = row_count;
  return v_cuantas;
end;
$$;

comment on function public.admin_moderate_reviews is
  'Publica o rechaza reseñas. Lo único que el Admin puede cambiar de una reseña: el texto y la estrella no se editan.';

revoke all on function public.admin_moderate_reviews(uuid, uuid[], text) from public, anon;
grant execute on function public.admin_moderate_reviews(uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Los permisos de tabla
-- ---------------------------------------------------------------------------
--
-- RLS decide **qué filas**; los grants deciden **qué verbos**, y sin ellos la
-- política más prolija devuelve «permission denied». Acá los dos van juntos y a
-- propósito: `insert` y `select`, nunca `update` ni `delete`.
--
-- Eso es lo que hace estructural la regla de que una reseña no se edita: el
-- Admin cambia el estado por `admin_moderate_reviews`, que es `definer`, y no hay
-- ningún camino por el que un `update` directo pueda tocar el texto o la estrella.
-- Medido en PGlite: con el grant puesto, el dueño podía reescribir la reseña.
grant select, insert on product_reviews to authenticated;
