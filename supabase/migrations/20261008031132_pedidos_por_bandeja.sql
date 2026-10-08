/*
 * Pedidos por bandeja (v3 Fase 2).
 *
 * Las pestañas de la lista de Pedidos del handoff —por cobrar, para preparar, en
 * camino, entregados, cancelados— cruzan el estado del pedido con el del pago,
 * que son dos ejes distintos. La definición de cada una vive en
 * `app.pedido_en_bandeja`, y la usan la lista, el conteo de las pestañas y el
 * «Para hacer» del Inicio: tres lugares que no pueden contar distinto lo mismo.
 */

-- ---------------------------------------------------------------------------
-- La definición de cada bandeja
-- ---------------------------------------------------------------------------

create or replace function app.pedido_en_bandeja(
  p_status  public.order_status,
  p_payment public.payment_status,
  p_bandeja text
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_bandeja
    -- El pago no entró y el pedido sigue vivo, aunque ya haya salido.
    when 'cobrar'     then p_payment <> 'paid' and p_status <> 'cancelled'
    -- Cobrado y todavía sin salir de la tienda.
    when 'preparar'   then p_payment = 'paid'
                       and p_status in ('received', 'confirmed', 'preparing', 'ready')
    when 'camino'     then p_status in ('shipped', 'in_transit')
    when 'entregados' then p_status = 'delivered'
    when 'cancelados' then p_status = 'cancelled'
    -- 'todos', o cualquier otra cosa: sin filtro.
    else true
  end;
$$;

comment on function app.pedido_en_bandeja(public.order_status, public.payment_status, text) is
  'Si un pedido está en una bandeja de la lista de Pedidos (v3 Fase 2). Pura: no lee tablas.';

revoke all on function app.pedido_en_bandeja(public.order_status, public.payment_status, text)
  from public, anon;
grant execute on function app.pedido_en_bandeja(public.order_status, public.payment_status, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La lista de pedidos
-- ---------------------------------------------------------------------------

/*
 * Firma nueva, con los parámetros nuevos al final y todos con default: el Admin
 * que ya está desplegado —que manda los cinco de antes— sigue funcionando hasta
 * que se despliegue el nuevo. La vieja se borra para que no queden dos
 * sobrecargas entre las que PostgREST no sabría elegir.
 */
drop function if exists public.admin_orders(uuid, text, text, integer, integer);

create or replace function public.admin_orders(
  p_store_id     uuid,
  p_query        text        default '',
  p_status       text        default null,
  p_page         integer     default 1,
  p_per_page     integer     default 20,
  p_bucket       text        default null,
  p_payment      text        default null,
  p_from         timestamptz default null,
  p_to           timestamptz default null,
  p_oldest_first boolean     default false
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with base as (
  select
    o.id,
    o.created_at,
    lower(
      '#' || o.number::text || ' ' ||
      coalesce(o.customer->>'name', '') || ' ' ||
      coalesce(o.customer->>'email', '') || ' ' ||
      coalesce(o.customer->>'phone', '') || ' ' ||
      -- La ciudad, como en el buscador del handoff: «los pedidos de Luque».
      coalesce(o.address->>'city', '')
    ) as hay
  from orders o
  where o.store_id = p_store_id
    and (p_status is null or o.status = p_status::order_status)
    and (p_payment is null or o.payment_status = p_payment::payment_status)
    and (p_from is null or o.created_at >= p_from)
    and (p_to is null or o.created_at < p_to)
    and app.pedido_en_bandeja(o.status, o.payment_status, coalesce(p_bucket, 'todos'))
),

filtrados as (
  select b.* from base b
  where coalesce(p_query, '') = '' or not exists (
    select 1
    from unnest(string_to_array(lower(trim(p_query)), ' ')) t(tok)
    where t.tok <> '' and position(t.tok in b.hay) = 0
  )
),

total as (select count(*)::int as n from filtrados),

pagina as (
  select greatest(1, ceil(t.n::numeric / greatest(1, least(p_per_page, 200)))::int) as page_count, t.n
  from total t
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from pagina pg
),

/*
 * El corte de página va **antes** de armar cada fila: numerar sólo lleva el id y
 * la fecha, y el documento —con la subconsulta de los ítems— se arma para las
 * veinte de la página y no para todas las que pasaron el filtro, como antes. Es
 * la regla de CLAUDE.md sobre `row_number()` y el corte de página.
 */
numeradas as (
  select
    f.id,
    row_number() over (
      order by
        case when p_oldest_first then f.created_at end asc,
        case when not p_oldest_first then f.created_at end desc,
        f.id
    ) as rn
  from filtrados f
),

de_la_pagina as (
  select n.id, n.rn
  from numeradas n, acotada a
  where n.rn >  (a.page - 1) * least(p_per_page, 200)
    and n.rn <= a.page * least(p_per_page, 200)
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      p.rn,
      jsonb_strip_nulls(jsonb_build_object(
        'id', o.id,
        'number', o.number,
        'createdAt', o.created_at,
        'customerName', o.customer->>'name',
        'city', nullif(o.address->>'city', ''),
        'total', jsonb_build_object('amount', o.total_amount, 'currency', o.currency),
        'status', o.status,
        'paymentStatus', o.payment_status,
        'itemCount', (select coalesce(sum(i.quantity), 0)::int from order_items i where i.order_id = o.id)
      )) as doc
    from de_la_pagina p
    join orders o on o.id = p.id
  ) x
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', least(p_per_page, 200),
  'pageCount', (select page_count from acotada)
);
$$;

comment on function public.admin_orders(uuid, text, text, integer, integer, text, text, timestamptz, timestamptz, boolean) is
  'La lista de pedidos del Admin, por bandeja, pago, fecha y búsqueda, paginada en el servidor (v3 Fase 2).';

revoke all on function public.admin_orders(uuid, text, text, integer, integer, text, text, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.admin_orders(uuid, text, text, integer, integer, text, text, timestamptz, timestamptz, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Cuántos hay en cada pestaña
-- ---------------------------------------------------------------------------

create or replace function public.admin_order_counts(p_store_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'todos', count(*)::int,
    'cobrar', (count(*) filter (where app.pedido_en_bandeja(status, payment_status, 'cobrar')))::int,
    'preparar', (count(*) filter (where app.pedido_en_bandeja(status, payment_status, 'preparar')))::int,
    'camino', (count(*) filter (where app.pedido_en_bandeja(status, payment_status, 'camino')))::int,
    'entregados', (count(*) filter (where app.pedido_en_bandeja(status, payment_status, 'entregados')))::int,
    'cancelados', (count(*) filter (where app.pedido_en_bandeja(status, payment_status, 'cancelados')))::int
  )
  from orders
  where store_id = p_store_id;
$$;

comment on function public.admin_order_counts(uuid) is
  'Cuántos pedidos hay en cada pestaña de la lista (v3 Fase 2). Invoker: RLS acota.';

revoke all on function public.admin_order_counts(uuid) from public, anon;
grant execute on function public.admin_order_counts(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Las tareas del Inicio, con la misma definición
-- ---------------------------------------------------------------------------

create or replace function public.admin_store_tasks(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
/*
 * El corte por organización es esta línea y ninguna otra.
 *
 * La función es `security definer` porque los avisos viven en
 * `notification_outbox`, que no tiene políticas a propósito: guarda el pedido
 * serializado con la dirección del comprador (ADR-102). Todo lo de abajo cuelga
 * de `tienda`, así que sin una tienda propia no sale ninguna fila y la función
 * devuelve null — no ceros, que se leerían como «está todo al día».
 */
tienda as (
  select s.id, s.tenant_id, coalesce(ss.settings, '{}'::jsonb) as ajustes
  from stores s
  left join store_settings ss on ss.store_id = s.id
  where s.id = p_store_id
    and s.tenant_id in (select app.current_tenants())
),

pedidos as (
  select o.created_at, o.status, o.payment_status
  from orders o
  join tienda t on t.id = o.store_id
),

-- Las mismas bandejas que las pestañas de Pedidos: una sola definición.
cobrar as (
  select count(*)::int as n, min(created_at) as desde
  from pedidos
  where app.pedido_en_bandeja(status, payment_status, 'cobrar')
),

preparar as (
  select count(*)::int as n, min(created_at) as desde
  from pedidos
  where app.pedido_en_bandeja(status, payment_status, 'preparar')
),

/*
 * Los avisos que no van a salir nunca: cinco intentos y sin enviar, el mismo
 * corte que el detalle del pedido (`INTENTOS_DE_AVISO`). Los que siguen en
 * cola no cuentan: salen solos con la próxima visita al sitio.
 */
abandonados as (
  select n.order_id, n.created_at
  from notification_outbox n
  join tienda t on t.id = n.store_id
  where n.sent_at is null
    and n.attempts >= 5
),

avisos as (
  select
    count(distinct a.order_id)::int as n,
    (
      select jsonb_build_object(
               'id', o.id,
               'number', o.number,
               'customerName', o.customer->>'name'
             )
      from abandonados a2
      join orders o on o.id = a2.order_id
      order by a2.created_at desc
      limit 1
    ) as pedido
  from abandonados a
),

-- Publicados y sin ninguna foto: la cola de «Sin foto» (v2 Fase 5).
sin_foto as (
  select count(*)::int as n
  from products p
  join tienda t on t.id = p.store_id
  where p.status = 'active'
    and not exists (select 1 from product_media m where m.product_id = p.id)
),

resenas as (
  select count(*)::int as n
  from product_reviews r
  join tienda t on t.id = r.store_id
  where r.status = 'pending'
),

ultima_resena as (
  select jsonb_build_object('producto', p.title, 'rating', r.rating) as doc
  from product_reviews r
  join tienda t on t.id = r.store_id
  join products p on p.id = r.product_id
  where r.status = 'pending'
  order by r.created_at desc
  limit 1
),

-- Lo que propuso la IA y espera que alguien lo mire (ADR-130).
propuestas as (
  select
    (select count(*)::int
       from description_proposals d join tienda t on t.id = d.store_id
       where d.status = 'pending') as descripciones,
    (select count(*)::int
       from media_proposals m join tienda t on t.id = m.store_id
       where m.status = 'pending') as fotos
)

select jsonb_build_object(
  'porCobrar', jsonb_build_object('n', c.n, 'desde', c.desde),
  'paraPreparar', jsonb_build_object('n', pr.n, 'desde', pr.desde),
  'avisosFallidos', jsonb_build_object('n', av.n, 'pedido', av.pedido),
  'sinFoto', jsonb_build_object(
    'n', sf.n,
    -- Si la tienda los oculta, «sin foto» quiere decir «no se ven».
    'ocultos', (t.ajustes->'catalog'->>'hideWithoutImage') = 'true'
  ),
  'resenas', jsonb_build_object('n', re.n, 'ultima', (select doc from ultima_resena)),
  'propuestas', jsonb_build_object('descripciones', pp.descripciones, 'fotos', pp.fotos),
  -- Los de toda la vida de la tienda, cancelados incluidos: decide si la tienda
  -- es nueva, no cuánto vendió.
  'pedidos', (select count(*)::int from orders o where o.store_id = t.id),
  /*
   * El checklist de una tienda nueva, leído de lo que la tienda ya hizo y no de
   * casillas que alguien tilda: una casilla tildada a mano puede mentir.
   */
  'alta', jsonb_build_object(
    'productos', exists (select 1 from products p where p.store_id = t.id),
    -- Transferencia sin datos de la cuenta no es un medio de pago: el comprador
    -- no sabría a dónde transferir. Cualquier otro método habilitado sí cuenta.
    'pagos',
      coalesce(t.ajustes->'payments'->'bankTransfer'->>'instructions', '') <> ''
      or exists (
        select 1
        from jsonb_array_elements_text(
          case when jsonb_typeof(t.ajustes->'payments'->'enabled') = 'array'
               then t.ajustes->'payments'->'enabled' else '[]'::jsonb end
        ) m(metodo)
        where m.metodo <> 'bank_transfer'
      ),
    -- Decidir no cobrar el envío también es decidir: cuenta la clave, no el modo.
    'envio', t.ajustes ? 'shipping',
    'portada', exists (select 1 from home_sections h where h.store_id = t.id),
    'equipo', (select count(*) from memberships mb where mb.tenant_id = t.tenant_id) > 1
  )
)
from tienda t, cobrar c, preparar pr, avisos av, sin_foto sf, resenas re, propuestas pp;
$$;

comment on function public.admin_store_tasks(uuid) is
  'Lo que espera a la tienda, el checklist de una tienda nueva y los contadores del sidebar (v3 Fase 2).';

revoke all on function public.admin_store_tasks(uuid) from public, anon;
grant execute on function public.admin_store_tasks(uuid) to authenticated, service_role;
