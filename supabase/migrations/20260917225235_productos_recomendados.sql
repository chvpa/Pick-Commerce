/*
 * «Quien vio esto también vio»: `recommended_products` (ADR-127, v2 Fase 4).
 *
 * **Una función para las tres anclas del ROADMAP**, porque son tres listas de
 * entrada sobre la misma tabla y el mismo índice, no tres consultas:
 *
 * - ancla **producto**: el PDP pasa el producto que se está mirando;
 * - ancla **carrito**: el endpoint pasa los productos del carrito;
 * - ancla **visitante**: los últimos productos que vio ese dispositivo.
 *
 * Si no se nombran por separado, «recomendados» suena a una cosa y son tres; si
 * se implementan por separado, son tres consultas que hay que mantener iguales.
 *
 * El documento del producto sale de `app.catalog_items`, así que la tarjeta de una
 * tira es **la misma** que la del catálogo: mismo precio con promoción, mismo
 * tachado, mismo stock, y sin lo que el catálogo esconde.
 */

create or replace function public.recommended_products(
  p_store_id    uuid,
  p_anchor_ids  uuid[],
  p_limit       integer default 8
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with
anclas as (
  select distinct id from unnest(coalesce(p_anchor_ids, '{}'::uuid[])) as t(id)
),

/*
 * Suma de puntajes sobre todos los anclas: un producto que se relaciona con dos
 * cosas del carrito vale más que uno que se relaciona con una.
 */
candidatos as (
  select a.related_id, sum(a.score) as score
  from product_affinity a
  join anclas an on an.id = a.product_id
  /*
   * El filtro de tienda es **defensa en profundidad y no la barrera**: la barrera
   * es `app.catalog_items`, que descarta lo que no es de esta tienda y tiene su
   * propio test adversarial. Se comprobó quitándolo: ningún caso se pone en rojo,
   * porque los ids ajenos igual mueren al serializarse. Se deja igual —cuesta
   * nada y evita traer filas para tirarlas— pero no se cuenta como cobertura.
   */
  where a.store_id = p_store_id
    -- Lo que ya está en el ancla no es una recomendación: es lo que se está
    -- mirando, o lo que ya está en el carrito.
    and a.related_id not in (select id from anclas)
  group by a.related_id
  order by sum(a.score) desc, a.related_id
  /*
   * Se piden más de los que se van a mostrar porque `app.catalog_items` descarta
   * lo que el catálogo esconde: sin este margen, una tira de ocho con dos
   * agotados queda en seis.
   */
  limit least(greatest(coalesce(p_limit, 8), 1), 24) * 3
),

documentos as (
  select app.catalog_items(
    p_store_id,
    (select array_agg(c.related_id order by c.score desc, c.related_id) from candidatos c)
  ) as items
)

select coalesce(
  (
    select jsonb_agg(item)
    from (
      select item
      from documentos d, jsonb_array_elements(d.items) as item
      limit least(greatest(coalesce(p_limit, 8), 1), 24)
    ) x
  ),
  '[]'::jsonb
);
$$;

comment on function public.recommended_products is
  'Productos relacionados con uno o varios anclas, con el mismo documento que el catálogo (ADR-127).';

/*
 * Sólo el servicio. La llama el Worker con la secret key, como al catálogo: los
 * ids del ancla salen de lo que alguien está mirando o de su carrito, y quien
 * garantiza que son suyos es el Worker.
 */
revoke all on function public.recommended_products(uuid, uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.recommended_products(uuid, uuid[], integer)
  to service_role;
