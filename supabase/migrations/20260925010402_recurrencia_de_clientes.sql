-- Recurrencia de clientes: cohortes y RFM (v2 Fase 8, ADR-134).
--
-- Las dos salen de `orders`, sin los cancelados, igual que todo lo que habla de
-- dinero en el Admin: un pedido anulado no es una compra. Y las dos son
-- `security invoker`, como `admin_customers`: la defensa es RLS sobre `orders` y
-- `customers`, que ya exige ser miembro de la organización.
--
-- La identidad es `orders.customer_id`: un cliente por tienda y por correo, que
-- `create_order` resuelve al comprar. Es lo que el ROADMAP pedía antes de hacer
-- esto —«identidad de cliente entre pedidos»— y existe desde la Fase 5.

-- ---------------------------------------------------------------------------
-- Cohortes
-- ---------------------------------------------------------------------------
--
-- Una cohorte son los clientes cuya **primera compra** cayó en un mes. Para cada
-- mes siguiente se cuenta cuántos de ellos volvieron a comprar. El mes 0 es la
-- cohorte entera por definición.
--
-- El mes se corta en la zona horaria de quien mira, que llega del navegador: el
-- Admin ya calcula «hoy» ahí (`rangoDePeriodo`), y un pedido de las 22 h del
-- último día del mes en Asunción es de ese mes, no del siguiente como diría UTC.
-- Una zona que Postgres no conoce cae en UTC en vez de fallar.

create or replace function public.admin_customer_cohorts(
  p_store_id uuid,
  p_tz       text    default 'UTC',
  p_months   integer default 12
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with zona as (
  select coalesce(
    (select name from pg_timezone_names where name = p_tz limit 1),
    'UTC'
  ) as z
),

compras as (
  select o.customer_id,
         date_trunc('month', o.created_at at time zone (select z from zona))::date as mes
  from orders o
  where o.store_id = p_store_id
    and o.status <> 'cancelled'
    and o.customer_id is not null
),

actual as (
  select date_trunc('month', now() at time zone (select z from zona))::date as mes
),

primera as (
  select customer_id, min(mes) as cohorte
  from compras
  group by customer_id
),

-- Sólo las cohortes de la ventana. El tope de 24 es el mismo motivo que el de
-- la paginación: una llamada no puede pedir la historia entera.
visibles as (
  select p.*
  from primera p, actual a
  where p.cohorte > a.mes - make_interval(months => least(greatest(coalesce(p_months, 12), 1), 24))
),

-- Meses entre dos primeros de mes, exactos: `age` entre dos días 1 no tiene días.
activos as (
  select v.cohorte,
         (extract(year from age(c.mes, v.cohorte)) * 12
          + extract(month from age(c.mes, v.cohorte)))::int as n,
         count(distinct c.customer_id)::int as clientes
  from visibles v
  join compras c using (customer_id)
  group by 1, 2
),

-- Una celda por cohorte y por mes transcurrido, también las vacías: una cohorte
-- que nadie repitió tiene que verse en cero, no desaparecer de la fila.
grilla as (
  select t.cohorte, t.clientes, g.n
  from (select cohorte, count(*)::int as clientes from visibles group by cohorte) t
  cross join actual a
  cross join lateral generate_series(
    0,
    (extract(year from age(a.mes, t.cohorte)) * 12 + extract(month from age(a.mes, t.cohorte)))::int
  ) g(n)
),

filas as (
  select g.cohorte, g.clientes,
         jsonb_agg(coalesce(a.clientes, 0) order by g.n) as activos
  from grilla g
  left join activos a on a.cohorte = g.cohorte and a.n = g.n
  group by g.cohorte, g.clientes
)

select jsonb_build_object(
  'timeZone', (select z from zona),
  'cohorts', coalesce(
    (select jsonb_agg(jsonb_build_object(
       'month', to_char(f.cohorte, 'YYYY-MM'),
       'customers', f.clientes,
       'active', f.activos
     ) order by f.cohorte)
     from filas f),
    '[]'::jsonb
  )
);
$$;

comment on function public.admin_customer_cohorts(uuid, text, integer) is
  'Clientes por mes de primera compra y cuántos volvieron cada mes siguiente, sin cancelados.';

revoke all on function public.admin_customer_cohorts(uuid, text, integer) from public, anon;
grant execute on function public.admin_customer_cohorts(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RFM
-- ---------------------------------------------------------------------------
--
-- Recencia, frecuencia y monto, por cliente con al menos una compra.
--
-- - **R es relativa a la tienda**: `cume_dist` sobre la última compra, en cinco
--   escalones. Con `ntile` una tienda de tres clientes pondría al más reciente
--   en el escalón 3 y no en el 5; con `cume_dist` el más reciente es siempre 5
--   y dos con la misma fecha comparten escalón.
-- - **F va por bandas fijas y no por quintiles**, porque en una tienda chica la
--   mayoría compró una vez: repartir empates en quintiles mandaría a clientes
--   idénticos a segmentos distintos.
-- - **M no decide el segmento**: se muestra como parte de la facturación de cada
--   uno, que es la pregunta que el comercio le hace.
--
-- Los siete segmentos son exhaustivos y se evalúan en orden; están escritos una
-- sola vez, acá, porque la lista filtra por ellos del lado del servidor.

create or replace function public.admin_customer_segments(
  p_store_id uuid,
  p_segment  text    default null,
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with agregados as (
  select o.customer_id,
         count(*)::int as f,
         sum(o.total_amount)::bigint as m,
         max(o.created_at) as ultima
  from orders o
  where o.store_id = p_store_id
    and o.status <> 'cancelled'
    and o.customer_id is not null
  group by o.customer_id
),

puntuados as (
  select a.*, ceil(cume_dist() over (order by a.ultima) * 5)::int as r
  from agregados a
),

segmentados as (
  select p.*,
    case
      when p.f >= 4 and p.r >= 4 then 'champions'
      when p.f >= 3 and p.r >= 3 then 'loyal'
      when p.f >= 2 and p.r <= 2 then 'at_risk'
      when p.f = 2 then 'promising'
      when p.r >= 4 then 'new'
      when p.r = 3 then 'cooling'
      else 'dormant'
    end as segmento
  from puntuados p
),

catalogo_de_segmentos(segmento, orden) as (
  values ('champions', 1), ('loyal', 2), ('promising', 3), ('new', 4),
         ('cooling', 5), ('at_risk', 6), ('dormant', 7)
),

resumen as (
  select k.segmento, k.orden,
         count(s.customer_id)::int as clientes,
         coalesce(sum(s.m), 0)::bigint as monto
  from catalogo_de_segmentos k
  left join segmentados s on s.segmento = k.segmento
  group by k.segmento, k.orden
),

filtrados as (
  select s.*, c.name, c.email
  from segmentados s
  join customers c on c.id = s.customer_id
  where p_segment is null or s.segmento = p_segment
),

moneda as (
  select coalesce((select currency from stores where id = p_store_id), 'PYG') as c
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pc) as page, pc, n, pp
  from (
    select t.n, pp.pp,
           greatest(1, ceil(t.n::numeric / pp.pp)::int) as pc
    from (select count(*)::int as n from filtrados) t,
         (select greatest(1, least(coalesce(p_per_page, 20), 200)) as pp) pp
  ) x
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      -- Los que más facturaron primero: es la lista que se mira para decidir a
      -- quién escribirle.
      row_number() over (order by f.m desc, f.ultima desc, f.customer_id) as rn,
      jsonb_build_object(
        'id', f.customer_id,
        'name', f.name,
        'email', f.email,
        'orderCount', f.f,
        'totalSpent', jsonb_build_object('amount', f.m, 'currency', (select c from moneda)),
        'lastOrderAt', f.ultima,
        'recency', f.r,
        'segment', f.segmento
      ) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * pp from acotada)
    and x.rn <= (select page * pp from acotada)
)

select jsonb_build_object(
  'segments', (
    select jsonb_agg(jsonb_build_object(
      'segment', r.segmento,
      'customers', r.clientes,
      'revenue', jsonb_build_object('amount', r.monto, 'currency', (select c from moneda))
    ) order by r.orden)
    from resumen r
  ),
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', (select pp from acotada),
  'pageCount', (select pc from acotada)
);
$$;

comment on function public.admin_customer_segments(uuid, text, integer, integer) is
  'Segmentos RFM de los clientes con compras, y la lista paginada de uno.';

revoke all on function public.admin_customer_segments(uuid, text, integer, integer)
  from public, anon;
grant execute on function public.admin_customer_segments(uuid, text, integer, integer)
  to authenticated;
