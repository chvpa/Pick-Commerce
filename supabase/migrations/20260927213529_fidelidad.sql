-- Fidelidad por tienda: el libro de puntos (ADR-141).
--
-- **La única decisión de esta migración que no se puede cambiar después** es la
-- forma del libro, y por eso es lo primero que se construye: un libro
-- **append-only** donde cada movimiento lleva la tienda que lo emitió. Nunca una
-- columna `points` en el cliente. Con un saldo, la Fase 9 —puntos que cruzan
-- tiendas— sería reescribir esto; con un libro atribuido, es una consulta encima.
-- Cuesta lo mismo ahora.
--
-- Dos formas de ganar y ninguna más: **una compra pagada** y **una reseña
-- publicada**. Se descartaron las misiones por navegar —visitar, buscar, agregar al
-- carrito, compartir— porque premian una acción sin valor económico y se farmean
-- abriendo una pestaña: con treinta días de visitas valiendo más que una compra, se
-- paga más por mirar que por comprar.
--
-- Tres cosas que no son obvias:
--
--   1. **Los puntos se acreditan cuando el pedido se cobra, no cuando se crea.** El
--      único pedido que existía en el piloto estaba `cancelled`: es exactamente el
--      caso. Y una cancelación emite el movimiento inverso, no borra el anterior.
--   2. **La reseña se paga sin mirar la estrella** (ADR-140). Pagar por estrellas
--      altas es cómo se arruina el activo que la reseña construye.
--   3. **El programa arranca apagado.** Una tienda que no lo pidió no empieza a
--      emitir un pasivo porque se desplegó una migración.

-- ---------------------------------------------------------------------------
-- De dónde salió cada movimiento
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'loyalty_source') then
    -- `reverso` es su propio origen y no un `compra` negativo: así el único
    -- parcial de más abajo puede permitir exactamente un crédito y una reversión
    -- por pedido, que es lo que hace imposible acreditar dos veces.
    create type loyalty_source as enum (
      'compra', 'resena', 'canje', 'reverso', 'vencimiento', 'ajuste'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- El libro
-- ---------------------------------------------------------------------------

create table if not exists loyalty_ledger (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  -- **La tienda que lo emitió.** Es la columna que la Fase 9 necesita y la que no
  -- se puede agregar después sin reprocesar la historia.
  store_id    uuid not null,
  customer_id uuid not null,

  -- Positivo gana, negativo gasta. Nunca cero: un movimiento que no mueve nada no
  -- es un movimiento.
  points      integer not null check (points <> 0),
  source      loyalty_source not null,

  -- Qué lo originó. Cada origen tiene su columna en vez de un `source_id` genérico:
  -- con la foránea, un pedido borrado no deja el libro apuntando al vacío, y se
  -- puede consultar «cuánto pagó este pedido» sin adivinar el tipo.
  order_id    uuid references orders (id) on delete set null,
  review_id   uuid references product_reviews (id) on delete set null,

  -- Para un ajuste a mano: por qué. Lo demás se explica por su origen.
  note        text,

  created_at  timestamptz not null default now(),

  constraint loyalty_ledger_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint loyalty_ledger_customer_id_fkey
    foreign key (customer_id, tenant_id) references customers (id, tenant_id) on delete cascade
);

comment on table loyalty_ledger is
  'Libro de puntos, append-only. Cada movimiento lleva la tienda que lo emitió: es lo que permite que la Fase 9 sea una consulta encima y no una reescritura.';

-- Un crédito y una reversión por pedido, y una sola por reseña. Es lo que hace
-- idempotentes a los disparadores: acreditar dos veces deja de ser posible, no
-- deja de pasar por suerte.
create unique index if not exists loyalty_ledger_por_pedido
  on loyalty_ledger (order_id, source) where order_id is not null;

create unique index if not exists loyalty_ledger_por_resena
  on loyalty_ledger (review_id) where review_id is not null;

create index if not exists loyalty_ledger_saldo_idx
  on loyalty_ledger (store_id, customer_id, created_at);

alter table loyalty_ledger enable row level security;

/*
 * El comprador lee **su** libro y nada más. No escribe: los movimientos los
 * emiten los disparadores y el canje, que son `definer`.
 *
 * El equipo del comercio lee el de sus tiendas. Tampoco escribe a mano: un ajuste
 * manual necesitaría su propia función y su propia auditoría, y no hay pedido
 * detrás todavía —el enum ya lo contempla—.
 */
create policy loyalty_ledger_propio on loyalty_ledger
  for select to authenticated
  using (customer_id = app.current_customer(store_id));

create policy loyalty_ledger_del_equipo on loyalty_ledger
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

grant select on loyalty_ledger to authenticated;

-- ---------------------------------------------------------------------------
-- Las reglas, que viven en un solo lado
-- ---------------------------------------------------------------------------

/*
 * Cuántos puntos da cada cosa, y si el programa está encendido.
 *
 * **Las reglas viven sólo acá.** Los disparadores las leen para emitir y el Admin
 * las lee para mostrarlas: si además estuvieran escritas en TypeScript, el día que
 * cambie una el sistema pagaría una cosa y la pantalla diría otra.
 *
 * Salen de `store_settings.settings.loyalty`, con sus defaults en el `coalesce`. Una
 * tienda sin la sección tiene el programa **apagado**: emitir un pasivo porque se
 * desplegó una migración no es una decisión que nadie tomó.
 *
 * Los puntos son por compra y no por guaraní gastado a propósito: una razón de
 * conversión entre plata y puntos es una decisión de negocio que hay que tomar con
 * datos, y acá todavía no hay. Veinte por compra es simple de explicar y de cambiar.
 */
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
  from store_settings s
  where s.store_id = p_store_id;
$$;

comment on function app.regla_de_puntos is
  'Las reglas del programa de puntos de una tienda, con sus defaults. Apagado si la tienda no lo configuró.';

revoke all on function app.regla_de_puntos(uuid) from public, anon;
grant execute on function app.regla_de_puntos(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ganar: la compra pagada
-- ---------------------------------------------------------------------------

/*
 * Acredita al pasar a pagado, y revierte al cancelarse.
 *
 * Va en un disparador y no en el Admin porque **hay más de un camino a «pagado»**:
 * la pantalla de pedidos hoy, una pasarela cuando exista, un script de conciliación
 * si aparece. Un programa de puntos que sólo funciona por la pantalla que se usó
 * para escribirlo es un programa que se rompe con la siguiente.
 *
 * `definer`: quien marca el pedido como pagado es el equipo del comercio, que no
 * tiene —ni debería tener— permiso de escritura sobre el libro.
 */
create or replace function app.puntos_del_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_regla jsonb;
  v_ya    integer;
begin
  if new.customer_id is null then
    return new;
  end if;

  v_regla := app.regla_de_puntos(new.store_id);
  if coalesce((v_regla->>'enabled')::boolean, false) is not true then
    return new;
  end if;

  -- Se cobró: se acredita. El único parcial impide la segunda vez, así que un
  -- `update` que vuelva a dejar `paid` no paga de nuevo.
  if new.payment_status = 'paid' and coalesce(old.payment_status::text, '') <> 'paid' then
    insert into loyalty_ledger (tenant_id, store_id, customer_id, points, source, order_id)
    values (new.tenant_id, new.store_id, new.customer_id,
            (v_regla->>'porCompra')::int, 'compra', new.id)
    on conflict do nothing;
  end if;

  /*
   * Se canceló: se emite el inverso. **No se borra el crédito**, que es lo que
   * significa append-only: el libro tiene que poder explicar por qué el saldo bajó,
   * y un movimiento que desaparece no explica nada.
   *
   * Sólo si había algo acreditado: cancelar un pedido que nunca se cobró no
   * descuenta puntos que no se dieron.
   */
  if new.status = 'cancelled' and coalesce(old.status::text, '') <> 'cancelled' then
    select points into v_ya
    from loyalty_ledger
    where order_id = new.id and source = 'compra';

    if v_ya is not null then
      insert into loyalty_ledger (tenant_id, store_id, customer_id, points, source, order_id)
      values (new.tenant_id, new.store_id, new.customer_id, -v_ya, 'reverso', new.id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists puntos_del_pedido on orders;
create trigger puntos_del_pedido
  after update on orders
  for each row execute function app.puntos_del_pedido();

-- ---------------------------------------------------------------------------
-- Ganar: la reseña publicada
-- ---------------------------------------------------------------------------

/*
 * Al publicarse, y **sin mirar la estrella** (ADR-140).
 *
 * Al publicarse y no al escribirse: una reseña que el comercio rechaza no pagó
 * nada, y pagar antes de la revisión convierte el programa en una máquina de texto
 * que nadie va a leer.
 */
create or replace function app.puntos_de_la_resena()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_regla jsonb;
begin
  if new.status <> 'published' or coalesce(old.status::text, '') = 'published' then
    return new;
  end if;

  v_regla := app.regla_de_puntos(new.store_id);
  if coalesce((v_regla->>'enabled')::boolean, false) is not true then
    return new;
  end if;

  insert into loyalty_ledger (tenant_id, store_id, customer_id, points, source, review_id)
  values (new.tenant_id, new.store_id, new.customer_id,
          (v_regla->>'porResena')::int, 'resena', new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists puntos_de_la_resena on product_reviews;
create trigger puntos_de_la_resena
  after update on product_reviews
  for each row execute function app.puntos_de_la_resena();

-- ---------------------------------------------------------------------------
-- El vencimiento, que se calcula al leer
-- ---------------------------------------------------------------------------

/*
 * Vence lo que quedó sin gastar de lo ganado antes del corte, **escribiendo** el
 * movimiento.
 *
 * Sin vencimiento el pasivo crece para siempre y nadie canjea; con una tarea
 * programada habría que montar y vigilar una tarea programada. Esto se llama al
 * leer el saldo y al canjear, así que el libro se mantiene al día sin nada afuera.
 *
 * La cuenta es FIFO en agregado y entra en una línea: de lo ganado hasta el corte,
 * se vence lo que no consumieron los gastos y los vencimientos anteriores. Eso
 * evita el error clásico —restar dos veces unos puntos que ya se habían gastado— sin
 * necesidad de rastrear qué gasto consumió qué crédito.
 */
create or replace function app.vencer_puntos(p_store_id uuid, p_customer_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_dias      integer;
  v_ganado    integer;
  v_consumido integer;
  v_vencer    integer;
  v_tenant    uuid;
begin
  v_dias := coalesce((app.regla_de_puntos(p_store_id)->>'diasDeVencimiento')::int, 365);
  if v_dias <= 0 then
    return 0;
  end if;

  select coalesce(sum(points) filter (
           where points > 0 and created_at <= now() - make_interval(days => v_dias)
         ), 0),
         coalesce(-sum(points) filter (where points < 0), 0)
    into v_ganado, v_consumido
  from loyalty_ledger
  where store_id = p_store_id and customer_id = p_customer_id;

  v_vencer := v_ganado - v_consumido;
  if v_vencer <= 0 then
    return 0;
  end if;

  select tenant_id into v_tenant from stores where id = p_store_id;

  insert into loyalty_ledger (tenant_id, store_id, customer_id, points, source, note)
  values (v_tenant, p_store_id, p_customer_id, -v_vencer, 'vencimiento',
          format('Puntos ganados hace más de %s días', v_dias));

  return v_vencer;
end;
$$;

comment on function app.vencer_puntos is
  'Escribe el movimiento de vencimiento que corresponda. Se llama al leer el saldo: el libro se mantiene al día sin una tarea programada.';

revoke all on function app.vencer_puntos(uuid, uuid) from public, anon, authenticated;
-- Al storefront sí: es el que lee el saldo con la secret key cuando hace falta
-- mostrarlo fuera de la sesión del comprador.
grant execute on function app.vencer_puntos(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Lo que lee el comprador
-- ---------------------------------------------------------------------------

/*
 * Su saldo y su historia.
 *
 * `definer` porque **escribe**: pasa el vencimiento antes de contar, y el comprador
 * no tiene permiso de escritura sobre el libro. La identidad sigue saliendo de la
 * sesión por `app.current_customer`.
 */
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
      -- `t.m` y `t.created_at`: dentro del `jsonb_agg` hay que ordenar por la
      -- columna de la subconsulta, no por un campo del jsonb que no existe.
      select jsonb_agg(t.m order by t.created_at desc)
      from (
        select jsonb_build_object(
                 'id', l.id,
                 'puntos', l.points,
                 'origen', l.source,
                 'nota', l.note,
                 'fecha', l.created_at
               ) as m,
               l.created_at
        from loyalty_ledger l
        where l.store_id = p_store_id and l.customer_id = v_cliente
        order by l.created_at desc
        limit least(greatest(coalesce(p_limite, 20), 1), 100)
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.mis_puntos is
  'El saldo de puntos del comprador autenticado y sus últimos movimientos. Pasa el vencimiento antes de contar.';

revoke all on function public.mis_puntos(uuid, integer) from public, anon;
grant execute on function public.mis_puntos(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que ve el comercio
-- ---------------------------------------------------------------------------

/*
 * El programa, en números: qué reglas rigen, cuánto se emitió, cuánto se gastó y
 * cuál es el pasivo abierto.
 *
 * **El pasivo es el número que importa** y es el que nadie mira hasta que duele:
 * son los puntos emitidos y no gastados, o sea lo que el comercio va a tener que
 * entregar. Se informa aparte de lo emitido a propósito.
 */
create or replace function public.admin_loyalty(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with permitido as (
    select s.id from stores s
    where s.id = p_store_id and s.tenant_id in (select app.current_tenants())
  ),
  libro as (
    select l.* from loyalty_ledger l join permitido pe on pe.id = l.store_id
  )
  select case when exists (select 1 from permitido) then jsonb_build_object(
    'reglas', app.regla_de_puntos(p_store_id),
    'emitidos', (select coalesce(sum(points), 0)::int from libro where points > 0),
    'gastados', (select coalesce(-sum(points), 0)::int from libro where points < 0),
    'pasivo', (select coalesce(sum(points), 0)::int from libro),
    'conPuntos', (
      select count(*)::int from (
        select customer_id from libro group by customer_id having sum(points) > 0
      ) c
    ),
    'porCompras', (select coalesce(sum(points), 0)::int from libro where source = 'compra'),
    'porResenas', (select coalesce(sum(points), 0)::int from libro where source = 'resena'),
    'vencidos', (select coalesce(-sum(points), 0)::int from libro where source = 'vencimiento')
  ) else jsonb_build_object('reglas', jsonb_build_object('enabled', false)) end;
$$;

comment on function public.admin_loyalty is
  'El programa de puntos de una tienda en números, con el pasivo abierto aparte de lo emitido.';

revoke all on function public.admin_loyalty(uuid) from public, anon;
grant execute on function public.admin_loyalty(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- El catálogo de canje, y el canje
-- ---------------------------------------------------------------------------
--
-- **Tres de los cuatro tipos de canje ya son una promoción.** El motor de la Fase 9
-- tiene `discount_type`, `discount_value`, alcance por `all`, `category`,
-- `collection` y `product`, tope de usos y rango de fechas: un 30 % en todo, un 20 %
-- sobre una colección de marca y un producto al 100 % ya se expresan ahí. Entonces un
-- canje **gasta puntos y emite un cupón de un solo uso**, y no hay un segundo lugar
-- donde se calcule un importe. Eso es lo que evita el bug que este repo ya conoce: el
-- carrito mostrando un precio y el pedido cobrando otro.
--
-- Lo que **no** entra, y con su motivo:
--
--   - **Envío gratis.** El envío lo calcula `create_order` aparte y no es un
--     descuento sobre el subtotal (ADR-107, ADR-114), así que sería un tipo nuevo en
--     el camino del dinero. Se hace con su propio trabajo y sus propios tests, no de
--     paso.
--   - **Un producto de regalo con reserva de stock.** La reserva es lo que hace que
--     un canje agotado no termine en un error al pagar, y eso es multi-location, que
--     el ERP bloquea.
--
-- El cupón queda atado a quien lo canjeó **porque sólo esa persona lo recibe**, y vale
-- una sola vez. Un código compartido lo gasta otro, pero los puntos ya los pagó quien
-- lo canjeó: el riesgo es de quien lo comparte, y el tope de un uso acota el del
-- comercio. Atarlo por `customer_id` obligaría a que `cart_promotions` supiera quién
-- está comprando —hoy no lo sabe, y el checkout de invitado no tiene a nadie—, o sea
-- tocar el camino del dinero para algo que el código de un solo uso ya resuelve.

create table if not exists loyalty_rewards (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations (id) on delete cascade,
  store_id      uuid not null,

  title         text not null,
  -- Lo que cuesta. El Admin muestra el tipo de cambio implícito al fijarlo, que es lo
  -- más valioso de esa pantalla: «una compra da 20 puntos; estás pidiendo 10: cada
  -- compra alcanza para dos canjes de esto».
  points_cost   integer not null check (points_cost > 0),

  -- Lo que entrega, en el vocabulario del motor de promociones.
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value bigint not null check (discount_value > 0),
  target        jsonb not null default '{"kind":"all"}'::jsonb,

  status        promotion_status not null default 'draft',
  starts_at     timestamptz,
  ends_at       timestamptz,

  -- El «stock» del premio. Nulo = sin tope. El contador lo incrementa el canje con la
  -- condición en el propio update, como el de los cupones: un select y después un
  -- update deja pasar dos canjes simultáneos del último.
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemptions   integer not null default 0,
  -- Cuántas veces lo puede canjear la misma persona. Nulo = sin tope.
  max_per_customer integer check (max_per_customer is null or max_per_customer > 0),

  -- Cuánto vale el cupón que emite. Un cupón sin vencimiento es un pasivo abierto que
  -- no se puede cerrar.
  valid_days    integer not null default 30 check (valid_days > 0),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint loyalty_rewards_porcentaje_valido
    check (discount_type <> 'percentage' or discount_value <= 10000),
  constraint loyalty_rewards_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table loyalty_rewards is
  'Que se puede canjear con puntos. Un canje emite un cupon de un solo uso: el descuento lo sigue calculando el motor de promociones.';

create index if not exists loyalty_rewards_tienda_idx
  on loyalty_rewards (store_id, status, points_cost);

alter table loyalty_rewards enable row level security;

-- El comprador ve los activos: es una vitrina. El equipo administra.
create policy loyalty_rewards_vitrina on loyalty_rewards
  for select to authenticated
  using (status = 'active');

create policy loyalty_rewards_del_equipo on loyalty_rewards
  for all to authenticated
  using (app.has_permission(tenant_id, 'promotion.write'))
  with check (app.has_permission(tenant_id, 'promotion.write'));

grant select, insert, update, delete on loyalty_rewards to authenticated;

-- El libro necesita poder decir qué canje fue, y qué cupón emitió.
alter table loyalty_ledger
  add column if not exists reward_id uuid references loyalty_rewards (id) on delete set null;
alter table loyalty_ledger
  add column if not exists promotion_id uuid references promotions (id) on delete set null;

/*
 * Canjear.
 *
 * Todo adentro de una transacción y con el tope en el `update`: el saldo, el stock del
 * premio, el cupón y el movimiento del libro tienen que existir los cuatro o ninguno.
 * Si el cupón se creara y el movimiento fallara, el comercio entregaría un descuento
 * sin cobrar los puntos.
 *
 * Los errores hablan en el idioma de quien los va a leer: un premio agotado dice que
 * está agotado, no que una restricción falló. **Un canje agotado se ve como agotado,
 * nunca como un error al pagar**, y por eso el stock se toma acá y no en el checkout.
 */
create or replace function public.canjear_premio(p_store_id uuid, p_reward_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente  uuid;
  v_tenant   uuid;
  v_regla    jsonb;
  v_premio   loyalty_rewards;
  v_saldo    integer;
  v_suyos    integer;
  v_codigo   text;
  v_promo    uuid;
begin
  v_regla := app.regla_de_puntos(p_store_id);
  if coalesce((v_regla->>'enabled')::boolean, false) is not true then
    raise exception 'Esta tienda no tiene programa de puntos';
  end if;

  v_cliente := app.current_customer(p_store_id);
  if v_cliente is null then
    raise exception 'Hay que entrar a la cuenta para poder canjear';
  end if;

  select * into v_premio from loyalty_rewards
  where id = p_reward_id and store_id = p_store_id;

  if v_premio.id is null or v_premio.status <> 'active' then
    raise exception 'Ese premio no esta disponible';
  end if;

  if (v_premio.starts_at is not null and now() < v_premio.starts_at)
     or (v_premio.ends_at is not null and now() >= v_premio.ends_at) then
    raise exception 'Ese premio no esta disponible en esta fecha';
  end if;

  if v_premio.max_per_customer is not null then
    select count(*) into v_suyos from loyalty_ledger
    where store_id = p_store_id and customer_id = v_cliente and reward_id = p_reward_id;

    if v_suyos >= v_premio.max_per_customer then
      raise exception 'Ya canjeaste este premio todas las veces que se puede';
    end if;
  end if;

  -- El vencimiento antes de contar: canjear con puntos que ya vencieron seria
  -- entregar un descuento contra nada.
  perform app.vencer_puntos(p_store_id, v_cliente);

  select coalesce(sum(points), 0) into v_saldo from loyalty_ledger
  where store_id = p_store_id and customer_id = v_cliente;

  if v_saldo < v_premio.points_cost then
    raise exception 'Te faltan puntos: tenes % y este premio cuesta %',
      v_saldo, v_premio.points_cost;
  end if;

  -- El stock, con la condición en el update. Si no actualiza ninguna fila, otro se
  -- llevó el último mientras esta transacción pensaba.
  update loyalty_rewards
  set redemptions = redemptions + 1, updated_at = now()
  where id = p_reward_id
    and (max_redemptions is null or redemptions < max_redemptions);

  if not found then
    raise exception 'Ese premio se agoto';
  end if;

  select tenant_id into v_tenant from stores where id = p_store_id;

  /*
   * El código. Nueve caracteres de un alfabeto sin los que se confunden al leerlos en
   * voz alta —sin 0/O, sin 1/I— porque alguien lo va a copiar a mano desde el
   * teléfono. El único de `promotions (store_id, lower(code))` es la última palabra:
   * si hubiera colisión, la transacción falla y el canje no ocurre.
   */
  select 'P' || string_agg(
           substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), ''
         )
    into v_codigo
  from generate_series(1, 9);

  insert into promotions (
    tenant_id, store_id, title, status, code, starts_at, ends_at,
    usage_limit, discount_type, discount_value, target, stackable
  ) values (
    v_tenant, p_store_id,
    format('Canje: %s', v_premio.title), 'active', v_codigo,
    now(), now() + make_interval(days => v_premio.valid_days),
    1, v_premio.discount_type, v_premio.discount_value, v_premio.target, false
  )
  returning id into v_promo;

  insert into loyalty_ledger (
    tenant_id, store_id, customer_id, points, source, reward_id, promotion_id
  ) values (
    v_tenant, p_store_id, v_cliente, -v_premio.points_cost, 'canje', p_reward_id, v_promo
  );

  return jsonb_build_object(
    'codigo', v_codigo,
    'premio', v_premio.title,
    'vence', now() + make_interval(days => v_premio.valid_days),
    'saldo', v_saldo - v_premio.points_cost
  );
end;
$$;

comment on function public.canjear_premio is
  'Gasta puntos y emite un cupon de un solo uso. El descuento lo sigue calculando el motor de promociones, asi que no hay un segundo lugar donde se decida un importe.';

revoke all on function public.canjear_premio(uuid, uuid) from public, anon;
grant execute on function public.canjear_premio(uuid, uuid) to authenticated;

/*
 * Los premios que el comprador puede ver, con si le alcanza.
 *
 * `definer` porque pasa el vencimiento antes de comparar. «Le alcanza» se calcula acá
 * y no en la pantalla para que el botón y la base no puedan discrepar.
 */
create or replace function public.premios_disponibles(p_store_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente uuid;
  v_saldo   integer := 0;
begin
  if coalesce((app.regla_de_puntos(p_store_id)->>'enabled')::boolean, false) is not true then
    return jsonb_build_object('habilitado', false, 'saldo', 0, 'premios', '[]'::jsonb);
  end if;

  v_cliente := app.current_customer(p_store_id);
  if v_cliente is not null then
    perform app.vencer_puntos(p_store_id, v_cliente);
    select coalesce(sum(points), 0) into v_saldo from loyalty_ledger
    where store_id = p_store_id and customer_id = v_cliente;
  end if;

  return jsonb_build_object(
    'habilitado', true,
    'saldo', v_saldo,
    'premios', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'titulo', r.title,
          'puntos', r.points_cost,
          'tipo', r.discount_type,
          'valor', r.discount_value,
          'alcanza', v_saldo >= r.points_cost,
          -- Agotado se dice, no se esconde: un premio que desaparece parece un error.
          'agotado', r.max_redemptions is not null and r.redemptions >= r.max_redemptions,
          'vence', r.ends_at
        ) order by r.points_cost
      )
      from loyalty_rewards r
      where r.store_id = p_store_id
        and r.status = 'active'
        and (r.starts_at is null or now() >= r.starts_at)
        and (r.ends_at is null or now() < r.ends_at)
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.premios_disponibles is
  'Los premios activos de una tienda con el saldo de quien mira y si le alcanza. Un premio agotado se informa como agotado, no se esconde.';

revoke all on function public.premios_disponibles(uuid) from public, anon;
grant execute on function public.premios_disponibles(uuid) to authenticated;
