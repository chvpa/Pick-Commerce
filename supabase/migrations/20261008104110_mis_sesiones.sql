-- Dónde está abierta la cuenta de quien entra al Admin, para «Mi cuenta»
-- (ADR-155).
--
-- `auth.sessions` no está expuesta a la API: la leen y la borran estas dos
-- funciones, `security definer`, y cada una se acota a `auth.uid()` en una
-- línea. Nunca devuelven `refresh_token_hmac_key` —con él se firma la
-- renovación— ni la IP: la pantalla dice desde qué navegador y cuándo, que es lo
-- que alguien reconoce como «esa soy yo».
--
-- Van en plpgsql y no en sql porque PGlite no tiene `auth.sessions`: una función
-- sql se valida al crearse y dejaría la suite sin arrancar. Sus pruebas declaran
-- la tabla antes de llamarlas.

create or replace function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  is_current boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    s.id,
    s.created_at,
    -- `refreshed_at` es la última renovación, y GoTrue la guarda sin zona, en UTC.
    greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc'),
    s.user_agent,
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
  order by 3 desc
  -- ponytail: tope fijo y sin paginar. Sin vencimiento de sesiones en el
  -- proyecto, un navegador borrado deja la suya viva; «Cerrar las demás» las
  -- limpia todas de una vez.
  limit 50;
end;
$$;

comment on function public.my_sessions() is
  'Las sesiones abiertas de quien llama, sin secretos. Marca la actual por el session_id del JWT.';

create or replace function public.close_my_session(p_session uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_borradas integer;
begin
  -- La propia se cierra con «Salir», que además limpia el navegador: borrarla
  -- desde acá dejaría la pantalla abierta con una sesión que ya no renueva.
  if p_session::text = coalesce(auth.jwt() ->> 'session_id', '') then
    raise exception 'Es la sesión en la que estás: para cerrarla, usá «Salir».';
  end if;

  -- Los refresh tokens caen en cascada. El token de acceso que esa sesión ya
  -- tenga sigue valiendo hasta que vence, a la hora: un JWT no se puede revocar.
  delete from auth.sessions where id = p_session and user_id = auth.uid();
  get diagnostics v_borradas = row_count;
  return v_borradas > 0;
end;
$$;

comment on function public.close_my_session(uuid) is
  'Cierra otra sesión de quien llama. La de esta pestaña no: esa es «Salir».';

revoke all on function public.my_sessions() from public, anon;
revoke all on function public.close_my_session(uuid) from public, anon;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.close_my_session(uuid) to authenticated;
