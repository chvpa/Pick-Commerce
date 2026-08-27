-- Aislamiento entre comercios a nivel de schema: cada clave foránea lleva el tenant.
--
-- Hasta acá, toda tabla hija declaraba dos constraints **independientes**:
-- `tenant_id references organizations` por un lado, y la FK al padre por otro.
-- Nada ataba una con la otra, y RLS no puede hacerlo: la política de escritura
-- valida `app.has_permission(tenant_id, ...)`, o sea **la columna `tenant_id` de
-- la fila que se inserta**, no a quién pertenece el padre al que apunta. La
-- verificación de la FK tampoco ayuda: Postgres no aplica políticas durante los
-- chequeos de integridad referencial.
--
-- El agujero se reprodujo, no se dedujo. Un owner del tenant B, con
-- `catalog.write` sólo sobre B, escribiendo con su propio `tenant_id`:
--
--   insert into inventory_levels (tenant_id, variant_id, location_id, available)
--   values ('<B>', '<variante de A>', '<sucursal de B>', 9999);   -- pasa
--
-- El storefront de A pasó de 30 unidades a 10029, y el Admin de A siguió viendo
-- 30: la fila envenenada no es suya, así que RLS se la esconde a la víctima. El
-- `variant_id` no es secreto — `catalog_search` lo emite en cada ítem y el PDP
-- lo serializa en el HTML.
--
-- Lo mismo pasaba con `product_media` sobre un producto ajeno (una imagen
-- arbitraria en la PDP de otro comercio) y con `product_variants` sobre un
-- producto ajeno (una variante fantasma con precio y SKU propios).
--
-- El arreglo es estructural y no una política más: si la FK incluye el tenant,
-- apuntar afuera es **imposible**, lo garantiza Postgres y no hay que acordarse
-- de filtrar en cada consulta. Es también la razón de que no se agregue un
-- `and il.tenant_id = v.tenant_id` en las lecturas: una fila que no puede
-- existir no necesita filtrarse.

-- ---------------------------------------------------------------------------
-- 1. Claves candidatas que incluyen el tenant
-- ---------------------------------------------------------------------------
--
-- Una FK compuesta necesita que el destino sea único por esas mismas columnas.
-- `id` ya es la PK, así que `(id, tenant_id)` es redundante como restricción
-- —no puede haber dos filas con el mismo id— pero es la única forma de que
-- Postgres acepte referenciar el par.

alter table stores           add constraint stores_id_tenant_key           unique (id, tenant_id);
alter table locations        add constraint locations_id_tenant_key        unique (id, tenant_id);
alter table categories       add constraint categories_id_tenant_key       unique (id, tenant_id);
alter table product_groups   add constraint product_groups_id_tenant_key   unique (id, tenant_id);
alter table products         add constraint products_id_tenant_key         unique (id, tenant_id);
alter table product_variants add constraint product_variants_id_tenant_key unique (id, tenant_id);
alter table collections      add constraint collections_id_tenant_key      unique (id, tenant_id);

-- ---------------------------------------------------------------------------
-- 2. Multitenancy
-- ---------------------------------------------------------------------------

alter table locations drop constraint locations_store_id_fkey;
alter table locations add constraint locations_store_id_fkey
  foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade;

alter table store_settings drop constraint store_settings_store_id_fkey;
alter table store_settings add constraint store_settings_store_id_fkey
  foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade;

-- `feature_flags.store_id` es nullable: un flag sin tienda vale para toda la
-- organización. Con MATCH SIMPLE —el default— una FK compuesta con alguna
-- columna nula no se verifica, que es exactamente lo que ese caso necesita.
alter table feature_flags drop constraint feature_flags_store_id_fkey;
alter table feature_flags add constraint feature_flags_store_id_fkey
  foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. Catálogo
-- ---------------------------------------------------------------------------

alter table categories drop constraint categories_store_id_fkey;
alter table categories add constraint categories_store_id_fkey
  foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade;

alter table categories drop constraint categories_parent_id_fkey;
alter table categories add constraint categories_parent_id_fkey
  foreign key (parent_id, tenant_id) references categories (id, tenant_id) on delete cascade;

alter table attribute_definitions drop constraint attribute_definitions_store_id_fkey;
alter table attribute_definitions add constraint attribute_definitions_store_id_fkey
  foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade;

alter table attribute_definitions drop constraint attribute_definitions_category_id_fkey;
alter table attribute_definitions add constraint attribute_definitions_category_id_fkey
  foreign key (category_id, tenant_id) references categories (id, tenant_id) on delete cascade;

alter table product_groups drop constraint product_groups_store_id_fkey;
alter table product_groups add constraint product_groups_store_id_fkey
  foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade;

alter table products drop constraint products_store_id_fkey;
alter table products add constraint products_store_id_fkey
  foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade;

-- `on delete set null (category_id)`: sin la lista de columnas, Postgres
-- intentaría anular también `tenant_id`, que es `not null`, y el borrado de una
-- categoría fallaría. La sintaxis con lista existe desde Postgres 15; el
-- proyecto corre 17.6 y PGlite 18.3.
alter table products drop constraint products_category_id_fkey;
alter table products add constraint products_category_id_fkey
  foreign key (category_id, tenant_id) references categories (id, tenant_id)
  on delete set null (category_id);

alter table products drop constraint products_product_group_id_fkey;
alter table products add constraint products_product_group_id_fkey
  foreign key (product_group_id, tenant_id) references product_groups (id, tenant_id)
  on delete set null (product_group_id);

alter table product_variants drop constraint product_variants_product_id_fkey;
alter table product_variants add constraint product_variants_product_id_fkey
  foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade;

alter table product_media drop constraint product_media_product_id_fkey;
alter table product_media add constraint product_media_product_id_fkey
  foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade;

alter table inventory_levels drop constraint inventory_levels_variant_id_fkey;
alter table inventory_levels add constraint inventory_levels_variant_id_fkey
  foreign key (variant_id, tenant_id) references product_variants (id, tenant_id) on delete cascade;

alter table inventory_levels drop constraint inventory_levels_location_id_fkey;
alter table inventory_levels add constraint inventory_levels_location_id_fkey
  foreign key (location_id, tenant_id) references locations (id, tenant_id) on delete cascade;

alter table collections drop constraint collections_store_id_fkey;
alter table collections add constraint collections_store_id_fkey
  foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade;

alter table collection_products drop constraint collection_products_collection_id_fkey;
alter table collection_products add constraint collection_products_collection_id_fkey
  foreign key (collection_id, tenant_id) references collections (id, tenant_id) on delete cascade;

alter table collection_products drop constraint collection_products_product_id_fkey;
alter table collection_products add constraint collection_products_product_id_fkey
  foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 4. `anon` no ejecuta ninguna función de la aplicación
-- ---------------------------------------------------------------------------
--
-- Cada migración cerraba sus funciones con `revoke all ... from public`, y el
-- comentario afirmaba que con eso `anon` quedaba afuera. Es falso, y se
-- comprobó contra el proyecto real: las cuatro funciones muestran
--
--   postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- Supabase declara un `default privilege` que concede EXECUTE **directamente al
-- rol `anon`** sobre cada función creada en `public`. `revoke from public` sólo
-- quita el permiso del pseudo-rol PUBLIC y no toca un grant directo, así que
-- `anon` conservaba el suyo.
--
-- Hoy no es explotable: `catalog_search` es `security invoker` y adentro la
-- frena el `revoke ... from anon` sobre las tablas. O sea que lo que protegía
-- era la segunda capa, no la que el comentario nombraba. Deja de ser inofensivo
-- en cuanto exista la primera función `security definer` —que es exactamente lo
-- que necesita la creación de un pedido con guest checkout—: quedaría invocable
-- desde cualquier browser con la publishable key, corriendo con privilegios de
-- dueño y con los parámetros que elija quien llame.
--
-- El revoke va explícito por rol. PGlite no puede detectar esto, porque no
-- reproduce los default privileges de Supabase: por eso también hay un test que
-- afirma el grant esperado, y no sólo la ausencia.

revoke all on function public.catalog_search(uuid, jsonb, text, text, integer, integer, bigint, bigint, text, text) from anon;
revoke all on function public.admin_products(uuid, text, text, integer, integer) from anon;
revoke all on function public.admin_save_product(uuid, jsonb) from anon;
revoke all on function public.import_products(uuid, jsonb) from anon;

-- Defensa en profundidad: las dos funciones de `app` son `security definer`, y
-- hoy sólo las salva que `anon` no tenga USAGE sobre ese esquema. Un grant de
-- USAGE futuro las abriría solas.
revoke all on function app.current_tenants() from public;
revoke all on function app.has_permission(uuid, text) from public;
grant execute on function app.current_tenants() to authenticated;
grant execute on function app.has_permission(uuid, text) to authenticated;
