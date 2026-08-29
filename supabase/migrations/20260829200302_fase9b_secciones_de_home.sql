-- Fase 9 Etapa B — la home se compone por secciones.
--
-- **Corrige el modelo de ADR-093.** Ahí se decidió que «una sección de la home es
-- una colección», y era cierto para los carruseles de productos y falso como
-- modelo general: un hero no es una colección y un grupo de mosaicos tampoco.
-- El acierto de aquella decisión —no inventar tres tipos de sección para tres
-- carruseles de productos— se conserva: `products` sigue siendo **un** tipo que
-- apunta a una colección, manual o dinámica.
--
-- El vocabulario, que estaba mezclado y ahora queda fijo:
--
--   hero        la pieza grande de arriba, con título, bajada y botón. Con
--               varias piezas es un slideshow y cada una es un slide.
--   tiles       mosaicos promocionales: avisos secundarios en grilla.
--   products    un carrusel de productos, o sea una colección.
--   categories  la tira de categorías.
--
-- `banners` deja de ser «lo que va debajo del hero» y pasa a ser la **pieza**:
-- lo que cambia entre un slide del hero y un mosaico es la sección que lo
-- contiene, no la fila.

do $$ begin
  create type home_section_type as enum ('hero', 'tiles', 'products', 'categories');
exception when duplicate_object then null;
end $$;

-- La clave compuesta que necesita la FK de abajo. `collections` nació en la Fase
-- 4 con `id` como PK a secas, y una FK que lleve el tenant —ADR-063— exige que
-- el destino tenga ese par como único.
do $$ begin
  alter table collections add constraint collections_id_tenant_key unique (id, tenant_id);
exception when duplicate_table then null;
end $$;

create table if not exists home_sections (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations (id) on delete cascade,
  store_id      uuid not null,

  type          home_section_type not null,
  -- Encabezado visible. Nulo en un hero, que suele llevar su texto en la pieza.
  title         text,
  subtitle      text,

  -- Estático o carrusel. Con una sola pieza dan lo mismo; la elección importa
  -- cuando hay varias, que es justo cuando el comercio quiere decidirlo.
  layout        text not null default 'static' check (layout in ('static', 'slider')),

  -- Ajustes por tipo: `{"columns": 2}` en tiles, y lo que aparezca. Jsonb y no
  -- columnas porque son de presentación y cada tipo quiere las suyas: una
  -- columna por ajuste sería una migración por cada retoque visual.
  settings      jsonb not null default '{}'::jsonb,

  -- Sólo para `products`. Compuesta con el tenant, como el resto (ADR-063).
  collection_id uuid,

  position      integer not null default 0,
  published     boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Un carrusel de productos sin colección no tiene qué mostrar, y una colección
  -- colgando de un hero no significa nada. El check lo dice una vez acá en vez de
  -- repetirlo en el Admin, el storefront y el importador.
  constraint home_sections_coleccion_coherente
    check ((type = 'products') = (collection_id is not null)),

  unique (id, tenant_id),
  constraint home_sections_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint home_sections_collection_id_fkey
    foreign key (collection_id, tenant_id) references collections (id, tenant_id) on delete cascade
);

comment on table home_sections is
  'Bloques ordenados que componen la home. El tipo decide qué muestra y `layout` si va estático o en carrusel.';

create index if not exists home_sections_orden_idx
  on home_sections (store_id, position)
  where published;

alter table home_sections enable row level security;

create policy home_sections_lectura on home_sections
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

create policy home_sections_escritura on home_sections
  for all to authenticated
  using (app.has_permission(tenant_id, 'catalog.write'))
  with check (app.has_permission(tenant_id, 'catalog.write'));

grant select, insert, update, delete on home_sections to authenticated;
revoke all on home_sections from anon;

-- ---------------------------------------------------------------------------
-- Las piezas pertenecen a una sección
-- ---------------------------------------------------------------------------

alter table banners add column if not exists section_id uuid;

-- Un hero lleva botón; un mosaico normalmente enlaza entero. Con `cta_label` la
-- pieza dibuja un botón, sin él el bloque completo es el enlace.
alter table banners add column if not exists cta_label text;

do $$ begin
  alter table banners add constraint banners_section_id_fkey
    foreign key (section_id, tenant_id) references home_sections (id, tenant_id) on delete cascade;
exception when duplicate_object then null;
end $$;

create index if not exists banners_por_seccion_idx on banners (section_id, position);

comment on column banners.section_id is
  'La sección que lo contiene. Un slide del hero y un mosaico son la misma fila: los distingue el tipo de su sección.';

-- ---------------------------------------------------------------------------
-- Lo que ya existía se conserva
-- ---------------------------------------------------------------------------
--
-- Los banners cargados hasta ahora se dibujaban en grilla debajo del hero, así
-- que eso es lo que eran: mosaicos. Se les crea su sección en vez de dejarlos
-- huérfanos —un banner sin sección no lo mostraría nadie, y borrar el trabajo de
-- alguien por un cambio de modelo no es una migración, es una pérdida.

do $$
declare
  v_tienda record;
  v_seccion uuid;
  v_col record;
begin
  for v_tienda in select distinct store_id, tenant_id from banners where section_id is null
  loop
    insert into home_sections (tenant_id, store_id, type, layout, position, published)
    values (v_tienda.tenant_id, v_tienda.store_id, 'tiles', 'static', 10, true)
    returning id into v_seccion;

    update banners set section_id = v_seccion
    where store_id = v_tienda.store_id and section_id is null;
  end loop;

  -- Y las colecciones que estaban en la home pasan a ser secciones `products`,
  -- conservando su orden relativo.
  for v_col in
    select id, tenant_id, store_id, home_position, published
    from collections where home_position is not null
  loop
    insert into home_sections
      (tenant_id, store_id, type, layout, collection_id, position, published)
    values
      (v_col.tenant_id, v_col.store_id, 'products', 'slider', v_col.id,
       20 + v_col.home_position, v_col.published);
  end loop;

  -- La tira de categorías se dibujaba siempre, fuera de todo modelo. Pasa a ser
  -- una sección más para que se pueda mover, apagar o poner arriba de todo, que
  -- es la mitad del sentido de tener secciones.
  insert into home_sections (tenant_id, store_id, type, title, position, published)
  select s.tenant_id, s.id, 'categories', 'Categorías', 5, true
  from stores s
  where exists (select 1 from categories c where c.store_id = s.id);
end $$;

-- `collections.home_position` deja de decidir nada: quien decide es la sección.
-- Se conserva la columna una versión más para no perder el dato si hubiera que
-- volver atrás, pero ya no se lee.
comment on column collections.home_position is
  'OBSOLETA desde las secciones de home. La posición vive en home_sections.position.';
