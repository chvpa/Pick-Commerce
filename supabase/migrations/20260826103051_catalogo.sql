-- Catálogo: productos, variantes, taxonomía, atributos, inventario y colecciones.
--
-- Sigue el patrón de la migración de multitenancy: toda tabla lleva `tenant_id`,
-- RLS cerrada por defecto, y los privilegios se declaran explícitos. Ver ADR-052.
--
-- Nada de extensiones: las pruebas de aislamiento corren sobre PGlite, que sólo
-- trae el core de Postgres. `gen_random_uuid()` está ahí desde la versión 13.

-- ---------------------------------------------------------------------------
-- Taxonomía y definiciones de atributos
-- ---------------------------------------------------------------------------

create table categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null references stores (id) on delete cascade,
  -- Árbol: Category → Subcategory → Product type (PROJECT.md §8). La
  -- profundidad se acota en el Admin y no con un constraint: un CHECK no puede
  -- recorrer el árbol y un trigger sería más código que el riesgo que cubre.
  parent_id   uuid references categories (id) on delete cascade,
  name        text not null,
  slug        text not null,
  position    integer not null default 0,
  -- {url, alt, width, height}: la home muestra la categoría con imagen.
  image       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, slug)
);

create index categories_parent_idx on categories (parent_id);

create table attribute_definitions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null references stores (id) on delete cascade,
  -- Nulo = el atributo aplica a toda la tienda. Con valor, sólo a esa categoría.
  category_id uuid references categories (id) on delete cascade,
  -- Clave con la que viaja en `product_variants.attributes` y en la URL: 'color'.
  name        text not null,
  -- Etiqueta visible: 'Color'.
  label       text not null,
  position    integer not null default 0,

  -- Los cinco flags que PROJECT.md §35 exige declarar por atributo. `filterable`
  -- es el que decide qué facetas existen en la PLP: sin esto el storefront
  -- tendría que adivinar, que es lo que hacía con una lista hardcodeada.
  filterable   boolean not null default false,
  searchable   boolean not null default false,
  sortable     boolean not null default false,
  visible_pdp  boolean not null default false,
  visible_card boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Un UNIQUE normal trataría cada NULL como distinto y dejaría duplicar el
-- atributo global. Mismo patrón que `feature_flags`.
create unique index attribute_definitions_unicos_idx on attribute_definitions (
  store_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), name
);

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------

create type product_status as enum ('draft', 'active', 'inactive', 'archived');

-- Agrupa productos hermanos: el mismo modelo en otro color, cuando el ERP los
-- trata como productos independientes. Ver ADR-026 y PROJECT.md §39.
create table product_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null references stores (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table products (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references organizations (id) on delete cascade,
  store_id         uuid not null references stores (id) on delete cascade,
  handle           text not null,
  title            text not null,
  description      text,
  brand            text,
  category_id      uuid references categories (id) on delete set null,
  product_group_id uuid references product_groups (id) on delete set null,
  -- Arranca en draft: publicar es un acto explícito. El storefront sólo lee
  -- 'active'.
  status           product_status not null default 'draft',

  -- PROJECT.md §8 los pone en el core universal. `weight_grams` es columna
  -- porque el cálculo de envío la va a consultar; dimensiones e impuestos son
  -- metadata sin consumidor todavía, así que van en jsonb hasta que lo tengan.
  weight_grams     integer,
  dimensions       jsonb,
  tax              jsonb,

  -- Origen de cada campo sincronizable: {"price":"ERP"}. La ausencia significa
  -- COMMERCE. Cuando el origen es ERP la edición local se bloquea, y el error
  -- de sync queda visible para diagnóstico. Ver PROJECT.md §10.
  field_sources    jsonb not null default '{}'::jsonb,
  last_sync_at     timestamptz,
  sync_error       text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, handle)
);

-- El recorrido que hace la PLP: productos activos de una tienda, en orden
-- estable. `created_at, id` es también el orden de "relevance".
create index products_listado_idx on products (store_id, status, created_at, id);
create index products_category_idx on products (category_id);

create table product_variants (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations (id) on delete cascade,
  product_id        uuid not null references products (id) on delete cascade,
  sku               text not null,
  barcode           text,
  title             text not null,
  -- La PLP muestra la primera variante: sin un orden explícito, el precio que
  -- ve el cliente dependería del plan de ejecución de Postgres.
  position          integer not null default 0,

  -- Importes en la unidad mínima de la moneda, como el tipo `Money` del core:
  -- PYG usa 0 decimales, USD usa 2. Un float acá es cómo se pierde plata en los
  -- redondeos.
  price             bigint not null,
  currency          text not null,
  compare_at_price  bigint,
  cost              bigint,

  attributes        jsonb not null default '{}'::jsonb,
  field_sources     jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- El SKU identifica dentro del comercio, no dentro de una tienda: dos tiendas
  -- del mismo tenant no pueden usar el mismo SKU para cosas distintas.
  unique (tenant_id, sku)
);

create index product_variants_producto_idx on product_variants (product_id, position);
create index product_variants_attributes_idx on product_variants using gin (attributes);

create table product_media (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  product_id  uuid not null references products (id) on delete cascade,
  url         text not null,
  alt         text not null default '',
  -- Obligatorias: sin dimensiones no se puede reservar el espacio y el layout
  -- salta al cargar. Ver ADR-034.
  width       integer not null,
  height      integer not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index product_media_producto_idx on product_media (product_id, position);

-- ---------------------------------------------------------------------------
-- Inventario
-- ---------------------------------------------------------------------------

create table inventory_levels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  variant_id  uuid not null references product_variants (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  -- Sin `check (available >= 0)` a propósito: esto es un espejo del ERP
  -- (ADR-009) y un ERP puede reportar negativo. Recortarlo a cero escondería el
  -- overselling en vez de mostrarlo.
  available   integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (variant_id, location_id)
);

create index inventory_levels_tenant_idx on inventory_levels (tenant_id);

-- ---------------------------------------------------------------------------
-- Colecciones
-- ---------------------------------------------------------------------------

create table collections (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references organizations (id) on delete cascade,
  store_id    uuid not null references stores (id) on delete cascade,
  title       text not null,
  handle      text not null,
  -- Nulo = colección manual, con selección explícita en `collection_products`.
  -- Con valor = dinámica, y la forma es exactamente `CatalogFilters` del core:
  -- una colección dinámica es una consulta guardada que resuelve el mismo
  -- `catalog_search`. Cero motor de reglas nuevo.
  rules       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, handle)
);

create table collection_products (
  tenant_id     uuid not null references organizations (id) on delete cascade,
  collection_id uuid not null references collections (id) on delete cascade,
  product_id    uuid not null references products (id) on delete cascade,
  position      integer not null default 0,
  primary key (collection_id, product_id)
);

create index collection_products_producto_idx on collection_products (product_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Cerradas por defecto, como el resto: sin política explícita nadie ve nada.
alter table categories           enable row level security;
alter table attribute_definitions enable row level security;
alter table product_groups       enable row level security;
alter table products             enable row level security;
alter table product_variants     enable row level security;
alter table product_media        enable row level security;
alter table inventory_levels     enable row level security;
alter table collections          enable row level security;
alter table collection_products  enable row level security;

create policy categories_lectura on categories
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy categories_escritura on categories
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

create policy attribute_definitions_lectura on attribute_definitions
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy attribute_definitions_escritura on attribute_definitions
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

create policy product_groups_lectura on product_groups
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy product_groups_escritura on product_groups
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

create policy products_lectura on products
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy products_escritura on products
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

create policy product_variants_lectura on product_variants
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy product_variants_escritura on product_variants
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

create policy product_media_lectura on product_media
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy product_media_escritura on product_media
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

-- El stock usa `catalog.write` y no un permiso propio: hoy ningún rol
-- distingue "edita catálogo" de "ajusta stock". Se separa cuando exista uno.
create policy inventory_levels_lectura on inventory_levels
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy inventory_levels_escritura on inventory_levels
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

create policy collections_lectura on collections
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy collections_escritura on collections
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

create policy collection_products_lectura on collection_products
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy collection_products_escritura on collection_products
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

-- RLS filtra filas, pero antes el rol necesita poder consultar la tabla. Se
-- declara explícito y no se confía en los defaults del proyecto.
grant select, insert, update, delete on
  categories, attribute_definitions, product_groups, products, product_variants,
  product_media, inventory_levels, collections, collection_products
  to authenticated;

-- `anon` es el rol del browser. El storefront lee desde el servidor con la
-- secret key, así que ninguna de estas tablas le corresponde. Se revoca
-- explícitamente en vez de confiar en que no se haya concedido.
revoke all on
  categories, attribute_definitions, product_groups, products, product_variants,
  product_media, inventory_levels, collections, collection_products
  from anon;
