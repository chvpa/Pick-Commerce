-- Los tres códigos de un producto, cada uno en su nivel.
--
-- La Fase 8 los confundió: puso el código del ERP en el producto y usó el
-- código de barras como SKU de la variante. Son tres cosas distintas y
-- mezclarlas se paga al facturar, porque el ERP espera recibir el suyo:
--
--   SKU             el código del **modelo**: `NK123-01`, donde `-01` es el
--                   color. Lo comparten todas las tallas y no cambia. Es lo
--                   único estable a nivel producto, así que es lo que agrupa.
--
--   internal_code   el código del **ERP del comercio**. Según el ERP se repite
--                   en todo el modelo o es propio de cada variante, así que vive
--                   en la variante: repetirlo cuesta nada, y al revés no entra.
--
--   barcode         el código impreso en la caja, del proveedor. Mismo caso: hay
--                   modelos con uno solo para todas las tallas.
--
-- Ni `internal_code` ni `barcode` llevan restricción de unicidad, y eso es
-- deliberado. Ponérsela parecería prolijo y rechazaría catálogos legítimos.

-- ---------------------------------------------------------------------------
-- El código de modelo, en el producto
-- ---------------------------------------------------------------------------

alter table products add column if not exists sku text;

comment on column products.sku is
  'Código del modelo. Lo comparten todas las variantes; nulo si el catálogo no lo maneja.';

-- Único por tienda: dos productos con el mismo código de modelo son el mismo
-- producto cargado dos veces. Parcial, porque un catálogo cargado a mano puede
-- no tener ninguno y todos los nulos chocarían entre sí.
create unique index if not exists products_sku_idx
  on products (store_id, sku)
  where sku is not null;

-- ---------------------------------------------------------------------------
-- El código del ERP, en la variante
-- ---------------------------------------------------------------------------

alter table product_variants add column if not exists internal_code text;

comment on column product_variants.internal_code is
  'Código del ERP del comercio. Sin unicidad: hay ERPs que lo repiten en todo el modelo.';

create index if not exists product_variants_internal_code_idx
  on product_variants (tenant_id, internal_code)
  where internal_code is not null;

-- El que la Fase 8 puso en el producto. Se va: dejarlo en los dos lados sería
-- tener dos verdades para el mismo dato, y la del producto no puede representar
-- un ERP que codifique por variante.
--
-- No hay que migrar nada: lo único que lo usaba es el catálogo de Estilo Sport,
-- que se vuelve a importar con el mapeo corregido.
drop index if exists products_internal_code_idx;
alter table products drop column if exists internal_code;
