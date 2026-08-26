-- Multitenancy, membresías y autorización.
--
-- Un "tenant" es una `organization`. La columna se llama `tenant_id` en las
-- entidades de negocio, como en PROJECT.md §7, y apunta a `organizations(id)`.
--
-- La autorización tiene dos capas y ninguna reemplaza a la otra: RLS acá, y
-- verificación en el servicio de dominio. Ver ADR-052.

-- `gen_random_uuid()` está en el core de Postgres desde la 13: no hace falta
-- la extensión pgcrypto.

-- ---------------------------------------------------------------------------
-- Roles y permisos
-- ---------------------------------------------------------------------------

create type member_role as enum ('owner', 'admin', 'staff', 'viewer');

-- Los permisos se guardan como datos y no se hardcodean en las políticas: al
-- agregar un rol no hay que reescribir RLS, y el conjunto es auditable.
create table role_permissions (
  role        member_role not null,
  permission  text        not null,
  primary key (role, permission)
);

comment on table role_permissions is
  'Permisos por rol. Las políticas consultan esto en vez de comparar roles.';

insert into role_permissions (role, permission) values
  -- owner: todo, incluida la organización misma.
  ('owner', 'organization.manage'),
  ('owner', 'store.manage'),
  ('owner', 'member.manage'),
  ('owner', 'catalog.write'),
  ('owner', 'order.write'),
  ('owner', 'settings.write'),
  -- admin: opera la tienda pero no toca la organización ni el equipo.
  ('admin', 'store.manage'),
  ('admin', 'catalog.write'),
  ('admin', 'order.write'),
  ('admin', 'settings.write'),
  -- staff: día a día, sin configuración.
  ('staff', 'catalog.write'),
  ('staff', 'order.write');
  -- viewer: sólo lectura. No se le asigna ningún permiso de escritura.

-- ---------------------------------------------------------------------------
-- Organizaciones, tiendas y sucursales
-- ---------------------------------------------------------------------------

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table stores (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references organizations (id) on delete cascade,
  name         text not null,
  slug         text not null,
  -- Dominio propio del storefront. Es lo que resuelve el tenant en runtime.
  domain       text unique,
  currency     text not null default 'PYG',
  locale       text not null default 'es-PY',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table locations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null references stores (id) on delete cascade,
  name        text not null,
  -- Mapeo al ERP cuando exista. El ERP conserva autoridad; ver ADR-010.
  erp_location_id text,
  is_pickup_point boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Membresías
-- ---------------------------------------------------------------------------

create table memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  -- FK real contra los usuarios de Supabase: sin ella, borrar un usuario deja
  -- membresías huérfanas que siguen concediendo acceso.
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Un usuario tiene un solo rol por organización.
  unique (tenant_id, user_id)
);

create index memberships_user_idx on memberships (user_id);

-- ---------------------------------------------------------------------------
-- Configuración y flags
-- ---------------------------------------------------------------------------

create table store_settings (
  store_id    uuid primary key references stores (id) on delete cascade,
  tenant_id   uuid not null references organizations (id) on delete cascade,
  -- jsonb y no columnas: la forma de la configuración cambia por preset y por
  -- vertical, y no debe exigir una migración cada vez.
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table feature_flags (
  tenant_id   uuid not null references organizations (id) on delete cascade,
  -- Nulo = aplica a toda la organización; con valor, sólo a esa tienda.
  store_id    uuid references stores (id) on delete cascade,
  key         text not null,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- `store_id` nulo significa "toda la organización". Un UNIQUE normal trataría
-- cada NULL como distinto y dejaría duplicar el flag global.
create unique index feature_flags_unicos_idx on feature_flags (
  tenant_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), key
);

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------

create table audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references organizations (id) on delete cascade,
  -- El actor puede borrarse; el registro de auditoría no debe irse con él.
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_tenant_created_idx on audit_log (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Funciones de autorización
-- ---------------------------------------------------------------------------

create schema if not exists app;

-- SECURITY DEFINER a propósito: la política de `memberships` necesita consultar
-- `memberships`, y hacerlo directamente entraría en recursión infinita. La
-- función corre con los privilegios del dueño y saltea RLS, que es lo único que
-- rompe el ciclo.
--
-- `search_path` fijo: sin esto, un search_path manipulado podría redirigir las
-- tablas que la función consulta.
create or replace function app.current_tenants()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant_id from memberships where user_id = auth.uid()
$$;

comment on function app.current_tenants is
  'Organizaciones donde el usuario autenticado es miembro. Rompe la recursión de RLS sobre memberships.';

create or replace function app.has_permission(p_tenant uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from memberships m
    join role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid()
      and m.tenant_id = p_tenant
      and rp.permission = p_permission
  )
$$;

comment on function app.has_permission is
  'Permiso efectivo del usuario en una organización, resuelto por datos y no por comparación de roles.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Todas las tablas de negocio quedan cerradas por defecto: sin política
-- explícita, nadie ve nada. Es más seguro equivocarse hacia el lado que
-- devuelve vacío que hacia el que filtra datos de otro comercio.
alter table organizations   enable row level security;
alter table stores          enable row level security;
alter table locations       enable row level security;
alter table memberships     enable row level security;
alter table store_settings  enable row level security;
alter table feature_flags   enable row level security;
alter table audit_log       enable row level security;
alter table role_permissions enable row level security;

-- El catálogo de permisos es una tabla de referencia, igual para todos.
create policy role_permissions_lectura on role_permissions
  for select to authenticated using (true);

create policy organizations_lectura on organizations
  for select to authenticated
  using (id in (select app.current_tenants()));

create policy organizations_escritura on organizations
  for update to authenticated
  using (app.has_permission(id, 'organization.manage'))
  with check (app.has_permission(id, 'organization.manage'));

create policy stores_lectura on stores
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy stores_escritura on stores
  for all to authenticated
  using (app.has_permission(tenant_id, 'store.manage'))
  with check (app.has_permission(tenant_id, 'store.manage'));

create policy locations_lectura on locations
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy locations_escritura on locations
  for all to authenticated
  using (app.has_permission(tenant_id, 'store.manage'))
  with check (app.has_permission(tenant_id, 'store.manage'));

-- Un miembro ve el equipo de su organización, pero sólo quien administra
-- miembros puede modificarlo. Sin esto, cualquiera podría ascenderse a owner.
create policy memberships_lectura on memberships
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy memberships_escritura on memberships
  for all to authenticated
  using (app.has_permission(tenant_id, 'member.manage'))
  with check (app.has_permission(tenant_id, 'member.manage'));

create policy store_settings_lectura on store_settings
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy store_settings_escritura on store_settings
  for all to authenticated
  using (app.has_permission(tenant_id, 'settings.write'))
  with check (app.has_permission(tenant_id, 'settings.write'));

create policy feature_flags_lectura on feature_flags
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy feature_flags_escritura on feature_flags
  for all to authenticated
  using (app.has_permission(tenant_id, 'settings.write'))
  with check (app.has_permission(tenant_id, 'settings.write'));

-- La auditoría se lee, no se edita: un registro que el actor puede reescribir
-- no sirve como evidencia. La escritura la hace el servicio de dominio.
create policy audit_log_lectura on audit_log
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

-- RLS filtra filas, pero antes el rol necesita poder consultar la tabla. Se
-- declara explícito y no se confía en los privilegios por defecto del
-- proyecto: un default distinto dejaría las políticas sin efecto o de más.
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

grant select, insert, update, delete on
  organizations, stores, locations, memberships, store_settings, feature_flags
  to authenticated;

-- La auditoría se lee, no se escribe desde la app.
grant select on audit_log to authenticated;
grant select on role_permissions to authenticated;

-- `anon` es el rol del browser. Ninguna de estas tablas le corresponde: el
-- storefront lee desde el servidor. Se revoca explícitamente en vez de confiar
-- en que no se haya concedido.
revoke all on
  organizations, stores, locations, memberships, store_settings, feature_flags,
  audit_log, role_permissions
  from anon;
