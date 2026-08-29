-- Fase 9, Etapa A — promociones.
--
-- El modelo es plano a propósito. PROJECT.md §15 dibuja `conditions[]` y
-- `actions[]`, pero los casos de esta fase —porcentaje, monto fijo, mínimo de
-- compra, mínimo de cantidad, cupón, vigencia y alcance— entran en columnas. Un
-- motor de reglas para eso sería un intérprete que hay que depurar sin ganar
-- nada, y `collections.rules` ya mostró que una consulta guardada rinde más que
-- un motor propio.
--
-- La semántica no vive acá: vive en `packages/commerce-core/src/promotions.ts`,
-- con sus tests. Por el razonamiento de ADR-055, el modo de fallo de una
-- promoción es silencioso —un descuento mal calculado no lanza nada, sólo cobra
-- mal—, así que el core es la especificación y el SQL la refleja.

-- ---------------------------------------------------------------------------
-- El permiso
-- ---------------------------------------------------------------------------
--
-- `promotion.write` y no `catalog.write`. El precedente de ADR-056 dice no
-- inventar un permiso cuando ningún rol distingue —por eso el stock escribe con
-- `catalog.write`—, pero acá sí hay una distinción real: una campaña de
-- descuento es una decisión de precio, y las decisiones de precio ya viven
-- detrás de `settings.write`, que el staff no tiene. Un repositor que carga
-- productos no debería poder publicar un 40 %.
--
-- La fuente de verdad es `ROLE_PERMISSIONS` en el core; un test compara las dos
-- listas y falla si divergen.

insert into role_permissions (role, permission) values
  ('owner', 'promotion.write'),
  ('admin', 'promotion.write')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Promociones
-- ---------------------------------------------------------------------------

do $$ begin
  create type promotion_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null;
end $$;

create table if not exists promotions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations (id) on delete cascade,
  store_id      uuid not null,

  title         text not null,
  -- Se archiva, no se borra (ADR-060): un pedido viejo tiene que poder seguir
  -- explicando de dónde salió su descuento.
  status        promotion_status not null default 'draft',

  -- Mayor primero. Es el control del comercio sobre cuál gana cuando hay dos.
  priority      integer not null default 0,
  -- Si combina con otra. La regla exacta está en `aplicarCadena` del core: se
  -- recorren por prioridad, y una que no combina se aplica sólo si no se aplicó
  -- ninguna todavía y corta la cadena.
  stackable     boolean not null default false,

  -- Nulo = automática. Con valor = cupón, y el comprador lo escribe al comprar.
  code          text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  -- Nulo = sin tope. El contador lo incrementa `create_order` dentro de su misma
  -- transacción, con la condición en el propio update: un select seguido de un
  -- update deja pasar dos pedidos simultáneos con el último cupón.
  usage_limit   integer check (usage_limit is null or usage_limit > 0),
  usage_count   integer not null default 0,

  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  -- Puntos básicos si es porcentaje (1500 = 15 %), unidad mínima de la moneda si
  -- es monto fijo. Entero en los dos casos: el dinero de este sistema nunca pasa
  -- por un float, y un descuento tampoco.
  discount_value bigint not null check (discount_value > 0),

  -- {"kind":"all"} | {"kind":"category"|"collection"|"product","ids":[...]}
  target        jsonb not null default '{"kind":"all"}'::jsonb,

  -- Condiciones de carrito. Su presencia es lo que hace que la promoción **no**
  -- se pueda mostrar en la PLP: sin carrito no hay subtotal contra el que
  -- evaluarlas. Ver `esDeCatalogo` en el core.
  min_subtotal  bigint check (min_subtotal is null or min_subtotal > 0),
  min_quantity  integer check (min_quantity is null or min_quantity > 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Un porcentaje mayor al 100 % daría un precio negativo. El core lo topa igual
  -- con `subtractMoney`, pero el dato no tiene por qué llegar roto.
  constraint promotions_porcentaje_valido
    check (discount_type <> 'percentage' or discount_value <= 10000),

  unique (id, tenant_id),
  constraint promotions_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table promotions is
  'Campañas de descuento. La semántica de aplicación vive en commerce-core/promotions.ts, que es su especificación ejecutable.';

-- Dos cupones con el mismo código en una tienda es un bug de cobro: el segundo
-- sería inalcanzable o se aplicaría el equivocado. Insensible a mayúsculas
-- porque así se busca desde el checkout.
create unique index if not exists promotions_code_idx
  on promotions (store_id, lower(code))
  where code is not null;

-- El listado del Admin y la resolución del storefront piden lo mismo: las de
-- esta tienda, por prioridad.
create index if not exists promotions_listado_idx
  on promotions (store_id, status, priority desc);

alter table promotions enable row level security;

create policy promotions_lectura on promotions
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy promotions_escritura on promotions
  for all to authenticated
  using (app.has_permission(tenant_id, 'promotion.write'))
  with check (app.has_permission(tenant_id, 'promotion.write'));

grant select, insert, update, delete on promotions to authenticated;
revoke all on promotions from anon;

-- ---------------------------------------------------------------------------
-- El pedido conserva su descuento
-- ---------------------------------------------------------------------------
--
-- PROJECT.md §13 exige que el detalle del pedido conserve «precio original,
-- descuentos, cupón». Hoy `orders` guarda un solo `total_amount` y no conserva
-- ninguno de los tres.

alter table orders add column if not exists discount_amount bigint not null default 0;

-- El snapshot de lo aplicado, no el id de la promoción. Por el mismo motivo por
-- el que `order_items` copia título y precio: la promoción se edita, se archiva
-- o cambia de porcentaje, y el pedido tiene que seguir contando su historia.
-- Cada elemento: {promotionId, title, code?, discountType, discountValue, amount}
alter table orders add column if not exists applied_promotions jsonb not null default '[]'::jsonb;

-- El subtotal **se deriva, no se guarda**.
--
-- El primer intento fue una columna `not null` con su check de que las tres
-- cuadraran, y rompió todos los insert de `orders` que ya existen: `create_order`
-- inserta el pedido y recién después le pone el total, y las fixtures de los
-- tests insertan sin pasar por ahí. Exigirlo habría obligado a tocar cada sitio
-- de inserción para repetir un dato que ya está implícito.
--
-- `total = subtotal - descuento` significa que el subtotal es `total +
-- descuento`. Generada y almacenada, la mantiene Postgres: la invariante no se
-- puede violar porque no hay dos números que puedan discrepar, los pedidos
-- viejos quedan con su subtotal correcto sin backfill, y ningún llamador cambia.
--
-- No contradice la advertencia de ADR-056 sobre columnas materializadas: aquella
-- es sobre un espejo que **alguien** tiene que recordar actualizar. Acá no hay
-- nadie a quien se le pueda olvidar.
alter table orders add column if not exists subtotal_amount bigint
  generated always as (total_amount + discount_amount) stored;

comment on column orders.subtotal_amount is
  'Suma de los precios de lista, antes de descuento. Derivada: total + descuento.';
comment on column orders.discount_amount is
  'Lo descontado sobre el subtotal de lista.';
comment on column orders.applied_promotions is
  'Snapshot de las promociones aplicadas. No referencia a promotions: el pedido no depende de que la campaña siga existiendo.';
