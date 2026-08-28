-- La guarda del último owner impedía dar de baja una organización.
--
-- `memberships.tenant_id` cascadea desde `organizations`, así que borrar la
-- organización borra sus membresías y eso dispara el trigger. Con un solo
-- propietario —el caso normal— fallaba con «La organización necesita al menos un
-- owner», que además del bloqueo dice algo que no tiene sentido: la organización
-- no necesita nada, se está yendo.
--
-- Reproducido antes de tocar nada: `delete from organizations where id = ...`
-- sobre un tenant con un owner fallaba.
--
-- La corrección se apoya en el orden que garantiza Postgres para una acción
-- referencial: la fila padre se borra **antes** de cascadear a las hijas, así que
-- cuando este trigger corre por una baja de organización, la organización ya no
-- está. Es la distinción exacta que hace falta: quitarle el rol al último owner
-- de una organización viva se sigue rechazando; borrar la organización entera,
-- no. El test `equipo.test.ts` cubre los dos lados.

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

  -- La organización se está yendo entera: no hay a quién dejar al mando.
  if not exists (select 1 from organizations where id = old.tenant_id) then
    return old;
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
  'Impide que una organización viva se quede sin owner, por cualquier camino. No bloquea la baja de la organización entera.';

revoke all on function public.impedir_quitar_ultimo_owner() from public, anon;
