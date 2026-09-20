/*
 * La cola de lo que no se puede encontrar: descripciones (v2 Fase 8).
 *
 * De los 3752 productos activos de Treeshop, **3674 no tienen descripción**. Eso
 * no es un problema de prolijidad: `products.search_doc` es título más marca, y
 * el vector semántico de ADR-132 se arma con título, marca, categoría y
 * atributos. Sin una línea que diga qué es y para qué sirve, ni el buscador
 * léxico ni el semántico tienen con qué encontrar el producto cuando alguien lo
 * pide con otras palabras. LIMITACIONES ya lo dice: **el techo de calidad del
 * buscador lo pone el catálogo, no el modelo.**
 *
 * La forma es la de ADR-130, deliberadamente: la IA propone, una persona
 * aprueba, y lo anterior no se pierde. Y la de ADR-104: la IA nunca escribe
 * sola en el catálogo.
 *
 * `description_proposals` es casi gemela de `media_proposals`, y es duplicación
 * a sabiendas. Unificarlas en una tabla con una columna `campo` obligaría a
 * migrar una tabla con datos en producción para ahorrar sesenta líneas, y las
 * dos tienen un ciclo de vida corto: se vacían a medida que alguien decide. Si
 * aparece una tercera, ahí sí se unifican.
 */

create table if not exists description_proposals (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizations (id) on delete cascade,
  store_id   uuid not null,
  product_id uuid not null,

  -- Lo que propuso la IA. La descripción anterior no se guarda acá porque la
  -- cola son productos que **no tienen**: no hay nada que perder.
  proposed   text not null,

  status     text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,

  constraint description_proposals_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint description_proposals_product_fkey
    foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade
);

comment on table description_proposals is
  'Descripciones propuestas por la IA, esperando que una persona las apruebe (v2 Fase 8).';

create index if not exists description_proposals_pendientes_idx
  on description_proposals (store_id, status, created_at desc);

-- Una pendiente por producto: pedirla dos veces gasta la clave del comercio dos
-- veces y deja dos filas que deciden lo mismo.
create unique index if not exists description_proposals_una_pendiente_idx
  on description_proposals (store_id, product_id)
  where status = 'pending';

alter table description_proposals enable row level security;

do $$ begin
  create policy description_proposals_lectura on description_proposals
    for select to authenticated
    using (tenant_id in (select app.current_tenants()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy description_proposals_escritura on description_proposals
    for all to authenticated
    using (app.has_permission(tenant_id, 'catalog.write'))
    with check (app.has_permission(tenant_id, 'catalog.write'));
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on description_proposals to authenticated;
revoke all on description_proposals from anon;

-- ---------------------------------------------------------------------------
-- La cola
-- ---------------------------------------------------------------------------

/*
 * Los productos activos sin descripción, primero los que se pueden vender hoy.
 *
 * Mismo orden que la cola de fotos y por el mismo motivo: una descripción sobre
 * algo agotado no vende nada esta semana. Y se excluye lo que **ya tiene una
 * propuesta pendiente**, para que la cola se vacíe a medida que alguien decide
 * en vez de ofrecer dos veces el mismo trabajo.
 *
 * `security invoker`, como `admin_products`: lo acota RLS.
 */
create or replace function public.admin_products_without_description(
  p_store_id uuid,
  p_page     integer default 1,
  p_per_page integer default 20
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with
activos as (
  select p.id, p.handle, p.title, p.brand, p.description,
         coalesce(trim(p.description), '') <> '' as con_descripcion,
         coalesce((
           select sum(il.available)::int
           from product_variants v
           join inventory_levels il on il.variant_id = v.id
           where v.product_id = p.id
         ), 0) as stock,
         exists (
           select 1 from description_proposals dp
           where dp.product_id = p.id and dp.status = 'pending'
         ) as propuesta_pendiente
  from products p
  where p.store_id = p_store_id
    and p.status = 'active'
),

pendientes as (
  select * from activos where not con_descripcion and not propuesta_pendiente
),

paginacion as (
  select
    greatest(1, ceil(count(*)::numeric / greatest(1, least(p_per_page, 100)))::int) as page_count,
    count(*)::int as n
  from pendientes
),

pagina as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from paginacion pg
),

ordenados as (
  select pe.*, row_number() over (order by (pe.stock > 0) desc, pe.stock desc, pe.id) as rn
  from pendientes pe
),

items as (
  select jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', o.id,
      'handle', o.handle,
      'title', o.title,
      'brand', o.brand,
      'stock', o.stock
    ))
    order by o.rn
  ) as docs
  from ordenados o, pagina pg
  where o.rn > (pg.page - 1) * least(p_per_page, 100)
    and o.rn <= pg.page * least(p_per_page, 100)
),

-- Escritas en la última semana: es lo que dice si el trabajo avanza.
escritas as (
  select count(*)::int as n
  from description_proposals dp
  where dp.store_id = p_store_id
    and dp.status = 'approved'
    and dp.decided_at >= now() - interval '7 days'
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from pagina),
  'page', (select page from pagina),
  'perPage', least(p_per_page, 100),
  'pageCount', (select page_count from pagina),
  'cuentas', jsonb_build_object(
    'activos', (select count(*) from activos),
    'conDescripcion', (select count(*) from activos where con_descripcion),
    'sinDescripcion', (select count(*) from activos where not con_descripcion),
    'pendientes', (select count(*) from activos where propuesta_pendiente),
    'escritasSemana', (select n from escritas)
  )
);
$$;

comment on function public.admin_products_without_description(uuid, integer, integer) is
  'Productos activos sin descripción, primero los que tienen stock (v2 Fase 8).';

revoke all on function public.admin_products_without_description(uuid, integer, integer)
  from public, anon;
grant execute on function public.admin_products_without_description(uuid, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Aprobar
-- ---------------------------------------------------------------------------

/*
 * Publicar lo aprobado: escribe la descripción y cierra la propuesta, atómico.
 *
 * Si se escribiera el producto y no el estado, la propuesta volvería a la cola y
 * la clave del comercio se gastaría de nuevo por lo mismo.
 *
 * **Respeta al ERP** (ADR-117): un producto cuya descripción administra el ERP
 * no se toca, aunque alguien apruebe la propuesta. `field_sources` declara el
 * dueño de cada campo, y una reimportación pisaría lo que la IA escribió — así
 * que se descarta acá en vez de escribir algo que va a desaparecer solo.
 *
 * `security invoker`: lo autoriza RLS, que sobre `products` y sobre esta tabla
 * exige `catalog.write`. Y el `where` por tienda no es decoración: los ids
 * llegan del navegador.
 */
create or replace function public.admin_apply_description_proposals(
  p_store_id uuid,
  p_ids      uuid[]
) returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_escritas integer;
begin
  update products p
     set description = dp.proposed,
         updated_at = now()
    from description_proposals dp
   where dp.id = any(coalesce(p_ids, '{}'::uuid[]))
     and dp.store_id = p_store_id
     and dp.status = 'pending'
     and p.id = dp.product_id
     and coalesce(p.field_sources->>'description', 'local') = 'local';

  get diagnostics v_escritas = row_count;

  update description_proposals dp
     set status = 'approved',
         decided_by = auth.uid(),
         decided_at = now()
   where dp.id = any(coalesce(p_ids, '{}'::uuid[]))
     and dp.store_id = p_store_id
     and dp.status = 'pending';

  return v_escritas;
end;
$$;

comment on function public.admin_apply_description_proposals(uuid, uuid[]) is
  'Publica las descripciones aprobadas y cierra sus propuestas, atómico (v2 Fase 8).';

revoke all on function public.admin_apply_description_proposals(uuid, uuid[]) from public, anon;
grant execute on function public.admin_apply_description_proposals(uuid, uuid[]) to authenticated;
