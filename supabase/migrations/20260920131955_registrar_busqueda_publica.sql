/*
 * `registrar_busqueda` se muda a `public` (v2 Fase 7, ADR-132).
 *
 * Motivo prosaico y no de diseño: **PostgREST sólo expone `public`**, y quien
 * tiene que llamarla es el storefront con la secret key, por RPC. En `app` era
 * inalcanzable desde el cliente, y la alternativa —que el navegador arme el
 * hash y el upsert por su cuenta— duplicaría en TypeScript la normalización que
 * ya vive en SQL. Dos copias de la llave de una caché terminan calculando llaves
 * distintas, y eso no falla: hace que la caché nunca acierte.
 *
 * `app.similitud_semantica` se queda donde está: a ésa la llama `catalog_search`
 * desde adentro de la base, no el cliente.
 */

drop function if exists app.registrar_busqueda(uuid, text, text);

create or replace function public.registrar_busqueda(
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

comment on function public.registrar_busqueda(uuid, text, text) is
  'Suma una frase a la caché de búsquedas; con vector, la deja lista para usar (ADR-132).';

do $$ begin
  if not exists (select 1 from pg_extension where extname = 'vector') then
    return;
  end if;

  execute $p$
    create or replace function public.registrar_busqueda(
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

revoke all on function public.registrar_busqueda(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_busqueda(uuid, text, text) to service_role;
