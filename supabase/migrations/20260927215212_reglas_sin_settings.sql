-- Las reglas de puntos existen aunque la tienda no tenga fila de ajustes.
--
-- `app.regla_de_puntos` leía `store_settings` con un `from`: una tienda **sin** fila
-- —recién provisionada, o la del smoke— no devolvía «apagado con los defaults»,
-- devolvía **ninguna fila**, o sea `null`. Y `null` no es un objeto: la pantalla de
-- Fidelidad se quedaba en el esqueleto para siempre, sin un error en ningún lado.
--
-- Lo encontró el e2e del Admin, no el typecheck ni la suite de PGlite: los tests
-- siembran `store_settings` porque otras cosas lo necesitan, así que ahí la función
-- nunca se quedaba sin fila. Es la misma clase de falso verde que ADR-121 ya
-- documentó.
--
-- El `left join` contra una fila constante es lo que garantiza que siempre haya
-- exactamente una: los defaults salen del `coalesce`, que ya estaba.

create or replace function app.regla_de_puntos(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'enabled', coalesce((s.settings #> '{loyalty,enabled}')::boolean, false),
    'porCompra', coalesce((s.settings #>> '{loyalty,porCompra}')::int, 20),
    'porResena', coalesce((s.settings #>> '{loyalty,porResena}')::int, 10),
    'diasDeVencimiento', coalesce((s.settings #>> '{loyalty,diasDeVencimiento}')::int, 365)
  )
  from (select 1) una
  left join store_settings s on s.store_id = p_store_id;
$$;

comment on function app.regla_de_puntos is
  'Las reglas del programa de puntos de una tienda, con sus defaults. Devuelve un objeto siempre: una tienda sin ajustes esta apagada, no es null.';
