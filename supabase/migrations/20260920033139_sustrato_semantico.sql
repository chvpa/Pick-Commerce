/*
 * El sustrato de la búsqueda semántica (v2 Fase 7, ADR-132).
 *
 * Acá no se llama a OpenAI ni se busca nada todavía: se deja el lugar donde
 * viven los vectores y la función que los consulta. Lo que importa de esta
 * migración es **cómo está partida**.
 *
 * `vector` no existe en el build de PGlite que corre la suite de aislamiento, y
 * un `create table` que nombre el tipo **no parsea**: dejaría los 407 tests sin
 * arrancar, no fallando sino sin poder empezar. Así que:
 *
 * - Las tablas se crean **sin** la columna vectorial. En PGlite existen enteras,
 *   con sus políticas y sus grants, y la suite prueba el aislamiento de verdad.
 * - La columna, su índice y el cuerpo que usa `<=>` van adentro de una guarda
 *   `do $$ ... execute $p$ ... $p$ ... $$`, que es el patrón que ya usa el bucket
 *   de Storage (`20260828204540_fase7_pagos_y_notificaciones.sql`).
 * - `app.similitud_semantica` existe siempre y **devuelve cero filas** cuando no
 *   hay extensión o no hay vectores. Eso hace que la degradación al buscador
 *   léxico de la Fase 3 sea por construcción y no por un `if` que alguien puede
 *   olvidar: sin embeddings, el catálogo devuelve exactamente lo de antes.
 *
 * Lo que queda sin cubrir offline se dice en el ADR y en el ROADMAP: la
 * extensión, el operador de distancia y los tiempos sólo se verifican contra el
 * proyecto remoto.
 */

do $$ begin
  if not exists (select 1 from pg_available_extensions where name = 'vector') then
    return;
  end if;
  execute 'create extension if not exists vector with schema extensions';
end $$;

-- ---------------------------------------------------------------------------
-- Los vectores del catálogo
-- ---------------------------------------------------------------------------

/*
 * Un embedding por producto.
 *
 * `hash` es del **texto que se embebió**, no del producto: es lo que hace que
 * una reimportación que reescribe 3753 filas con los mismos títulos no vuelva a
 * gastar la clave del comercio. Sin eso, `pnpm camelot:importar` sería un
 * reembedding completo disparado por una tarea de mantenimiento que nadie
 * asoció con un gasto.
 */
create table if not exists product_embeddings (
  product_id uuid primary key,
  tenant_id  uuid not null references organizations (id) on delete cascade,
  store_id   uuid not null,
  hash       text not null,
  updated_at timestamptz not null default now(),

  constraint product_embeddings_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint product_embeddings_product_fkey
    foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade
);

comment on table product_embeddings is
  'Un vector por producto, con el hash del texto embebido para no reembeber lo que no cambió (ADR-132).';

-- El script pregunta «qué le falta a esta tienda», y es su único acceso.
create index if not exists product_embeddings_tienda_idx
  on product_embeddings (store_id);

/*
 * Ni `anon` ni `authenticated` la tocan.
 *
 * La escribe el script con la secret key y la lee `app.similitud_semantica`, que
 * es `security definer` justamente para no tener que abrir esta tabla. Es la
 * salida que CLAUDE.md prescribe cuando hace falta cruzar algo del catálogo sin
 * repartir permisos: el filtro de identidad escrito en una línea, adentro.
 */
alter table product_embeddings enable row level security;
revoke all on product_embeddings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- La caché de consultas
-- ---------------------------------------------------------------------------

/*
 * El vector de una frase, guardado por tienda.
 *
 * Es a la vez la caché y la cola: una fila con `embedded_at is null` es una
 * frase que alguien buscó y todavía no tiene vector. El script las toma por
 * `hits` desc, que es lo que ordena por «lo que más se pide» sin inventar una
 * prioridad.
 *
 * Por tienda y no global: dos comercios que venden cosas distintas usan las
 * mismas palabras para pedir cosas distintas, y además un vector se paga con la
 * clave de **un** comercio. Compartirlo entre tenants sería gastarle la clave a
 * uno para servirle a otro.
 */
create table if not exists search_queries (
  store_id    uuid not null,
  hash        text not null,
  tenant_id   uuid not null references organizations (id) on delete cascade,
  termino     text not null,
  hits        integer not null default 1,
  last_seen   timestamptz not null default now(),
  embedded_at timestamptz,

  primary key (store_id, hash),
  constraint search_queries_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table search_queries is
  'Vectores de las frases buscadas, por tienda. Sin `embedded_at` es la cola de lo pendiente (ADR-132).';

-- La cola: lo pendiente de una tienda, lo más pedido primero.
create index if not exists search_queries_pendientes_idx
  on search_queries (store_id, hits desc)
  where embedded_at is null;

alter table search_queries enable row level security;
revoke all on search_queries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- La columna vectorial, donde la extensión existe
-- ---------------------------------------------------------------------------

/*
 * 1536 dimensiones: es lo que devuelve `text-embedding-3-small` sin recortar.
 *
 * **Sin índice ANN a propósito.** Con 3753 productos, el escaneo exacto son
 * milisegundos y siempre devuelve lo correcto. Un HNSW filtrado por tienda puede
 * devolver menos filas de las pedidas —lo dice la documentación de Supabase— y
 * ese modo de falla es peor que unos milisegundos: es un catálogo que a veces
 * muestra de menos sin que nadie se entere. El índice entra cuando una tienda
 * pase de unos 50k productos, con su medición, y para entonces pgvector 0.8 ya
 * tiene `iterative index scans`, que es la respuesta documentada a eso.
 */
do $$ begin
  if not exists (select 1 from pg_extension where extname = 'vector') then
    return;
  end if;

  execute $p$
    alter table product_embeddings
      add column if not exists embedding extensions.vector(1536)
  $p$;

  execute $p$
    alter table search_queries
      add column if not exists embedding extensions.vector(1536)
  $p$;
end $$;

-- ---------------------------------------------------------------------------
-- La consulta
-- ---------------------------------------------------------------------------

/*
 * Los productos más parecidos a una frase ya embebida.
 *
 * **La versión base devuelve cero filas.** No es un placeholder: es el camino
 * que corre en PGlite, en una tienda sin clave de OpenAI y en una tienda que
 * todavía no embebió nada. Que `catalog_search` la use igual en los tres casos
 * es lo que hace que «degrada a la Fase 3» sea una propiedad del código y no una
 * promesa.
 *
 * `security definer` y no invoker: así `product_embeddings` y `search_queries`
 * quedan cerradas para `anon` y `authenticated`, y el filtro por tienda va
 * adentro, en una línea. El Admin llama a `catalog_search` con la publishable
 * key para armar las facetas, así que una tabla nueva sin política habría dejado
 * dos pantallas con «permission denied» — ya pasó con `product_trending`.
 */
create or replace function app.similitud_semantica(
  p_store_id uuid,
  p_query_hash text,
  p_limite integer default 50,
  p_minimo real default 0.35
) returns table (product_id uuid, sim real)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select null::uuid, null::real where false;
$$;

comment on function app.similitud_semantica(uuid, text, integer, real) is
  'Productos parecidos a una frase embebida. Cero filas sin extensión o sin vectores (ADR-132).';

do $$ begin
  if not exists (select 1 from pg_extension where extname = 'vector') then
    return;
  end if;

  /*
   * El `store_id` va en los dos `where` y no se confía en que el ranking no
   * cruce: un vecino más cercano no sabe de qué tienda es, así que «devolvió el
   * catálogo de otro comercio» es acá el modo de falla por defecto.
   *
   * `1 - (a <=> b)` convierte la distancia coseno de pgvector en una similitud
   * 0..1, que es lo que `catalog_search` mezcla con el puntaje léxico.
   */
  execute $p$
    create or replace function app.similitud_semantica(
      p_store_id uuid,
      p_query_hash text,
      p_limite integer default 50,
      p_minimo real default 0.35
    ) returns table (product_id uuid, sim real)
    language sql
    stable
    security definer
    set search_path = public, extensions, pg_temp
    as $cuerpo$
      with consulta as (
        select sq.embedding
        from search_queries sq
        where sq.store_id = p_store_id
          and sq.hash = p_query_hash
          and sq.embedding is not null
      )
      select pe.product_id, (1 - (pe.embedding <=> c.embedding))::real as sim
      from product_embeddings pe
      cross join consulta c
      where pe.store_id = p_store_id
        and pe.embedding is not null
        and (1 - (pe.embedding <=> c.embedding)) >= p_minimo
      order by pe.embedding <=> c.embedding
      limit greatest(coalesce(p_limite, 50), 1);
    $cuerpo$
  $p$;
end $$;

/*
 * La ejecuta quien ya puede llamar a `catalog_search`.
 *
 * No filtra nada privado: devuelve ids de productos publicados y un número. Lo
 * que protege el `definer` es la tabla de vectores, no el resultado.
 */
revoke all on function app.similitud_semantica(uuid, text, integer, real) from public, anon;
grant execute on function app.similitud_semantica(uuid, text, integer, real)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Registrar una frase buscada
-- ---------------------------------------------------------------------------

/*
 * Suma la frase a la caché, y le pone el vector si quien llama lo trae.
 *
 * Una sola función para los dos casos —frase nueva sin vector, frase con el
 * vector recién pedido— porque son el mismo upsert y separarlas daría dos
 * caminos que tienen que mantenerse iguales.
 *
 * El vector entra como **texto** (`'[0.1,0.2,…]'`) para que la firma no nombre
 * el tipo `vector`: si lo nombrara, esta función no parsearía en PGlite y la
 * suite no arrancaría. El casteo pasa adentro, en la versión guardada.
 *
 * `security definer` por lo mismo que la de arriba: la tabla queda cerrada.
 */
create or replace function app.registrar_busqueda(
  p_store_id uuid,
  p_termino text,
  p_vector text default null
) returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tenant uuid;
  v_hash   text;
  v_norm   text;
begin
  -- `normalizar_busqueda` pliega acentos y mayúsculas pero **no recorta**:
  -- sin el trim, una frase de puros espacios abría una fila en la cola y el
  -- script la habría mandado a embeber. Lo encontró la suite.
  v_norm := trim(app.normalizar_busqueda(coalesce(p_termino, '')));
  if v_norm = '' then
    return;
  end if;

  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    return;
  end if;

  v_hash := md5(v_norm);

  insert into search_queries (store_id, hash, tenant_id, termino, hits, last_seen)
  values (p_store_id, v_hash, v_tenant, v_norm, 1, now())
  on conflict (store_id, hash) do update
    set hits = search_queries.hits + 1,
        last_seen = now();
end;
$$;

comment on function app.registrar_busqueda(uuid, text, text) is
  'Suma una frase a la caché de búsquedas; con vector, la deja lista para usar (ADR-132).';

do $$ begin
  if not exists (select 1 from pg_extension where extname = 'vector') then
    return;
  end if;

  execute $p$
    create or replace function app.registrar_busqueda(
      p_store_id uuid,
      p_termino text,
      p_vector text default null
    ) returns void
    language plpgsql
    volatile
    security definer
    set search_path = public, extensions, pg_temp
    as $cuerpo$
    declare
      v_tenant uuid;
      v_hash   text;
      v_norm   text;
    begin
      -- `normalizar_busqueda` pliega acentos y mayúsculas pero **no recorta**:
  -- sin el trim, una frase de puros espacios abría una fila en la cola y el
  -- script la habría mandado a embeber. Lo encontró la suite.
  v_norm := trim(app.normalizar_busqueda(coalesce(p_termino, '')));
      if v_norm = '' then
        return;
      end if;

      select tenant_id into v_tenant from stores where id = p_store_id;
      if v_tenant is null then
        return;
      end if;

      v_hash := md5(v_norm);

      insert into search_queries (store_id, hash, tenant_id, termino, hits, last_seen, embedding, embedded_at)
      values (
        p_store_id, v_hash, v_tenant, v_norm, 1, now(),
        case when p_vector is null then null else p_vector::extensions.vector end,
        case when p_vector is null then null else now() end
      )
      on conflict (store_id, hash) do update
        set hits = search_queries.hits + 1,
            last_seen = now(),
            -- Un vector que llega no pisa a uno que ya estaba: son el mismo
            -- texto embebido con el mismo modelo, y escribir 6 KB por búsqueda
            -- para dejar lo mismo es trabajo que nadie pidió.
            embedding = coalesce(search_queries.embedding, excluded.embedding),
            embedded_at = coalesce(search_queries.embedded_at, excluded.embedded_at);
    end;
    $cuerpo$
  $p$;
end $$;

revoke all on function app.registrar_busqueda(uuid, text, text) from public, anon, authenticated;
grant execute on function app.registrar_busqueda(uuid, text, text) to service_role;
