/*
 * Sugerencias mientras se escribe (Fase 3, ADR-125).
 *
 * Devuelve títulos, no productos: Treeshop tiene la misma «Remera Nike Negro» en
 * varias filas, y ocho sugerencias iguales no ayudan a nadie. Elegir una busca
 * ese título, que trae todas.
 *
 * **Umbral más bajo que el del catálogo** (0,3 contra 0,5). Una sugerencia es
 * una propuesta, no un resultado: mientras se escribe «zapat» tiene que ofrecer
 * algo, y cuando la búsqueda no encontró nada es lo que alimenta «¿Quisiste
 * decir…?». Lo que mejor coincide va primero, así que el parecido flojo sólo
 * aparece cuando no hay nada mejor.
 *
 * **Mismas reglas de visibilidad que `catalog_search`**: sin stock y —si la
 * tienda lo pide— sin foto, no se sugiere. Sugerir un título que después da
 * cero resultados sería peor que no sugerir nada.
 *
 * Sólo `service_role`: la llama el Worker con la secret key, como al catálogo.
 */

create or replace function public.search_suggest(
  p_store_id uuid,
  p_q        text,
  p_limit    integer default 8
) returns jsonb
language sql
stable
set search_path = public, extensions, pg_temp
as $$
with
consulta as (
  select app.normalizar_busqueda(trim(coalesce(p_q, ''))) as t
),

ajustes as (
  select
    coalesce((select s.settings->'catalog'->>'showOutOfStock' from store_settings s
               where s.store_id = p_store_id), 'false') = 'true' as con_agotados,
    coalesce((select s.settings->'catalog'->>'hideWithoutImage' from store_settings s
               where s.store_id = p_store_id), 'false') = 'true' as sin_foto_oculta
),

candidatos as (
  select
    p.title,
    -- Lo literal vale 1, y empezar por lo escrito suma: quien escribe «rem»
    -- quiere «Remera…» antes que «Cremera…».
    greatest(
      case when strpos(p.search_doc, c.t) > 0 then 1.0 else 0 end,
      word_similarity(c.t, p.search_doc)::numeric
    ) + case when starts_with(p.search_doc, c.t) then 0.5 else 0 end as puntaje
  from products p
  cross join consulta c
  cross join ajustes a
  -- Con menos de dos letras cualquier cosa se parece.
  where length(c.t) >= 2
    and p.store_id = p_store_id
    and p.status = 'active'
    and (strpos(p.search_doc, c.t) > 0 or word_similarity(c.t, p.search_doc) >= 0.3)
    and (
      a.con_agotados
      or exists (
        select 1
        from product_variants v
        join inventory_levels il on il.variant_id = v.id
        where v.product_id = p.id and il.available > 0
      )
    )
    and (
      not a.sin_foto_oculta
      or exists (select 1 from product_media m where m.product_id = p.id)
    )
),

-- Un título una sola vez, con su mejor puntaje. Se compara normalizado: «Remera
-- Nike» y «REMERA NIKE» son la misma sugerencia.
unicos as (
  select distinct on (app.normalizar_busqueda(title)) title, puntaje
  from candidatos
  order by app.normalizar_busqueda(title), puntaje desc
)

select coalesce(jsonb_agg(u.title order by u.puntaje desc, u.title), '[]'::jsonb)
from (
  select title, puntaje
  from unicos
  order by puntaje desc, title
  limit least(greatest(coalesce(p_limit, 8), 1), 8)
) u;
$$;

-- Nace con el `execute` de `PUBLIC`, que incluye a `anon`: el rol del navegador.
revoke all on function public.search_suggest(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_suggest(uuid, text, integer) to service_role;
