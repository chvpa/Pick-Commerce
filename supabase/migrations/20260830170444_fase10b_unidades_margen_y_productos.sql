-- Fase 10 Etapa B — unidades, margen y ventas por producto.
--
-- Tres cosas que la Etapa A dejó pendientes porque salen de los pedidos y no de
-- los eventos, y una que estaba bloqueada por un dato que faltaba.
--
-- El criterio que las ordena es el de ADR-067, sin cambios: **el Resumen responde
-- por el dinero**. Unidades y margen son dinero, y qué se movió y qué no también
-- —lo quieto es capital parado—. Lo que mide comportamiento sigue en Analytics.
--
-- El margen se informa siempre junto a su **cobertura**: qué fracción de los
-- ingresos tiene costo conocido. Un margen sobre cobertura parcial no es un
-- margen — si la mitad del catálogo no tiene costo, el número da el doble de lo
-- real y parece excelente. Es el mismo criterio que `medidoDesde` en la
-- conversión (ADR-099): declarar el hueco en vez de dar un número que no se puede
-- explicar.

create or replace function public.admin_dashboard(
  p_store_id uuid,
  p_from     timestamptz,
  p_to       timestamptz
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with moneda as (
  -- Si la tienda no se ve (RLS) queda PYG: el resumen sale en cero igual, y una
  -- moneda por defecto es mejor que un nulo propagándose hasta el formateo.
  select coalesce((select currency from stores where id = p_store_id), 'PYG') as code
),

-- Los pedidos del período, una sola vez para todo lo que sigue.
periodo as (
  select o.*
  from orders o
  where o.store_id = p_store_id
    and o.created_at >= p_from
    and o.created_at <  p_to
),

vendidos as (
  select * from periodo where status <> 'cancelled'
),

-- Las líneas de lo vendido. Antes cada bloque volvía a unir `order_items` con
-- los pedidos; ahora se hace una vez y lo usan las unidades, el margen y el top.
lineas as (
  select i.*
  from order_items i
  join vendidos v on v.id = i.order_id
),

totales as (
  select
    coalesce(sum(total_amount), 0)::bigint as ventas,
    count(*)::int                          as pedidos
  from vendidos
),

/*
 * Unidades y margen.
 *
 * El margen sólo suma las líneas que **tienen** costo, y aparte se informa qué
 * fracción de los ingresos cubren. Un margen sobre cobertura parcial no es un
 * margen: si la mitad del catálogo no tiene costo cargado, el número da el doble
 * de lo real y parece excelente. Con la cobertura al lado, se lee por lo que es.
 *
 * Los pedidos anteriores a la Fase 10 no tienen costo y nunca lo van a tener:
 * cuentan como cobertura faltante, que es la verdad.
 */
unidades as (
  select
    coalesce(sum(quantity), 0)::int as n,
    coalesce(sum(
      case when unit_cost is not null
        then (unit_price - unit_cost) * quantity
      end
    ), 0)::bigint as margen,
    coalesce(sum(
      case when unit_cost is not null then unit_price * quantity end
    ), 0)::bigint as con_costo,
    coalesce(sum(unit_price * quantity), 0)::bigint as bruto
  from lineas
),

por_estado as (
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) as doc
  from (select status, count(*)::int as n from periodo group by status) s
),

top as (
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'title', t.title,
           'variantTitle', t.variant_title,
           'sku', t.sku,
           'quantity', t.cantidad,
           'revenue', jsonb_build_object('amount', t.importe, 'currency', (select code from moneda))
         )) order by t.cantidad desc, t.title) as doc
  from (
    select i.title, i.variant_title, i.sku,
           sum(i.quantity)::int                   as cantidad,
           sum(i.unit_price * i.quantity)::bigint as importe
    from lineas i
    -- Por el snapshot y no por `variant_id`: el pedido guarda lo que se vendió
    -- ese día. Si después le cambian el título a la variante el histórico no se
    -- reescribe, y si la variante se borra lo vendido no desaparece del informe.
    group by i.title, i.variant_title, i.sku
    order by cantidad desc, i.title
    limit 5
  ) t
),

recientes as (
  select jsonb_agg(jsonb_strip_nulls(r.doc) order by r.rn) as doc
  from (
    select row_number() over (order by o.created_at desc, o.id) as rn,
           jsonb_build_object(
             'id', o.id,
             'number', o.number,
             'createdAt', o.created_at,
             'customerName', o.customer->>'name',
             'total', jsonb_build_object('amount', o.total_amount, 'currency', o.currency),
             'status', o.status,
             'paymentStatus', o.payment_status,
             'itemCount', (select coalesce(sum(i.quantity), 0)::int
                           from order_items i where i.order_id = o.id)
           ) as doc
    from orders o
    where o.store_id = p_store_id
  ) r
  where r.rn <= 5
)

select jsonb_build_object(
  'sales', jsonb_build_object(
    'amount', (select ventas from totales),
    'currency', (select code from moneda)
  ),
  'orderCount', (select pedidos from totales),
  'aov', jsonb_build_object(
    -- `greatest(pedidos, 1)` y no un `case`: sin pedidos el numerador ya es 0,
    -- así que el resultado es 0 y no hay división por cero que esquivar.
    'amount', (select round(ventas::numeric / greatest(pedidos, 1))::bigint from totales),
    'currency', (select code from moneda)
  ),
  'units', (select n from unidades),
  /*
   * El margen va `null` cuando no hay **nada** con costo, en vez de cero: cero es
   * un margen, y «no sé» no lo es. La pantalla muestra un guion.
   */
  'margin', case
    when (select con_costo from unidades) = 0 then null
    else jsonb_build_object(
      'amount', (select margen from unidades),
      'currency', (select code from moneda)
    )
  end,
  -- Qué fracción de los ingresos tiene costo conocido, en tanto por uno.
  'marginCoverage', (
    select round(con_costo::numeric / greatest(bruto, 1), 4) from unidades
  ),
  'byStatus', (select doc from por_estado),
  'topProducts', coalesce((select doc from top), '[]'::jsonb),
  'recent', coalesce((select doc from recientes), '[]'::jsonb)
);
$$;

comment on function public.admin_dashboard is
  'Resumen del período derivado de los pedidos, con unidades y margen. Los cancelados quedan fuera de ventas y ticket promedio, y dentro del desglose por estado.';

revoke all on function public.admin_dashboard(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_dashboard(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Ventas por producto: lo que se movió y lo que no
-- ---------------------------------------------------------------------------
--
-- Una sola función para las dos preguntas, porque son la misma mirada desde dos
-- lados: qué conviene reponer y qué está inmovilizando plata.
--
--   vendidos        agrupado por el snapshot de la línea, de mayor a menor
--   sin_movimiento  variantes publicadas que **no** vendieron nada en el período
--
-- El segundo modo no puede salir de `order_items` —lo que no se vendió no tiene
-- líneas— así que sale del catálogo. Por eso trae `stock`: sin él, «no se
-- vendió» es una curiosidad; con él es cuánto capital está quieto.
--
-- Pagina, como manda ADR-024: el catálogo de un comercio real no entra en una
-- respuesta, y el export de CSV la recorre por páginas igual que el del catálogo.

create or replace function public.admin_product_performance(
  p_store_id uuid,
  p_from     timestamptz,
  p_to       timestamptz,
  p_modo     text default 'vendidos',
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with moneda as (
  select coalesce((select currency from stores where id = p_store_id), 'PYG') as code
),

vendidos as (
  select o.id
  from orders o
  where o.store_id = p_store_id
    and o.created_at >= p_from
    and o.created_at <  p_to
    and o.status <> 'cancelled'
),

-- Lo vendido en el período, agrupado por el snapshot de la línea. Por el
-- snapshot y no por `variant_id`, igual que el top del resumen: el pedido guarda
-- lo que se vendió ese día, y si después le cambian el título a la variante el
-- histórico no se reescribe.
movidos as (
  select
    i.sku,
    min(i.title)                                   as title,
    min(i.variant_title)                           as variant_title,
    sum(i.quantity)::int                           as unidades,
    sum(i.unit_price * i.quantity)::bigint         as ingresos,
    sum(case when i.unit_cost is not null
             then (i.unit_price - i.unit_cost) * i.quantity end)::bigint as margen,
    sum(case when i.unit_cost is not null
             then i.unit_price * i.quantity end)::bigint                 as con_costo
  from order_items i
  join vendidos v on v.id = i.order_id
  group by i.sku
),

/*
 * Las variantes publicadas que no vendieron nada.
 *
 * `left join` contra lo movido y se queda con lo que no matcheó. El stock se
 * suma de todas las sucursales, que es como lo mira quien decide una liquidación.
 */
quietos as (
  select
    v.sku,
    p.title                                    as title,
    nullif(v.title, '')                        as variant_title,
    0                                          as unidades,
    0::bigint                                  as ingresos,
    null::bigint                               as margen,
    0::bigint                                  as con_costo,
    coalesce((
      select sum(il.available) from inventory_levels il where il.variant_id = v.id
    ), 0)::int                                 as stock
  from product_variants v
  join products p on p.id = v.product_id
  where p.store_id = p_store_id
    and p.status = 'active'
    and not exists (select 1 from movidos m where m.sku = v.sku)
),

elegidos as (
  select sku, title, variant_title, unidades, ingresos, margen, con_costo,
         null::int as stock
  from movidos
  where p_modo = 'vendidos'
  union all
  select sku, title, variant_title, unidades, ingresos, margen, con_costo, stock
  from quietos
  where p_modo = 'sin_movimiento'
),

total as (select count(*)::int as n from elegidos),

-- La página, acotada al rango válido: pedir la 99 de tres devuelve la última y
-- no una lista vacía, que se confunde con «no hay nada».
paginado as (
  select
    greatest(1, least(p_page, greatest(1, ceil((select n from total)::numeric / p_per_page)::int))) as page
),

filas as (
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'sku', e.sku,
           'title', e.title,
           'variantTitle', e.variant_title,
           'unidades', e.unidades,
           'ingresos', jsonb_build_object('amount', e.ingresos, 'currency', (select code from moneda)),
           -- `null` y no cero cuando no hay costo: cero es un margen y «no sé» no
           -- lo es.
           'margen', case when coalesce(e.con_costo, 0) = 0 then null else jsonb_build_object(
             'amount', coalesce(e.margen, 0), 'currency', (select code from moneda)
           ) end,
           'stock', e.stock
         )) order by e.orden) as doc
  from (
    select e.*,
           row_number() over (
             order by
               case when p_modo = 'vendidos' then e.unidades end desc,
               e.title,
               e.sku
           ) as orden
    from elegidos e
  ) e
  where e.orden > ((select page from paginado) - 1) * p_per_page
    and e.orden <= (select page from paginado) * p_per_page
)

select jsonb_build_object(
  'items', coalesce((select doc from filas), '[]'::jsonb),
  'total', (select n from total),
  'page', (select page from paginado),
  'perPage', p_per_page,
  'pageCount', greatest(1, ceil((select n from total)::numeric / p_per_page)::int)
);
$$;

comment on function public.admin_product_performance is
  'Ventas por producto del período, o las variantes publicadas que no vendieron nada. Paginado.';

revoke all on function public.admin_product_performance(uuid, timestamptz, timestamptz, text, integer, integer)
  from public, anon;
grant execute on function public.admin_product_performance(uuid, timestamptz, timestamptz, text, integer, integer)
  to authenticated;
