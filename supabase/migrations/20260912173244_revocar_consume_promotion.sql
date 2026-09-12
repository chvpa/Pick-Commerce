/*
 * `app.consume_promotion` deja de ser alcanzable por el rol `authenticated`.
 *
 * Es `security definer` —o sea que RLS está salteada por construcción—, recibe
 * un uuid arbitrario y **no comprueba ni tenant ni permiso**: incrementa el
 * `usage_count` de la promoción que le nombren. Con `authenticated`
 * significando hoy «alguien del equipo de algún comercio», el alcance ya es
 * cruzar tenants: un viewer del comercio A le quema el `usage_limit` del cupón
 * de B si conoce el uuid. Las cuentas de comprador que v2 va a abrir lo
 * volverían alcanzable por cualquiera que se registre.
 *
 * El grant nunca hizo falta: su único llamador es `create_order`, que está
 * revocada de `public, anon, authenticated` y la ejecuta sólo `service_role`
 * (20260827015211:363-364). `service_role` conserva el permiso, así que el
 * checkout no cambia.
 *
 * Reversión: `grant execute on function app.consume_promotion(uuid) to
 * authenticated;` — pero no hay motivo. Si alguna vez hace falta que un rol de
 * cliente consuma una promoción, lo que se agrega es la comprobación de tenant
 * y de permiso adentro de la función, no el grant.
 */

revoke execute on function app.consume_promotion(uuid) from authenticated;
