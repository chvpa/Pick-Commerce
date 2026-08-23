# Pick Commerce — PROJECT.md

> Fuente de verdad funcional y arquitectónica del proyecto.  
> Antes de desarrollar o modificar una funcionalidad, leer este archivo junto con `ROADMAP.md`, `DECISIONS.md` y `ENGINEERING_HARNESS.md`.

## 1. Visión

Pick Commerce es una infraestructura de ecommerce headless, modular y multitenant orientada a retailers de Paraguay y LATAM.

El objetivo no es replicar Shopify feature por feature. El objetivo es ofrecer una plataforma mucho más adaptable para comercios que ya tienen operación física, catálogo, ERP, medios de pago locales y necesidades particulares de venta.

Debe servir desde una boutique pequeña hasta un mayorista, importador, ferretería o marca grande sin crear productos distintos para cada vertical.

La plataforma debe ser dueña de la experiencia de venta, pero **no intentar convertirse en ERP, sistema contable, facturador ni plataforma de atención omnicanal**.

---

## 2. Principios del producto

1. **Un solo Commerce Core.**
   - No crear forks por cliente.
   - No crear "Pick Fashion", "Pick Hardware", etc.
   - Las diferencias se resuelven mediante presets, feature flags, configuración, atributos y adapters.

2. **Storefronts independientes, core compartido.**
   - Cada cliente puede tener su propio repositorio y despliegue.
   - Todos consumen paquetes versionados `@pick/*`.

3. **Admin único y multitenant.**
   - Una sola aplicación.
   - Cada usuario ve exclusivamente los tenants, tiendas, sucursales y acciones permitidas.

4. **El ERP conserva autoridad sobre los datos que le pertenecen.**
   - Stock, costos, precios o SKUs pueden quedar bloqueados en Pick Commerce cuando su source of truth sea el ERP.
   - Pick Commerce mantiene una representación sincronizada, no una autoridad paralela.

5. **IA para enriquecer, no para inventar datos críticos.**
   - AI puede inferir categorías, atributos, descripciones, tags, SEO e imágenes.
   - SKU, barcode, stock, costo, precio, impuestos y cantidades deben provenir de fuentes verificables o confirmación humana.

6. **Las acciones sensibles se validan en backend.**
   - El frontend, Admin, Copilot o MCP nunca reemplazan autorización del servidor.

7. **Demos reales.**
   - Una demo utiliza el mismo engine, componentes y capacidades que producción.
   - No mostrar features que Pick Commerce no pueda entregar.

8. **Performance como requisito de producto.**
   - El storefront debe enviar el menor JavaScript razonable.
   - Interactividad mediante islands.
   - El Admin prioriza productividad y mantenibilidad.

9. **No sobredimensionar v1.**
   - El primer objetivo es procesar pedidos reales de forma confiable.
   - Funciones avanzadas se agregan cuando el núcleo esté estable.

---

## 3. Arquitectura objetivo

```text
                            CLIENTE
                               │
              ┌────────────────┴────────────────┐
              │                                 │
          STOREFRONT                         ADMIN
            Astro                         React/Vite
         Preact islands                      SPA
              │                                 │
              └──────────────┬──────────────────┘
                             │
                        COMMERCE API
                             │
       ┌────────────┬────────┼────────┬─────────────┐
       │            │        │        │             │
    Catalog      Orders   Customers Promotions Analytics
       │            │
       └────────────┼─────────────────────────────┐
                    │                             │
                ADAPTERS                      AI SERVICE
                    │                             │
       ┌────────────┼────────────┐             OpenAI API
       │            │            │
      ERP        Payment       Resend
       │
  SOURCE OF TRUTH

                     COMMERCE API
                          │
                       MCP SERVER
                          │
                       ChatGPT
```

---

## 4. Stack aprobado

### Storefront

- Astro
- TypeScript
- Tailwind CSS v4
- Preact para islands e interacción
- componentes propios de Commerce
- Cloudflare Workers
- Cloudflare CDN
- Cloudflare R2 para media cuando corresponda

### Admin

- React
- Vite
- TypeScript
- Tailwind CSS v4
- shadcn
- Base UI
- TanStack Router
- TanStack Query
- TanStack Table
- React Hook Form
- Zod

### Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security
- API/servicios de dominio
- Cloudflare Workers donde convenga como edge/API gateway

### AI

- OpenAI exclusivamente en la primera etapa
- BYOK: cada tenant puede configurar su propia OpenAI API key
- La key nunca se expone al browser
- No existe sistema de "créditos Pick AI" en v1

### Notificaciones

- Email con Resend
- WhatsApp fuera del core inicial
- Mantener una abstracción `NotificationProvider` para integraciones futuras

---

## 5. Repositorios y paquetes

Estructura conceptual:

```text
packages/
  commerce-core/
  commerce-types/
  commerce-api/
  commerce-ui/
  commerce-astro/
  commerce-search/
  commerce-seo/
  commerce-analytics/
  adapter-supabase/
  adapter-resend/
  adapter-openai/
  adapter-erp-*/
  adapter-payment-*/

apps/
  admin/
  demo-fashion/
  demo-sport/
  demo-wholesale/
  client-storefronts/
```

Los storefronts no deben copiar el core.

Ejemplo de consumo:

```text
@pick/commerce-core
@pick/commerce-ui
@pick/commerce-astro
@pick/commerce-search
@pick/commerce-seo
```

---

## 6. Provisionamiento de tiendas

Objetivo futuro del CLI:

```bash
pnpm dlx create-pick-commerce@latest
```

Flujo esperado:

1. Crear tenant/organization.
2. Crear store.
3. Crear owner/membership.
4. Aplicar roles y defaults.
5. Seleccionar preset inicial.
6. Activar feature flags.
7. Generar storefront.
8. Crear repo.
9. Crear proyecto/Worker en Cloudflare.
10. Configurar secrets.
11. Conectar dominio.
12. Hacer primer deploy.

El Admin y Commerce API no se despliegan por cliente.

Cada storefront sí puede tener un despliegue independiente.

---

## 7. Modelo multitenant

Entidades mínimas:

- organizations
- stores
- locations
- users
- memberships
- roles
- permissions
- feature_flags
- store_settings

Toda entidad de negocio relevante debe pertenecer explícitamente a un tenant/store.

Ejemplo:

```text
products.tenant_id
orders.tenant_id
customers.tenant_id
promotions.tenant_id
```

La seguridad no depende sólo del frontend. Debe existir RLS y autorización en servicios de dominio.

---

## 8. Catálogo universal

No crear una tabla de productos con cientos de columnas específicas para industrias.

### Core universal

- Product
- Variant
- SKU
- Barcode/GTIN
- Title
- Description
- Brand
- Category
- Price
- Cost
- Media
- Weight
- Dimensions
- Tax metadata
- Status

### Taxonomía

```text
Category
  └ Subcategory
      └ Product type
```

### Atributos configurables

Ejemplos:

**Running shoes**

- gender
- size
- color
- surface
- material

**Book**

- author
- isbn
- publisher
- language
- pages

**Screw**

- diameter
- length
- thread
- material
- head_type

Usar definiciones de atributos + valores de producto/variante y metafields para extensiones.

---

## 9. Productos e importación

Canales de alta:

1. Manual
2. CSV/XLSX
3. ERP Adapter
4. AI Product Studio

Campos críticos mínimos para un producto vendible:

- nombre
- SKU o identificador equivalente
- variante(s) cuando corresponda
- cantidad/stock
- precio

Campos adicionales pueden quedar pendientes o enriquecerse después.

### CSV

Debe existir:

- template descargable
- validación antes de importar
- preview de errores
- importación parcial cuando sea segura
- reporte final de filas creadas, actualizadas, rechazadas o pendientes

### ERP

Pipeline:

```text
ERP RAW
   ↓
Mapper
   ↓
Validator
   ↓
AI Enrichment
   ↓
Human Review cuando corresponda
   ↓
Commerce Product
```

No usar:

```text
ERP → AI → database
```

sin validación.

---

## 10. Source of Truth

Cada campo sincronizable debe poder indicar su origen.

Ejemplo:

```text
stock.source = ERP
price.source = ERP
description.source = COMMERCE
images.source = COMMERCE
```

Cuando un campo es administrado por ERP:

- mostrar origen
- bloquear edición local si corresponde
- registrar último sync
- registrar error de sync
- permitir diagnóstico

---

## 11. Sucursales e inventario

Aunque el ERP tenga sucursales, Pick Commerce mantiene una representación sincronizada.

`locations` puede representar:

- tiendas
- depósitos
- dark stores
- centros de distribución
- puntos de retiro

Cada location puede mapearse a `erp_location_id`.

Esto permite:

- stock por sucursal
- pickup
- delivery routing
- analytics
- catálogo disponible por ubicación
- reglas de fulfillment

El ERP sigue siendo source of truth cuando corresponda.

---

## 12. Stock y prevención de overselling

### Navegación

Usar inventario replicado/cacheado para performance.

### Add to Cart

Cuando el adapter lo permita:

```text
addToCart
  ↓
InventoryService
  ↓
ERP
  ↓
validate availability
```

### Checkout

Antes de confirmar:

```text
validateInventory()
```

Si cambió el stock, informar al cliente y corregir el carrito.

### Reservas

Los adapters ERP deben declarar capacidades:

```text
supportsReservations: true | false
```

Si el ERP soporta reservas, preferir:

```text
validate
→ reserve
→ payment
→ order
```

Si no soporta reservas:

```text
validate
→ payment/order
→ push ERP immediately
```

No prometer cero overselling cuando el ERP no dispone de reservas/transacciones adecuadas.

---

## 13. Pedidos

Pick Commerce es un sistema de venta y orquestación de pedidos.

Estados operativos iniciales:

- recibido
- confirmado
- en preparación
- listo
- enviado
- en tránsito
- entregado
- cancelado

El detalle del pedido debe conservar:

- cliente
- productos
- variantes
- cantidades
- precio original
- descuentos
- cupón
- shipping
- dirección
- método de pago
- estado de pago
- datos fiscales solicitados
- timeline
- notas internas

### Fuera del scope inicial

- facturación
- notas de crédito
- reembolsos
- motor de devoluciones
- cambios fiscales/contables

Cuando esos procesos ocurren en ERP, Pick Commerce puede reflejar el estado resultante.

---

## 14. Pagos

Usar una interfaz estándar:

```text
PaymentProvider
```

Capacidades esperadas:

- createPayment
- getPaymentStatus
- verifyWebhook
- cancelPayment cuando el proveedor lo soporte
- healthCheck

Adapters previstos por mercado:

- Bancard
- uPay
- Pagopar
- Dinelco
- transferencia bancaria

No acoplar Orders directamente a un proveedor.

---

## 15. Promotions Engine

Modelo esperado:

```text
Promotion
- conditions[]
- actions[]
- priority
- stackability
- startsAt
- endsAt
- usageLimits
```

Casos:

- porcentaje
- monto fijo
- compra mínima
- cantidad mínima
- delivery gratis
- Buy X Get Y
- 2x1 / 3x2
- bundles
- categoría
- marca
- colección
- segmento
- primera compra
- fecha
- cupón

Antes de publicar promociones complejas debe existir modo simulación/preview cuando sea razonable.

---

## 16. Collections Engine

Soportar:

### Manual Collections

Selección explícita de productos.

### Dynamic Collections

Reglas automáticas.

Ejemplo:

```text
category = running
gender = female
discount > 0
stock > 0
```

Banners y secciones pueden enlazar colecciones.

---

## 17. Storefront

Páginas base:

- Home
- Collection/PLP
- Product/PDP
- Search
- Cart
- Checkout
- Account
- Orders
- Policies
- FAQ
- 404

Componentes esperados:

- Header
- Footer
- Announcement bar
- Hero
- Banner
- Category navigation
- Product Card
- Product Grid
- Product Carousel
- Product Gallery
- Product Info
- Price
- Variant Selector
- Quantity Selector
- Add to Cart
- Cart Drawer
- Search
- Filters
- Breadcrumb
- Wishlist cuando esté habilitado
- Recommendations
- Recently Viewed
- Shop the Look cuando esté habilitado

Todo componente debe ser configurable por:

- composition
- variants
- slots
- tokens
- props
- `className` como escape hatch

Evitar componentes con decenas de props booleanas cuando composition/variants resuelvan mejor el caso.

---

## 18. Presets y Feature Flags

Presets iniciales posibles:

- Blank
- Fashion
- Sport
- Wholesale
- Hardware
- Minimal
- Luxury

Un preset configura defaults. No crea otro producto.

Feature flags ejemplo:

- ai_catalog
- ai_search
- image_search
- loyalty
- b2b
- multi_location
- wishlist
- pickup
- bundles
- advanced_analytics
- mcp

---

## 19. Admin

Módulos v1:

- Resumen
- Productos
- Pedidos
- Clientes
- Promociones
- Contenido/CMS
- Equipo
- Analytics básico
- Integraciones
- Configuración

Módulos posteriores:

- Loyalty
- AI Product Studio avanzado
- AI Search insights
- Advanced Analytics
- MCP
- B2B/Wholesale avanzado

---

## 20. AI Product Studio

Flujo objetivo:

```text
Camera/Upload
  ↓
Producto + etiqueta + ángulos
  ↓
Vision/OCR
  ↓
Product Draft
  ↓
Image Generation
  ↓
Review
  ↓
Price/Variants/Stock
  ↓
Publish
```

AI puede proponer:

- nombre
- descripción
- categoría
- subcategoría
- color
- género
- atributos
- tags
- SEO
- metadata
- imágenes

AI no debe inventar silenciosamente:

- SKU
- barcode
- stock
- costo
- precio
- impuestos

---

## 21. Search

No usar un LLM completo para cada búsqueda.

Arquitectura objetivo:

```text
query
 ↓
query understanding
 ↓
hybrid retrieval
 ├ keyword
 ├ semantic
 └ filters
 ↓
ranking
```

Búsqueda por imagen se agrega posteriormente con embeddings y similarity search.

Fallback:

- corregir intención cuando sea razonable
- sugerir alternativas
- evitar página vacía sin recomendación

---

## 22. Analytics

Eventos mínimos:

- page_view
- product_view
- search
- search_no_results
- add_to_cart
- remove_from_cart
- begin_checkout
- checkout_completed
- coupon_applied
- wishlist_add

No acoplar analytics a tablas OLTP de forma que impida migrar posteriormente a ClickHouse, BigQuery, Analytics Engine u otra solución.

Métricas prioritarias:

- revenue
- orders
- units
- AOV
- conversion
- add-to-cart rate
- checkout rate
- abandonment
- best sellers
- slow movers
- search terms
- no-result searches
- margin cuando exista costo
- contribution margin cuando existan costos suficientes
- campañas cuando se integren Ads

---

## 23. Clientes y privacidad

No usar IP como identidad fiable de una persona.

Usar:

```text
anonymous_session_id
```

y asociarlo a un cliente cuando exista un evento de identificación legítimo:

- login
- checkout
- email
- teléfono
- cuenta

Separar:

- analytics anónimo
- customer identity
- marketing consent

No disparar outreach sólo porque una IP visitó un producto.

---

## 24. Email

Proveedor inicial:

```text
ResendProvider
```

Eventos:

- welcome
- order_received
- order_confirmed
- order_preparing
- order_shipped
- order_delivered
- password_reset
- back_in_stock cuando exista

Mantener `NotificationProvider` extensible.

---

## 25. OpenAI API vs MCP

### OpenAI API

Se usa cuando la IA vive dentro de Pick Commerce:

- AI Product Studio
- enrichment
- generation
- embeddings
- search understanding
- AI analytics
- Admin Copilot

Modelo BYOK:

- cada tenant agrega su OpenAI API key
- la key se guarda cifrada server-side
- nunca se expone al navegador

### MCP

Se usa cuando el usuario opera Pick Commerce desde ChatGPT.

Ejemplos:

- consultar ventas
- crear producto
- crear colección
- crear promoción
- actualizar contenido
- analizar catálogo
- sincronizar ERP
- consultar stock
- crear campañas cuando exista integración

MCP no necesita la API key del cliente para funcionar desde ChatGPT.

---

## 26. Reglas MCP

MCP nunca debe:

- facturar
- emitir nota de crédito
- realizar reembolsos
- manipular contabilidad
- saltar permisos

MCP debe respetar:

```text
user_id
tenant_id
role
permissions
```

Riesgo por tipo de acción:

### Read

Puede ejecutarse directamente.

### Write bajo riesgo

Puede ejecutarse con audit log según política.

### Write sensible

Usar:

```text
PREVIEW
→ CONFIRM
→ EXECUTE
```

Ejemplos sensibles:

- cambio masivo de precio
- publicar promoción
- publicar campaña
- sync destructivo
- cambio de stock si alguna vez se habilita

Preferir plans:

```text
analyze
→ create_plan
→ preview
→ confirm
→ execute_plan
```

---

## 27. Demos comerciales

Las demos deben usar producción real.

Presets sugeridos:

- fashion.demo
- sport.demo
- wholesale.demo
- hardware.demo

Para prospectos:

```text
prospect-name.demo.pickcommerce...
```

Puede contener:

- logo
- colores
- 10–30 productos
- home
- PDP
- cart
- collections

El checkout puede finalizar en modo demo.

Regla:

> Nunca mostrar una capacidad que no exista en Commerce Core.

---

## 28. Camelot como caso piloto de ERP

Camelot puede usarse como caso real para validar el adapter architecture.

Objetivo:

- no reemplazar inicialmente su ecommerce/ERP actual
- clonar/sincronizar datos en modo controlado
- comparar catálogo, stock, precios y estructura
- detectar diferencias
- validar mappings
- probar rendimiento con catálogo grande
- evitar writes hacia ERP durante las primeras etapas

Primera etapa recomendada:

```text
ERP Camelot
   ↓ read only
Adapter
   ↓
Normalizer
   ↓
Pick Commerce shadow catalog
```

Luego:

```text
diff
reconciliation
test orders
```

Sólo después evaluar writes reales.

---

## 29. Definition of Success — v1

v1 no se considera terminado por cantidad de features.

Se considera listo cuando un retailer piloto puede:

1. cargar/sincronizar catálogo
2. publicar productos
3. navegar y buscar
4. agregar al carrito
5. validar stock
6. pagar
7. crear pedido
8. enviar pedido al ERP cuando corresponda
9. recibir email
10. administrar pedido
11. operar sin inconsistencias críticas

Objetivo de robustez:

> Poder procesar 1.000 pedidos reales sin intervención técnica y sin inconsistencias materiales de stock, pago o ERP.

---

## 30. Fuera de scope v1

- omnichannel inbox
- WhatsApp agents
- refunds
- returns engine
- invoicing
- credit notes
- accounting
- full loyalty engine
- advanced image search
- full MCP write surface
- Meta campaign creation
- advanced CDP
- predictive personalization
- enterprise data warehouse

Pueden existir como prototipos sin bloquear v1.

---

## 31. Reglas para desarrollo futuro

Antes de agregar una feature:

1. ¿Pertenece al Commerce Core?
2. ¿Es responsabilidad del ERP u otro sistema?
3. ¿Se puede resolver mediante adapter?
4. ¿Debe ser feature flag?
5. ¿Crea un fork por industria?
6. ¿Rompe multitenancy?
7. ¿Rompe source of truth?
8. ¿Añade riesgo fiscal o financiero?
9. ¿Se puede demostrar con una demo real?
10. ¿Ayuda directamente a vender, operar o analizar mejor?

Si la feature no supera estas preguntas, registrar la decisión en `DECISIONS.md`.

---

## 32. Regla Core vs código específico del cliente

Una necesidad nueva no debe agregarse automáticamente al Commerce Core.

Clasificación obligatoria:

### A. Feature reutilizable → Core

Agregar al Core cuando:

- puede servir razonablemente a más de un comercio;
- afecta una capacidad de ecommerce, no sólo una campaña puntual;
- puede activarse/desactivarse por configuración;
- puede modelarse sin hardcodear al cliente.

Ejemplos:

- multi-moneda;
- tipo de cambio manual;
- filtros por atributos;
- color linking;
- B2B;
- pickup;
- wishlist.

Debe implementarse como:

- capability;
- feature flag;
- configuration;
- provider/adapter cuando corresponda.

### B. Presentación o comportamiento particular → Storefront override

Mantener en el repo del cliente cuando:

- es una sección visual exclusiva;
- es una campaña puntual;
- es una composición única;
- no cambia contratos de dominio;
- no existe valor claro para otros tenants.

Ejemplo:

- una landing editorial especial;
- una animación exclusiva;
- una sección promocional diseñada sólo para ese cliente.

### C. Requerimiento dudoso → incubar localmente

Si todavía no sabemos si la feature será generalizable:

1. implementarla detrás de una interfaz limpia en el storefront/extension layer;
2. evitar acoplarla al cliente por nombre;
3. observar un segundo caso real;
4. promoverla al Core si demuestra reutilización.

Regla:

> El Core debe crecer por capacidades reutilizables, no por acumulación de excepciones de clientes.

---

## 33. Monedas y tipo de cambio

Multi-moneda es una capacidad reutilizable y pertenece al Core.

Configuración conceptual:

```ts
currency: {
  base: "PYG",
  enabled: true,
  displayCurrencies: ["PYG", "USD"],
  checkoutCurrency: "PYG",
  exchangeRate: {
    mode: "manual", // manual | provider
    value: 7350,
    updatedAt: "...",
  },
  rounding: "commerce-default",
}
```

Casos soportados:

1. Precio base en PYG y mostrar equivalente USD.
2. Precio base en USD y mostrar equivalente PYG.
3. Tipo de cambio ingresado manualmente por el comercio.
4. Futuro provider automático de FX.
5. Reglas de redondeo configurables.

Separar explícitamente:

- moneda de catálogo;
- moneda mostrada;
- moneda de checkout;
- moneda del ERP;
- moneda de settlement del gateway.

Nunca asumir que mostrar USD significa cobrar en USD.

Si el tipo de cambio es manual:

- mostrar fecha/hora de última actualización en Admin;
- permitir cambiarlo por usuario autorizado;
- registrar audit log;
- definir fallback si no existe tasa válida.

---

## 34. Métodos de pago configurables

Los medios de pago son capabilities configurables.

Evitar una proliferación de booleanos hardcodeados como:

```ts
transfer: true;
bancard: true;
```

Preferir configuración declarativa:

```ts
payments: {
  enabled: ["bank_transfer", "bancard"],
  default: "bancard",
}
```

Cada método resuelve a un `PaymentProvider` o a un método interno.

Ejemplos:

- bank_transfer
- bancard
- upay
- pagopar
- dinelco
- cash_on_delivery si alguna operación lo requiere

El checkout sólo muestra métodos:

- habilitados para el tenant;
- válidos para la orden;
- válidos para la ubicación/canal;
- disponibles según health/capabilities del provider.

---

## 35. PLP y filtros facetados

El PLP debe soportar filtros dinámicos y relevantes al conjunto visible.

Prioridad inicial:

1. variante/talla;
2. género;
3. marca;
4. color;
5. categoría/subcategoría;
6. precio;
7. atributos relevantes a la taxonomía actual.

Los filtros deben:

- presentarse en accordion;
- iniciar colapsados salvo decisión explícita del preset;
- mostrar sólo filtros aplicables al resultado actual;
- incluir conteos cuando sea viable;
- no renderizar listas enormes sin límite;
- usar "Ver más" cuando haya muchas opciones;
- actualizar resultados sin full page reload;
- sincronizar estado con URL cuando sea útil;
- permitir compartir/recargar una búsqueda filtrada;
- funcionar correctamente en mobile mediante drawer/sheet.

La definición de atributos de cada categoría debe indicar si un atributo es:

- filterable;
- searchable;
- sortable;
- visible en PDP;
- visible en Product Card.

---

## 36. UX como requisito funcional

La experiencia de usuario es una prioridad de producto, no un refinamiento posterior.

Toda interacción asincrónica debe tener estado perceptible.

Ejemplos obligatorios:

### Add to Cart

- feedback inmediato;
- pending state;
- spinner/progress cuando corresponda;
- prevenir doble submit;
- success feedback;
- error recuperable.

### PLP filtering

- no recargar toda la página;
- mostrar skeleton/progress en el grid;
- mantener controles interactivos;
- evitar layout jumps importantes;
- preservar scroll/contexto razonablemente.

### Admin

- tablas paginadas;
- loaders/skeletons;
- empty states;
- error states;
- confirmaciones sólo en acciones que lo ameriten;
- optimistic UI únicamente cuando sea seguro.

### Acciones

Todo elemento accionable debe:

- comunicar interactividad visualmente;
- usar cursor/pointer cuando corresponda;
- tener focus visible;
- ser usable con teclado;
- tener estados hover/pressed/disabled/loading.

La implementación con shadcn/Base UI debe corregir cualquier primitive que no comunique claramente que es accionable.

Mobile y desktop tienen igual prioridad. No diseñar desktop y "adaptar después".

---

## 37. Motion y experiencias premium

El Core debe permitir animaciones sin hacerlas obligatorias.

Objetivo:

- storefront básico extremadamente liviano;
- storefront premium capaz de experiencias avanzadas.

Soportar, cuando un theme/preset lo requiera:

- CSS/View Transitions para micro-interacciones simples;
- GSAP + ScrollTrigger como opción premium principal sobre Astro/Preact;
- Motion para React sólo dentro de islands React explícitas cuando una experiencia lo justifique;
- ScrollTrigger;
- transitions;
- reveal effects;
- page/section motion.

Reglas:

- no asumir compatibilidad nativa de Motion con Preact: Motion for React requiere React; Astro permite mezclar islands React y Preact cuando se configure explícitamente;
- cargar librerías de motion sólo en páginas/secciones que las usan;
- evitar incluir GSAP/animaciones pesadas en el bundle base;
- respetar `prefers-reduced-motion`;
- no sacrificar interacción, accesibilidad o Core Web Vitals por animación;
- progressive enhancement: el contenido principal debe existir sin animación.

Las animaciones premium pertenecen principalmente al storefront/theme layer salvo que una primitive general sea claramente reusable.

---

## 38. Paginación y carga de datos

No traer colecciones completas cuando el usuario sólo necesita una porción.

### Storefront

- PLP paginado o incremental;
- límite razonable por request;
- filtros y sorting server-side;
- evitar descargar todos los productos para filtrar en navegador;
- prefetch selectivo cuando aporte UX.

### Admin

Paginar siempre conjuntos potencialmente grandes:

- products;
- orders;
- customers;
- promotions;
- discounts;
- audit logs;
- sync logs;
- collections cuando corresponda.

Preferir cursor pagination para datasets grandes/cambiantes cuando sea útil.

Toda query debe contemplar:

- limit;
- cursor/page;
- filters;
- sort;
- tenant scope.

---

## 39. Color linking y familias de producto

El sistema debe poder representar productos relacionados por color u otra dimensión comercial.

Ejemplo:

- Air Force 1 White
- Air Force 1 Black
- Air Force 1 Fuchsia

Dependiendo del ERP, pueden ser:

- variantes del mismo Product;
- Products separados vinculados como una familia.

El Commerce Core debe soportar una relación configurable, por ejemplo:

```text
product_group / sibling_products / color_family
```

Feature conceptual:

```ts
catalog: {
  linkedColors: true;
}
```

Cuando está habilitada:

- Product Card puede mostrar swatches;
- PDP puede mostrar colores relacionados;
- seleccionar un color puede cambiar variante o navegar al sibling Product;
- stock, URL, SKU e imágenes deben corresponder al producto/variante real;
- no fusionar artificialmente SKUs si el ERP los trata como productos independientes.

La UI debe abstraer ambas representaciones para que el usuario perciba una experiencia consistente.

---

## 40. Reglas visuales de presets

Los presets deben evitar una estética genérica repetitiva asociada a templates automáticos.

Evitar como default:

- tracking excesivamente ancho;
- headings en uppercase sin razón de marca;
- exceso de gradients;
- cards idénticas en todos los presets;
- radius exagerado;
- glows decorativos innecesarios;
- jerarquías tipográficas artificialmente uniformes.

Cada preset debe definir:

- intención visual;
- tipografía;
- densidad;
- ritmo;
- tratamiento de imagen;
- navegación;
- cards;
- motion;
- spacing;
- comportamiento mobile.

Los presets son puntos de partida de diseño, no skins superficiales.
