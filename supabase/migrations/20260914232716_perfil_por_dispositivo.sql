/*
 * El perfil vive en el dispositivo, y no en la sesión.
 *
 * El plan de la Fase 2 decía «no se agrega ninguna cookie nueva: el perfil se
 * cuelga de `pick_sid`, y lo que cambia es cuánto dura». **Eso rompía la
 * analítica**, y se vio antes de escribirlo: `pick_sid` es el id de *visita* y
 * es el denominador de todo el embudo, que cuenta `distinct session_id`. Con esa
 * cookie durando seis meses, las veinte visitas de una persona se vuelven una
 * sola sesión y la conversión sube veinte veces sin que nada falle ni avise.
 *
 * Así que son dos identificadores y no uno, porque son dos preguntas distintas:
 *
 *   session_id  qué pasó en **esta visita**. Treinta minutos deslizantes. Es el
 *               denominador de la conversión y no se toca.
 *   device_id   qué viene haciendo **este navegador**. 180 días deslizantes. Es
 *               lo que levanta el techo de lo que el sitio puede recordar, que
 *               hasta hoy eran treinta minutos.
 *
 * `device_id` es **nulo** cuando la persona apagó la personalización, y por eso
 * la columna acepta nulos en vez de tener default: la fila del evento se guarda
 * igual —la medición del comercio no depende de que le den permiso a nada— y lo
 * único que se pierde es poder atarla a las demás visitas de ese navegador.
 *
 * Sigue sin haber **ninguna** columna de cliente acá. El cruce entre lo que
 * alguien mira y quién es vive en `session_identities`, que es otra tabla y otra
 * decisión (PROJECT.md §23).
 */

alter table store_events add column device_id uuid;

comment on column store_events.device_id is
  'El navegador, no la visita ni la persona. Nulo si se apagó la personalización.';

/*
 * Para «lo que vio este dispositivo», que es la consulta que estrena el perfil.
 *
 * Es el gemelo del índice por sesión y por el mismo motivo: sin él, leer el
 * historial de un visitante es un scan sobre la tabla que más crece del
 * esquema, en la portada. El `where` lo deja fuera de las filas sin
 * personalización, que son ruido para esta consulta y pueden ser muchas.
 */
create index store_events_dispositivo_idx
  on store_events (store_id, device_id, type, occurred_at desc)
  where device_id is not null;
