/*
 * Lo que la tienda gasta en IA, y el techo que no puede pasar (v2 Fase 7, ADR-132).
 *
 * Hasta acá se llamaba a OpenAI con la clave del comercio y **no quedaba
 * rastro**: los dos endpoints devuelven `usage` en la respuesta y se tiraba. La
 * primera pregunta que hizo el dueño del proyecto después de cargar un producto
 * fue cuánto había costado, y no había forma de responderla.
 *
 * Dos cosas distintas, y conviene no confundirlas:
 *
 * - **El contador** registra todo: fichas, fondos, embeddings y búsquedas. Es
 *   para mirar.
 * - **El techo** frena sólo el camino automático, el de la búsqueda. Un lote de
 *   fotos son cien imágenes que alguien eligió y confirmó, con su tope propio
 *   (ADR-130); la búsqueda la dispara tráfico anónimo y es la única que puede
 *   irse sola. Poner el mismo techo a las dos haría que una tanda de fotos
 *   normal dejara la tienda sin IA por el resto del mes.
 */

create table if not exists ai_usage (
  store_id  uuid not null,
  tenant_id uuid not null references organizations (id) on delete cascade,
  -- El primer día del mes. Agregado y no una fila por llamada: lo que se
  -- responde es «cuánto va este mes», y guardar cada búsqueda sería una tabla
  -- que crece con el tráfico para contestar lo mismo.
  mes       date not null,
  tipo      text not null check (tipo in ('ficha', 'fondo', 'embeddings', 'busqueda')),
  tokens    bigint not null default 0,
  llamadas  integer not null default 0,
  updated_at timestamptz not null default now(),

  primary key (store_id, mes, tipo),
  constraint ai_usage_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table ai_usage is
  'Tokens de IA por tienda, mes y tipo de llamada. El contador de ADR-132.';

alter table ai_usage enable row level security;

-- La lee el equipo del comercio desde el Admin; escribirla es del servidor.
do $$ begin
  create policy ai_usage_lectura on ai_usage
    for select to authenticated
    using (tenant_id in (select app.current_tenants()));
exception when duplicate_object then null;
end $$;

grant select on ai_usage to authenticated;
revoke all on ai_usage from anon;

-- ---------------------------------------------------------------------------
-- Registrar lo gastado
-- ---------------------------------------------------------------------------

/*
 * Suma tokens al mes en curso y devuelve el acumulado.
 *
 * Devuelve el total para que quien llama pueda decidir sin una segunda consulta:
 * el Worker del Admin registra y, con el número en la mano, sabe si ya se pasó
 * del techo. Registrar **antes** de decidir y no después es deliberado: si se
 * decidiera primero, dos búsquedas simultáneas pasarían las dos.
 */
create or replace function public.registrar_uso_de_ia(
  p_store_id uuid,
  p_tipo text,
  p_tokens bigint
) returns bigint
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_total  bigint;
begin
  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    return 0;
  end if;

  insert into ai_usage (store_id, tenant_id, mes, tipo, tokens, llamadas)
  values (p_store_id, v_tenant, date_trunc('month', now())::date, p_tipo, greatest(p_tokens, 0), 1)
  on conflict (store_id, mes, tipo) do update
    set tokens = ai_usage.tokens + excluded.tokens,
        llamadas = ai_usage.llamadas + 1,
        updated_at = now();

  select coalesce(sum(tokens), 0) into v_total
  from ai_usage
  where store_id = p_store_id and mes = date_trunc('month', now())::date;

  return v_total;
end;
$$;

comment on function public.registrar_uso_de_ia(uuid, text, bigint) is
  'Suma tokens al mes en curso y devuelve el total del mes (ADR-132).';

-- La escribe el servidor, con la secret key. Nadie más.
revoke all on function public.registrar_uso_de_ia(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.registrar_uso_de_ia(uuid, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- La caché de frases, que ahora dice si ya tiene vector
-- ---------------------------------------------------------------------------

/*
 * `registrar_busqueda` pasa a devolver **si la frase ya tiene vector**.
 *
 * Sin eso el storefront necesitaba dos viajes a la base por búsqueda —uno para
 * registrar y otro para preguntar— y ese segundo viaje está en el camino de
 * todas las búsquedas, incluidas las que ya están resueltas. Devolverlo sale
 * gratis: la fila ya está en la mano.
 */
drop function if exists public.registrar_busqueda(uuid, text, text);

create or replace function public.registrar_busqueda(
  p_store_id uuid,
  p_termino text,
  p_vector text default null
) returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tenant uuid;
  v_hash   text;
  v_norm   text;
  v_tiene  boolean;
begin
  -- `normalizar_busqueda` pliega acentos y mayúsculas pero **no recorta**: sin
  -- el trim, una frase de puros espacios abría una fila en la cola.
  v_norm := trim(app.normalizar_busqueda(coalesce(p_termino, '')));
  if v_norm = '' then
    return false;
  end if;

  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    return false;
  end if;

  v_hash := md5(v_norm);

  insert into search_queries (store_id, hash, tenant_id, termino, hits, last_seen)
  values (p_store_id, v_hash, v_tenant, v_norm, 1, now())
  on conflict (store_id, hash) do update
    set hits = search_queries.hits + 1,
        last_seen = now();

  select embedded_at is not null into v_tiene
  from search_queries
  where store_id = p_store_id and hash = v_hash;

  return coalesce(v_tiene, false);
end;
$$;

comment on function public.registrar_busqueda(uuid, text, text) is
  'Suma una frase a la caché y devuelve si ya tiene vector (ADR-132).';

do $$ begin
  if not exists (select 1 from pg_extension where extname = 'vector') then
    return;
  end if;

  execute $p$
    create or replace function public.registrar_busqueda(
      p_store_id uuid,
      p_termino text,
      p_vector text default null
    ) returns boolean
    language plpgsql
    volatile
    security definer
    set search_path = public, extensions, pg_temp
    as $cuerpo$
    declare
      v_tenant uuid;
      v_hash   text;
      v_norm   text;
      v_tiene  boolean;
    begin
      v_norm := trim(app.normalizar_busqueda(coalesce(p_termino, '')));
      if v_norm = '' then
        return false;
      end if;

      select tenant_id into v_tenant from stores where id = p_store_id;
      if v_tenant is null then
        return false;
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
            -- Un vector que llega no pisa a uno que ya estaba: es el mismo texto
            -- con el mismo modelo, y escribir 6 KB por búsqueda para dejar lo
            -- mismo es trabajo que nadie pidió.
            embedding = coalesce(search_queries.embedding, excluded.embedding),
            embedded_at = coalesce(search_queries.embedded_at, excluded.embedded_at);

      select embedded_at is not null into v_tiene
      from search_queries
      where store_id = p_store_id and hash = v_hash;

      return coalesce(v_tiene, false);
    end;
    $cuerpo$
  $p$;
end $$;

revoke all on function public.registrar_busqueda(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_busqueda(uuid, text, text) to service_role;
