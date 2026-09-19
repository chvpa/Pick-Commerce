/*
 * Si una sección de la portada sirvió: `admin_section_performance`.
 *
 * Es la línea que el ROADMAP pedía y que la Fase 4 había diferido por no tener
 * el evento que la alimenta. Ya existe: `section_click`, que anota el PDP cuando
 * el enlace trae `?s=<sección>` —cero JavaScript nuevo, como el resto (ADR-099)—.
 *
 * **La atribución no necesitó una columna nueva.** Un pedido ya está atado a su
 * visita por el evento `checkout_completed`, que guarda el `orderId`, así que la
 * cadena es: alguien entró a un producto desde una sección, y **en esa misma
 * visita** compró ese producto. Sin eso habría que llevar la sección en el
 * carrito y después al pedido, que es un campo nuevo en dos lugares para
 * responder una pregunta de tablero.
 *
 * Lo que esa decisión cuesta, dicho: **no hay atribución entre visitas**. Quien
 * ve algo el lunes desde un carrusel y vuelve a comprarlo el jueves cuenta como
 * click el lunes y como nada el jueves. Es el mismo criterio que el embudo, que
 * se cuenta por sesión (ADR-099), y es lo que hace que los números de acá y los
 * de Analytics signifiquen lo mismo.
 *
 * `security invoker`, como `admin_analytics`: lo que acota es RLS por tenant
 * sobre las tablas que toca, y todas tienen política para el Admin.
 */

create or replace function public.admin_section_performance(
  p_store_id uuid,
  p_days     integer default 30
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with
ventana as (
  select now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365)) as desde
),

-- De qué sección salió cada producto que alguien abrió, y en qué visita.
clics as (
  select e.session_id,
         (e.data->>'sectionId')::uuid as section_id,
         (e.data->>'productId')::uuid as product_id,
         e.occurred_at
  from store_events e, ventana v
  /*
   * El filtro de tienda es defensa en profundidad: los ids de sección son únicos
   * en todo el esquema, así que un click ajeno no tendría con qué juntarse.
   * Comprobado quitándolo —ningún caso se pone en rojo— y se deja escrito para
   * que no se cuente como cobertura.
   */
  where e.store_id = p_store_id
    and e.type = 'section_click'
    and e.occurred_at >= v.desde
    and e.data->>'sectionId' is not null
    and e.data->>'productId' is not null
),

-- Los pedidos de esas mismas visitas. El evento es el que ata pedido y sesión.
compras as (
  select e.session_id, (e.data->>'orderId')::uuid as order_id, e.occurred_at
  from store_events e, ventana v
  where e.store_id = p_store_id
    and e.type = 'checkout_completed'
    and e.occurred_at >= v.desde
    and e.data->>'orderId' is not null
),

-- Una línea por producto comprado, con lo que se pagó por ella.
lineas as (
  select c.session_id, c.order_id, c.occurred_at, pv.product_id,
         (oi.unit_price * oi.quantity)::bigint as importe
  from compras c
  join orders o on o.id = c.order_id and o.store_id = p_store_id and o.status <> 'cancelled'
  join order_items oi on oi.order_id = o.id
  join product_variants pv on pv.id = oi.variant_id
),

/*
 * Lo que una sección se lleva: una línea comprada cuyo producto se abrió desde
 * esa sección **antes** en la misma visita. El `distinct on` evita contar dos
 * veces la misma línea cuando alguien entró dos veces desde la misma sección.
 */
atribuidas as (
  select distinct on (l.order_id, l.product_id, k.section_id)
         k.section_id, l.order_id, l.importe
  from lineas l
  join clics k
    on k.session_id = l.session_id
   and k.product_id = l.product_id
   and k.occurred_at <= l.occurred_at
  order by l.order_id, l.product_id, k.section_id, k.occurred_at desc
)

select coalesce(
  jsonb_object_agg(
    s.id,
    jsonb_build_object(
      'clicks', coalesce(c.n, 0),
      'orders', coalesce(a.pedidos, 0),
      'revenue', coalesce(a.importe, 0)
    )
  ),
  '{}'::jsonb
)
from home_sections s
left join (
  select section_id, count(*)::int as n from clics group by section_id
) c on c.section_id = s.id
left join (
  select section_id, count(distinct order_id)::int as pedidos, sum(importe)::bigint as importe
  from atribuidas group by section_id
) a on a.section_id = s.id
where s.store_id = p_store_id;
$$;

comment on function public.admin_section_performance is
  'Clics, pedidos e importe atribuidos a cada sección de la portada, por sesión y dentro de la ventana pedida.';

revoke all on function public.admin_section_performance(uuid, integer) from public, anon;
grant execute on function public.admin_section_performance(uuid, integer) to authenticated, service_role;
