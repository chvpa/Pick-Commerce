/*
 * Lo que se mira junto y lo que se está moviendo: `product_affinity`,
 * `product_trending` y su recálculo (ADR-127, v2 Fase 4).
 *
 * Dos tablas y no una. Afinidad es un **par** —producto, relacionado— y tendencia
 * es un **número por producto**; meter la segunda en la primera como un par
 * consigo mismo es lo que alguien descifra a las 3 de la mañana.
 *
 * **Contar, no entrenar.** El puntaje es una suma de dos conteos con dos pesos
 * explícitos, que se le pueden explicar al comercio en una frase: «aparece porque
 * doce personas lo miraron en la misma visita que ése, y dos lo compraron juntos».
 * No hay volumen para evaluar un modelo y sí para explicar un peso.
 *
 * **El aislamiento es estructural.** Las tres tablas llevan `tenant_id` y sus FK
 * son compuestas por `(id, tenant_id)` (ADR-063): no existe forma de insertar una
 * fila que relacione el producto de un comercio con el de otro, aunque el job
 * tenga un bug. No depende de que un `where` esté bien escrito.
 */

-- ---------------------------------------------------------------------------
-- Las tablas
-- ---------------------------------------------------------------------------

create table if not exists product_affinity (
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,
  product_id  uuid not null,
  related_id  uuid not null,
  -- Los dos conteos se guardan además del puntaje: es lo que hace explicable el
  -- resultado, y lo que permite cambiar los pesos sin recalcular desde los eventos.
  co_views    integer not null default 0,
  co_orders   integer not null default 0,
  score       numeric not null,
  computed_at timestamptz not null default now(),

  primary key (store_id, product_id, related_id),
  constraint product_affinity_sin_si_mismo check (product_id <> related_id),
  constraint product_affinity_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint product_affinity_product_fkey
    foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade,
  constraint product_affinity_related_fkey
    foreign key (related_id, tenant_id) references products (id, tenant_id) on delete cascade
);

comment on table product_affinity is
  'Lo que se mira y se compra junto, por tienda. La escribe recompute_affinity; la lee el storefront con la secret key.';

/*
 * Sin más índices que la PK, a propósito: el prefijo `(store_id, product_id)`
 * sirve las tres claves de lectura —ancla producto, ancla carrito, ancla
 * visitante—, y como el recálculo se queda con los doce mejores por producto,
 * ordenar por puntaje son doce filas en memoria.
 *
 * ponytail: sin índice por score; se agrega si el tope de 12 sube.
 */

create table if not exists product_trending (
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,
  product_id  uuid not null,
  score       numeric not null,
  computed_at timestamptz not null default now(),

  primary key (store_id, product_id),
  constraint product_trending_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint product_trending_product_fkey
    foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade
);

comment on table product_trending is
  'Lo que se está moviendo esta semana, por tienda. Es el respaldo del orden por preferencias.';

/*
 * Una fila por tienda. Es el **candado** del recálculo y a la vez lo que el Admin
 * muestra: cuándo se recalculó y sobre cuánto.
 */
create table if not exists affinity_runs (
  store_id       uuid primary key,
  tenant_id      uuid not null references organizations (id) on delete cascade,
  started_at     timestamptz not null default now(),
  computed_at    timestamptz,
  products_count integer not null default 0,
  pairs_count    integer not null default 0,

  constraint affinity_runs_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table affinity_runs is
  'El turno del recálculo por tienda: lo reclama un solo isolate, y de acá sale el «última actualización» del Admin.';

-- ---------------------------------------------------------------------------
-- Quién puede leerlas
-- ---------------------------------------------------------------------------

alter table product_affinity enable row level security;
alter table product_trending enable row level security;
alter table affinity_runs    enable row level security;

/*
 * `product_affinity` y `product_trending` quedan **con RLS y sin ninguna
 * política**: su único lector es el Worker con la secret key, que saltea RLS
 * (ADR-052). Una política para `authenticated` sería una superficie sin lector.
 *
 * `affinity_runs` sí la tiene: el Admin la lee con la publishable key para
 * mostrar cuándo se recalculó, igual que `store_events`.
 */
do $$ begin
  create policy affinity_runs_lectura on affinity_runs
    for select to authenticated
    using (tenant_id in (select app.current_tenants()));
exception when duplicate_object then null;
end $$;

grant select on affinity_runs to authenticated;

-- `anon` es el rol del navegador. Se revoca explícito en vez de confiar en que
-- no se haya concedido.
revoke all on product_affinity from anon, authenticated;
revoke all on product_trending from anon, authenticated;
revoke all on affinity_runs from anon;

-- ---------------------------------------------------------------------------
-- El recálculo
-- ---------------------------------------------------------------------------

/*
 * No hay scheduler en este repo —ningún cron en los `wrangler.jsonc`, ningún
 * `pg_cron` en las migraciones, y `pg_cron` además dejaría sin arrancar la suite
 * de aislamiento, que corre en PGlite—. El patrón que el repo ya usa para trabajo
 * periódico es el de `purgar()`: oportunista, desde el middleware, con `waitUntil`.
 *
 * **El turno lo reclama la base, no el isolate.** `tocaPurgar()` vive en una
 * variable de módulo, así que con muchos isolates muchos van a creer que les toca.
 * Acá el que decide es un `insert ... on conflict ... where`, que es un solo
 * statement atómico: el que no consigue la fila se va sin tocar nada. Y como es
 * SQL, se puede probar.
 *
 * Los pesos son parámetros con default para que el test pueda fijarlos; quien los
 * pasa en producción es `PESOS_DE_AFINIDAD` de `@pick/commerce-core`, y un test
 * comprueba que los defaults coinciden con esa constante.
 */
create or replace function public.recompute_affinity(
  p_store_id    uuid,
  p_cada        interval default '6 hours',
  p_peso_vista  numeric  default 1,
  p_peso_compra numeric  default 5
) returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tenant    uuid;
  v_pares     integer := 0;
  v_productos integer := 0;
begin
  select s.tenant_id into v_tenant from stores s where s.id = p_store_id;
  if v_tenant is null then
    return 0;
  end if;

  -- El candado. Sin fila, otro isolate ya está adentro de la ventana.
  insert into affinity_runs (store_id, tenant_id, started_at)
  values (p_store_id, v_tenant, now())
  on conflict (store_id) do update set started_at = now()
    where affinity_runs.started_at < now() - p_cada;

  if not found then
    return 0;
  end if;

  -- --- Lo que se mira junto ------------------------------------------------
  delete from product_affinity where store_id = p_store_id;

  insert into product_affinity
    (tenant_id, store_id, product_id, related_id, co_views, co_orders, score, computed_at)
  with
  /*
   * Un producto por visita, no por vista: mirar cinco veces el mismo producto en
   * la misma sesión es una sola señal.
   *
   * Va por `session_id` y no por `device_id` a propósito: la co-vista no necesita
   * saber quién es nadie, así que sigue funcionando con la personalización
   * apagada, que es la mitad del valor de esta tabla.
   *
   * El tope de 50 productos por sesión no es cosmético: un bot que recorre 900
   * productos genera 810.000 pares él solo.
   */
  vistas as (
    select session_id, product_id
    from (
      select e.session_id,
             (e.data->>'productId')::uuid as product_id,
             row_number() over (
               partition by e.session_id order by max(e.occurred_at) desc
             ) as rn
      from store_events e
      where e.store_id = p_store_id
        and e.type = 'product_view'
        and e.occurred_at >= now() - interval '30 days'
        and e.data->>'productId' is not null
      group by e.session_id, (e.data->>'productId')::uuid
    ) x
    where rn <= 50
  ),

  co_vistas as (
    select a.product_id, b.product_id as related_id, count(*)::int as n
    from vistas a
    join vistas b on b.session_id = a.session_id and b.product_id <> a.product_id
    group by a.product_id, b.product_id
  ),

  /*
   * Lo que se compra junto. Se entra por el pedido y no por la variante: no hay
   * índice por `variant_id` en `order_items`, y no hace falta.
   */
  compras as (
    select distinct o.id as order_id, pv.product_id
    from orders o
    join order_items oi on oi.order_id = o.id
    join product_variants pv on pv.id = oi.variant_id
    where o.store_id = p_store_id
      and o.status <> 'cancelled'
      and o.created_at >= now() - interval '180 days'
  ),

  co_compras as (
    select a.product_id, b.product_id as related_id, count(*)::int as n
    from compras a
    join compras b on b.order_id = a.order_id and b.product_id <> a.product_id
    group by a.product_id, b.product_id
  ),

  juntos as (
    select coalesce(v.product_id, c.product_id) as product_id,
           coalesce(v.related_id, c.related_id) as related_id,
           coalesce(v.n, 0) as co_views,
           coalesce(c.n, 0) as co_orders
    from co_vistas v
    full outer join co_compras c
      on c.product_id = v.product_id and c.related_id = v.related_id
  ),

  /*
   * Sólo productos que existen y son de esta tienda. Un evento puede nombrar un
   * producto borrado —los eventos duran 180 días— y la FK compuesta lo rechazaría
   * con un error en medio del recálculo.
   */
  validos as (
    select j.*, p_peso_vista * j.co_views + p_peso_compra * j.co_orders as score
    from juntos j
    join products p  on p.id = j.product_id and p.store_id = p_store_id
    join products pr on pr.id = j.related_id and pr.store_id = p_store_id
  )

  -- Los doce mejores por producto. Sin tope, una tienda de 3752 productos tiene
  -- catorce millones de pares posibles.
  select v_tenant, p_store_id, t.product_id, t.related_id, t.co_views, t.co_orders,
         t.score, now()
  from (
    select v.*, row_number() over (
      partition by v.product_id order by v.score desc, v.related_id
    ) as puesto
    from validos v
  ) t
  where t.puesto <= 12;

  get diagnostics v_pares = row_count;

  -- --- Lo que se está moviendo ---------------------------------------------
  /*
   * Siete días, no treinta: «tendencia» es lo de ahora. Cuenta visitas distintas
   * —no vistas— más las unidades vendidas con el peso de la compra, que es la
   * misma regla que la afinidad y por eso se explica igual.
   */
  delete from product_trending where store_id = p_store_id;

  insert into product_trending (tenant_id, store_id, product_id, score, computed_at)
  select v_tenant, p_store_id, t.product_id, t.score, now()
  from (
    select p.id as product_id,
           p_peso_vista * coalesce(v.sesiones, 0) + p_peso_compra * coalesce(c.unidades, 0) as score
    from products p
    left join (
      select (e.data->>'productId')::uuid as product_id,
             count(distinct e.session_id) as sesiones
      from store_events e
      where e.store_id = p_store_id
        and e.type = 'product_view'
        and e.occurred_at >= now() - interval '7 days'
        and e.data->>'productId' is not null
      group by (e.data->>'productId')::uuid
    ) v on v.product_id = p.id
    left join (
      select pv.product_id, sum(oi.quantity) as unidades
      from orders o
      join order_items oi on oi.order_id = o.id
      join product_variants pv on pv.id = oi.variant_id
      where o.store_id = p_store_id
        and o.status <> 'cancelled'
        and o.created_at >= now() - interval '7 days'
      group by pv.product_id
    ) c on c.product_id = p.id
    where p.store_id = p_store_id
  ) t
  -- Un producto sin señal no se guarda: la tabla dice qué se mueve, no qué existe.
  where t.score > 0;

  get diagnostics v_productos = row_count;

  update affinity_runs
     set computed_at = now(), products_count = v_productos, pairs_count = v_pares
   where store_id = p_store_id;

  return v_pares;
end;
$$;

comment on function public.recompute_affinity is
  'Recalcula afinidad y tendencia de una tienda si pasó la ventana. Devuelve los pares escritos, o 0 si otro isolate tenía el turno.';

revoke all on function public.recompute_affinity(uuid, interval, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.recompute_affinity(uuid, interval, numeric, numeric)
  to service_role;
