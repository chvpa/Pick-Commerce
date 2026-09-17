/*
 * El documento de búsqueda, materializado. Primera mitad de la Fase 3 (ADR-125).
 *
 * Hasta hoy `catalog_search` armaba el heno —`lower(title || brand ||
 * string_agg(skus))`— **para cada producto de la tienda en cada petición**, haya
 * término de búsqueda o no. En el plan del listado de Treeshop es un `SubPlan`
 * con `loops=2096`. Y ningún índice puede servir un texto que se calcula ahí.
 *
 * **Es una columna generada, no un valor mantenido por trigger.** El plan de la
 * fase dudaba entre un trigger sobre tres tablas y una tabla lateral, porque daba
 * por hecho que los SKU y la categoría iban al mismo documento. No van:
 *
 * - Los SKU se buscan por **prefijo exacto** contra `product_variants`, aparte.
 *   Metidos en los trigramas, «A12» traería medio catálogo.
 * - La categoría y la descripción no se buscaban antes y no se buscan ahora; una
 *   descripción larga además diluye el puntaje de similitud (LIMITACIONES.md).
 *
 * Lo que queda —título y marca— vive en la misma fila, así que Postgres lo
 * mantiene solo y no hay nadie que tenga que acordarse de nada.
 */

-- ---------------------------------------------------------------------------
-- La extensión
-- ---------------------------------------------------------------------------

/*
 * En el schema `extensions`, que es la convención de Supabase: ahí vive lo que no
 * es del modelo. `if not exists` en los dos, porque en el proyecto el schema ya
 * existe y en PGlite no.
 */
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Los roles tienen que poder resolver las funciones de la extensión desde las
-- funciones que la usan. En Supabase ya está concedido; acá queda escrito.
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Plegar mayúsculas y acentos
-- ---------------------------------------------------------------------------

/*
 * «café», «CAFÉ» y «cafe» son lo mismo para quien busca.
 *
 * **Con `translate()` y no con `unaccent`**, y no porque falte: `unaccent` es
 * STABLE, así que no se puede usar en una columna generada ni en un índice sin
 * envolverla en una función marcada IMMUTABLE a mano — una mentira que habría que
 * asumir. Ésta **es** inmutable de verdad: `translate` y `lower` no dependen de
 * nada más que su argumento.
 *
 * Las mayúsculas acentuadas se traducen explícitamente en vez de confiar en
 * `lower()`: con una intercalación C, `lower('Á')` no la toca.
 *
 * La `ñ` se pliega a `n`: quien busca «nino» desde un teclado sin eñe quiere
 * encontrar «niño».
 */
create or replace function app.normalizar_busqueda(p_texto text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(translate(
    coalesce(p_texto, ''),
    'ÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòùÂÊÎÔÛâêîôûÄËÏÖäëïöÇç',
    'AEIOUUNaeiouunAEIOUaeiouAEIOUaeiouAEIOaeioCc'
  ))
$$;

comment on function app.normalizar_busqueda is
  'Minúsculas y sin acentos, para comparar búsquedas. Inmutable de verdad: se usa en una columna generada.';

-- ---------------------------------------------------------------------------
-- La columna y su índice
-- ---------------------------------------------------------------------------

alter table products
  add column search_doc text
  generated always as (app.normalizar_busqueda(title || ' ' || coalesce(brand, ''))) stored;

comment on column products.search_doc is
  'Título y marca, normalizados. Lo mantiene Postgres; los SKU se buscan aparte, por prefijo.';

/*
 * Trigramas. Los usa sobre todo la sugerencia mientras se escribe, que recorre la
 * tienda buscando parecidos. El listado ya viene acotado a la tienda antes de
 * comparar nada, así que ahí el planificador puede no elegirlo, y está bien.
 */
create index products_search_doc_trgm_idx
  on products using gin (search_doc extensions.gin_trgm_ops);
