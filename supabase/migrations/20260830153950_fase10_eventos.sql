-- Fase 10 Etapa A — los eventos del storefront.
--
-- El Admin ya responde «cuánto vendí» derivándolo de los pedidos (ADR-067). Esto
-- es la otra mitad —cuánta gente miró, qué buscó, dónde se cayó del embudo— y
-- cierra P-003 en Postgres.
--
-- **Esta tabla nunca es la fuente del dinero.** Los eventos aportan el
-- denominador: sesiones y pasos del embudo. El numerador —pedidos e importes—
-- sale de `orders`, sin los cancelados, igual que `admin_dashboard`. Por eso la
-- conversión coincide con la facturación por construcción, y por eso este log se
-- puede tirar entero sin perder una venta, que es lo que PROJECT.md §22 pide para
-- poder migrarlo a otra cosa el día que el volumen no entre acá.
--
-- Tres decisiones que no son obvias leyendo el DDL:
--
-- 1. **No se reusa `order_events`.** Tiene un trigger `after insert` que encola
--    correos: un `page_view` ahí mandaría mail.
-- 2. **`type` es `text` y no un enum**, igual que `order_events.type`. Agregar un
--    evento no puede exigir una migración.
-- 3. **`id` es `bigint identity` y no `uuid`**, como `audit_log`. Es la tabla de
--    más volumen del sistema y un uuid por fila se paga en índice y en disco.

create table if not exists store_events (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null,

  -- La sesión anónima (PROJECT.md §23). Nunca una IP, nunca un cliente: se
  -- asocia a una persona sólo si algún día hay un evento de identificación
  -- legítimo, y eso es otra tabla.
  session_id  uuid not null,

  type        text not null,
  -- La ruta sin query. El término de búsqueda va en `data`; el resto del query
  -- string son facetas, y guardarlas acá sería un índice de basura.
  path        text,
  data        jsonb not null default '{}'::jsonb,

  /*
   * Con qué se descarta un duplicado. `null` cuando repetirse es el dato.
   *
   * Tres eventos se repiten sin que nadie repita nada, y los tres se arreglan
   * acá en vez de en tres lugares distintos del storefront:
   *
   *   checkout_completed  reintentar el checkout con la misma clave de
   *                       idempotencia devuelve el pedido que ya existe y
   *                       responde 201 igual. Dos eventos, un pedido.
   *   coupon_applied      el checkout revalida el carrito en cada cambio y
   *                       reenvía el cupón, que resuelve bien todas las veces.
   *   search              la PLP reenvía `q` en un campo oculto al cambiar de
   *                       faceta: buscar una vez y tocar cinco filtros son cinco
   *                       búsquedas.
   *
   * La forma de cada clave la decide `claveDeDeduplicacion` en el core, que es
   * donde se puede leer de una y tiene sus tests.
   */
  dedupe_key  text,

  occurred_at timestamptz not null default now(),

  constraint store_events_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table store_events is
  'Eventos anónimos del storefront. Aporta el denominador de la conversión; el dinero sale de orders.';
comment on column store_events.dedupe_key is
  'Descarta repeticiones que no son repeticiones. Null cuando repetirse es el dato.';

-- El que hace que `on conflict do nothing` sirva de algo. Parcial, porque la
-- mayoría de las filas no lleva clave y un índice único sobre nulls no agrupa.
create unique index if not exists store_events_dedupe_idx
  on store_events (store_id, type, dedupe_key)
  where dedupe_key is not null;

-- Las dos consultas reales del panel: todo lo del período, y lo del período de un
-- tipo. El orden descendente es el que se lee.
create index if not exists store_events_periodo_idx
  on store_events (store_id, occurred_at desc);
create index if not exists store_events_tipo_idx
  on store_events (store_id, type, occurred_at desc);

alter table store_events enable row level security;

/*
 * Lectura sí, escritura no.
 *
 * A diferencia de `notification_outbox` —que no tiene ninguna política porque
 * nadie más que la secret key la toca— acá el Admin **sí** lee: consulta con la
 * publishable key y RLS es lo que lo acota a su organización.
 *
 * Escribir no puede hacerlo nadie autenticado. La única que inserta es la secret
 * key del storefront, que saltea RLS (ADR-052), y un evento no es algo que un
 * operador deba poder fabricar: si el panel se pudiera escribir desde el Admin,
 * la conversión dejaría de ser una medición.
 */
do $$ begin
  create policy store_events_lectura on store_events
    for select to authenticated
    using (tenant_id in (select app.current_tenants()));
exception when duplicate_object then null;
end $$;

grant select on store_events to authenticated;
-- `anon` es el rol del browser. Se revoca explícito en vez de confiar en que no
-- se haya concedido.
revoke all on store_events from anon;
