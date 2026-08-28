-- Guardar la configuración de una tienda, con su auditoría.
--
-- Dos escrituras que no pueden separarse: el tipo de cambio y el registro de
-- quién lo cambió. PROJECT.md §33 pide audit log para el cambio manual de tasa,
-- y una tasa guardada sin su auditoría es exactamente el caso que ese requisito
-- quiere evitar. Como `audit_log` no tiene grant de insert para `authenticated`
-- —se lee, no se escribe desde la app— el cliente ni siquiera podría intentarlo
-- por separado. Va todo en una función, que es una transacción.
--
-- `security definer`, entonces, por dos razones distintas:
--
--   1. Insertar en `audit_log`, que la app no puede tocar directo.
--   2. Fijar el `actor_id` con `auth.uid()` en vez de creerle al payload. Un
--      registro de auditoría donde el actor lo declara el propio actor no sirve
--      como evidencia.
--
-- Y como saltea RLS, verifica el permiso por su cuenta en la primera línea.

create or replace function public.admin_save_settings(
  p_store_id uuid,
  p_settings jsonb,
  p_audit    jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_final  jsonb;
begin
  select tenant_id into v_tenant from stores where id = p_store_id;

  -- Tienda inexistente y tienda ajena dan el **mismo** error a propósito: un
  -- mensaje distinto para cada caso le confirmaría a un tercero qué ids de
  -- tienda existen.
  if v_tenant is null or not app.has_permission(v_tenant, 'settings.write') then
    raise exception 'Sin permiso para editar la configuración de esta tienda';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'La configuración debe ser un objeto';
  end if;

  if p_audit is not null then
    if p_audit->>'action' is null or p_audit->>'entity' is null then
      raise exception 'La auditoría necesita action y entity';
    end if;
  end if;

  -- Merge de primer nivel: el Admin manda sólo la sección que editó
  -- (`{"currency": ...}` o `{"payments": ...}`) y las demás quedan intactas.
  -- Con un reemplazo completo, guardar los medios de pago borraría la
  -- configuración de moneda de la tienda sin que nada lo diga.
  --
  -- Dentro de una sección sí reemplaza, y eso es lo correcto: el formulario que
  -- edita esa sección la conoce entera. Dos operadores tocando la misma sección
  -- a la vez: gana el último. Es aceptable para una tienda con un operador; si
  -- alguna vez deja de serlo, se resuelve con una versión optimista, no con un
  -- merge profundo que haría imposible borrar una clave.
  insert into store_settings (store_id, tenant_id, settings, updated_at)
  values (p_store_id, v_tenant, p_settings, now())
  on conflict (store_id) do update
    set settings   = store_settings.settings || excluded.settings,
        updated_at = now()
  returning settings into v_final;

  if p_audit is not null then
    insert into audit_log (tenant_id, actor_id, action, entity, entity_id, metadata)
    values (
      v_tenant,
      auth.uid(),
      p_audit->>'action',
      p_audit->>'entity',
      p_store_id::text,
      coalesce(p_audit->'metadata', '{}'::jsonb)
    );
  end if;

  return v_final;
end;
$$;

comment on function public.admin_save_settings is
  'Guarda una sección de la configuración de la tienda y su auditoría en la misma transacción. El actor lo fija la función, no el payload.';

revoke all on function public.admin_save_settings(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_save_settings(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Deuda de ADR-064
-- ---------------------------------------------------------------------------
--
-- Estas tres son anteriores al hallazgo: sólo revocan `from public`, que en
-- Supabase no le quita nada a `anon` porque el proyecto le concede EXECUTE por
-- default privilege. Ninguna es explotable —son `security invoker`, así que RLS
-- las vacía— pero la deuda no debe quedar: la próxima que alguien copie de ellas
-- como modelo podría no serlo.

revoke all on function public.admin_products(uuid, text, text, integer, integer) from anon;
revoke all on function public.admin_save_product(uuid, jsonb) from anon;
revoke all on function public.import_products(uuid, jsonb) from anon;
