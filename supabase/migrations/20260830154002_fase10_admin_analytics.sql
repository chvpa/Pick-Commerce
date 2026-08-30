-- Fase 10 Etapa A — el resumen de navegación, para el Admin.
--
-- Gemela de `admin_dashboard` y con su misma forma: `security invoker`, todo
-- agregado en SQL, un solo `jsonb` de vuelta. RLS decide qué se ve, y a un
-- usuario de otro comercio le sale en cero sin necesidad de guardas.
--
-- **Agregar acá y no en el navegador no es una preferencia.** El Admin consulta
-- por PostgREST, que trunca a 1000 filas por defecto: contar eventos desde el
-- cliente daría un número plausible y equivocado, sin ningún error de por medio.
--
-- La división del trabajo, que es lo que hace que el número sea creíble:
--
--   los eventos  aportan el denominador — sesiones y pasos del embudo
--   `orders`     aporta el numerador   — pedidos, sin los cancelados
--
-- Así la conversión coincide con lo que informa el resumen de ventas por
-- construcción y no por casualidad. Y se hereda el criterio de ADR-067 sin
-- discutirlo: un pedido cancelado no es una venta.

/*
 * Un paso del embudo: cuántas sesiones llegaron, y qué fracción del total son.
 *
 * Existe para que los tres pasos se calculen igual. Escrita tres veces en línea,
 * la primera vez que alguien cambie el redondeo lo cambia en dos de las tres y
 * el panel muestra dos criterios a la vez sin que nada falle.
 *
 * `greatest(total, 1)` y no un `case`: sin sesiones el numerador ya es 0, así que
 * el resultado es 0 y no hay división por cero que esquivar. Es el mismo recurso
 * que usa el ticket promedio en `admin_dashboard`.
 */
create or replace function app.paso_del_embudo(p_sesiones int, p_total int)
returns jsonb
language sql
immutable
set search_path = pg_temp
as $$
  select jsonb_build_object(
    'sesiones', coalesce(p_sesiones, 0),
    'tasa', round(coalesce(p_sesiones, 0)::numeric / greatest(coalesce(p_total, 0), 1), 4)
  );
$$;

comment on function app.paso_del_embudo is
  'Un paso del embudo con su tasa sobre el total de sesiones. Un solo criterio de redondeo para los tres.';

/*
 * El grant va explícito, y no es de más.
 *
 * `grant execute on all functions in schema app` de la Fase 3 es una foto del
 * momento: no alcanza a las funciones que se crean después. La Fase 9 lo
 * descubrió cuando un pedido falló en producción con la migración aplicada sin
 * un solo error.
 */
revoke all on function app.paso_del_embudo(int, int) from public, anon;
grant execute on function app.paso_del_embudo(int, int) to authenticated, service_role;

create or replace function public.admin_analytics(
  p_store_id uuid,
  p_from     timestamptz,
  p_to       timestamptz
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with eventos as (
  select e.*
  from store_events e
  where e.store_id = p_store_id
    and e.occurred_at >= p_from
    and e.occurred_at <  p_to
),

-- El denominador de todo. Una sesión es una persona en una visita, no una
-- petición: sin `distinct`, el embudo mediría recargas.
sesiones as (
  select count(distinct session_id)::int as n from eventos
),

vistas as (
  select
    count(*) filter (where type = 'page_view')::int    as paginas,
    count(*) filter (where type = 'product_view')::int as productos
  from eventos
),

-- Cada paso, por sesiones distintas. Agregar dos veces al carrito no son dos
-- personas que llegaron al carrito.
embudo as (
  select
    count(distinct session_id) filter (where type = 'add_to_cart')::int    as carrito,
    count(distinct session_id) filter (where type = 'begin_checkout')::int as checkout,
    count(distinct session_id) filter (where type = 'checkout_completed')::int as compraron
  from eventos
),

/*
 * Los pedidos del período, de `orders` y no de los eventos.
 *
 * Es el punto entero del diseño. Si esto contara `checkout_completed`, la
 * conversión sería la de un log que puede perder escrituras —van con
 * `waitUntil`— y el Definition of Done de la fase, «las métricas coinciden con
 * orders», sería una coincidencia que hay que verificar en vez de una identidad.
 */
pedidos as (
  select count(*)::int as n
  from orders o
  where o.store_id = p_store_id
    and o.created_at >= p_from
    and o.created_at <  p_to
    and o.status <> 'cancelled'
),

/*
 * Sesiones que empezaron el checkout y no lo terminaron.
 *
 * Se calcula por sesión y no restando totales: restar
 * `checkout - compraron` daría negativo el día que alguien empiece el checkout
 * antes de medianoche y compre después, y un abandono negativo en el panel es
 * peor que uno impreciso.
 */
abandono as (
  select count(*)::int as n
  from (
    select session_id
    from eventos
    where type in ('begin_checkout', 'checkout_completed')
    group by session_id
    having count(*) filter (where type = 'begin_checkout') > 0
       and count(*) filter (where type = 'checkout_completed') = 0
  ) s
),

/*
 * Qué se buscó, y qué de eso no encontró nada.
 *
 * El término llega ya normalizado desde el core —minúsculas, espacios
 * colapsados— porque forma parte de la clave de deduplicación. Acá sólo se
 * agrupa.
 *
 * `search_no_results` acompaña siempre a un `search`, así que las dos columnas
 * se leen juntas: un término con `busquedas = 8` y `sinResultados = 8` es un
 * producto que la gente pide y la tienda no tiene, que es el hallazgo que
 * justifica toda esta tabla.
 */
terminos as (
  select jsonb_agg(jsonb_build_object(
           'termino', t.termino,
           'busquedas', t.busquedas,
           'sinResultados', t.vacias
         ) order by t.busquedas desc, t.termino) as doc
  from (
    select
      e.data->>'term'                                        as termino,
      count(*) filter (where e.type = 'search')::int         as busquedas,
      count(*) filter (where e.type = 'search_no_results')::int as vacias
    from eventos e
    where e.type in ('search', 'search_no_results')
      and coalesce(e.data->>'term', '') <> ''
    group by e.data->>'term'
    order by busquedas desc, termino
    limit 20
  ) t
)

select jsonb_build_object(
  'sesiones', (select n from sesiones),
  'vistas', (select paginas from vistas),
  'vistasDeProducto', (select productos from vistas),
  'agregaronAlCarrito', app.paso_del_embudo(
    (select carrito from embudo), (select n from sesiones)
  ),
  'empezaronElCheckout', app.paso_del_embudo(
    (select checkout from embudo), (select n from sesiones)
  ),
  'convirtieron', app.paso_del_embudo(
    (select n from pedidos), (select n from sesiones)
  ),
  'abandonaron', (select n from abandono),
  'terminos', coalesce((select doc from terminos), '[]'::jsonb)
);
$$;

comment on function public.admin_analytics is
  'Sesiones, embudo y búsquedas del período. El denominador sale de los eventos; los pedidos, de orders.';

revoke all on function public.admin_analytics(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_analytics(uuid, timestamptz, timestamptz) to authenticated;
