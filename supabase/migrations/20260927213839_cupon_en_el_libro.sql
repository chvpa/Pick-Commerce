-- El libro dice qué cupón salió de cada canje.
--
-- `mis_puntos` devolvía el movimiento con su origen y su fecha, y eso deja sin
-- respuesta la única pregunta que alguien le va a hacer a esa pantalla después de
-- canjear: **¿cuál era mi código?**. Sin esto había que anotarlo en el momento o
-- perderlo, que es una forma silenciosa de no entregar el premio.
--
-- Va con el vencimiento del cupón al lado, porque un código sin fecha no se sabe si
-- todavía sirve. Y sólo el del propio comprador: la función ya resuelve la identidad
-- por `app.current_customer`, así que el `left join` no puede traer el de otro.

create or replace function public.mis_puntos(p_store_id uuid, p_limite integer default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente uuid;
  v_regla   jsonb;
begin
  v_cliente := app.current_customer(p_store_id);
  v_regla := app.regla_de_puntos(p_store_id);

  if v_cliente is null or coalesce((v_regla->>'enabled')::boolean, false) is not true then
    return jsonb_build_object('habilitado', false, 'saldo', 0, 'movimientos', '[]'::jsonb);
  end if;

  perform app.vencer_puntos(p_store_id, v_cliente);

  return jsonb_build_object(
    'habilitado', true,
    'porCompra', (v_regla->>'porCompra')::int,
    'porResena', (v_regla->>'porResena')::int,
    'diasDeVencimiento', (v_regla->>'diasDeVencimiento')::int,
    'saldo', (
      select coalesce(sum(points), 0)::int from loyalty_ledger
      where store_id = p_store_id and customer_id = v_cliente
    ),
    'movimientos', coalesce((
      select jsonb_agg(t.m order by t.created_at desc)
      from (
        select jsonb_build_object(
                 'id', l.id,
                 'puntos', l.points,
                 'origen', l.source,
                 'nota', l.note,
                 'fecha', l.created_at,
                 -- El cupón que emitió el canje, si todavía se puede usar. Un código
                 -- gastado o vencido se informa igual: lo que no se puede es no
                 -- decirlo.
                 'cupon', pr.code,
                 'cuponVence', pr.ends_at,
                 'cuponUsado', pr.usage_limit is not null and pr.usage_count >= pr.usage_limit
               ) as m,
               l.created_at
        from loyalty_ledger l
        left join promotions pr on pr.id = l.promotion_id
        where l.store_id = p_store_id and l.customer_id = v_cliente
        order by l.created_at desc
        limit least(greatest(coalesce(p_limite, 20), 1), 100)
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.mis_puntos is
  'El saldo de puntos del comprador autenticado, sus ultimos movimientos y el cupon que emitio cada canje. Pasa el vencimiento antes de contar.';
