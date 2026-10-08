/*
 * El resumen de las reseñas (v3 Fase 2).
 *
 * La pantalla de Reseñas del handoff abre con el promedio, cuántas hay de cada
 * estrella y cuántos puntos paga una reseña publicada, y separa las reseñas en
 * pestañas con su conteo. Todo sale de la misma función que ya listaba, en la
 * misma vuelta: misma firma, con un `resumen` y la foto de cada producto de más.
 *
 * El promedio y la distribución son de **lo publicado**, que es lo que ve quien
 * compra: una reseña pendiente o rechazada no es parte de la nota de la tienda.
 */

create or replace function public.admin_product_reviews(
  p_store_id uuid,
  p_status text default null,
  p_page integer default 1,
  p_per_page integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with permitido as (
    select s.id, s.tenant_id
    from stores s
    where s.id = p_store_id and s.tenant_id in (select app.current_tenants())
  ),
  todas as (
    select r.*
    from product_reviews r
    join permitido pe on pe.id = r.store_id
  ),
  filtradas as (
    select * from todas
    where p_status is null or status = p_status::review_status
  ),
  total as (select count(*)::int as n from filtradas),
  acotada as (
    select least(greatest(1, coalesce(p_page, 1)), greatest(1, ceil(t.n::numeric / p_per_page)::int)) as page,
           greatest(1, ceil(t.n::numeric / p_per_page)::int) as page_count,
           t.n
    from total t
  ),
  -- El corte de página antes de armar las filas, como en las otras listas.
  de_la_pagina as (
    select f.id, f.rn
    from (
      select f.id, row_number() over (order by f.created_at desc, f.id) as rn
      from filtradas f
    ) f, acotada a
    where f.rn > (a.page - 1) * p_per_page
      and f.rn <= a.page * p_per_page
  ),
  items as (
    select jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id', r.id,
        'productId', r.product_id,
        'producto', p.title,
        'handle', p.handle,
        'imagen', (
          select m.url from product_media m
          where m.product_id = r.product_id order by m.position limit 1
        ),
        'rating', r.rating,
        'body', r.body,
        'status', r.status,
        'cliente', c.name,
        'fecha', r.created_at
      )) order by d.rn
    ) as docs
    from de_la_pagina d
    join product_reviews r on r.id = d.id
    join products p on p.id = r.product_id
    left join customers c on c.id = r.customer_id
  ),
  publicadas as (
    select rating from todas where status = 'published'
  )
  select jsonb_build_object(
    'items', coalesce((select docs from items), '[]'::jsonb),
    'total', (select n from acotada),
    'page', (select page from acotada),
    'perPage', p_per_page,
    'pageCount', (select page_count from acotada),
    'pendientes', (select count(*)::int from todas where status = 'pending'),
    'resumen', jsonb_build_object(
      'pending', (select count(*)::int from todas where status = 'pending'),
      'published', (select count(*)::int from publicadas),
      'rejected', (select count(*)::int from todas where status = 'rejected'),
      -- Con un decimal, como se lee una nota. Nulo sin publicadas: cero estrellas
      -- sería una nota, y no la hay.
      'promedio', (select round(avg(rating)::numeric, 1) from publicadas),
      'estrellas', jsonb_build_array(
        (select count(*)::int from publicadas where rating = 1),
        (select count(*)::int from publicadas where rating = 2),
        (select count(*)::int from publicadas where rating = 3),
        (select count(*)::int from publicadas where rating = 4),
        (select count(*)::int from publicadas where rating = 5)
      ),
      -- Lo que paga una reseña publicada, si el programa está encendido.
      'puntosPorResena', (
        select case when (app.regla_de_puntos(pe.id)->>'enabled')::boolean
                    then (app.regla_de_puntos(pe.id)->>'porResena')::int end
        from permitido pe
      )
    )
  );
$$;

comment on function public.admin_product_reviews is
  'Las reseñas de la tienda para moderar, paginadas, con el resumen de lo publicado y el conteo por estado (v3 Fase 2). Definer con el corte por organización adentro.';
