-- La sesión del checkout: el contacto del primer paso, guardado en el servidor
-- (ADR-167).
--
-- Hasta acá el checkout guardaba a quien compra recién al confirmar, así que un
-- checkout abandonado no tenía a quién escribirle y «Recuperar» no se podía
-- ofrecer en Analytics (ADR-153). Ahora, al pasar «Tus datos», el storefront
-- guarda el nombre, el correo, el teléfono y lo que hay en el carrito.
--
-- Reversión: `drop trigger cerrar_sesion_de_checkout on orders`,
-- `drop function app.cerrar_sesion_de_checkout()` y `drop table checkout_sessions`.
-- Todavía nada lee la tabla.

create table if not exists checkout_sessions (
  tenant_id  uuid not null,
  store_id   uuid not null,
  -- La clave de idempotencia del checkout: la genera el island al montarse y es
  -- la misma con la que después se crea el pedido. Así el pedido sabe qué sesión
  -- cierra sin que nadie se lo diga.
  id         uuid not null,

  -- Sólo lo que hace falta para escribirle. El documento no: es de la factura, y
  -- una factura sólo existe si hubo pedido.
  name       text not null,
  email      text not null,
  phone      text not null,

  -- `[{variantId, quantity}]`, como lo manda el carrito. Ni precio ni título:
  -- quien la lea los toma de la base, que es lo que vale cuando se le escribe.
  lines      jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (store_id, id),
  constraint checkout_sessions_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint checkout_sessions_lines_es_lista check (jsonb_typeof(lines) = 'array'),
  -- El trigger de abajo compara correos: los dos lados en minúsculas.
  constraint checkout_sessions_email_minusculas check (email = lower(email))
);

comment on table checkout_sessions is
  'El contacto del primer paso del checkout, hasta que hay pedido o pasan 30 días. ADR-167.';

-- Los dos que borran: el pedido, por correo; la purga, por fecha.
create index if not exists checkout_sessions_email_idx on checkout_sessions (store_id, email);
create index if not exists checkout_sessions_fecha_idx on checkout_sessions (store_id, updated_at);

alter table checkout_sessions enable row level security;
-- Sin políticas, como `notification_outbox`: hoy sólo la escribe y la borra la
-- secret key del storefront. Quien la lea desde el Admin —recuperar los
-- carritos— trae su propio camino.
revoke all on checkout_sessions from anon, authenticated;

/*
 * El pedido cierra la sesión: la borra.
 *
 * No la marca, la borra. Quien compró ya está en el pedido, y una copia de su
 * contacto en una tabla de «no compraron» no sirve para nada y es un dato
 * personal de más.
 *
 * Por la clave y **también por el correo**: quien recargó el checkout empezó
 * con otra clave, y su primera sesión quedaría diciendo que abandonó cuando
 * compró. Una sesión que empiece después del pedido es otra compra, y queda.
 *
 * Va en un trigger y no en el endpoint para que lo cumpla todo pedido, venga de
 * donde venga, y en la misma transacción que lo crea.
 */
create or replace function app.cerrar_sesion_de_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.checkout_sessions s
  where s.store_id = new.store_id
    and (s.id = new.idempotency_key
         or s.email = lower(new.customer ->> 'email'));
  return null;
end;
$$;

revoke all on function app.cerrar_sesion_de_checkout() from public, anon, authenticated;

drop trigger if exists cerrar_sesion_de_checkout on orders;
create trigger cerrar_sesion_de_checkout after insert on orders
  for each row execute function app.cerrar_sesion_de_checkout();
