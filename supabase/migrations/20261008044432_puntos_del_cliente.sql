/*
 * Los puntos de un cliente, vistos desde el Admin (v3 Fase 2).
 *
 * La ficha del cliente del handoff muestra su saldo y cuánto le falta para el
 * próximo premio. El saldo es la suma del libro **después** de pasar el
 * vencimiento, que hasta acá sólo corría cuando el comprador miraba sus puntos
 * (`mis_puntos`): sumar el libro a secas le mostraría al comercio puntos que ya
 * vencieron.
 *
 * Es la gemela de `mis_puntos` del lado del comercio: `definer` porque escribe
 * —el vencimiento es un movimiento del libro, y nadie del equipo escribe en él—,
 * con el corte por organización escrito en una línea.
 */

create or replace function public.admin_customer_points(p_store_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_regla jsonb;
begin
  -- Sólo el equipo de la tienda, y sólo un cliente de esa tienda. Un `definer`
  -- sin esto le diría el saldo de cualquiera a cualquiera.
  if not exists (
    select 1
    from customers c
    join stores s on s.id = c.store_id
    where c.id = p_customer_id
      and c.store_id = p_store_id
      and s.tenant_id in (select app.current_tenants())
  ) then
    return jsonb_build_object('habilitado', false, 'saldo', 0);
  end if;

  v_regla := app.regla_de_puntos(p_store_id);
  if coalesce((v_regla->>'enabled')::boolean, false) is not true then
    return jsonb_build_object('habilitado', false, 'saldo', 0);
  end if;

  perform app.vencer_puntos(p_store_id, p_customer_id);

  return jsonb_build_object(
    'habilitado', true,
    'saldo', (
      select coalesce(sum(points), 0)::int from loyalty_ledger
      where store_id = p_store_id and customer_id = p_customer_id
    )
  );
end;
$$;

comment on function public.admin_customer_points(uuid, uuid) is
  'El saldo de puntos de un cliente para el equipo de la tienda, con el vencimiento pasado (v3 Fase 2). Definer con el corte por organización adentro.';

revoke all on function public.admin_customer_points(uuid, uuid) from public, anon;
grant execute on function public.admin_customer_points(uuid, uuid) to authenticated, service_role;
