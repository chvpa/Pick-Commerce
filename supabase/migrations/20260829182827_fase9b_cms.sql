-- Fase 9, Etapa B — el contenido de la home se administra.
--
-- Dos cosas: las colecciones dejan de ser tablas dormidas y pasan a ser las
-- **secciones de la home**, y aparecen los banners.
--
-- Los tres ítems del ROADMAP —«featured», «new» y «best sellers»— **no son tres
-- mecanismos**: son una colección cada uno. Destacados es una colección manual,
-- Novedades una dinámica ordenada por fecha, Más vendidos una dinámica ordenada
-- por ventas. Inventar un modelo de «secciones» aparte habría dado tres formas
-- de decir lo mismo, y el comercio tendría que aprender cuál usar cuándo.
--
-- La otra mitad ya estaba escrita en ADR-056: «una colección dinámica es una
-- consulta guardada», y `collections.rules` tiene la forma de `CatalogFilters`
-- desde la Fase 4. Lo único que faltaba era que `catalog_search` la resolviera.

-- ---------------------------------------------------------------------------
-- Las colecciones se publican y se ordenan en la home
-- ---------------------------------------------------------------------------

alter table collections add column if not exists subtitle text;

-- `published` y no un enum de tres estados: en una colección «borrador» y
-- «archivada» son lo mismo —no se ve—, y un estado que no cambia el
-- comportamiento es una pregunta de más en el formulario. Las promociones sí lo
-- necesitan porque archivar preserva la historia de un pedido.
alter table collections add column if not exists published boolean not null default false;

-- Nulo = no está en la home. Con valor = la posición del carrusel, de arriba
-- hacia abajo. Sin esto haría falta una tabla de secciones sólo para decir el
-- orden de tres cosas.
alter table collections add column if not exists home_position integer;

-- El orden de una colección dinámica. Para las manuales manda
-- `collection_products.position`, que es orden editorial y gana siempre.
alter table collections add column if not exists sort text
  check (sort is null or sort in
    ('relevance', 'price-asc', 'price-desc', 'title-asc', 'newest', 'best-selling'));

comment on column collections.rules is
  'Nulo = manual, con selección explícita en collection_products. Con valor = dinámica, y la forma es CatalogFilters del core: la resuelve el mismo catalog_search.';
comment on column collections.home_position is
  'Posición del carrusel en la home. Nulo = no aparece.';

-- Las de la home, en orden, es la consulta que hace el storefront en cada visita.
create index if not exists collections_home_idx
  on collections (store_id, home_position)
  where home_position is not null and published;

-- Las colecciones ya existían sin RLS propia desde la Fase 4 y nadie las usaba.
-- Ahora las lee el storefront y las escribe el Admin, así que la necesitan.
alter table collections enable row level security;
alter table collection_products enable row level security;

do $$ begin
  create policy collections_lectura on collections
    for select to authenticated
    using (tenant_id in (select app.current_tenants()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy collections_escritura on collections
    for all to authenticated
    using (app.has_permission(tenant_id, 'catalog.write'))
    with check (app.has_permission(tenant_id, 'catalog.write'));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy collection_products_lectura on collection_products
    for select to authenticated
    using (tenant_id in (select app.current_tenants()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy collection_products_escritura on collection_products
    for all to authenticated
    using (app.has_permission(tenant_id, 'catalog.write'))
    with check (app.has_permission(tenant_id, 'catalog.write'));
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on collections to authenticated;
grant select, insert, update, delete on collection_products to authenticated;
revoke all on collections from anon;
revoke all on collection_products from anon;

-- ---------------------------------------------------------------------------
-- Banners
-- ---------------------------------------------------------------------------
--
-- Con `catalog.write` y sin permiso propio. El precedente de ADR-056 dice no
-- inventar uno cuando ningún rol distingue, y acá no distingue: quien cura el
-- catálogo cura la vidriera. Las promociones fueron la excepción porque son una
-- decisión de precio, y eso sí lo separan los roles.

create table if not exists banners (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references organizations (id) on delete cascade,
  store_id     uuid not null,

  title        text not null,
  subtitle     text,

  -- {url, alt, width, height}, como `categories.image` y `product_media`. Las
  -- dimensiones son obligatorias dentro del objeto por el mismo motivo de
  -- ADR-034: sin ellas no se puede reservar el espacio y el layout salta.
  image        jsonb not null,
  -- Nulo = se usa la de desktop. Un banner apaisado recortado a un teléfono
  -- suele perder justo lo que decía, así que se permite una propia.
  image_mobile jsonb,

  -- A dónde lleva. Una ruta del storefront: `/catalogo?categoria=x`,
  -- `/productos/handle`, `/catalogo`. Texto y no una referencia: un banner puede
  -- apuntar a una página que no es ni producto ni colección.
  href         text,

  position     integer not null default 0,
  published    boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint banners_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table banners is
  'Piezas de la home. `href` es una ruta del storefront, no una referencia: un banner puede apuntar a cualquier página.';

create index if not exists banners_orden_idx
  on banners (store_id, position)
  where published;

alter table banners enable row level security;

create policy banners_lectura on banners
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy banners_escritura on banners
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

grant select, insert, update, delete on banners to authenticated;
revoke all on banners from anon;
