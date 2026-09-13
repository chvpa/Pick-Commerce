/*
 * Lo que faltaba del revoke anterior, y la razón real en vez de la primera.
 *
 * `20260912155710_revocar_consume_promotion.sql` quitó el grant explícito a
 * `authenticated` y **no alcanzó**: Postgres le da `execute` a `PUBLIC` a toda
 * función al crearla, ese grant sobrevive a revocarle a un rol puntual, y
 * `PUBLIC` incluye a `authenticated`. Medido después de aplicarla:
 *
 *   grantee      | privilege
 *   PUBLIC       | EXECUTE      <- éste
 *   postgres     | EXECUTE
 *   service_role | EXECUTE
 *
 * Y de paso se corrige lo que esa migración afirmó. Decía que el alcance «ya es
 * cruzar tenants» desde la API, y eso es falso: PostgREST expone únicamente el
 * schema `public` —`POST /rest/v1/rpc/consume_promotion` devuelve 404
 * PGRST202— y `anon` no tiene `usage` sobre el schema `app`. No había camino
 * desde internet. La primera hipótesis era más grave que el hecho, que es
 * exactamente lo que un comentario de migración no debe hacer.
 *
 * Lo que sí es cierto, y por lo que este revoke va igual: la función es
 * `security definer`, recibe un uuid arbitrario y **no comprueba ni tenant ni
 * permiso**; `authenticated` tiene `usage` sobre `app`; y el único llamador,
 * `create_order`, está revocado de `public, anon, authenticated` y sólo lo
 * ejecuta `service_role` (20260827015211:363-364). O sea que el permiso no le
 * hace falta a nadie más, y dejarlo es apostar a que ninguna función futura de
 * `public` corra como `security invoker` y la llame, y a que nadie agregue
 * `app` a los schemas expuestos. La v2 abre cuentas de comprador y convierte
 * `authenticated` en un rol público: la apuesta se paga entonces.
 *
 * Reversión: `grant execute on function app.consume_promotion(uuid) to public;`
 * — pero si alguna vez hace falta que un rol de cliente la ejecute, lo que se
 * agrega es la comprobación de tenant y de permiso adentro, no el grant.
 */

revoke execute on function app.consume_promotion(uuid) from public;
