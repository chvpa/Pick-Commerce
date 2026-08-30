-- Fase 10 — la conversión sólo cuenta el tramo que se midió.
--
-- **Corrige la migración anterior el mismo día.** El panel mostró «Compraron 6 ·
-- 600 %», y no era un problema del entorno de prueba: es lo que va a ver toda
-- tienda que active analytics.
--
-- El motivo es que numerador y denominador tienen historias distintas. `orders`
-- viene de la Fase 5 y está lleno; `store_events` nace hoy y está vacío. Pedir
-- «últimos 30 días» el primer día devuelve treinta días de pedidos y unas horas
-- de sesiones, y la división no significa nada.
--
-- El arreglo es acotar **las dos** puntas al mismo tramo: la conversión se
-- calcula desde el primer evento que existe, no desde el borde del período. Así
-- las dos mitades hablan del mismo lapso.
--
-- La identidad con `admin_dashboard` no se pierde, se vuelve condicional y
-- explícita: **coinciden cuando el período está medido entero**, que es el estado
-- normal y es lo que pide el Definition of Done. Mientras no lo esté, la función
-- devuelve `medidoDesde` y la pantalla lo dice, en vez de dar un número que
-- parece una tasa y no lo es.
--
-- Es la misma línea de ADR-067: media capacidad de analytics es peor que
-- ninguna, porque el panel invita a leer tasas que no puede calcular.

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

/*
 * Desde cuándo hay medición dentro de este período.
 *
 * `null` si no hay ningún evento — ahí no hay nada que dividir y la pantalla
 * muestra su estado vacío.
 */
medido as (
  select min(occurred_at) as desde from eventos
),

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
    count(distinct session_id) filter (where type = 'begin_checkout')::int as checkout
  from eventos
),

/*
 * Los pedidos, de `orders` y no de los eventos.
 *
 * Es el punto del diseño: si esto contara `checkout_completed`, la conversión
 * sería la de un log que puede perder escrituras —van con `waitUntil`— y el
 * Definition of Done sería una coincidencia a verificar en vez de una identidad.
 *
 * Lo único que cambia respecto de la versión anterior es el borde inferior:
 * `greatest(p_from, primer_evento)`. Sin eso se comparaban treinta días de
 * pedidos contra unas horas de sesiones.
 */
pedidos as (
  select count(*)::int as n
  from orders o
  where o.store_id = p_store_id
    and o.created_at >= greatest(p_from, coalesce((select desde from medido), p_to))
    and o.created_at <  p_to
    and o.status <> 'cancelled'
),

/*
 * Sesiones que empezaron el checkout y no lo terminaron.
 *
 * Se calcula por sesión y no restando totales: restar daría negativo el día que
 * alguien empiece el checkout antes de medianoche y compre después, y un abandono
 * negativo es peor que uno impreciso.
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
 * El término llega normalizado desde el core —minúsculas, espacios colapsados—
 * porque forma parte de la clave de deduplicación. Acá sólo se agrupa.
 *
 * Un término con ocho búsquedas y ocho sin resultados es un producto que la gente
 * pide y la tienda no tiene: es el hallazgo que justifica toda esta tabla, y por
 * eso las dos columnas se leen juntas.
 */
terminos as (
  select jsonb_agg(jsonb_build_object(
           'termino', t.termino,
           'busquedas', t.busquedas,
           'sinResultados', t.vacias
         ) order by t.busquedas desc, t.termino) as doc
  from (
    select
      e.data->>'term'                                           as termino,
      count(*) filter (where e.type = 'search')::int             as busquedas,
      count(*) filter (where e.type = 'search_no_results')::int  as vacias
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
  -- Desde cuándo hay medición. La pantalla lo compara con el borde del período:
  -- si es posterior, avisa que la conversión mira un tramo más corto.
  'medidoDesde', (select desde from medido),
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
  'Sesiones, embudo y búsquedas del período. Los pedidos salen de orders, acotados al tramo con medición.';

revoke all on function public.admin_analytics(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_analytics(uuid, timestamptz, timestamptz) to authenticated;
