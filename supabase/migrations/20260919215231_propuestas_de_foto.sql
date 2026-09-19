/*
 * Las propuestas de la IA sobre una foto: `media_proposals` (ADR-130).
 *
 * La IA limpia el fondo y **una persona aprueba**. Esta tabla es lo que hace
 * posible esa frase: la propuesta vive aparte de la foto publicada, con la
 * original al lado, hasta que alguien la mira y decide. Nada llega a la vitrina
 * sin pasar por acá.
 *
 * Y es el rastro: quién aprobó qué foto editada y cuándo. Con una edición
 * generativa de por medio —que puede cambiar un logo sin que se note— eso no es
 * burocracia, es poder volver atrás y saber a quién preguntarle.
 *
 * La original **nunca se borra**: queda en `original_url` y en el bucket,
 * incluso después de aprobar, que es lo que permite arrepentirse.
 */

create table if not exists media_proposals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references organizations (id) on delete cascade,
  store_id     uuid not null,
  product_id   uuid not null,

  -- La foto publicada de la que se partió, y la que propuso la IA.
  original_url text not null,
  proposed_url text not null,

  -- `pending` → `approved` | `rejected`. Sin enum: un estado nuevo no debería
  -- pedir una migración de tipo (mismo criterio que `store_events.type`).
  status       text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,

  constraint media_proposals_store_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade,
  constraint media_proposals_product_fkey
    foreign key (product_id, tenant_id) references products (id, tenant_id) on delete cascade
);

comment on table media_proposals is
  'Fotos con el fondo limpiado por IA, esperando que una persona las apruebe (ADR-130).';

-- La pantalla de revisión pide «lo pendiente de esta tienda, lo último
-- primero»: es el único acceso que hace, y sin índice sería un scan.
create index if not exists media_proposals_pendientes_idx
  on media_proposals (store_id, status, created_at desc);

-- Una propuesta pendiente por producto: pedir dos veces la misma foto gasta la
-- clave del comercio dos veces y deja dos filas que deciden lo mismo.
create unique index if not exists media_proposals_una_pendiente_idx
  on media_proposals (store_id, product_id)
  where status = 'pending';

alter table media_proposals enable row level security;

/*
 * La lee y la escribe el equipo del comercio desde el Admin, con la publishable
 * key: es su trabajo, no el del storefront. Escribir pide `catalog.write`, como
 * el resto del catálogo; leer alcanza con pertenecer.
 */
do $$ begin
  create policy media_proposals_lectura on media_proposals
    for select to authenticated
    using (tenant_id in (select app.current_tenants()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy media_proposals_escritura on media_proposals
    for all to authenticated
    using (app.has_permission(tenant_id, 'catalog.write'))
    with check (app.has_permission(tenant_id, 'catalog.write'));
exception when duplicate_object then null;
end $$;

grant select, insert, update, delete on media_proposals to authenticated;
revoke all on media_proposals from anon;

-- ---------------------------------------------------------------------------
-- Aprobar
-- ---------------------------------------------------------------------------

/*
 * Aprobar es un cambio en dos tablas —la foto publicada y la propuesta— y tiene
 * que ser atómico: si se escribe la foto y no el estado, la propuesta vuelve a
 * ofrecerse y la clave del comercio se gasta de nuevo.
 *
 * `security invoker`: lo autoriza RLS, que sobre `product_media` y sobre esta
 * tabla exige `catalog.write`. Y el `where` por tienda no es decoración: los ids
 * llegan del navegador.
 */
create or replace function public.admin_apply_media_proposals(
  p_store_id uuid,
  p_ids      uuid[]
) returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_aplicadas integer := 0;
begin
  update product_media m
     set url = pr.proposed_url
    from media_proposals pr
   where pr.id = any(coalesce(p_ids, '{}'::uuid[]))
     and pr.store_id = p_store_id
     and pr.status = 'pending'
     and m.product_id = pr.product_id
     -- Se reemplaza **esa** foto, la que se le mandó a la IA, y no la primera
     -- que haya: el producto puede tener varias.
     and m.url = pr.original_url;

  update media_proposals
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = any(coalesce(p_ids, '{}'::uuid[]))
     and store_id = p_store_id
     and status = 'pending';

  get diagnostics v_aplicadas = row_count;
  return v_aplicadas;
end;
$$;

comment on function public.admin_apply_media_proposals is
  'Publica las fotos propuestas y marca quién las aprobó. La original queda en la propuesta (ADR-130).';

revoke all on function public.admin_apply_media_proposals(uuid, uuid[]) from public, anon;
grant execute on function public.admin_apply_media_proposals(uuid, uuid[]) to authenticated, service_role;
