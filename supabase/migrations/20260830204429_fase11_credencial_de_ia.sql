-- Fase 11 — la credencial de OpenAI de cada comercio.
--
-- BYOK: la key es del comercio, no de Pick (PROJECT.md §25). Se guarda cifrada
-- con AES-GCM y la clave maestra vive **sólo** en el Worker del Admin, así que
-- esta tabla, entera, no alcanza para usar la credencial de nadie.
--
-- Qué protege el cifrado, dicho sin adornos: **una filtración de la base** —un
-- dump, un backup mal guardado, una política de RLS rota—. No protege del propio
-- dueño del comercio, que es quien cargó la key y puede volver a leer el
-- ciphertext con su permiso de siempre. Decir más sería mentir.
--
-- Sin política de lectura, como `notification_outbox`: nadie consulta esta tabla
-- directamente. Todo pasa por las tres funciones de abajo, que son `security
-- definer` y verifican `settings.write` en su primera línea.

create table if not exists ai_credentials (
  -- Sin `references` en línea: la clave foránea es la compuesta del final, que
  -- es la que hace imposible apuntar a una tienda de otra organización
  -- (ADR-063). Declarar las dos le daría a la simple el mismo nombre que a la
  -- compuesta y la migración fallaría con un `duplicate_object`.
  store_id   uuid primary key,
  tenant_id  uuid not null references organizations (id) on delete cascade,

  -- El iv de 12 bytes va **adelante del ciphertext**, en el mismo base64. Con
  -- dos columnas hay dos formas de que queden desparejas y ninguna falla
  -- ruidosamente. Ver `cifrar` en commerce-core/src/ai.ts.
  ciphertext text not null,

  -- Lo único de la key que vuelve a verse. Alcanza para reconocer cuál es y no
  -- alcanza para nada más.
  last4      text not null,

  -- Qué modelo usa esta tienda. No es un secreto, y vive acá y no en
  -- `store_settings` porque «la credencial y con qué se la usa» es una sola
  -- cosa: separarlas dejaría media configuración legible por cualquier miembro.
  model      text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ai_credentials_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table ai_credentials is
  'Credencial de OpenAI por tienda, cifrada. La clave maestra vive en el Worker del Admin, no acá.';

alter table ai_credentials enable row level security;

-- Ninguna política, a propósito: ni lectura ni escritura. Se revoca explícito en
-- vez de confiar en que no se haya concedido.
revoke all on ai_credentials from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Estado: lo que el Admin puede mostrar
-- ---------------------------------------------------------------------------
--
-- Devuelve si hay credencial, en qué termina y con qué modelo. Nunca el
-- ciphertext. Es lo que consulta la pantalla de configuración con la publishable
-- key.

create or replace function public.ai_credential_status(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_fila   ai_credentials;
begin
  select tenant_id into v_tenant from stores where id = p_store_id;

  -- Tienda inexistente y tienda ajena dan el mismo error, como en
  -- `admin_save_settings`: un mensaje distinto para cada caso le confirmaría a
  -- un tercero qué ids de tienda existen.
  if v_tenant is null or not app.has_permission(v_tenant, 'settings.write') then
    raise exception 'Sin permiso para ver la configuración de esta tienda';
  end if;

  select * into v_fila from ai_credentials where store_id = p_store_id;

  if v_fila.store_id is null then
    return jsonb_build_object('configured', false);
  end if;

  return jsonb_build_object(
    'configured', true,
    'last4', v_fila.last4,
    'model', v_fila.model,
    'updatedAt', v_fila.updated_at
  );
end;
$$;

comment on function public.ai_credential_status is
  'Si la tienda tiene credencial de IA, en qué termina y con qué modelo. Nunca el ciphertext.';

revoke all on function public.ai_credential_status(uuid) from public, anon;
grant execute on function public.ai_credential_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- El secreto: lo que sólo el Worker pide
-- ---------------------------------------------------------------------------
--
-- Separada de `ai_credential_status` y no la misma con una bandera. Un parámetro
-- que decide si devuelve el secreto es exactamente la forma en que un día
-- devuelve el secreto por error: alcanza con que una llamada lo pase mal.
--
-- Devuelve el ciphertext, que sin la clave maestra del Worker no sirve para
-- nada. Aun así exige `settings.write`: la defensa en profundidad no se salta
-- porque el dato de abajo esté cifrado.

create or replace function public.ai_credential_secret(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_fila   ai_credentials;
begin
  select tenant_id into v_tenant from stores where id = p_store_id;

  if v_tenant is null or not app.has_permission(v_tenant, 'settings.write') then
    raise exception 'Sin permiso para usar la credencial de esta tienda';
  end if;

  select * into v_fila from ai_credentials where store_id = p_store_id;

  if v_fila.store_id is null then
    return jsonb_build_object('configured', false);
  end if;

  return jsonb_build_object(
    'configured', true,
    'ciphertext', v_fila.ciphertext,
    'model', v_fila.model
  );
end;
$$;

comment on function public.ai_credential_secret is
  'El ciphertext de la credencial, para el Worker del Admin. Inútil sin la clave maestra.';

revoke all on function public.ai_credential_secret(uuid) from public, anon;
grant execute on function public.ai_credential_secret(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar y borrar
-- ---------------------------------------------------------------------------
--
-- Con su auditoría en la misma transacción, por el criterio de ADR-069: cambiar
-- la credencial de IA de un comercio es un evento de seguridad, y una escritura
-- cuya auditoría puede fallar sola no deja evidencia.
--
-- Nunca registra el ciphertext ni la key en la auditoría. Sólo qué pasó, cuándo
-- y quién: los últimos cuatro caracteres alcanzan para reconocer cuál se cambió.

create or replace function public.admin_save_ai_credential(
  p_store_id   uuid,
  p_ciphertext text,
  p_last4      text,
  p_model      text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from stores where id = p_store_id;

  if v_tenant is null or not app.has_permission(v_tenant, 'settings.write') then
    raise exception 'Sin permiso para editar la configuración de esta tienda';
  end if;

  -- Sin ciphertext se borra. Es el mismo formulario: quitar la credencial es una
  -- opción de la pantalla, no otra operación.
  if p_ciphertext is null then
    delete from ai_credentials where store_id = p_store_id;

    insert into audit_log (tenant_id, actor_id, action, entity, entity_id, metadata)
    values (v_tenant, auth.uid(), 'ai_credential.removed', 'store', p_store_id::text, '{}'::jsonb);

    return jsonb_build_object('configured', false);
  end if;

  if p_last4 is null or p_model is null then
    raise exception 'La credencial necesita su modelo y sus últimos cuatro caracteres';
  end if;

  insert into ai_credentials (store_id, tenant_id, ciphertext, last4, model, updated_at)
  values (p_store_id, v_tenant, p_ciphertext, p_last4, p_model, now())
  on conflict (store_id) do update
    set ciphertext = excluded.ciphertext,
        last4      = excluded.last4,
        model      = excluded.model,
        updated_at = now();

  insert into audit_log (tenant_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_tenant,
    auth.uid(),
    'ai_credential.saved',
    'store',
    p_store_id::text,
    jsonb_build_object('last4', p_last4, 'model', p_model)
  );

  return jsonb_build_object('configured', true, 'last4', p_last4, 'model', p_model);
end;
$$;

comment on function public.admin_save_ai_credential is
  'Guarda o borra la credencial de IA cifrada, con su registro de auditoría. Nunca audita el secreto.';

revoke all on function public.admin_save_ai_credential(uuid, text, text, text) from public, anon;
grant execute on function public.admin_save_ai_credential(uuid, text, text, text) to authenticated;
