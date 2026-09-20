/*
 * La búsqueda semántica entra al catálogo (v2 Fase 7, ADR-132).
 *
 * Un solo cambio de fondo y dos de forma. El de fondo: hasta acá un producto
 * entraba al resultado **sólo si coincidía con todos los términos**, y «algo
 * para correr en invierno» no coincide con ninguno. Lo semántico no es un
 * criterio de orden que se suma al final: es una **fuente de filas nueva**, y
 * por eso toca el `where` de `base` y no sólo el `order by`.
 *
 * Los de forma: la llave de la frase se calcula acá dentro —así la firma no
 * cambia, no hay `drop`+`create` y los grants no se resetean, que ya pasó una
 * vez— y el orden mezcla los dos puntajes con pesos que garantizan que una
 * coincidencia léxica nunca quede debajo de un parecido.
 *
 * Sin extensión, sin clave o sin vectores, `app.similitud_semantica` devuelve
 * cero filas y esto es, fila por fila y orden por orden, el catálogo de la
 * Fase 3. La suite de aislamiento lo comprueba con la prueba de paridad que ya
 * existía.
 */

CREATE OR REPLACE FUNCTION public.catalog_search(p_store_id uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT ''::text, p_sort text DEFAULT 'relevance'::text, p_page integer DEFAULT 1, p_per_page integer DEFAULT 24, p_price_min bigint DEFAULT NULL::bigint, p_price_max bigint DEFAULT NULL::bigint, p_handle text DEFAULT NULL::text, p_collection text DEFAULT NULL::text, p_prefiere jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
with
-- La colección pedida, si la hay. `rules` nulo la hace manual.
coleccion as (
  select col.id, col.rules, col.sort
  from collections col
  where p_collection is not null
    and col.store_id = p_store_id
    and col.handle = p_collection
),

-- Promociones de catálogo vigentes de la tienda. Son pocas —un comercio tiene
-- diez, no diez mil—, así que se resuelven una vez por consulta y se cruzan,
-- en vez de evaluarse producto por producto.
promos as (
  select pr.id, pr.title, pr.priority, pr.stackable,
         pr.discount_type as "discountType", pr.discount_value as "discountValue",
         pr.target
  from promotions pr
  where pr.store_id = p_store_id
    and pr.status = 'active'
    -- De catálogo: sin cupón ni condiciones de carrito.
    and pr.code is null
    and pr.min_subtotal is null
    and pr.min_quantity is null
    and (pr.starts_at is null or now() >= pr.starts_at)
    and (pr.ends_at is null or now() < pr.ends_at)
    and (pr.usage_limit is null or pr.usage_count < pr.usage_limit)
),

-- Las que alcanzan a cada producto, ya ordenadas para encadenar. El `filter`
-- deja `[]` en los productos sin promoción, que es lo que permite saltear el
-- cálculo más abajo.
promos_producto as (
  select p.id as product_id,
         coalesce(
           jsonb_agg(to_jsonb(pm) - 'target' order by pm.priority desc, pm.id)
             filter (where pm.id is not null),
           '[]'::jsonb
         ) as lista
  from products p
  left join promos pm on (
    pm.target->>'kind' = 'all'
    or (pm.target->>'kind' = 'product'  and pm.target->'ids' ? p.id::text)
    or (pm.target->>'kind' = 'category' and p.category_id is not null
        and pm.target->'ids' ? p.category_id::text)
    or (pm.target->>'kind' = 'collection' and exists (
          select 1 from collection_products cp
          where cp.product_id = p.id and pm.target->'ids' ? cp.collection_id::text))
  )
  where p.store_id = p_store_id and p.status = 'active'
  group by p.id
),

-- El precio efectivo de cada variante.
--
-- El `case` no es una optimización cosmética: sin promociones vigentes —que es
-- el estado normal de una tienda— `lista` es `[]` para todos y no se llama a
-- `apply_chain` ni una vez, así que la consulta cuesta lo mismo que antes.
precios as (
  select v.id as variant_id, v.product_id, v.price as lista,
         case when pp.lista = '[]'::jsonb then v.price
              else (app.apply_chain(v.price, pp.lista)->>'amount')::bigint
         end as efectivo
  from product_variants v
  join promos_producto pp on pp.product_id = v.product_id
),

-- El precio más bajo de cada producto, agregado **una vez**.
--
-- Era una subconsulta correlacionada —`(select min(efectivo) from precios where
-- product_id = p.id)`— dentro de `prods`. Contra una tabla habría usado el
-- índice; contra un CTE no hay índice que usar, así que Postgres recorría las
-- 5010 filas de `precios` una vez por producto: 25 millones de filas y 1,9 de
-- los 2,2 segundos que tardaba el catálogo. Medido con `explain analyze`.
--
-- Un producto sin variantes no aparece acá, y el `left join` de `prods` le deja
-- `lowest` en nulo, que es lo que devolvía el `min()` de un conjunto vacío.
minimos as (
  select product_id, min(efectivo) as lowest
  from precios
  group by product_id
),

-- Productos publicados de la tienda. `ord` fija el orden de "relevance" y es
-- también el orden en que se descubren las facetas, igual que en el core.
prods as (
  select
    p.id,
    p.handle,
    p.title,
    p.description,
    p.brand,
    p.tenant_id,
    p.product_group_id,
    c.slug as categoria,
    row_number() over (order by p.created_at, p.id) as ord,
    p.created_at,
    /*
     * Unidades vendidas, sin los cancelados. Se agrega en la consulta y **no**
     * se guarda en una columna: un contador materializado es alguien que tiene
     * que acordarse de actualizarlo, y ADR-056 ya dice a dónde lleva eso con el
     * stock. El join va por `variant_id` porque `order_items` no referencia al
     * producto: guarda la variante y una copia de lo que se vendió.
     */
    coalesce((
      select sum(oi.quantity)
      from order_items oi
      join product_variants pv on pv.id = oi.variant_id
      join orders o on o.id = oi.order_id
      where pv.product_id = p.id and o.status <> 'cancelled'
    ), 0)::int as vendidas,
    -- El mínimo **efectivo**, no el de lista: de acá salen el orden por precio,
    -- el filtro de rango y los extremos de la barra.
    mp.lowest,
    -- Título y marca normalizados, materializados (ADR-125). Sobre esto se
    -- busca; antes se armaba acá, con los SKU, para cada producto en cada
    -- petición, hubiera término o no.
    p.search_doc,
    /*
     * Lo que se está moviendo esta semana (ADR-127). Sale de una tabla que
     * mantiene el recálculo, no de una cuenta en esta consulta: contar eventos
     * acá sería recorrer la tabla más grande del esquema en cada visita.
     *
     * `coalesce` a cero y no nulo: una tienda sin tráfico tiene la tabla vacía y
     * todos empatan, así que el orden queda en el del catálogo. Es el escalón
     * de respaldo de la cascada, y sale sin un `if` en ningún lado.
     */
    coalesce(pt.score, 0) as tendencia
  from products p
  left join categories c on c.id = p.category_id
  left join minimos mp on mp.product_id = p.id
  /*
   * El filtro por tienda del join es defensa en profundidad: un id de producto es
   * único en todo el esquema, así que una fila de otra tienda no puede coincidir
   * igual. Comprobado quitándolo —ningún caso se pone en rojo—, y se deja escrito
   * para que nadie lo cuente como cobertura.
   */
  left join product_trending pt on pt.product_id = p.id and pt.store_id = p_store_id
  -- El storefront nunca ve borradores. Un select sin esto los publicaría.
  where p.store_id = p_store_id
    and p.status = 'active'
    and (p_handle is null or p.handle = p_handle)
    /*
     * Sin stock, fuera del listado. Salvo que la tienda pida mostrarlos
     * (`settings.catalog.showOutOfStock`), un producto cuyas variantes están
     * todas en cero no aparece en el catálogo, en la búsqueda, en las facetas
     * ni en las colecciones: todo pasa por acá.
     *
     * **Nunca fuera del PDP.** Con `p_handle` no se filtra: un producto que se
     * agotó sigue teniendo su página, con «Sin stock» a la vista. Un 404 en un
     * enlace que ayer funcionaba es peor que una página que dice que no hay.
     *
     * Se compara como texto y no con `::boolean`: un valor mal escrito en el
     * jsonb haría fallar el catálogo entero, y el lado seguro es ocultar.
     */
    and (
      p_handle is not null
      or coalesce(
           (select s.settings->'catalog'->>'showOutOfStock' from store_settings s
             where s.store_id = p_store_id),
           'false') = 'true'
      or exists (
        select 1
        from product_variants v
        join inventory_levels il on il.variant_id = v.id
        where v.product_id = p.id and il.available > 0
      )
    )
    /*
     * Sin foto, fuera del listado **si la tienda lo pide**
     * (`settings.catalog.hideWithoutImage`). Al revés que el stock, acá el
     * default es mostrar: que no haya stock es universal —no se vende lo que no
     * hay—, que no haya foto es merchandising, y una ferretería vende sin foto.
     * Una tienda de ropa lo enciende y lo que Camelot cargó sin fotografiar
     * deja de abrir la vitrina con seis páginas de «Sin imagen».
     *
     * Tampoco filtra por `p_handle`: la página existe, con su placeholder.
     */
    and (
      p_handle is not null
      or coalesce(
           (select s.settings->'catalog'->>'hideWithoutImage' from store_settings s
             where s.store_id = p_store_id),
           'false') <> 'true'
      or exists (select 1 from product_media m where m.product_id = p.id)
    )
    -- La pertenencia **manual** se resuelve acá. La dinámica no: sus reglas son
    -- filtros de faceta y necesitan los valores del producto, que se calculan
    -- más abajo. Se aplica en `base`.
    and (
      p_collection is null
      or (select rules from coleccion) is not null
      or exists (
        select 1
        from collection_products cp
        join coleccion c on c.id = cp.collection_id
        where cp.product_id = p.id
      )
    )
),

-- Pares producto × faceta × valor, deduplicados: un producto cuenta una sola
-- vez por valor aunque tres de sus variantes lo repitan.
--
-- `disc` es el orden de descubrimiento —producto, y dentro de él la posición de
-- la variante—, que define en qué orden se listan los valores de una faceta.
pav as (
  select distinct on (product_id, name, value) product_id, name, value, disc
  from (
    select pr.id as product_id, 'brand'::text as name, pr.brand as value,
           pr.ord * 100000 as disc
    from prods pr where pr.brand is not null
    union all
    select pr.id, 'categoria', pr.categoria, pr.ord * 100000
    from prods pr where pr.categoria is not null
    union all
    select pr.id, a.key, a.value, pr.ord * 100000 + v.position
    from prods pr
    join product_variants v on v.product_id = pr.id
    cross join lateral jsonb_each_text(v.attributes) a
  ) x
  order by product_id, name, value, disc
),

-- Valores por producto y faceta, para evaluar los filtros sin recorrer `pav`
-- una vez por condición.
pfacets as (
  select product_id, jsonb_object_agg(name, valores) as fv
  from (
    select product_id, name, jsonb_agg(value) as valores
    from pav
    group by product_id, name
  ) g
  group by product_id
),

-- Los términos de la búsqueda, normalizados como el documento: sin mayúsculas ni
-- acentos. Vacío sin búsqueda, y entonces los dos CTE que siguen no hacen nada.
terminos as (
  select distinct t.tok
  from unnest(string_to_array(app.normalizar_busqueda(trim(coalesce(p_search, ''))), ' ')) t(tok)
  where t.tok <> ''
),

-- La llave de la frase en la caché de vectores (ADR-132).
--
-- Vacía en dos casos, y en los dos el camino semántico no aporta nada: sin
-- búsqueda, y cuando la consulta **parece un código**. Un solo token con
-- dígitos —«CH-407307-01», «A12»— es una referencia, no una descripción, y ahí
-- manda lo léxico, que es exacto. «campera 2024» son dos tokens: no es un
-- código.
frase as (
  select case
    when q = '' then ''
    when q !~ ' ' and q ~ '[0-9]' then ''
    else md5(q)
  end as llave
  from (select app.normalizar_busqueda(trim(coalesce(p_search, ''))) as q) n
),

-- Los productos parecidos a la frase, si la frase ya tiene vector.
--
-- **Cero filas** cuando no hay extensión, no hay clave del comercio o nadie
-- embebió todavía: entonces esto no agrega ni quita nada y el catálogo es
-- exactamente el léxico de la Fase 3. Es un CTE y no una subconsulta
-- correlacionada a propósito: así se evalúa una vez y no una por producto.
semanticos as (
  select s.product_id, s.sim
  from frase f
  cross join lateral app.similitud_semantica(p_store_id, f.llave) s
),

-- Los productos con algún SKU que **empieza** con un término. Por prefijo y
-- exacto, no por parecido: «A12» por trigramas traería medio catálogo. Una sola
-- pasada por las variantes de la tienda en vez de un `exists` por producto.
skus as (
  select distinct v.product_id, t.tok
  from product_variants v
  join prods pr on pr.id = v.product_id
  cross join terminos t
  where starts_with(app.normalizar_busqueda(v.sku), t.tok)
),

-- Cómo coincide cada producto con cada término, y cuánto vale. Un término
-- coincide si aparece literal en el documento, si es un prefijo de SKU, o
-- —desde cuatro letras, porque con menos es ruido— si se parece lo suficiente a
-- una palabra del documento: así «zapatila» encuentra «zapatilla».
--
-- El puntaje ordena por relevancia: el SKU pesa más que lo literal, y lo
-- literal más que cualquier parecido, que vale su `word_similarity` (< 1).
coincidencias as (
  select pr.id as product_id, count(*) as n, sum(m.puntos) as puntaje
  from prods pr
  cross join terminos t
  left join skus s on s.product_id = pr.id and s.tok = t.tok
  cross join lateral (
    select case
      when s.tok is not null then 1.2
      when strpos(pr.search_doc, t.tok) > 0 then 1.0
      when length(t.tok) >= 4 then (
        select ws from (select word_similarity(t.tok, pr.search_doc)::numeric as ws) w
        where ws >= 0.5
      )
    end as puntos
  ) m
  where m.puntos is not null
  group by pr.id
),

-- Búsqueda y rango de precio: se aplican a los ítems **y** a los counts de
-- todas las facetas. A diferencia de un filtro de faceta, nunca se auto-excluyen.
base as (
  select pr.*, co.puntaje, sem.sim
  from prods pr
  left join pfacets pfr on pfr.product_id = pr.id
  left join coincidencias co on co.product_id = pr.id
  left join semanticos sem on sem.product_id = pr.id
  -- Tienen que coincidir **todos** los términos… **o** parecerse a la frase.
  --
  -- Esta línea es la fase entera: «algo para correr en invierno» no coincide
  -- con ningún término, así que sin ella el producto no entraría por más
  -- parecido que fuera. Lo semántico no es un criterio de orden, es una fuente
  -- de filas. Lo que sigue —precio, colección, facetas— se le aplica igual.
  where (
    not exists (select 1 from terminos)
    or co.n = (select count(*) from terminos)
    or sem.product_id is not null
  )
  and (p_price_min is null or pr.lowest >= p_price_min)
  and (p_price_max is null or pr.lowest <= p_price_max)
  -- Las reglas de una colección dinámica. Misma forma que `p_filters` —varios
  -- valores de una faceta son un OR, facetas distintas un AND— pero acá, junto
  -- a la búsqueda y al precio, para que **no se auto-excluyan** del conteo de
  -- facetas: la colección tiene que seguir acotada cuando el visitante filtra.
  and not exists (
    select 1
    from jsonb_each(coalesce((select rules from coleccion), '{}'::jsonb)) r(k, vals)
    where jsonb_array_length(r.vals) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(r.vals) t(v)
        where coalesce(pfr.fv -> r.k, '[]'::jsonb) ? t.v
      )
  )
),

-- Productos que pasan todos los filtros de faceta. Varios valores de una misma
-- faceta son un OR; facetas distintas, un AND.
filtrados as (
  select b.*
  from base b
  left join pfacets pf on pf.product_id = b.id
  where not exists (
    select 1
    from jsonb_each(p_filters) f(k, vals)
    where jsonb_array_length(f.vals) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(f.vals) t(v)
        where coalesce(pf.fv -> f.k, '[]'::jsonb) ? t.v
      )
  )
),

total as (select count(*)::int as n from filtrados),

paginacion as (
  select
    greatest(1, ceil(t.n::numeric / greatest(1, least(p_per_page, 200)))::int) as page_count,
    t.n
  from total t
),

pagina as (
  -- Una página fuera de rango devuelve la última con resultados, no una vacía:
  -- pasa al quitar filtros estando en la página 5.
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from paginacion pg
),

-- El orden de la página, calculado sobre lo barato: id, título, precio más
-- bajo y unidades vendidas, que ya están en `filtrados`.
--
-- Acá **no** se serializa nada, y eso es lo que hace barata la paginación
-- profunda. Antes el `jsonb_build_object` vivía en el mismo select que este
-- `row_number()`, así que se armaba el documento de cada fila que la ventana
-- dejaba pasar.
--
-- En la **primera** página eso no costaba: Postgres empuja el tope adentro de la
-- ventana con un `Run Condition` sobre el `row_number()`, y para a las 24 filas.
-- Pero el `Run Condition` sólo empuja el límite **superior**. En la página 100 la
-- ventana entrega 2400 filas, se arman 2400 documentos y se descartan 2376:
--
--     página 100, sin este corte   1660 ms
--     página 100, con este corte    204 ms
--
-- Medido con 5006 productos. Se revirtió una vez por haber medido sólo la
-- primera página, donde no se nota.
ordenados as (
  select
    f.*,
    row_number() over (
      order by
        case when p_sort = 'price-asc'  then f.lowest end asc  nulls last,
        case when p_sort = 'price-desc' then f.lowest end desc nulls last,
        case when p_sort = 'title-asc'  then lower(f.title) end asc,
        -- Descendentes las dos. `f.ord` desempata al final, así que lo que no
        -- vendió nada conserva el orden de descubrimiento en vez de barajarse.
        case when p_sort = 'newest'       then f.created_at end desc,
        case when p_sort = 'best-selling' then f.vendidas   end desc,
        /*
         * La cascada de «Preferencias», que es un solo `order by` y no tres
         * caminos de código (ADR-127):
         *
         * 1. lo de las marcas y categorías que viene mirando, si hay señal;
         * 2. dentro de eso —y para quien no tiene señal—, lo que se está moviendo;
         * 3. y si la tienda tampoco tiene tráfico, el orden del catálogo, que es
         *    `f.ord` al final de esta lista.
         *
         * Con `p_prefiere` vacío el primer `case` da 1 para todos y el orden
         * queda igual al de «Tendencia». No hay un `if` en el storefront eligiendo
         * camino, así que el arranque en frío no es una rama que nadie prueba: es
         * la misma consulta con el parámetro vacío.
         */
        case
          when p_sort = 'preferencias'
           and (coalesce(p_prefiere->'brand', '[]'::jsonb) ? f.brand
                or coalesce(p_prefiere->'categoria', '[]'::jsonb) ? f.categoria)
          then 0 else 1
        end asc,
        -- «Tendencia»: lo que se movió esta semana. Con la tabla vacía empatan
        -- todos en cero y desempata `f.ord`, que es el orden del catálogo.
        case when p_sort in ('trending', 'preferencias') then f.tendencia end desc,
        -- Con término de búsqueda, lo que mejor coincide primero. Sin término
        -- el puntaje es nulo para todos y el orden es el de siempre.
        /*
          Relevancia fusionada (ADR-132).

          `puntaje` es una suma sin techo sobre los términos, así que se divide
          por cuántos son para dejarlo en la misma escala que `sim`, que es
          0..1. Los pesos no son un gusto: **lo léxico siempre gana**. Un
          producto que coincide con todos los términos aporta al menos 0,5 por
          término —es el piso de `word_similarity`—, o sea 0,75 × 0,5 = 0,375,
          por encima del máximo que puede dar lo semántico solo, 0,25 × 1 =
          0,25. Un parecido nunca desplaza a una coincidencia.

          Sin vectores, `sim` es null en todas las filas y esto es el orden de
          antes multiplicado por una constante: el mismo orden.
        */
        case when p_sort = 'relevance' then
          0.75 * coalesce(f.puntaje / nullif((select count(*) from terminos), 0), 0)
          + 0.25 * coalesce(f.sim, 0)
        end desc nulls last,
        f.ord
    ) as rn
  from filtrados f
),

-- La página pedida. El corte va **antes** de serializar, así que lo que sigue
-- trabaja sobre `p_per_page` filas y no sobre el catálogo entero.
pagina_items as (
  select o.*
  from ordenados o
  where o.rn > (select (page - 1) * least(p_per_page, 200) from pagina)
    and o.rn <= (select page * least(p_per_page, 200) from pagina)
),

items as (
  select jsonb_agg(
    -- `strip_nulls`: el contrato del core dice "ausente", no "nulo".
    jsonb_strip_nulls(jsonb_build_object(
      'id', f.id,
      -- `Product` extiende `TenantScoped`: el scope viaja con cada ítem en vez
      -- de que quien llama tenga que acordarse de inyectarlo.
      'tenantId', f.tenant_id,
      'storeId', p_store_id,
      'handle', f.handle,
      'title', f.title,
      'description', f.description,
      'brand', f.brand,
      'categoryId', f.categoria,
      'productGroupId', f.product_group_id,
      'status', 'active',
      'createdAt', f.created_at,
      'unitsSold', f.vendidas,
      'images', coalesce((
        select jsonb_agg(jsonb_build_object(
          'url', m.url, 'alt', m.alt, 'width', m.width, 'height', m.height
        ) order by m.position)
        from product_media m where m.product_id = f.id
      ), '[]'::jsonb),
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id,
          'sku', v.sku,
          'barcode', v.barcode,
          'title', v.title,
          -- El precio que paga el comprador. Con una promoción vigente es el
          -- rebajado; sin ninguna, el de lista.
          'price', jsonb_build_object('amount', pe.efectivo, 'currency', v.currency),
          -- El tachado. Si la variante ya traía uno propio del catálogo y era
          -- mayor, gana ése: tachar el de lista mostraría un ahorro más chico
          -- que el real. Y si no hubo descuento, se conserva el de siempre.
          'compareAtPrice', case
            when pe.efectivo < v.price
              then jsonb_build_object(
                'amount', greatest(v.price, coalesce(v.compare_at_price, 0)),
                'currency', v.currency)
            when v.compare_at_price is null then null
            else jsonb_build_object('amount', v.compare_at_price, 'currency', v.currency)
          end,
          -- Espejo de inventario: la suma de las sucursales. Nunca es
          -- autoridad si el ERP posee el stock. Ver ADR-009.
          'availableQuantity', coalesce((
            select sum(il.available)::int from inventory_levels il where il.variant_id = v.id
          ), 0),
          'attributes', v.attributes
        ) order by v.position)
        from product_variants v
        join precios pe on pe.variant_id = v.id
        where v.product_id = f.id
      ), '[]'::jsonb)
    ))
    order by f.rn
  ) as docs
  from pagina_items f
),

-- Counts por faceta, **ignorando la propia selección de esa faceta**. Con
-- "color: Negro" activo, la faceta color sigue mostrando cuántos hay en Azul;
-- si se aplicara su propio filtro, todas las demás opciones darían cero y la
-- faceta quedaría inservible.
conteos as (
  select
    pv.name,
    pv.value,
    count(distinct pv.product_id)::int as count,
    min(pv.disc) as vdisc
  from pav pv
  join base b on b.id = pv.product_id
  left join pfacets pf on pf.product_id = pv.product_id
  where not exists (
    select 1
    from jsonb_each(p_filters) f(k, vals)
    where f.k <> pv.name
      and jsonb_array_length(f.vals) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(f.vals) t(v)
        where coalesce(pf.fv -> f.k, '[]'::jsonb) ? t.v
      )
  )
  group by pv.name, pv.value
),

facetas as (
  select jsonb_agg(
    jsonb_build_object('name', f.name, 'values', f.values)
    order by f.orden
  ) as docs
  from (
    select
      c.name,
      -- brand y categoria primero, como en el core; el resto por orden de
      -- descubrimiento.
      case c.name when 'brand' then 0 when 'categoria' then 1 else 2 end * 1000000000
        + min(c.vdisc) as orden,
      jsonb_agg(
        jsonb_build_object(
          'value', c.value,
          'count', c.count,
          'selected', coalesce(p_filters -> c.name, '[]'::jsonb) ? c.value
        ) order by c.vdisc
      ) as values
    from conteos c
    group by c.name
  ) f
),

-- Renombrado desde `precios`, que ahora es el CTE de precios efectivos por
-- variante. Estos son los extremos de la barra de rango, y salen de `lowest`,
-- así que siguen al precio con descuento sin más cambios.
extremos as (
  select min(lowest) as pmin, max(lowest) as pmax from prods
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'facets', coalesce((select docs from facetas), '[]'::jsonb),
  'total', (select n from pagina),
  'page', (select page from pagina),
  'perPage', least(p_per_page, 200),
  'pageCount', (select page_count from pagina),
  'priceMin', (select pmin from extremos),
  'priceMax', (select pmax from extremos)
);
$function$
;
