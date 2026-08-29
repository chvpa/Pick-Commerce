-- Fase 8 — el ERP entra al catálogo.
--
-- Tres cosas: los dos identificadores que necesita el cruce contra el ERP, la
-- auditoría de cada corrida de sincronización, y el bloqueo del stock cuando su
-- dueño es el ERP.
--
-- Todo va acá y no directo contra Supabase. En el sistema actual de Estilo Sport
-- cuatro objetos —`erp_send_logs`, `sync_logs`, `orders.erp_sent_at` y
-- `product_variants.erp_talla`— se crearon a mano en la consola, así que levantar
-- ese proyecto de cero exige recrearlos adivinando. Ver ADR-085.

-- ---------------------------------------------------------------------------
-- Identificadores del ERP
-- ---------------------------------------------------------------------------

-- El código con el que el ERP nombra al producto. En el ORDS de Estilo Sport es
-- `codigo`, y todas las tallas del mismo modelo lo comparten: verificado sobre
-- las 9032 filas del catálogo real, donde 2920 códigos distintos agrupan las
-- 9032 variantes y ninguno aparece con dos nombres de artículo distintos.
alter table products add column if not exists internal_code text;

comment on column products.internal_code is
  'Código del producto en el ERP. Nulo cuando el producto nació en Pick.';

-- Parcial: la enorme mayoría de los productos de una tienda sin ERP lo tienen
-- nulo, y un índice sobre nulos no sirve para buscar nada.
create index if not exists products_internal_code_idx
  on products (tenant_id, internal_code)
  where internal_code is not null;

-- La talla en el formato nativo del ERP, guardada tal cual llegó.
--
-- No es redundante con el atributo `talla` de la variante. El campo del ORDS
-- tiene tres caracteres de ancho: manda `"8.5"` con punto y `"10.5"` como
-- `"105"`. Convertir de vuelta exige adivinar ese ancho, y una talla mal escrita
-- en un pedido se factura mal. Guardarla evita la adivinanza.
alter table product_variants add column if not exists erp_size text;

comment on column product_variants.erp_size is
  'Talla en el formato nativo del ERP. Se guarda para no tener que reconstruirla al mandar un pedido.';

-- ---------------------------------------------------------------------------
-- Auditoría de las corridas de sincronización
-- ---------------------------------------------------------------------------
--
-- Un sync escribe precio y stock de todo el catálogo. Sin registro, la pregunta
-- «quién me puso todo en cero» no tiene respuesta.

create table if not exists erp_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations (id) on delete cascade,
  store_id      uuid not null,

  -- Qué adapter corrió. Texto y no enum: sumar un ERP no debería costar una
  -- migración, igual que en `order_events.type`.
  adapter       text not null,
  -- 'dry_run' no escribe nada; es el reporte de reconciliación.
  mode          text not null check (mode in ('dry_run', 'real')),

  items_received  integer not null default 0,
  products_seen   integer not null default 0,
  created_count   integer not null default 0,
  updated_count   integer not null default 0,
  unchanged_count integer not null default 0,
  unmatched_count integer not null default 0,

  -- Los errores por fila, con el código del artículo que los provocó. Un sync
  -- que falla en 3 de 9000 filas es exitoso y hay que poder ver esas 3.
  error_details jsonb not null default '[]'::jsonb,

  started_at    timestamptz not null default now(),
  finished_at   timestamptz,

  constraint erp_sync_runs_store_id_fkey
    foreign key (store_id, tenant_id) references stores (id, tenant_id) on delete cascade
);

comment on table erp_sync_runs is
  'Una fila por corrida de sincronización con un ERP. En modo dry_run los contadores son el reporte de reconciliación.';

create index if not exists erp_sync_runs_recientes_idx
  on erp_sync_runs (store_id, started_at desc);

alter table erp_sync_runs enable row level security;

-- Lectura para cualquier miembro de la organización, igual que `audit_log`: es
-- un registro de lo que pasó, no un dato operable. La escritura es del
-- importador, que corre con la secret key, y nadie edita una corrida pasada.
--
-- No se usa `has_permission(tenant_id, 'catalog.read')` porque ese permiso no
-- existe —los roles declaran `catalog.write`—, y una política contra un permiso
-- inexistente no falla: deniega a todos, en silencio.
create policy erp_sync_runs_lectura on erp_sync_runs
  for select to authenticated
  using (tenant_id in (select app.current_tenants()));

grant select on erp_sync_runs to authenticated;
revoke all on erp_sync_runs from anon;

-- ---------------------------------------------------------------------------
-- El stock que posee el ERP no se pisa desde el Admin
-- ---------------------------------------------------------------------------
--
-- `admin_save_product` ya respetaba `field_sources` para los campos del producto
-- y para el precio de la variante, pero escribía `inventory_levels` sin mirar.
-- El stock es lo único que un ERP posee de verdad, y era justamente lo que no
-- estaba protegido: el no-negociable del repo dice que los campos del ERP se
-- bloquean localmente, y para el stock no se cumplía.
--
-- El resto del cuerpo es idéntico al vigente. Las migraciones son append-only,
-- así que la función se reemplaza entera desde un archivo nuevo.

create or replace function public.admin_save_product(
  p_store_id uuid,
  p_producto jsonb
) returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_tenant   uuid;
  v_location uuid;
  v_id       uuid := nullif(p_producto->>'id', '')::uuid;
  v_fuentes  jsonb;
  v_actual   products;
  v_variante jsonb;
  v_medio    jsonb;
  v_vid      uuid;
  v_i        integer := 0;
  v_ids      uuid[] := '{}';
begin
  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    raise exception 'La tienda % no existe', p_store_id;
  end if;

  -- El stock necesita una sucursal. Se usa la primera de la tienda mientras el
  -- Admin no tenga selector: inventar una acá escondería que falta configurarla.
  select id into v_location
  from locations
  where store_id = p_store_id
  order by created_at, id
  limit 1;

  if v_id is not null then
    select * into v_actual from products where id = v_id and store_id = p_store_id;
    if v_actual.id is null then
      raise exception 'El producto % no existe en esta tienda', v_id;
    end if;
  end if;

  v_fuentes := coalesce(v_actual.field_sources, '{}'::jsonb);

  /*
   * Los campos que posee el ERP no se pisan, aunque lleguen en el payload. El
   * formulario ya los deshabilita, pero el frontend no es la capa de
   * autorización: una petición armada a mano llegaría igual. Ver ADR-009.
   */
  if v_id is null then
    insert into products (
      tenant_id, store_id, handle, title, description, brand, category_id, status
    ) values (
      v_tenant,
      p_store_id,
      p_producto->>'handle',
      p_producto->>'title',
      nullif(p_producto->>'description', ''),
      nullif(p_producto->>'brand', ''),
      nullif(p_producto->>'categoryId', '')::uuid,
      coalesce(p_producto->>'status', 'draft')::product_status
    )
    returning id into v_id;
  else
    update products set
      handle      = p_producto->>'handle',
      title       = case when v_fuentes->>'title' = 'ERP' then v_actual.title
                    else p_producto->>'title' end,
      description = case when v_fuentes->>'description' = 'ERP' then v_actual.description
                    else nullif(p_producto->>'description', '') end,
      brand       = case when v_fuentes->>'brand' = 'ERP' then v_actual.brand
                    else nullif(p_producto->>'brand', '') end,
      category_id = nullif(p_producto->>'categoryId', '')::uuid,
      status      = coalesce(p_producto->>'status', 'draft')::product_status,
      updated_at  = now()
    where id = v_id;
  end if;

  -- Variantes. `position` es el orden del array: la PLP muestra la primera y su
  -- precio es el que ve el cliente (ADR-056).
  for v_variante in select * from jsonb_array_elements(coalesce(p_producto->'variants', '[]'::jsonb))
  loop
    v_vid := nullif(v_variante->>'id', '')::uuid;

    -- Igual que con el producto: en el import la identidad de una variante es su
    -- SKU, que es único por tenant.
    if v_vid is null and v_variante->>'sku' is not null then
      select v.id into v_vid
      from product_variants v
      where v.product_id = v_id and v.sku = v_variante->>'sku';
    end if;

    if v_vid is null then
      insert into product_variants (
        tenant_id, product_id, sku, barcode, title, position,
        price, currency, compare_at_price, cost, attributes
      ) values (
        v_tenant, v_id,
        v_variante->>'sku',
        nullif(v_variante->>'barcode', ''),
        v_variante->>'title',
        v_i,
        (v_variante->>'price')::bigint,
        coalesce(v_variante->>'currency', 'PYG'),
        nullif(v_variante->>'compareAtPrice', '')::bigint,
        nullif(v_variante->>'cost', '')::bigint,
        coalesce(v_variante->'attributes', '{}'::jsonb)
      )
      returning id into v_vid;
    else
      update product_variants set
        sku              = v_variante->>'sku',
        barcode          = nullif(v_variante->>'barcode', ''),
        title            = v_variante->>'title',
        position         = v_i,
        -- El precio es el campo que un ERP posee más seguido.
        price            = case when v_fuentes->>'price' = 'ERP' then price
                           else (v_variante->>'price')::bigint end,
        currency         = coalesce(v_variante->>'currency', 'PYG'),
        compare_at_price = nullif(v_variante->>'compareAtPrice', '')::bigint,
        cost             = nullif(v_variante->>'cost', '')::bigint,
        attributes       = coalesce(v_variante->'attributes', '{}'::jsonb),
        updated_at       = now()
      where id = v_vid and product_id = v_id;
    end if;

    -- El stock sólo se toca si el payload lo trae: omitirlo no es "cero".
    -- Y si el dueño del stock es el ERP, tampoco se toca, aunque venga en el
    -- payload. Se saltea en silencio igual que el precio unas líneas más
    -- arriba: el formulario manda el stock de todas las variantes en cada
    -- guardado, así que cortar acá dejaría sin poder editar el título de un
    -- producto del ERP.
    if v_variante ? 'stock' and coalesce(v_fuentes->>'stock', '') <> 'ERP' then
      -- Sin sucursal no hay dónde guardarlo. Antes esto se salteaba en silencio:
      -- la función devolvía el id como si todo hubiera salido bien, el Admin
      -- mostraba éxito y navegaba, y el producto quedaba invendible para siempre
      -- —"Sin stock" en la PLP, botón deshabilitado en el PDP— sin que nada
      -- apuntara a la causa. En un import de 500 filas, las 500 decían ok. El
      -- comentario de al lado decía que inventar una sucursal escondería que
      -- falta configurarla; saltearla la escondía igual.
      if v_location is null then
        raise exception 'La tienda no tiene ninguna sucursal, y sin sucursal el stock no se puede guardar. Crear una en locations antes de cargar stock.';
      end if;

      insert into inventory_levels (tenant_id, variant_id, location_id, available)
      values (v_tenant, v_vid, v_location, (v_variante->>'stock')::integer)
      on conflict (variant_id, location_id)
      do update set available = excluded.available, updated_at = now();
    end if;

    v_ids := v_ids || v_vid;
    v_i := v_i + 1;
  end loop;

  if array_length(v_ids, 1) is null then
    raise exception 'Un producto necesita al menos una variante';
  end if;

  -- Lo que ya no está en el payload se borró en el formulario. En un import, el
  -- archivo es la verdad para los productos que nombra.
  delete from product_variants where product_id = v_id and not (id = any(v_ids));

  -- Sin la clave `media` no se toca nada. Con un array —aunque esté vacío— se
  -- reemplaza entero: el medio no tiene identidad propia para el usuario.
  if p_producto ? 'media' then
    delete from product_media where product_id = v_id;
    v_i := 0;
    for v_medio in select * from jsonb_array_elements(p_producto->'media')
    loop
      insert into product_media (tenant_id, product_id, url, alt, width, height, position)
      values (
        v_tenant, v_id,
        v_medio->>'url',
        coalesce(v_medio->>'alt', ''),
        (v_medio->>'width')::integer,
        (v_medio->>'height')::integer,
        v_i
      );
      v_i := v_i + 1;
    end loop;
  end if;

  return v_id;
end;
$$;
