/*
 * Apagar la personalización borra el perfil de la cuenta, y ahí mismo.
 *
 * El texto de privacidad dice que apagar borra **las dos cosas**: el
 * identificador del navegador y el resumen de la cuenta. Lo primero ya lo hacía
 * el middleware; esto es lo segundo.
 *
 * Que además **sostenga** lo resuelve el propio recálculo, que sólo mira visitas
 * con `device_id` —o sea, con la personalización prendida—: sin eso, borrar el
 * perfil duraría hasta la próxima corrida, que es la forma más silenciosa de
 * incumplir lo que promete un interruptor.
 *
 * `security definer` con el filtro de identidad adentro, como `my_preferences`:
 * lo llama el Worker con el token de quien apagó, y nadie puede borrar el perfil
 * de otro.
 */

create or replace function public.forget_my_preferences(p_store_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  delete from customer_preferences
   where store_id = p_store_id
     and customer_id = app.current_customer(p_store_id);
$$;

comment on function public.forget_my_preferences is
  'Borra el perfil de quien llama. Lo usa el interruptor de personalización (ADR-128).';

revoke all on function public.forget_my_preferences(uuid) from public, anon;
grant execute on function public.forget_my_preferences(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Y lo que ya se había guardado de ese navegador
-- ---------------------------------------------------------------------------

/*
 * Borrar el resumen no alcanzaba, y lo encontró un test: las visitas viejas de
 * ese navegador siguen en `store_events` hasta 180 días, así que **el recálculo
 * siguiente lo armaba de nuevo**. El interruptor habría durado seis horas.
 *
 * Así que apagar también le saca el `device_id` a lo ya guardado. El evento se
 * queda —la medición del comercio no depende de que le den permiso a nada, que
 * es lo que dice ADR-124— pero deja de estar atado a este navegador, que es
 * exactamente lo que se apagó.
 *
 * Lo llama el Worker con la secret key: el `device_id` sale de la cookie que el
 * navegador acaba de mandar, y quien lo manda es el dueño de ese navegador.
 */
create or replace function public.forget_device(p_store_id uuid, p_device_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  update store_events
     set device_id = null
   where store_id = p_store_id
     and device_id = p_device_id;

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

comment on function public.forget_device is
  'Desata de su navegador lo ya registrado. Lo usa el interruptor de personalización (ADR-128).';

revoke all on function public.forget_device(uuid, uuid) from public, anon, authenticated;
grant execute on function public.forget_device(uuid, uuid) to service_role;
