-- El equipo de una organización: quiénes son y qué rol tienen.
--
-- La escritura ya funciona sin nada nuevo: `memberships_escritura` exige
-- `member.manage` para todas las operaciones, así que cambiar un rol o quitar a
-- alguien es un update o un delete común contra PostgREST. No se agrega un RPC
-- para eso, y la razón importa: un RPC que validara "no dejar la organización
-- sin owner" no cerraría nada, porque el update directo que RLS permite seguiría
-- estando ahí. La guarda tiene que vivir donde pasan **todos** los caminos.
--
-- Lo que sí hace falta es leer los emails, que están en `auth.users` y no en
-- `memberships`. Eso exige `security definer`, y por eso esa función —a
-- diferencia de las `admin_*` de catálogo y pedidos— sí verifica el permiso por
-- su cuenta: al saltear RLS, ya no hay nadie más que lo haga.

-- ---------------------------------------------------------------------------
-- Una organización no se queda sin owner
-- ---------------------------------------------------------------------------
--
-- Sin esto, el único owner puede bajarse a staff o borrarse a sí mismo y la
-- organización queda sin nadie que administre miembros ni configuración: no hay
-- forma de arreglarlo desde el Admin, hay que entrar a la base a mano.
--
-- Es un trigger y no una validación en la aplicación porque también tiene que
-- frenar al update directo por PostgREST, a la secret key y a los scripts. El
-- invariante es de los datos, así que se defiende en los datos.
--
-- `security definer` para que el conteo vea a los demás owners: con RLS, un
-- usuario que sólo tiene permiso de lectura sobre su tenant igual los vería,
-- pero un servicio con otro contexto no, y entonces la guarda se dispararía
-- cuando no debe.

create or replace function public.impedir_quitar_ultimo_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Las dos salidas tempranas van separadas y en este orden a propósito: en un
  -- DELETE, `new` no está asignado y leerlo revienta. Un `or` no sirve para
  -- esquivarlo, porque plpgsql evalúa la expresión entera como SQL y ahí no hay
  -- cortocircuito garantizado.
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  -- `for update` y no un `count`: dos owners bajándose a la vez leerían cada uno
  -- al otro y pasarían los dos. Con el lock, el segundo espera, vuelve a mirar
  -- cuando el primero confirmó, y ya no encuentra a nadie.
  perform 1
  from memberships
  where tenant_id = old.tenant_id
    and role = 'owner'
    and id <> old.id
  for update;

  if not found then
    raise exception 'La organización necesita al menos un owner';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.impedir_quitar_ultimo_owner is
  'Impide que una organización se quede sin owner, por cualquier camino: Admin, PostgREST directo, secret key o script.';

create trigger memberships_ultimo_owner
  before update or delete on memberships
  for each row execute function public.impedir_quitar_ultimo_owner();

-- ---------------------------------------------------------------------------
-- Listar el equipo
-- ---------------------------------------------------------------------------
--
-- `security definer` porque `auth.users` no es consultable por `authenticated`,
-- y sin el email la pantalla mostraría uuids. Como saltea RLS, la primera línea
-- es el permiso: `member.manage`, el mismo que exige la política de escritura.
-- Un staff no tiene por qué ver la lista de quién administra el comercio.

create or replace function public.admin_team(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.has_permission(p_tenant, 'member.manage') then
    raise exception 'Sin permiso para ver el equipo';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'userId', m.user_id,
             'email', u.email,
             'role', m.role,
             'createdAt', m.created_at
           ) order by m.created_at, m.id)
    from memberships m
    join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant
  ), '[]'::jsonb);
end;
$$;

comment on function public.admin_team is
  'Miembros de una organización con su email. Definer porque lee auth.users, y por eso verifica member.manage por su cuenta.';

revoke all on function public.admin_team(uuid) from public, anon;
grant execute on function public.admin_team(uuid) to authenticated;
