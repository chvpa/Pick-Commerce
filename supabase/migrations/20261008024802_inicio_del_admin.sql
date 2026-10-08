/*
 * Inicio del Admin (v3 Fase 2).
 *
 * Dos funciones para la pantalla con la que abre el Admin, como la dibuja el
 * handoff de diseño (ADR-143):
 *
 * - `admin_store_tasks`: lo que espera a la tienda —«Para hacer»—, el checklist
 *   de una tienda nueva y los contadores del sidebar, en una sola consulta.
 * - `admin_dashboard_series`: las ventas y los pedidos por hora o por día, y
 *   cómo se reparten los pedidos según cuánto gastaron.
 *
 * Los totales del período siguen saliendo de `admin_dashboard`, que no cambia.
 */

-- ---------------------------------------------------------------------------
-- Lo que espera a la tienda
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

vivos as (
  select o.created_at, o.status, o.payment_status
  from orders o
  join tienda t on t.id = o.store_id
  where o.status <> 'cancelled'
),

-- El pago no entró y el pedido sigue vivo: con transferencia, el comprobante que
-- nadie miró todavía.
cobrar as (
  select count(*)::int as n, min(created_at) as desde
  from vivos
  where payment_status <> 'paid'
),

-- Cobrado y todavía sin salir de la tienda.
preparar as (
  select count(*)::int as n, min(created_at) as desde
  from vivos
  where payment_status = 'paid'
    and status in ('received', 'confirmed', 'preparing', 'ready')
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

-- ---------------------------------------------------------------------------
-- Las series del período
-- ---------------------------------------------------------------------------

create or replace function public.admin_dashboard_series(
  p_store_id uuid,
  p_from     timestamptz,
  p_to       timestamptz,
  p_tz       text    default 'UTC',
  p_hourly   boolean default false
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with
-- Un huso que Postgres no conoce cae a UTC en vez de fallar, como en la
-- recurrencia (ADR-134): el corte del día es de quien mira.
zona as (
  select coalesce((select name from pg_timezone_names where name = p_tz limit 1), 'UTC') as z
),

unidad as (
  select case when p_hourly then 'hour' else 'day' end as u
),

vendidos as (
  select o.created_at, o.total_amount
  from orders o
  where o.store_id = p_store_id
    and o.created_at >= p_from
    and o.created_at <  p_to
    and o.status <> 'cancelled'
),

/*
 * Una cubeta por hora o por día **aunque no haya ventas**: un gráfico que salta
 * los días vacíos dibuja una línea que miente. Con techo, como toda función que
 * devuelve una lista: un rango absurdo no puede pedir un millón de puntos.
 */
cubetas as (
  select g as desde
  from zona, unidad,
       generate_series(
         date_trunc(u, p_from at time zone z),
         date_trunc(u, (p_to - interval '1 microsecond') at time zone z),
         case when p_hourly then interval '1 hour' else interval '1 day' end
       ) g
  limit 400
),

por_cubeta as (
  select date_trunc((select u from unidad), v.created_at at time zone (select z from zona)) as desde,
         sum(v.total_amount)::bigint as ventas,
         count(*)::int               as pedidos
  from vendidos v
  group by 1
),

/*
 * Los tramos del ticket, alrededor del ticket del propio período: hasta la
 * mitad, hasta el doble, y más. Fijos en guaraníes no servirían para otra
 * moneda ni para otra tienda. Se redondean a una cifra significativa para que el
 * rótulo se lea —«hasta 300.000» y no «hasta 287.413»—.
 */
promedio as (
  select avg(total_amount)::numeric as m from vendidos
),

bordes as (
  select array[
           (round(m / 2 / power(10::numeric, floor(log(m / 2))))
              * power(10::numeric, floor(log(m / 2))))::bigint,
           (round(m * 2 / power(10::numeric, floor(log(m * 2))))
              * power(10::numeric, floor(log(m * 2))))::bigint
         ] as b
  from promedio
  where m > 0
),

tramos as (
  select bo.b,
         count(*) filter (where v.total_amount <= bo.b[1])::int as bajo,
         count(*) filter (where v.total_amount >  bo.b[1]
                            and v.total_amount <= bo.b[2])::int as medio,
         count(*) filter (where v.total_amount >  bo.b[2])::int as alto
  from bordes bo
  cross join vendidos v
  group by bo.b
)

select jsonb_build_object(
  'puntos', coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'desde', c.desde,
               'ventas', coalesce(p.ventas, 0),
               'pedidos', coalesce(p.pedidos, 0)
             ) order by c.desde
           )
    from cubetas c
    left join por_cubeta p on p.desde = c.desde
  ), '[]'::jsonb),
  -- Sin ventas no hay ticket alrededor del cual cortar: null, no tres ceros.
  'tramos', (
    select jsonb_build_object(
             'hasta', jsonb_build_array(t.b[1], t.b[2]),
             'pedidos', jsonb_build_array(t.bajo, t.medio, t.alto)
           )
    from tramos t
  )
);
$$;

comment on function public.admin_dashboard_series(uuid, timestamptz, timestamptz, text, boolean) is
  'Ventas y pedidos por hora o por día, y los pedidos por tramo de ticket (v3 Fase 2).';

revoke all on function public.admin_dashboard_series(uuid, timestamptz, timestamptz, text, boolean)
  from public, anon;
grant execute on function public.admin_dashboard_series(uuid, timestamptz, timestamptz, text, boolean)
  to authenticated, service_role;
