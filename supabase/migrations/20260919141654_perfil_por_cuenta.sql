/*
 * El perfil que sigue a la persona, no al navegador: `customer_preferences`.
 *
 * La Fase 4 entregó la personalización por `pick_did`, la cookie de dispositivo:
 * cubre casi todo el tráfico, pero no pasa del teléfono al escritorio y se
 * apaga cuando se apaga la cookie. Esto es el escalón que faltaba, y **cambia lo
 * que la tienda promete**: cruzar lo que alguien mira con quién es era
 * exactamente la línea que PROJECT.md §23 protegía. El texto de privacidad se
 * reescribió en el mismo cambio, antes de encenderlo.
 *
 * **Materializado, no calculado por request** (lo pedía el ROADMAP): es lo que
 * permite que el perfil sobreviva a la purga de `store_events` a los 180 días.
 * Lo escribe el mismo `recompute_affinity` que ya corre con el tráfico: sin job
 * nuevo, sin cron nuevo, y con el mismo candado.
 *
 * Quién es quién lo dice `session_identities`, que se escribe **sólo al entrar a
 * la cuenta**: sin login no hay fila, así que sin login no hay perfil por
 * persona. Es el mismo diseño que ya tenía la fusión de la wishlist.
 */

create table if not exists customer_preferences (
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,
  customer_id uuid not null,
  -- La misma forma que devuelve `visitor_preferences`: dos marcas y dos
  -- categorías. Que las dos fuentes hablen igual es lo que permite elegir una u
  -- otra en el storefront sin un `if` por cada campo.
  prefiere    jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),

  primary key (store_id, customer_id),
  constraint customer_preferences_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint customer_preferences_customer_fkey
    foreign key (customer_id, tenant_id) references customers (id, tenant_id) on delete cascade
);

comment on table customer_preferences is
  'Las marcas y categorías que viene mirando una persona con cuenta, materializadas para sobrevivir a la purga de eventos.';

alter table customer_preferences enable row level security;

/*
 * Sin política: la lee el Worker con la secret key, a través de `my_preferences`,
 * que filtra por la identidad del comprador. Una política para `authenticated`
 * sería una superficie sin lector —el Admin no tiene por qué ver qué mira cada
 * cliente— y eso es justamente lo que el texto de privacidad promete.
 */
revoke all on customer_preferences from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lo mío, y sólo lo mío
-- ---------------------------------------------------------------------------

/*
 * `security definer` con el filtro de identidad escrito en una línea, como
 * `wishlist_products`: la tabla no tiene política de comprador, así que una
 * función `invoker` devolvería vacío siempre y la pantalla mentiría en silencio
 * (CLAUDE.md lo tiene anotado con nombre y apellido).
 *
 * `app.current_customer` resuelve quién es quien llama a partir de su token. Sin
 * token devuelve null, y entonces esto devuelve `{}`: el que no entró a su
 * cuenta ve lo que ve cualquiera.
 */
create or replace function public.my_preferences(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select cp.prefiere
       from customer_preferences cp
      /*
       * El filtro de tienda es defensa en profundidad: `app.current_customer`
       * ya devuelve la ficha **de esa tienda**, y una ficha pertenece a una
       * sola. Comprobado quitándolo: ningún caso se pone en rojo.
       */
      where cp.store_id = p_store_id
        and cp.customer_id = app.current_customer(p_store_id)),
    '{}'::jsonb
  );
$$;

comment on function public.my_preferences is
  'Las preferencias de quien llama, por su token de comprador. {} para quien no entró (ADR-128).';

revoke all on function public.my_preferences(uuid) from public, anon;
grant execute on function public.my_preferences(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lo calcula el recálculo que ya existe
-- ---------------------------------------------------------------------------

/*
 * `recompute_affinity` gana un tercer paso. Es el mismo cuerpo de antes salvo
 * ese bloque: la afinidad, la tendencia y ahora el perfil de cada persona con
 * cuenta que tuvo actividad en la ventana.
 *
 * **Sólo se recalcula a quien tuvo actividad reciente**, y a quien dejó de
 * tenerla se le borra: un perfil viejo es peor que ninguno, porque ordena la
 * vitrina con lo que a alguien le interesaba hace un año.
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

  validos as (
    select j.*, p_peso_vista * j.co_views + p_peso_compra * j.co_orders as score
    from juntos j
    join products p  on p.id = j.product_id and p.store_id = p_store_id
    join products pr on pr.id = j.related_id and pr.store_id = p_store_id
  )

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
  where t.score > 0;

  get diagnostics v_productos = row_count;

  -- --- Y el perfil de cada persona con cuenta ------------------------------
  /*
   * La misma forma que `visitor_preferences` —dos marcas, dos categorías, y
   * nada con menos de tres vistas— pero mirando las visitas de esa persona en
   * vez de las de un navegador. Noventa días, como el bucket del dispositivo.
   */
  delete from customer_preferences where store_id = p_store_id;

  insert into customer_preferences (tenant_id, store_id, customer_id, prefiere, computed_at)
  with vistas as (
    select si.customer_id, (e.data->>'productId')::uuid as product_id, e.occurred_at
    from store_events e
    join session_identities si
      on si.store_id = e.store_id and si.session_id = e.session_id
    where e.store_id = p_store_id
      and e.type = 'product_view'
      and e.occurred_at >= now() - interval '90 days'
      and e.data->>'productId' is not null
      /*
       * **Sólo las visitas con personalización prendida.** Con el interruptor
       * apagado el evento se guarda igual pero sin `device_id` (ADR-124), así
       * que esta línea es la que hace que apagar **sostenga**: el recálculo
       * siguiente no vuelve a armar el perfil que se borró. Sin ella, apagar
       * duraría hasta la próxima corrida.
       */
      and e.device_id is not null
  ),

  -- Las últimas cien de cada persona: el tope acota el trabajo igual que arriba.
  acotadas as (
    select customer_id, product_id
    from (
      select v.*, row_number() over (
        partition by v.customer_id order by v.occurred_at desc
      ) as rn
      from vistas v
    ) x
    where rn <= 100
  ),

  mirados as (
    select a.customer_id, p.brand, c.slug as categoria
    from acotadas a
    join products p on p.id = a.product_id and p.store_id = p_store_id
    left join categories c on c.id = p.category_id
  ),

  marcas as (
    select customer_id, brand as valor
    from (
      select customer_id, brand, count(*) as n,
             row_number() over (partition by customer_id order by count(*) desc, brand) as puesto
      from mirados where brand is not null
      group by customer_id, brand
    ) x
    where puesto <= 2
  ),

  categorias as (
    select customer_id, categoria as valor
    from (
      select customer_id, categoria, count(*) as n,
             row_number() over (partition by customer_id order by count(*) desc, categoria) as puesto
      from mirados where categoria is not null
      group by customer_id, categoria
    ) x
    where puesto <= 2
  ),

  con_senal as (
    select customer_id from mirados group by customer_id having count(*) >= 3
  ),

  armados as (
    select s.customer_id,
           jsonb_strip_nulls(jsonb_build_object(
             'brand', (select jsonb_agg(m.valor) from marcas m where m.customer_id = s.customer_id),
             'categoria', (select jsonb_agg(c.valor)
                             from categorias c where c.customer_id = s.customer_id)
           )) as prefiere
    from con_senal s
  )

  -- Un perfil vacío no se guarda: quien miró tres productos sin marca ni
  -- categoría no tiene preferencia que aplicar, y una fila vacía sería una fila
  -- que hay que acordarse de ignorar en cada lectura.
  select v_tenant, p_store_id, a.customer_id, a.prefiere, now()
  from armados a
  where a.prefiere <> '{}'::jsonb;

  update affinity_runs
     set computed_at = now(), products_count = v_productos, pairs_count = v_pares
   where store_id = p_store_id;

  return v_pares;
end;
$$;

revoke all on function public.recompute_affinity(uuid, interval, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.recompute_affinity(uuid, interval, numeric, numeric)
  to service_role;
