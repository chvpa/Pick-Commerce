-- Resumen del negocio y clientes, para el Admin.
--
-- Las dos son `security invoker`, como `admin_orders`: RLS decide qué filas se
-- ven y la función no verifica permisos por su cuenta. Para un usuario de otro
-- comercio no hacen falta guardas — las políticas de `orders` no le devuelven
-- ninguna fila, así que el resumen le sale en cero y la lista vacía.
--
-- Nada de esto es event tracking. El dashboard se deriva de los pedidos que ya
-- están en la base; los eventos de navegación (page_view, add_to_cart) son de
-- Fase 10 y no se adelantan acá.

-- ---------------------------------------------------------------------------
-- Resumen del período
-- ---------------------------------------------------------------------------
--
-- Un criterio que se repite y conviene tener claro: **un pedido cancelado no es
-- una venta**, así que queda fuera de ventas, de la cantidad de pedidos, del
-- ticket promedio y de lo más vendido. Sí aparece en el desglose por estado,
-- porque ahí lo que se mira es la operación y no la facturación: al operador le
-- importa cuántos se cancelaron.
--
-- `recent` ignora el período a propósito. Es la bandeja de entrada del operador
-- —qué entró último—, no una métrica: filtrarla por el rango dejaría el panel
-- vacío justo el día que no hubo ventas, que es cuando se lo mira.

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

totales as (
  select
    coalesce(sum(total_amount), 0)::bigint as ventas,
    count(*)::int                          as pedidos
  from vendidos
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
    from order_items i
    join vendidos v on v.id = i.order_id
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
  'byStatus', (select doc from por_estado),
  'topProducts', coalesce((select doc from top), '[]'::jsonb),
  'recent', coalesce((select doc from recientes), '[]'::jsonb)
);
$$;

comment on function public.admin_dashboard is
  'Resumen del período para el Admin, derivado de los pedidos. Los cancelados quedan fuera de ventas y ticket promedio, y dentro del desglose por estado.';

revoke all on function public.admin_dashboard(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_dashboard(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
--
-- Mismo esqueleto de paginación que `admin_orders` y `admin_products`: filtrado,
-- total, página acotada al rango válido. La búsqueda exige **todos** los
-- términos, así que dos palabras no traen a todas las Anas del padrón.
--
-- `p_customer_id` es lo que le permite al detalle usar esta misma función en vez
-- de una segunda: la ficha de un cliente son sus agregados, que ya se calculan
-- acá. Duplicarlos en otro select los haría divergir en cuanto alguien toque uno.
--
-- Los agregados excluyen cancelados por el mismo criterio que el dashboard: lo
-- que se canceló no es lo que el cliente gastó.

create or replace function public.admin_customers(
  p_store_id    uuid,
  p_query       text    default '',
  p_customer_id uuid    default null,
  p_page        integer default 1,
  p_per_page    integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with base as (
  select
    c.*,
    lower(c.name || ' ' || c.email || ' ' || c.phone) as hay,
    (select count(*)::int from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as pedidos,
    (select coalesce(sum(o.total_amount), 0)::bigint from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as gastado,
    (select max(o.created_at) from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as ultimo
  from customers c
  where c.store_id = p_store_id
    and (p_customer_id is null or c.id = p_customer_id)
),

filtrados as (
  select b.* from base b
  where p_query = '' or not exists (
    select 1
    from unnest(string_to_array(lower(trim(p_query)), ' ')) t(tok)
    where t.tok <> '' and position(t.tok in b.hay) = 0
  )
),

total as (select count(*)::int as n from filtrados),

pagina as (
  select greatest(1, ceil(t.n::numeric / greatest(1, p_per_page))::int) as page_count, t.n
  from total t
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from pagina pg
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      -- Los que compraron hace poco primero; los que nunca compraron, al final.
      row_number() over (order by f.ultimo desc nulls last, f.created_at desc, f.id) as rn,
      jsonb_strip_nulls(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'email', f.email,
        'phone', f.phone,
        'taxId', f.tax_id,
        'taxName', f.tax_name,
        'createdAt', f.created_at,
        'orderCount', f.pedidos,
        'totalSpent', jsonb_build_object(
          'amount', f.gastado,
          'currency', coalesce((select currency from stores where id = p_store_id), 'PYG')
        ),
        'lastOrderAt', f.ultimo
      )) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * p_per_page from acotada)
    and x.rn <= (select page * p_per_page from acotada)
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', p_per_page,
  'pageCount', (select page_count from acotada)
);
$$;

comment on function public.admin_customers is
  'Listado paginado de clientes con sus agregados de compra. Sirve también al detalle, vía p_customer_id.';

revoke all on function public.admin_customers(uuid, text, uuid, integer, integer) from public, anon;
grant execute on function public.admin_customers(uuid, text, uuid, integer, integer) to authenticated;
