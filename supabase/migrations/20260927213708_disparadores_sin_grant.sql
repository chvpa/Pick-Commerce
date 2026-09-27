-- Las funciones de disparador no se llaman a mano.
--
-- `app.puntos_del_pedido` y `app.puntos_de_la_resena` nacieron alcanzables por
-- `authenticated`, no porque alguien las concediera sino porque **Postgres concede
-- `execute` a `public` por defecto** en toda función nueva. Lo encontró la suite de
-- aislamiento, que exige que cada función alcanzable esté clasificada a mano: son
-- `security definer` y escriben en el libro de puntos, así que dejarlas invocables era
-- dejar una puerta por la que cualquiera con sesión podía emitir un movimiento pasando
-- un `new` armado.
--
-- Revocarlas no apaga los disparadores: **al disparar, Postgres no comprueba `execute`
-- sobre la función**; el permiso que importa es `trigger` sobre la tabla, y lo tiene el
-- dueño. Medido en PGlite con los diez casos de fidelidad: siguen acreditando igual.

revoke all on function app.puntos_del_pedido() from public, anon, authenticated;
revoke all on function app.puntos_de_la_resena() from public, anon, authenticated;
