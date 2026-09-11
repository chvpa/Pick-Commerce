# Pick Commerce — ROADMAP.md

> Registro vivo de avance.  
> Este archivo representa **qué está hecho, qué falta y qué puede avanzarse en paralelo**.
>
> Estados:
>
> - `[ ]` TODO
> - `[~]` IN PROGRESS
> - `[x]` DONE
> - `[!]` BLOCKED
> - `[-]` DEFERRED
>
> El porcentaje de cada fase es manual y debe actualizarse al cerrar trabajo relevante.  
> No utilizar el porcentaje como sustituto de los checkboxes.

---

# Resumen

| Versión | Objetivo                                    |      Estado | Avance |
| ------- | ------------------------------------------- | ----------: | -----: |
| v1      | Commerce Core vendible + primer piloto real | IN PROGRESS |    98% |
| v2      | Operación avanzada, AI Commerce y escala    |        TODO |     0% |
| v3      | MCP, intelligence layer y expansión LATAM   |        TODO |     0% |

---

# Reglas del roadmap

- Se puede avanzar una fase futura aunque existan tareas pendientes anteriores si no hay dependencia técnica real.
- Las tareas bloqueadas no detienen todo el roadmap.
- Integraciones específicas pueden desarrollarse como "tracks paralelos".
- Una fase no necesita estar al 100% para comenzar la siguiente.
- No perseguir 100% de cobertura de tests para marcar una fase como usable.
- Registrar decisiones que cambien el alcance en `DECISIONS.md`.
- Cuando una tarea descubra trabajo adicional:
  - si es crítico para correctness → agregarlo a la fase actual;
  - si no bloquea → agregarlo a `Backlog / Retroactividad`;
  - si cambia arquitectura → registrar ADR-lite en `DECISIONS.md`.

---

# v1 — Commerce Core vendible

## Fase 0 — Foundation

**Avance: 100%**

Objetivo: repositorio, tooling, CI y estructura base funcionando.

- [x] Crear monorepo con pnpm workspaces.
- [x] Crear repositorio Git y estrategia básica de branches.
- [x] Configurar TypeScript compartido.
- [x] Configurar ESLint.
- [x] Configurar Prettier si se decide utilizar.
- [x] Configurar Tailwind CSS v4.
- [x] Crear paquetes base `@pick/*`.
- [x] Crear app `admin`.
- [x] Crear storefront demo Astro.
- [x] Configurar variables de entorno y secrets.
- [x] Configurar build local.
- [x] Configurar CI mínimo.
- [x] Configurar deploy inicial a Cloudflare. Deploy por push funcionando desde Workers Builds.
- [x] Crear Supabase project de desarrollo. Proyecto `snnbkqesjiooejaccqhg` creado y verificado (auth responde, publishable y secret key válidas). Las credenciales viven en `.env`, fuera de git.
- [x] Definir migraciones/versionado de schema.
- [x] Confirmar que `CLAUDE.md`, `PROJECT.md`, `ROADMAP.md`, `DECISIONS.md` y `ENGINEERING_HARNESS.md` forman parte del repo.

**Definition of Done**

- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- admin y demo levantan localmente
- deploy mínimo accesible

---

## Fase 1 — Design System y Commerce UI base

**Avance: 100%**

Objetivo: construir los LEGO visuales reutilizables.

- [x] Instalar/configurar shadcn + Base UI en Admin/UI package cuando corresponda. Sólo en el Admin: shadcn es React y `@pick/commerce-ui` es Preact.
- [x] Definir tokens base: color, typography, spacing, radius, container. En `@pick/commerce-ui/tokens.css`, semánticos y CSS-first (ADR-033).
- [x] Crear primitives UI esenciales. `Button` y `Badge`, con las recetas de clases compartidas entre la capa `.astro` y la Preact.
- [x] Crear layout primitives. `Container` con anchos `content`/`wide` por token.
- [x] Crear Header y Footer base. Nav y acciones por slot: el Core no impone categorías.
- [x] Crear Product Card. Composición con slots: Media/Body/Title + badge.
- [x] Crear Product Price. Precio, compare-at tachado accesible y % de descuento.
- [x] Crear Product Image/Gallery base. CSS-only con scroll-snap y miniaturas ancla: cero JavaScript y conserva `astro:assets`.
- [x] Crear Variant Selector. Opciones derivadas de las variantes reales, con disponibilidad condicionada al resto de la selección.
- [x] Crear Quantity Selector. Island Preact, topeado por stock, con `aria-live`.
- [x] Crear Add to Cart. Island con pending/success/error/disabled y doble submit bloqueado por ref (ADR-022).
- [x] Crear Product Grid.
- [x] Crear Product Carousel. Scroll-snap sin JavaScript, como la galería.
- [x] Crear Cart Drawer. `<dialog>` nativo: foco, Escape y backdrop los da el browser.
- [x] Crear Search UI. `<form method="get">` nativo: busca sin JavaScript y deja la consulta en la URL.
- [x] Crear Filter UI. Accordion con `<details>` nativo, counts y "Ver más" anidado, sin JavaScript.
- [x] Crear PLP faceted filters con accordion, counts, URL state y mobile drawer. Server-side sobre ruta on-demand, sin full page reload vía ClientRouter acotado, disclosure mobile sin JavaScript.
- [x] Crear swatches/linked colors UI configurable. El color CSS lo aporta el storefront: el catálogo guarda "Azul", no un hex.
- [x] Crear Hero/Banner.
- [x] Crear Category Section.
- [x] Crear Breadcrumb. Con JSON-LD `BreadcrumbList` y `aria-current`.
- [x] Confirmar support de variants, slots, tokens, props y `className`. Auditado y fijado con un test: 21 componentes `.astro` y 6 islands. Override de tokens verificado sin tocar componentes.

**Definition of Done**

- demo visual muestra una Home, PLP y PDP con componentes reales
- los componentes aceptan customización sin forks
- no existe lógica de negocio hardcodeada al theme

---

## Fase 2 — Storefront Shell

**Avance: 100%**

Objetivo: storefront Astro funcional y rápido.

- [x] Configurar Astro.
- [x] Configurar Preact islands.
- [x] Implementar Home.
- [x] Implementar Collection/PLP.
- [x] Implementar Product/PDP.
- [x] Implementar Search. Form GET nativo, busca en título, marca y SKU.
- [x] Implementar paginación/incremental loading del PLP.
- [x] Evitar full page reload al filtrar/ordenar. ClientRouter acotado a la PLP.
- [x] Implementar Cart. Drawer y página `/carrito`, con el mismo contenido compartido.
- [-] Implementar Checkout shell. Diferido a Fase 5: necesita los contratos de customer, address y order, que hoy habría que inventar.
- [-] Implementar Account shell. Diferido a Fase 5, no a Fase 3: el Auth de Fase 3 es para usuarios del Admin, y la cuenta del storefront necesita el modelo de customer.
- [x] Implementar Policies/FAQ. El FAQ emite `FAQPage`.
- [x] Implementar 404.
- [x] Implementar metadata SEO. Canonical absoluto, Open Graph y Twitter Card.
- [x] Implementar JSON-LD base. Product, ItemList, Organization, BreadcrumbList y FAQPage, generados en el core y testeados.
- [x] Implementar sitemap/robots/canonical. Con política de crawlers de IA por flag y `llms.txt`.
- [x] Definir budgets de performance razonables. 25 KB de JS y 20 KB de CSS por página, gzip, verificado en CI. Desde la Fase 12 lo mide `e2e/performance.spec.ts` sobre la red en vez de `pnpm budget` sobre el disco: al volverse on-demand las últimas páginas prerenderizadas, el build dejó de emitir HTML que medir (ADR-106). El catálogo tiene 28 KB por el `ClientRouter`, declarado.
- [x] Verificar que sólo los componentes interactivos hidratan. Fijado con tests: las páginas de contenido no superan 2 islands y la home no carga ClientRouter.

**Definition of Done**

- navegación real end-to-end con catálogo mock
- storefront usable sin backend completo
- lighthouse/performance baseline registrado

---

## Fase 3 — Multitenancy, Auth y Domain Model

**Avance: 100%**

Objetivo: modelo de datos y autorización confiables.

- [x] Crear organizations.
- [x] Crear stores. Con dominio propio, que es lo que resuelve el tenant.
- [x] Crear locations. Con `erp_location_id` para el mapeo al ERP.
- [x] Crear users/memberships. FK real contra `auth.users`.
- [x] Crear roles/permissions. Permisos como datos, no como comparación de roles.
- [x] Crear feature flags. Por organización o por tienda.
- [x] Crear store settings.
- [x] Configurar Supabase Auth. Login con estados de pending y error, sesión observada desde el adapter.
- [x] Configurar RLS. Todas las tablas cerradas por defecto. Verificado en CI con PGlite y, aparte, contra el proyecto real con JWTs de Supabase Auth.
- [x] Implementar tenant resolution. Normalización de dominio en el core, con tests; la consulta en el adapter.
- [x] Crear audit log base. Sólo lectura desde la app: un registro que el actor puede reescribir no sirve como evidencia.
- [x] Definir Domain Services. Autorización (`can`, `assertCan`, `assertSameTenant`) y contratos de repositorio; los servicios por entidad llegan con Fase 4.
- [x] Evitar acceso directo descontrolado del Admin a tablas sensibles. El Admin no importa `@supabase/supabase-js` y sólo usa la publishable key; la secret key no puede existir en su bundle.

**Definition of Done**

- dos tenants pueden coexistir sin ver datos entre sí
- roles básicos funcionan
- pruebas de aislamiento pasan

---

## Fase 4 — Catalog, Variants e Inventory Mirror

**Avance: 100%**

Objetivo: catálogo universal utilizable.

- [x] Crear Product. Con weight, dimensiones, metadata fiscal y origen por campo.
- [x] Crear Variant. Con `position`: el precio que ve el cliente no puede depender del plan de ejecución.
- [x] Crear SKU/barcode. SKU único por tenant.
- [x] Crear Price/Cost. En unidades mínimas, como el tipo `Money`.
- [x] Modelar currencies/exchange rate manual. En `store_settings`, con `actualizarTasa` puro. Falta la UI (Fase 6).
- [x] Modelar product groups/sibling products para colores relacionados.
- [x] Crear Media. Con `width`/`height` obligatorios, contra CLS.
- [x] Crear Category/Taxonomy. Árbol por `parent_id`.
- [x] Crear Attribute Definitions. Con los cinco flags de PROJECT.md §35.
- [x] Crear Product Attribute Values. `attributes` jsonb en la variante, con índice GIN.
- [x] Crear Collections manuales.
- [x] Crear Dynamic Collections básicas. `rules` tiene la forma de `CatalogFilters`: la resuelve el mismo `catalog_search`.
- [x] Crear stock por location. Se suma al leer, sin materializar.
- [x] Registrar source of truth por campo cuando corresponda. `field_sources` más `assertEditable` en el core.
- [x] Crear status activo/inactivo/archivado. El storefront sólo lee `active`, con test.
- [x] Implementar CRUD Admin. Tabla paginada con búsqueda por SKU, formulario con variantes y stock, y archivado.
- [x] Implementar CSV template. Una fila por variante, agrupadas por handle, con una fila de ejemplo de cada forma.
- [x] Implementar preview y validación de import CSV. Valida el archivo entero sin escribir; cada producto es atómico por separado y el reporte se descarga.
- [x] Implementar export CSV básico. Paginado y con BOM, para que Excel no rompa los acentos.

**Definition of Done**

- [x] se puede representar moda, libro y ferretería sin cambiar schema core — los atributos son `jsonb` por variante y las facetas las declara la tienda
- [x] catálogo importado aparece en storefront — verificado por CSV y desde el Admin, sin redeploy
- [x] variantes y stock funcionan

---

## Fase 5 — Cart, Checkout y Orders

**Avance: 100%**

Objetivo: convertir catálogo en pedidos reales.

- [x] Crear cart service.
- [x] Agregar/quitar/actualizar ítems.
- [x] Validar variantes.
- [x] Validar stock en Add to Cart cuando el provider lo permita.
- [x] Revalidar stock antes de confirmar checkout.
- [x] Crear customer/address mínimo.
- [x] Crear checkout.
- [x] Crear order.
- [x] Crear order items snapshot.
- [x] Crear order status.
- [x] Crear timeline.
- [x] Crear idempotency para creación de pedidos.
- [x] Implementar guest checkout.
- [x] Crear página de confirmación.
- [x] Crear vista Admin de pedidos.
- [x] Crear quick status.

**Fuera de esta fase**

- refunds
- returns
- invoicing
- credit notes

**Definition of Done**

- Playwright smoke: Home → PDP → Cart → Checkout → Order
- no se crea doble order por reintento simple
- stock se vuelve a validar en checkout

---

## Fase 6 — Admin v1

**Avance: 100%**

Objetivo: operación diaria sin tocar base de datos.

- [x] Dashboard Resumen. Ventas, pedidos, ticket promedio, desglose por estado, lo más vendido y últimos pedidos, por período.
- [x] Productos.
- [x] Pedidos.
- [x] Clientes. Listado paginado con agregados de compra y ficha con sus pedidos.
- [-] Promociones básicas. Diferido a Fase 9: lo desbloquea el `Promotion model`, que es de esa fase.
- [-] CMS/Banners. Diferido a Fase 9, por lo mismo: la fase se llama «Promotions y CMS v1».
- [x] Equipo. Ver miembros, cambiar rol y quitar. El alta sigue por `pnpm admin:crear` (ADR-068).
- [x] Roles predeterminados. Cableados en la interfaz con `usePuede`; RLS sigue siendo la autorización.
- [x] Configuración.
- [x] Configuración de métodos de pago habilitados.
- [x] Configuración de moneda/tipo de cambio. Con auditoría en la misma transacción (ADR-069).
- [-] Integraciones. Diferido a Fase 7/8: lo desbloquea el primer provider real. Hoy no hay ninguno que listar.
- [x] Analytics básico. Derivado de los pedidos; el seguimiento de eventos es Fase 10 (ADR-067).
- [x] Búsqueda/filtros.
- [x] Bulk actions prioritarias. Selección múltiple y archivar/desarchivar en lote (ADR-070).
- [x] Estados de loading/error/empty.
- [x] Responsive razonable para tablet/desktop.

**Fuera de esta fase**

- invitaciones por correo desde la interfaz (exige superficie de servidor propia del Admin)
- edición de datos del cliente y export CSV de clientes
- e2e de Playwright del Admin

**Definition of Done**

- operador puede administrar catálogo y pedidos sin herramientas técnicas
- superadmin puede provisionar tenant manualmente — `pnpm tienda:crear`, con runbook en INFRAESTRUCTURA.md

---

## Fase 7 — Payment + Email

**Avance: 100%**

Objetivo: cobro y comunicación transaccional.

- [x] Definir `PaymentProvider`. Contrato completo de PROJECT.md §14, en el core.
- [-] Implementar primer gateway real. Se implementó el contrato y un proveedor **simulado declarado como tal**, que ejercita redirect, webhook firmado, reintento y rechazo. El adapter real espera credenciales de sandbox de un proveedor paraguayo (P-001, ADR-080).
- [x] Verificar webhooks. Firma HMAC verificada antes de mirar el contenido, y scope de tienda comprobado aparte.
- [x] Crear payment status. `failed` sumado al enum; `refunded` no, porque los refunds están fuera del core (ADR-008).
- [x] Manejar retries/idempotency. `record_payment` no escribe nada si el estado ya es el mismo: tres avisos idénticos dejan un solo evento y un solo correo.
- [x] Implementar transferencia bancaria manual. Existía desde Fase 5; acá se validó contra el flujo con pasarela y se dejó sin proveedor a propósito.
- [x] Definir `NotificationProvider`.
- [x] Implementar Resend. Por REST, sin SDK (ADR-081).
- [x] Email order_received.
- [x] Email order_confirmed.
- [x] Email order_shipped/delivered cuando corresponda.
- [x] Password/reset emails. Por Supabase Auth; el SMTP hacia Resend queda como runbook (ADR-083).

**Además, el bloque de medios que el backlog dejó acá**

- [x] Bucket propio con políticas por tenant, subida de archivos desde el Admin y optimización de imágenes efectiva. Cierra P-002 (ADR-082).

**Fuera de esta fase**

- refunds y `refunded` (ADR-008)
- adapter de un gateway real (P-001)
- reintento de pago tras un rechazo
- WhatsApp, y los correos `welcome`, `back_in_stock` y `order_preparing`
- pantalla de Integraciones del Admin, y vista de la cola de correos
- dominio verificado en Resend

**Definition of Done**

- pago sandbox/test pasa end-to-end — smoke de Playwright, aprobado y rechazado
- webhook repetido no duplica efectos — tres avisos idénticos, un evento y un correo; verificado en PGlite y en e2e
- pedido genera notificación esperada — comprobado contra la API real de Resend

---

## Fase 8 — ERP Adapter Architecture + Estilo Sport Shadow Pilot

**Avance: 100% — cerrada**

Objetivo: validar adapters con un ERP real sin poner operación en riesgo.

El piloto pasó de Camelot —apagado, sin fecha— a **Estilo Sport**, que además de
estar accesible es bidireccional: es el bucle operativo, no un clon (ADR-084).
Esta pasada es la **Etapa A**: el ERP entra y nada sale, porque la tienda actual
del cliente sigue viva facturando contra el mismo Oracle (ADR-086).

**Se cierra con la Etapa A completa y la B descartada para este cliente**, que no
da escritura sobre su ERP ni contra un entorno de prueba. El objetivo de la fase
—validar que la arquitectura de adapters aguanta un ERP real— está cumplido: el
puerto vive en el core, el adapter es un paquete aparte, y las tres rarezas que
costaron un ciclo cada una —el ancho fijo de tres caracteres del `cod_talla`, los
lotes que se suman contra los duplicados que no, y los tres códigos en su nivel—
salieron de datos reales y quedaron con test. Lo que sigue pendiente no bloquea
las fases siguientes y está en el backlog: el `healthCheck` que mira la capa
equivocada y la medición a escala, los dos a la espera de que el Oracle responda.

- [x] Definir `ERPAdapter`.
- [x] Definir capability matrix.
- [x] Crear mapper/normalizer.
- [x] Crear validator.
- [x] Crear sync logs.
- [-] Crear healthCheck. Existe, pero **mide la capa equivocada**: pregunta por
  `/health`, que es la vida del proxy, no la de Oracle. Comprobado el
  2026-08-29 a las 16:08 — `/health` devolvió 200 mientras una consulta real
  de stock daba 503 en el mismo minuto. El arreglo es chico pero verificarlo
  exige el Oracle arriba: queda en el backlog.
- [x] Implementar adapter Estilo Sport read-only.
- [x] Mapear catálogo.
- [x] Mapear stock.
- [x] Mapear precios cuando corresponda.
- [-] Mapear locations. **No se puede con este ERP**: el payload no identifica el
  depósito aunque mande una fila por lote. Todo el stock va a una sucursal.
- [x] Crear shadow catalog.
- [x] Crear diff/reconciliation report.
- [-] Medir tiempos con catálogo grande. El bulk entero son 9032 filas en 5,4 s,
  pero sólo se escribieron 100 productos: falta medir la escritura completa.
  Se intentó el 2026-08-29 con un `--dry-run` sin límite y no se pudo: el
  Oracle estaba caído detrás del proxy. Queda en el backlog, y la Fase 12 ya
  tiene su propio «pruebas con catálogo grande» que lo vuelve a pedir.
- [-] Probar delta sync. **No existe en este ERP**: no hay consulta por fecha de
  cambio, así que cada sync trae el catálogo entero.
- [x] Documentar limitaciones del ERP.
- [x] Evaluar si soporta reservations/webhooks. No tiene ninguna de las dos.
- [x] Imágenes de los 100 productos. 129 fotos de 75 productos, copiadas al
      bucket propio y servidas por `/_image`. ADR-088.
- [-] Etapa B — envío de pedidos al ERP. **No se puede con este cliente**: no hay
  permiso de escritura sobre el Oracle de Estilo Sport, ni siquiera contra un
  entorno de prueba. Al motivo de ADR-086 —dos emisores contra un ERP que no
  deduplica— se le suma que el acceso no existe. Lo que la etapa necesita
  queda nombrado en ese ADR y se retoma con el próximo ERP que sí lo dé.

**No bloquear**
Esta fase puede comenzar antes de que v1 esté completa si el acceso al ERP está disponible.

**Definition of Done**

- Pick Commerce puede clonar/sincronizar catálogo real sin escribir en ERP
- diferencias pueden auditarse
- source of truth queda explícito

---

## Fase 9 — Promotions y CMS v1

**Avance: 100% — cerrada**

Objetivo: merchandising real.

Se parte en dos etapas, porque son dos motores distintos: **la A toca dinero y la
B no**. La A está cerrada; la B es el CMS.

**Etapa A — promociones**

- [x] Promotion model. Plano, sin motor de reglas: los casos de esta fase entran
      en columnas. ADR-091.
- [x] percentage discount. En puntos básicos, para que «12,5 %» sea un entero.
- [x] fixed amount.
- [x] minimum cart.
- [x] minimum quantity.
- [-] free shipping. **No hay qué descontar**: verificado contra el schema, no
  existe ningún costo de envío en el sistema —`orders` sólo tiene
  `total_amount`—. Presupone una feature de envíos —zonas, tarifas,
  métodos— que no está en ninguna fase. Se retoma cuando exista.
- [x] coupon. Con tope de uso consumido dentro de la transacción del pedido, que
      es lo que impide que dos compras simultáneas usen el último.
- [x] start/end date. Inicio inclusivo, fin exclusivo, con test en los dos bordes.
- [x] product/category/collection targeting. Los tres en el modelo, el SQL y el
      core. El formulario ofrece catálogo entero, categorías y productos: las
      colecciones no tienen todavía pantalla donde crearse, y apuntar a algo que
      no se puede crear sería una opción muerta. Aparece con el CMS.
- [x] prioridad/stackability mínima. Se recorren por prioridad; la que no combina
      se aplica sólo si no se aplicó ninguna y corta la cadena.
- [x] preview/simulation básica. El formulario dice a cuántos productos alcanza y
      muestra uno de ejemplo con su precio antes y después.

**Etapa B — CMS**

- [x] banners desktop/mobile. Imagen propia para teléfono, opcional: sin ella se
      usa la de escritorio. Dos formas, y el vocabulario quedó fijo en ADR-094:
      el **hero** es la pieza grande de arriba —con varias, un slideshow por
      scroll-snap sin JavaScript— y los **tiles** son los avisos secundarios de
      más abajo, en grilla o carrusel.
- [x] banner links a colección/producto/ruta. `href` es una ruta y no una
      referencia: un banner puede apuntar a una página que no es ninguna de las
      tres. Con `cta_label` la pieza dibuja un botón; sin él, enlaza entera.
- [x] category image/icon. La columna existía desde la Fase 4 y la home ya la
      leía; lo que faltaba era la pantalla, y con ella el alta y edición de
      categorías, que hasta ahora sólo se podían elegir.
- [x] featured/new/best sellers sections. **No son tres mecanismos**: son una
      colección cada una —manual la primera, dinámicas las otras dos con su
      orden—. `newest` y `best-selling` sumados a `CatalogSort` en las dos
      implementaciones, así que la paridad de ADR-055 sigue en pie. ADR-093.
- [x] La portada se compone por **secciones** ordenadas, cada una con su tipo y
      su layout. No estaba en la lista original: apareció al usar lo anterior, y
      corrige el modelo de ADR-093, que servía para los carruseles de productos y
      no para el hero ni los avisos. ADR-094.
- [x] manual/dynamic collections en CMS. Las dinámicas eran lo que ADR-056 dejó
      anticipado y sin implementar: `rules` tiene la forma de `CatalogFilters` y
      la resuelve el mismo `catalog_search`.

**Definition of Done**

- Admin puede crear una campaña de descuento sin código ✅
- storefront refleja promoción correctamente ✅ — precio tachado en PLP y PDP,
  desglose y cupón en el checkout, y el pedido cobra lo que mostraba la grilla

Los dos con su smoke de Playwright, que crea la campaña y la sección desde la
interfaz en vez de afirmar que los botones existen.

---

## Fase 10 — Analytics v1

**Avance: 100%** — Etapa A: la tubería de eventos y lo que sólo ellos pueden
medir. Etapa B: lo que se deriva de los pedidos, más el costo en la línea que lo
hacía posible.

Objetivo: métricas comerciales esenciales.

- [x] Definir event schema.
- [x] page_view.
- [x] product_view.
- [x] search.
- [x] search_no_results.
- [x] add_to_cart.
- [x] begin_checkout.
- [x] checkout_completed.
- [x] coupon_applied.
- [x] Dashboard ventas. Ya estaba desde la Fase 6 (ADR-067).
- [x] AOV. Ídem.
- [x] units.
- [x] conversion básica.
- [x] best sellers. Pasó de un top 5 sin paginar a una tabla con margen y export.
- [x] slow movers básico. Sale del catálogo y trae el stock: sin él, «no se
      vendió» es una curiosidad; con él es cuánta plata está quieta.
- [x] search insights.
- [x] export CSV.
- [x] margen cuando exista costo. `order_items` gana `unit_cost` y
      `create_order` lo copia (ADR-101). **Se informa siempre con su cobertura**: un
      margen sobre cobertura parcial no es un margen. Lo anterior a la migración no
      tiene costo y cuenta como cobertura faltante, que es la verdad.
- [x] abstraer storage para migración futura.
- [-] `wishlist_add` (PROJECT.md §22). No hay wishlist: es v2.
- [-] `remove_from_cart` (PROJECT.md §22). Es el único de los diez sin momento de
  servidor —quitar una línea no habla con nadie— y registrarlo costaría
  JavaScript en el navegador, que es lo que este diseño evita.

**Definition of Done**

- métricas coinciden con orders para una ventana de prueba
- los eventos no bloquean UX del storefront

---

## Fase 11 — OpenAI v1

**Avance: 100%**

Objetivo: AI útil sin volverla requisito del ecommerce.

- [x] BYOK OpenAI por tenant. Tabla `ai_credentials` sin ninguna política, con
      tres funciones `security definer` que verifican `settings.write` (ADR-105).
- [x] Storage cifrado de API key. AES-GCM en el Worker del Admin, que existe
      desde esta fase y sólo para esto (ADR-103). El cifrado protege contra una
      filtración de la base y **no** contra el dueño del comercio; está dicho.
- [x] Test connection. Al guardar y a pedido: una clave se revoca del otro lado
      sin avisar. Usa el listado de modelos, que no consume tokens.
- [x] AI enrichment de producto.
- [x] OCR/vision de etiqueta cuando corresponda. Sobre las fotos que el producto
      **ya tiene**, que están en un bucket público. El flujo de cámara a ficha
      del AI Product Studio (PROJECT.md §20) es otra cosa y es posterior.
- [x] Generación de nombre/description/category/attributes. Tags y SEO no: no
      tienen columna, y el SEO ya se deriva del título y la descripción.
- [x] Human review antes de datos dudosos. Por construcción: el enriquecimiento
      **no escribe nada**, propone y cada campo se aplica a mano (ADR-104).
- [x] Prohibir inventar datos críticos. El esquema estricto no los declara, el
      servidor recorta igual, y el atributo libre se filtra con el mismo
      criterio — que es la puerta de atrás. Con su test.
- [-] Search query understanding básico. PROJECT.md §21 dice explícitamente «no
  usar un LLM completo para cada búsqueda»; además pondría un viaje a OpenAI
  en el camino crítico de la PLP, que tiene presupuesto de performance, y
  obligaría a que el storefront también pudiera descifrar la credencial.
- [-] AI summary de analytics opcional. El propio ROADMAP lo marca opcional. Se
  difiere entero en vez de a medias.

**Definition of Done**

- [x] un tenant sin OpenAI sigue funcionando normalmente — con su e2e: el botón
      está, explica qué falta y enlaza a Configuración
- [x] un tenant con key puede enriquecer un producto
- [x] secrets no aparecen en frontend/logs — la key nunca vuelve al navegador y
      de ella sólo se muestran cuatro caracteres; la auditoría registra qué pasó
      y nunca el ciphertext

---

## Fase 12 — Demo + Pilot Hardening

**Avance: 90%**

Objetivo: vender y operar el primer piloto.

- [-] Crear preset Blank.
- [-] Crear preset Fashion.
- [-] Crear preset Sport o Wholesale.
  Los tres se difieren a v1.1 por decisión de scope. Los tokens ya están
  construidos para recibirlos —un preset redefine variables, no clases— así
  que la deuda es de diseño y no de arquitectura. Un preset que falta es una
  demo que se ve como la actual, que está diseñada a propósito (ADR-027); lo
  que sí bloqueaba plata era el envío, y ése entró.
- [x] Crear demo real. Corre en producción con `pnpm seed`, y desde esta fase
      **se anuncia con el nombre de su tienda** y no con una constante (ADR-106).
- [x] Crear seed data. `pnpm seed` y `pnpm seed:dummy`, que ahora sintetiza por
      encima de los 194 de dummyjson para poder medir con catálogo grande.
- [x] Crear modo checkout demo. El pedido se crea y se ve en el Admin, marcado, y
      no dispara correos (ADR-108).
- [x] Crear checklist de onboarding. `ONBOARDING.md`.
- [x] Crear observability básica. Los dos Workers tienen `observability`, y un
      workflow pide el sitio cada 15 minutos y abre un issue si no responde.
- [-] Crear error tracking. Sentry es un proveedor fuera del stack cerrado y su
  SDK de navegador solo supera el presupuesto entero del storefront. Lo que
  cubriría del lado del servidor ya lo da la observabilidad de Cloudflare.
- [~] Crear backups/restore procedure. Los backups automáticos del proyecto
  existen; **el restore no se ejerció nunca**, así que el tiempo de
  recuperación es desconocido. Anotado en `LIMITACIONES.md`.
- [x] Revisar RLS. `pnpm rls:verificar` lo automatiza con **sesiones reales**, que
      es la capa que la suite de PGlite no toca. Cierra el ítem del backlog que
      decía que esa verificación era manual.
- [x] Revisar webhooks/idempotency. La suite cubre firma adulterada, webhook
      repetido y reintento con la misma clave de idempotencia.
- [x] Ejecutar Playwright critical path.
- [x] Ejecutar pruebas con catálogo grande. Con 5000 productos el listado del
      catálogo tardaba 2,3 segundos —y casi 4 en la página 100— mientras el Admin
      entero se mantenía por debajo de 140 ms. **Arreglado**: 233 ms en la
      primera página y 229 en la 100, o sea plano. El diagnóstico anotado al
      cerrar la fase cubría la mitad del problema; quedó corregido en el backlog.
- [x] Registrar known limitations. `LIMITACIONES.md`.
- [~] Procesar piloto real. **En curso con Treeshop**: la app existe, el
  catálogo de Camelot está importado y la portada se administra desde el
  Admin. Falta el envío por departamento, el arte del hero y de las marcas,
  y el despliegue en `sontres.shop`. El detalle vive en el backlog con la
  etiqueta Treeshop.

**Definition of Done**

- [x] un prospecto puede probar una demo 100% basada en Commerce Core
- [x] primer retailer puede operar sin intervención técnica constante. Con 5006
      productos la vitrina responde en 231 ms del lado de la base y la página
      entera sale en 0,4 s sobre la red

---

# v2 — Operación avanzada y AI Commerce

## Fase 0 — Multi-location avanzado

**Avance: 0%**

- [ ] inventory allocation
- [ ] pickup por sucursal
- [ ] fulfillment routing
- [ ] stock visibility rules
- [ ] capability-based ERP reservations
- [ ] inventory reconciliation avanzado

---

## Fase 1 — Wholesale / B2B

**Avance: 0%**

- [ ] MOQ.
- [ ] case packs.
- [ ] quantity breaks.
- [ ] customer-specific pricing.
- [ ] wholesale customer groups.
- [ ] bulk ordering.
- [ ] minimum order rules.

---

## Fase 2 — AI Product Studio

**Avance: 0%**

- [ ] mobile camera flow.
- [ ] multi-angle upload.
- [ ] label capture.
- [ ] barcode/OCR.
- [ ] product draft.
- [ ] batch image generation.
- [ ] background presets.
- [ ] shadow/no-shadow.
- [ ] model/editorial outputs.
- [ ] review/approve/regenerate.
- [ ] publish flow.

---

## Fase 3 — Search avanzado

**Avance: 0%**

- [ ] hybrid keyword + vector search.
- [ ] ranking.
- [ ] typo handling.
- [ ] semantic fallback.
- [ ] recommendations.
- [ ] recently viewed.
- [ ] cart recommendations.
- [ ] image search prototype.

---

## Fase 4 — Loyalty

**Avance: 0%**

- [ ] points ledger.
- [ ] earn rules.
- [ ] redemption rules.
- [ ] tiers.
- [ ] birthday rewards.
- [ ] coupons/rewards.
- [ ] enable/disable per tenant.

---

## Fase 5 — Advanced Analytics

**Avance: 0%**

- [ ] contribution margin.
- [ ] cohort analysis.
- [ ] RFM.
- [ ] product profitability.
- [ ] inventory aging.
- [ ] Meta Ads integration.
- [ ] Google Ads integration.
- [ ] ROAS/MER.
- [ ] AI business summary.

---

# v3 — Intelligence Layer y MCP

## Fase 0 — Internal Commerce Tools

**Avance: 0%**

Objetivo: exponer servicios de dominio como tools reutilizables.

- [ ] read tools.
- [ ] write-low-risk tools.
- [ ] write-sensitive actions.
- [ ] policy enforcement.
- [ ] audit logs.
- [ ] plans/previews.
- [ ] confirm/execute flow.

---

## Fase 1 — MCP Server

**Avance: 0%**

- [ ] authentication.
- [ ] tenant scoping.
- [ ] RBAC.
- [ ] product tools.
- [ ] order read tools.
- [ ] promotion tools.
- [ ] collection tools.
- [ ] analytics tools.
- [ ] ERP sync tools.
- [ ] catalog audit tools.
- [ ] no fiscal/refund tools.
- [ ] rate limits.
- [ ] prompt injection/security review.

---

## Fase 2 — Admin AI Copilot

**Avance: 0%**

- [ ] reutilizar tools del Commerce Core.
- [ ] OpenAI API.
- [ ] conversational analytics.
- [ ] create drafts.
- [ ] promotion plans.
- [ ] catalog actions.
- [ ] approval workflow.

---

## Fase 3 — Campaign Intelligence

**Avance: 0%**

- [ ] Meta campaign read.
- [ ] campaign recommendations.
- [ ] draft campaigns.
- [ ] preview.
- [ ] explicit confirmation.
- [ ] write integration cuando esté suficientemente madura.

---

# Tracks paralelos

Estas líneas de trabajo pueden avanzar independientemente cuando exista acceso o valor inmediato.

## ERP — Estilo Sport (Oracle ORDS)

**Avance: 70%**

- [x] obtener documentación/acceso.
- [x] mapear endpoints/files.
- [x] clone read-only.
- [x] diff.
- [-] sync strategy. Manual por ahora: automatizarla exige que el Worker alcance
  el proxy, que hoy no puede (ADR-085).
- [ ] benchmark catálogo grande.

## ERP — Camelot

**Avance: 0%** — apagado. Cuando vuelva sirve como **segundo** ERP, que es el
caso que prueba de verdad si el contrato abstrae (ADR-084).

- [ ] obtener documentación/acceso.
- [ ] mapear endpoints/files.
- [ ] clone read-only.

## Payment — Paraguay

**Avance: 0%**

- [ ] Bancard.
- [ ] uPay.
- [ ] Pagopar.
- [ ] Dinelco.
- [ ] transferencia.

## Demos

**Avance: 0%**

- [ ] Fashion.
- [ ] Sport.
- [ ] Wholesale.
- [ ] Hardware.
- [ ] demo personalizada para prospecto.

---

# Backlog / Retroactividad

> Registrar aquí descubrimientos que no deben interrumpir la fase actual.

| Fecha      | Hallazgo                                                                                       | Impacto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Acción                                                                                                                                                                                                                                                                                                                          | Fase destino | Estado    |
| ---------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| 2026-08-29 | El ERP modela cada color como un producto distinto                                             | Medido sobre las 9032 filas: 457 modelos aparecen como códigos separados que sólo difieren en el color, y el peor caso llega a 52. Importados tal cual, la PLP muestra 52 mochilas casi idénticas en vez de una con swatches                                                                                                                                                                                                                                                                                      | Es el caso que `product_groups` anticipó (ADR-026). Agruparlos exige inferir el modelo del nombre, que es texto libre: se decide con el bloque de Linked Colors, no por heurística improvisada                                                                                                                                  | Fase 9       | Pendiente |
| 2026-08-29 | Abrir el menú de usuario o el selector de tiendas rompía el Admin                              | `DropdownMenuLabel` es un `Menu.GroupLabel` de Base UI y fuera de su `Menu.Group` lanza en vez de degradarse. No se podía cerrar sesión ni cambiar de tienda. Estaba así desde Fase 6: el selector no daba la cara porque con una sola tienda dibuja una variante inerte, y apareció al existir una segunda organización. En producción el mensaje llega minificado —«Base UI error #31»— y no apunta a la causa                                                                                                  | El rótulo va dentro del grupo en los dos lugares, que además deja el menú con `role="group"` y su `aria-labelledby`. Cubierto por el smoke nuevo del Admin, verificado con sabotaje. ADR-087                                                                                                                                    | Fase 8       | Resuelto  |
| 2026-08-29 | En mobile el sidebar tapaba la sección a la que acababas de entrar                             | El sheet no se cerraba al navegar: la pantalla nueva quedaba detrás del menú y, como un sheet modal marca el resto de la página `aria-hidden`, un lector de pantalla tampoco llegaba al contenido. Lo encontró el smoke del Admin al escribirlo, no una revisión                                                                                                                                                                                                                                                  | Se cierra al tocar una sección. En desktop no hay sheet y no cambia nada. ADR-087                                                                                                                                                                                                                                               | Fase 8       | Resuelto  |
| 2026-08-29 | El CI construía el Admin sin su configuración                                                  | El workflow exportaba `SUPABASE_*` pero no las `VITE_*` que el Admin hornea al construir, así que `pnpm build` producía un bundle que arranca en «falta configuración». Nadie se enteraba porque nada probaba el Admin                                                                                                                                                                                                                                                                                            | El workflow exporta las dos variables. El smoke nuevo lo habría detectado igual: sin ellas no llega ni al login                                                                                                                                                                                                                 | Fase 8       | Resuelto  |
| 2026-08-29 | El selector de tiendas no tiene buscador ni tope                                               | `mias()` no lleva `limit` y el desplegable dibuja todas. No escala con la cantidad de tenants —RLS acota a las tiendas del usuario, y el dueño de un comercio ve una— pero sí con una cuenta interna de soporte con muchas membresías, donde además PostgREST cortaría en su máximo de filas sin avisar                                                                                                                                                                                                           | No se construye hoy: no existe esa cuenta y sería abstraer sin caso. Disparador concreto: la primera cuenta que pase de ~20 organizaciones necesita buscador y paginación                                                                                                                                                       | Fase 12      | Pendiente |
| 2026-08-29 | El SKU, el código del ERP y el de barra estaban mezclados                                      | La Fase 8 puso el código del ERP en el producto y usó el código de barras como SKU de la variante. Son tres cosas distintas: el SKU es del modelo, el interno es del ERP del comercio y el de barra es del proveedor. Mezclarlos se paga al facturar, porque el ERP espera recibir el suyo y le mandaríamos otro                                                                                                                                                                                                  | `products.sku` para el modelo y `product_variants.internal_code` para el del ERP, y ninguno de los dos últimos con unicidad: hay ERPs que los repiten en todo el modelo. ADR-089                                                                                                                                                | Fase 8       | Resuelto  |
| 2026-08-29 | Siete variantes venían duplicadas y el importador les sumaba el stock                          | El ERP trae la misma variante dos veces con códigos distintos —`CCOB001` contra `ccob001`, `lt-005` contra `lt'005`, dos EAN para la misma zapatilla— y las dos filas con el mismo número de unidades. La agregación por código de barras las sumaba: el catálogo habría publicado el doble del stock que existe                                                                                                                                                                                                  | Se distingue el lote —mismo artículo, se suma— del duplicado de carga —artículos distintos, gana el primero y el resto se reporta—. El arreglo de fondo va en el ERP del cliente. ADR-089                                                                                                                                       | Fase 8       | Resuelto  |
| 2026-08-29 | Las fotos del catálogo salían recortadas                                                       | `object-cover` en una caja 3:4 contra packshots de proveedor, cuyas proporciones van de 0,32 a 2,89. De una riñonera apaisada se veía la franja del medio. No se notaba antes porque las fotos del seed miden exactamente 0,75                                                                                                                                                                                                                                                                                    | Token `--fit-product` con `contain` por defecto, que nunca destruye una foto; `cover` queda para quien tenga su fotografía bajo control. También en la galería del PDP. ADR-090                                                                                                                                                 | Fase 8       | Resuelto  |
| 2026-08-29 | El breadcrumb del PDP decía «Catálogo» y llevaba al home                                       | El rótulo y el destino no coincidían: el `href` apuntaba a la raíz en vez de a `/catalogo`                                                                                                                                                                                                                                                                                                                                                                                                                        | Corregido                                                                                                                                                                                                                                                                                                                       | Fase 8       | Resuelto  |
| 2026-08-29 | Borré el catálogo para reimportarlo y el ERP se cayó justo entonces                            | Reescribiendo el mapeo de códigos hacía falta reimportar, así que borré los 100 productos antes de confirmar que el origen respondía. El ORDS dejó de responder en ese momento y la tienda quedó vacía sin forma de restituirla                                                                                                                                                                                                                                                                                   | Restituida desde una captura del payload. El importador ganó `--desde`, que reprocesa una captura sin golpear el ERP y además sirve para iterar sobre el mapeo. La lección es anterior: confirmar que el origen responde antes de borrar el destino                                                                             | Fase 8       | Resuelto  |
| 2026-08-29 | Los handles del catálogo del ERP salían con mayúsculas                                         | Al pasar el SKU al handle lo pegué crudo, y los códigos de modelo vienen en mayúsculas: 68 de 100 URLs quedaron sensibles a mayúsculas. `/productos/…-dv9315010` daba 404 mientras `…-DV9315010` funcionaba, y un buscador las trata como dos páginas distintas                                                                                                                                                                                                                                                   | El `slug` se aplica al conjunto, no sólo al título. Los 100 existentes se normalizaron: nada los enlazaba todavía                                                                                                                                                                                                               | Fase 8       | Resuelto  |
| 2026-08-29 | El storefront anuncia «Pick Demo» sirva la tienda que sirva                                    | `storeName` está fijo en `apps/demo/src/lib/store-config.ts` con un comentario que dice que en Fase 3 pasaría a leerse de la base; estamos en la 8. El storefront de Estilo Sport muestra «Pick Demo» en el encabezado y en el `<title>` de todas sus páginas, que además es lo que indexa un buscador. `ResolucionTenant` ya trae el `name` de la tienda, así que el dato está                                                                                                                                   | Resuelto: sale de `stores.name`, y el título lo compone el layout — estaba escrito a mano en nueve páginas, no en una constante. Con test que lo prueba contra un nombre que no existe en el código (ADR-106)                                                                                                                   | Fase 12      | Resuelto  |
| 2026-08-29 | El carrito mostraba el precio de lista mientras el catálogo mostraba el rebajado               | Lo introduje yo al conectar las promociones al catálogo: la PLP decía 120.000 con un 20 % activo, el carrito 150.000 porque leía `product_variants.price` a secas, y `create_order` cobraba 120.000. Tres números para lo mismo, y el del medio es el que el comprador mira antes de decidir                                                                                                                                                                                                                      | El endpoint del carrito dejó de sumar por su cuenta y toma el dinero de `cart_promotions`, la misma función que usa el pedido. Un solo cálculo no puede divergir de sí mismo. ADR-092                                                                                                                                           | Fase 9       | Resuelto  |
| 2026-08-29 | El comentario que justificaba `numeric` en vez de float estaba equivocado                      | Decía que era por pérdida de precisión. El sabotaje lo desmintió: con float pasaba igual. El motivo real es que `round(float8)` de Postgres redondea al par y `round(numeric)` se aleja del cero, como `Math.round` del core. Además destapó que el escenario de paridad no tenía ningún caso que cayera justo en la mitad, así que no probaba nada                                                                                                                                                               | Comprobado con las dos formas sobre los mismos valores antes de reescribirlo, y el escenario cambiado por un precio cuyo descuento cae en 13.498,5. ADR-091                                                                                                                                                                     | Fase 9       | Resuelto  |
| 2026-08-29 | Di la sección de promociones por terminada sin desplegar el Admin                              | El storefront sale a producción con cada push, pero el Admin no tiene Workers Builds y se despliega a mano. Build, typecheck y Playwright estaban en verde —los tres corren contra el local—, así que nada avisó: la pantalla existía en el repo y no para quien la iba a usar. Lo encontró el usuario, no la verificación                                                                                                                                                                                        | Desplegado y comprobado sobre el bundle en línea. La regla quedó en `CLAUDE.md`, junto a las otras de verificación. El arreglo de fondo es darle Workers Builds al Admin, que INFRAESTRUCTURA §10 ya lista como pendiente                                                                                                       | Fase 9       | Resuelto  |
| 2026-08-29 | Nueve borrados sin confirmación o con el `confirm()` del navegador                             | Tres borraban de un clic —secciones, piezas, colecciones— y seis usaban `window.confirm`: bloqueante, sin estilo, sin foco gestionado, y silenciable por el navegador, que en ese caso ejecuta la acción sin preguntar. Lo pidió el usuario y la auditoría encontró el doble de casos de los que se veían                                                                                                                                                                                                         | `AlertDialog` de Base UI, que no cierra con Escape ni con un clic afuera, en un componente compartido. La versión controlada existe porque dos de los casos los dispara un interruptor y un `select`, no un botón. ADR-096                                                                                                      | Fase 9       | Resuelto  |
| 2026-08-29 | La posición de una sección se escribía como número                                             | Para poner un bloque arriba de otro había que abrir los dos, mirar sus números y elegir uno intermedio: una idea espacial traducida a aritmética por la persona equivocada                                                                                                                                                                                                                                                                                                                                        | Flechas en la lista y la posición derivada del orden, renumerando desde cero. Se descartó arrastrar-y-soltar: exige un ADR por la librería y no funciona con teclado sin construir igual estos botones. ADR-096                                                                                                                 | Fase 9       | Resuelto  |
| 2026-08-29 | Desde una pantalla de edición no había forma de volver                                         | Editar una colección, una sección o una promoción dejaba sin salida salvo el botón del navegador, que en mobile ni está a la vista                                                                                                                                                                                                                                                                                                                                                                                | Migas de pan derivadas de la ruta, con reglas declaradas y no partiendo la URL en segmentos: no todo segmento es un nivel navegable, y unas migas que llevan a un 404 son peores que ninguna. ADR-096, corregido por ADR-098 —que convirtió `/contenido/colecciones` en pantalla real y sacó el nivel «Contenido» de las migas— | Fase 9       | Resuelto  |
| 2026-08-29 | Tres campos numéricos rechazaban sin decir nada                                                | El esquema convertía con `Number()` **antes** de validar, así que un texto se volvía `NaN` y el mensaje hablaba de cero; y `minSubtotal`, `minQuantity` y `priority` ni siquiera renderizaban su error, así que guardar no hacía nada sin explicar por qué                                                                                                                                                                                                                                                        | Se valida el texto tal como se escribió, con mensajes que hablan de puntos y comas. El componente `Campo` trae el error adentro: dejar de mostrarlo deja de ser algo que uno pueda olvidarse. Diez tests y su sabotaje                                                                                                          | Fase 9       | Resuelto  |
| 2026-08-29 | Un `update` filtrado por RLS se veía como un éxito                                             | `reordenar` no comprobaba cuántas filas tocaba, y PostgREST devuelve éxito con cero filas cuando RLS filtra. Un reordenamiento sin permiso parecía funcionar hasta recargar, sin ningún error en ninguna parte                                                                                                                                                                                                                                                                                                    | Se exige que haya tocado exactamente una fila. Es un patrón a repetir en cualquier update que dependa de una política                                                                                                                                                                                                           | Fase 9       | Resuelto  |
| 2026-08-29 | Un test culpaba al reordenamiento, que funcionaba                                              | `click()` de Playwright vuelve apenas despacha el clic, y el `page.reload()` inmediato abortaba la petición en vuelo. El test falló tres veces y el código estaba bien; se comprobó llamando al repositorio contra la base                                                                                                                                                                                                                                                                                        | Se espera a que la pantalla lo refleje y recién después se recarga, lo que además separa dos afirmaciones: que cambió, y que quedó guardado                                                                                                                                                                                     | Fase 9       | Resuelto  |
| 2026-08-29 | Pick Demo tenía dos secciones de categorías                                                    | La migración creó una para cada tienda que tuviera categorías, y el seed que se agregó después creó otra con id fijo. Apareció al leer la salida de una prueba de reordenamiento, no por un fallo                                                                                                                                                                                                                                                                                                                 | Borrada la de la migración en la tienda de la demo, que es la única donde el seed manda. Queda como recordatorio de que una migración que siembra y un seed que siembra lo mismo se pisan                                                                                                                                       | Fase 9       | Resuelto  |
| 2026-08-29 | Cambiar de tienda no cerraba el formulario abierto                                             | Con un editor de contenido abierto, cambiar de tienda dejaba el formulario mostrando el registro de la anterior sobre una lista ya actualizada —las consultas sí llevan el id de la tienda en su clave— y guardarlo lo habría escrito en la tienda nueva. Lo reportó el usuario; leyendo el código parecía imposible, y se encontró reproduciéndolo con Playwright                                                                                                                                                | `key={tienda.id}` en el `Outlet` del Admin: la pantalla se remonta y su estado local se va con ella. Va en la cáscara y no pantalla por pantalla porque el riesgo es de todas. ADR-095                                                                                                                                          | Fase 9       | Resuelto  |
| 2026-08-29 | La home se quedó sin `h1` al sacar el hero fijo                                                | Los títulos de las secciones son `h2` y deben seguir siéndolo, así que la portada quedó sin encabezado: sin título para un lector de pantalla y para un buscador. Lo agarró el smoke de navegación, que afirmaba sobre el texto del hero viejo                                                                                                                                                                                                                                                                    | `h1` oculto con el nombre de la tienda, y el smoke pasa a exigir **exactamente uno** sin mirar su texto: el copy de la portada lo decide el comercio y cambiarlo no puede ser una regresión                                                                                                                                     | Fase 9       | Resuelto  |
| 2026-08-29 | «Banner» nombraba dos cosas distintas                                                          | La barra de anuncio, el hero y los mosaicos se llamaban todos «banner», así que no había forma de pedir uno sin el otro: se entregó el bloque de avisos creyendo que era el banner principal                                                                                                                                                                                                                                                                                                                      | Vocabulario fijado en ADR-094 —hero, slide, tiles, sections— con los términos de la industria, y el componente de la barra renombrado a `AnnouncementBar`                                                                                                                                                                       | Fase 9       | Resuelto  |
| 2026-08-29 | El test de la firma adulterada pasaba por suerte un 6 % de las veces                           | Adulteraba el **último** carácter de la firma, y ahí sobran dos bits: `A`, `B`, `C` y `D` decodifican a los mismos 32 bytes. Cuando el token terminaba en uno de esos, el «adulterado» era el mismo token y el webhook lo aceptaba con razón. Apareció como un fallo intermitente en una corrida de la Fase 9, sin relación con lo que se estaba tocando                                                                                                                                                          | Se adultera el primer carácter de la firma, que siempre cambia los bytes, y se afirma que el token cambió antes de mandarlo. La proporción está medida, no estimada. El verificador no se toca: acepta base64 no canónico, pero eso no permite forjar una firma que no se conozca                                               | Fase 7       | Resuelto  |
| 2026-08-29 | Las funciones nuevas del schema `app` no tenían grant                                          | El `grant execute on all functions in schema app` de la Fase 3 es una foto del momento y no alcanza a las creadas después; `service_role` además nunca tuvo `usage` sobre ese schema. El síntoma aparecía al crear un pedido, no al aplicar la migración                                                                                                                                                                                                                                                          | Grant explícito por función. Queda como precedente: en este repo, una función nueva de `app` lleva su grant al lado                                                                                                                                                                                                             | Fase 9       | Resuelto  |
| 2026-08-29 | No existe ningún costo de envío en el sistema                                                  | `orders` guarda `total_amount` y nada de envío, así que el `free shipping` de la Fase 9 no tiene qué descontar. PROJECT.md §13 sí lo pide entre lo que el pedido debe conservar                                                                                                                                                                                                                                                                                                                                   | Resuelto: tarifa plana y umbral de envío gratis, calculados en el servidor y guardados en `orders.shipping_amount` (ADR-107)                                                                                                                                                                                                    | Fase 12      | Resuelto  |
| 2026-08-29 | Falta medir la escritura del importador a escala real                                          | Del bulk se sabe la lectura —9032 filas en 5,4 s— pero sólo se escribieron 100 productos. Cuánto tarda el catálogo entero, y si conviene subir el lote de 200, sigue sin medirse. Se intentó con un `--dry-run` sin límite el 2026-08-29 y el Oracle estaba caído                                                                                                                                                                                                                                                 | Repetir el `--dry-run` sin límite cuando el ERP responda, y una escritura completa contra una tienda descartable. La Fase 12 lo vuelve a pedir en «pruebas con catálogo grande»                                                                                                                                                 | Fase 8       | Pendiente |
| 2026-08-29 | El `healthCheck` del adapter mira la vida del proxy, no la del ERP                             | `healthCheck()` pregunta por `/health`, la única ruta sin auth del proxy, que responde por sí misma y no toca Oracle. El 2026-08-29 devolvió 200 mientras una consulta real de stock daba 503 `ECONNABORTED` en el mismo minuto. Un sync programado lo consultaría, lo vería verde y saldría a sincronizar contra un ERP caído                                                                                                                                                                                    | Que la comprobación recorra el camino real —una consulta de stock por artículo, con timeout corto— y que el resultado distinga las dos capas en vez de colapsarlas en un booleano. Verificarlo exige el Oracle arriba: hoy sólo se puede comprobar la mitad negativa                                                            | Fase 8       | Pendiente |
| 2026-08-29 | El Admin no tenía un idioma visual común                                                       | Cada pantalla se armó por su cuenta: el título vivía en la barra de arriba mientras el contenido empezaba sin contexto, la acción principal aparecía donde le quedara a cada una, la paginación estaba escrita cuatro veces —una ya con otro espaciado—, el mismo `<select>` existía con tres alturas y la caja de error estaba copiada en diez lugares                                                                                                                                                           | Resuelto: `components/pagina.tsx` con la distribución de Shopify, y las piezas repetidas unificadas (ADR-097)                                                                                                                                                                                                                   | Fase 9       | Resuelto  |
| 2026-08-29 | Dos componentes `Campo` distintos en el Admin                                                  | El compartido pide `id` y usa `htmlFor`; el del formulario de producto envuelve el control en el `<label>` porque sus campos vienen de `register()` sin id. Tipográficamente ya son idénticos, así que la duplicación no se ve — pero es un lugar donde el próximo arreglo de accesibilidad puede no llegar                                                                                                                                                                                                       | Unificar cuando haya que tocar la accesibilidad de los formularios: exige inventar un id por campo en `FormularioProducto` para no cambiar nada de lo que se ve hoy                                                                                                                                                             | v1.1         | Pendiente |
| 2026-08-29 | El smoke del carrito vacío falló una vez y no se pudo reproducir                               | Tras confirmar un pedido, `/carrito` debe decir «Tu carrito está vacío». En una corrida completa falló dos veces —en tests distintos— y en aislamiento pasa 3/3, igual que la corrida completa siguiente. `clear()` es una escritura síncrona a `localStorage` anterior al `location.assign`, así que la hipótesis obvia no explica la intermitencia                                                                                                                                                              | Instrumentar el test para volcar el `localStorage` al fallar, en vez de adivinar. Es un camino de dinero: la falla del test puede estar señalando un carrito que no se vacía                                                                                                                                                    | v1.1         | Pendiente |
| 2026-08-29 | `abrirSidebar` del smoke se colgaba con el sheet ya abierto                                    | Daba por hecho que en mobile el menú estaba cerrado y esperaba a que desapareciera. Era cierto mientras toda entrada del sidebar navegaba; con «Contenido» como disclosure dejó de serlo y siete tests de mobile se quedaron esperando 30 s. La suposición estaba escrita en un comentario, no en una aserción                                                                                                                                                                                                    | Resuelto: distingue abierto de cerrándose por `data-ending-style`, el atributo que Base UI marca mientras el panel se va (ADR-098)                                                                                                                                                                                              | Fase 9       | Resuelto  |
| 2026-08-29 | El compilador de React no está activo, y hay comentarios que dan a entender que sí             | `@vitejs/plugin-react` 6.1.0 trae `compiler` en `false` por defecto y `apps/admin/vite.config.ts` lo usa pelado; `oxc-transform-react` ni siquiera está instalado, así que no podría correr aunque se prendiera el flag. Verificado sobre el artefacto: cero ocurrencias de `compiler-runtime` y del idiom `c[0]!==` en los 69 chunks del build. Lo que sí está activo es el **lint** `react-hooks` v7, que avisa igual y hace parecer que el compilador corre. El comentario de `ListaProductos` lo da por hecho | Decidir: o se activa —y entonces medir— o se corrigen los comentarios que lo suponen. Mientras tanto, no omitir `useMemo`/`useCallback` confiando en él                                                                                                                                                                         | v1.1         | Pendiente |
| 2026-08-29 | Colapsar la barra con el foco dentro del submenú deja el foco en el `body`                     | Ctrl/Cmd+B con el foco en «Colecciones»: el `<ul>` pasa a `display:none` y el navegador suelta el foco. Medido en Chromium: **no** es un fallo de orden de foco —el siguiente Tab va a «Clientes», que es donde correspondía— pero se pierde el anillo de foco hasta ese Tab. La APG devuelve el foco al botón del grupo                                                                                                                                                                                          | Devolver el foco al disparador cuando el submenú deja de verse, si alguna vez molesta. No se hizo ahora: es una pérdida transitoria sobre un elemento que la persona acaba de pedir ocultar, y el arreglo mete un ref y un efecto por eso solo                                                                                  | v1.1         | Pendiente |
| 2026-08-30 | Después de comprar, el carrito volvía a llenarse                                               | El checkout revalida contra el servidor y escribe la respuesta con `replaceLines`; al confirmar llama a `clear()` y navega, pero una revalidación en vuelo resolvía **después** y reescribía el carrito de antes. El comprador llegaba a la confirmación con el pedido hecho y el carrito lleno, listo para comprar lo mismo de nuevo. Es del camino de dinero y era intermitente: la primera vez se anotó como flake sin causa                                                                                   | Resuelto: `replaceLines` no escribe sobre un carrito vacío. La guarda va en el store —donde está la escritura— y cubre además el caso de dos pestañas. Con test determinista y su sabotaje (ADR-100)                                                                                                                            | Fase 10      | Resuelto  |
| 2026-08-30 | El prefetch global del `ClientRouter` nunca se decidió                                         | Llegó por defecto al montar view transitions en la PLP: `prefetchAll` con estrategia hover a 80 ms, o sea un GET real al Worker por cada enlace que el mouse roce. Contradice PROJECT.md §1401, que pide «prefetch selectivo cuando aporte UX». Analytics lo descarta por cabecera, así que la medición ya no miente, pero el tráfico sigue                                                                                                                                                                       | Decidir si se deja, se acota a los enlaces que valen o se apaga, y registrarlo. Hoy nadie eligió esto                                                                                                                                                                                                                           | v1.1         | Pendiente |
| 2026-08-30 | El residuo de precarga de Safari no se puede descartar                                         | Chrome manda `Sec-Purpose: prefetch` y Firefox `X-moz`, pero el fallback de Safari usa un `fetch()` sin ninguna cabecera que lo distinga de una navegación. Infla las vistas —no el embudo, que se cuenta por sesión— en la proporción de Safari desktop                                                                                                                                                                                                                                                          | Si molesta, apagar el prefetch o pedirle a Astro una cabecera propia. La pantalla ya declara que existe                                                                                                                                                                                                                         | v1.1         | Pendiente |
| 2026-08-29 | Un Worker de Cloudflare no puede alcanzar el proxy del ERP                                     | El `fetch()` de Workers descarta el puerto no estándar en producción y bloquea las IPs crudas, y el proxy vive en `http://<ip>:3001`. En local con Miniflare funciona, así que el fallo aparecería recién al desplegar. Bloquea el chequeo de stock en vivo al agregar al carrito y cualquier sync programado                                                                                                                                                                                                     | El importador corre en Node, donde la restricción no aplica. Para subirlo al Worker hay que publicar el proxy en un hostname con TLS sobre 443: Caddy con `sslip.io` sin comprar dominio, o Cloudflare Tunnel si aparece una zona. ADR-085                                                                                      | Fase 8       | Pendiente |
| 2026-08-29 | El stock que administra el ERP se podía pisar desde el Admin                                   | `admin_save_product` respetaba `field_sources` para los campos del producto y para el precio, pero escribía `inventory_levels` sin mirar. El stock es lo único que un ERP posee de verdad y era el único campo sin proteger; el no-negociable del repo dice lo contrario desde Fase 0                                                                                                                                                                                                                             | Misma comprobación que el precio, salteando en silencio para no romper la edición del resto del producto. Cuatro tests que fallan si se quita. ADR-086                                                                                                                                                                          | Fase 8       | Resuelto  |
| 2026-08-29 | La documentación del ERP difiere del cable en cuatro puntos                                    | El payload trae once campos y no ocho; `rubro` vale `GENERICO` siempre y no sirve de categoría —la que sirve es `familia`, no documentada—; `cant_dispon` y `precio_vta` son números y no strings; y hoy ningún `cod_barra` viene repetido, aunque el doc describa una fila por lote. Mapear desde el doc habría dejado el catálogo sin categorías y con la marca perdida                                                                                                                                         | Todo el mapeo salió del cable, con fixtures verbatim de las 9032 filas. La agregación por variante se conserva igual, porque si el ORDS vuelve a repetir el error sería silencioso. ADR-085                                                                                                                                     | Fase 8       | Resuelto  |
| 2026-08-29 | El ERP no dice en qué depósito está el stock                                                   | Manda una fila por lote pero ningún campo identifica la sucursal, así que `locations.erp_location_id` —que existe desde Fase 3 para esto— no se puede usar. Todo el stock cae en una sola sucursal                                                                                                                                                                                                                                                                                                                | Registrado como limitación conocida del ERP; el storefront ya suma todas las sucursales, así que no cambia nada visible. Se revisa si el ORDS gana el campo                                                                                                                                                                     | Fase 8       | Pendiente |
| 2026-08-29 | Los 100 productos importados no tienen imágenes                                                | El payload del ORDS no trae ninguna URL de imagen. Las fotos viven en el proyecto actual de Estilo Sport, y sin acceso a ese Supabase no hay de dónde sacarlas. El catálogo se navega igual, con precio, stock y facetas                                                                                                                                                                                                                                                                                          | Resueltas el 29/08: se copian del Supabase de su tienda actual cruzando por `internal_code`, al bucket propio para que se optimicen. 129 fotos en 75 productos; 25 no las tienen tampoco en el origen. ADR-088                                                                                                                  | Fase 8       | Resuelto  |
| 2026-08-29 | El proxy del ERP expone el secreto en texto plano sobre internet                               | El tramo app → proxy es `http://` sobre una IP pública, así que el `x-api-key`, el stock y los precios de venta viajan en claro. La documentación del cliente sólo marca como deuda el tramo interno proxy → Oracle, que es el menos expuesto de los dos. Además `/api/storefront/stock` de la tienda actual es público y sin autenticación                                                                                                                                                                       | Es del sistema actual del cliente, no de Pick, y Pick no porta ese endpoint. Se arregla junto con el hostname con TLS, que hace falta igual para que el Worker pueda hablarle                                                                                                                                                   | Fase 8       | Pendiente |
| 2026-08-24 | Los requisitos transversales quedaron en 0% con la mitad ya hecha                              | El ROADMAP dejó de reflejar el estado real                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Reconciliados contra el código                                                                                                                                                                                                                                                                                                  | —            | Resuelto  |
| 2026-08-24 | Falta estado de carga en el grid al filtrar la PLP                                             | El usuario no ve que algo pasó entre el click y los resultados                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `aria-busy` y atenuado del grid mientras el router trae la página. No son placeholders: la ruta es on-demand y el HTML ya llega con productos                                                                                                                                                                                   | Fase 4       | Resuelto  |
| 2026-08-24 | La faceta de precio necesita rango, no valores discretos                                       | Con muchos precios la faceta sería inusable                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Cuatro tramos calculados sobre el catálogo entero                                                                                                                                                                                                                                                                               | Fase 4       | Resuelto  |
| 2026-08-24 | La verificación de RLS con JWTs reales es manual                                               | No corre en CI: exige credenciales fuera del repo                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Resuelto: `pnpm rls:verificar`. Comprueba las **dos** caras —responde a la organización propia y rechaza la ajena—, porque mirar sólo el rechazo pasaba en verde cuando fallaba por un parámetro mal escrito                                                                                                                    | Fase 12      | Resuelto  |
| 2026-08-24 | Revisión adversarial de Fase 1 interrumpida                                                    | Quedó sin ejecutar; puede haber hallazgos no vistos                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Relanzarla sobre el código actual                                                                                                                                                                                                                                                                                               | —            | Pendiente |
| 2026-08-24 | Lighthouse completo no corre en CI                                                             | El presupuesto de bytes acota, pero no cubre CWV bajo red real                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ejecutar en pre-release                                                                                                                                                                                                                                                                                                         | Fase 12      | Pendiente |
| 2026-08-26 | El drawer del carrito abrió vacío una vez en 3 corridas del smoke                              | Un cliente agregaba al carrito y no veía lo que agregó                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Causa encontrada el 27/08: `ADD_TO_CART_EVENT` es fire-and-forget y las dos islands hidratan por separado; si el clic llegaba antes de que el drawer montara, el evento se perdía. Ahora la apertura se pide en el módulo compartido y el drawer la consume al montar                                                           | Fase 5       | Resuelto  |
| 2026-08-26 | El deploy de Cloudflare no espera al CI                                                        | Los dos salen del mismo push y corren en paralelo: un commit que rompe los tests llega a producción igual, y antes de que la corrida termine                                                                                                                                                                                                                                                                                                                                                                      | Desplegar desde el propio CI, como último paso después del e2e, y desconectar Workers Builds                                                                                                                                                                                                                                    | Fase 12      | Pendiente |
| 2026-08-26 | El e2e sólo funcionaba porque lo corría un agente de código                                    | La primera corrida real del CI quedó colgada una hora en `pnpm e2e`: `astro preview` sólo se demoniza con `--background` o cuando detecta un agente, y el runner no lo es                                                                                                                                                                                                                                                                                                                                         | Bandera `--background` en `e2e/global-setup.ts`. Comprobado sin las variables del agente: sin la bandera el comando no vuelve, con ella sí. CI en verde de punta a punta en 3m 37s                                                                                                                                              | Fase 4       | Resuelto  |
| 2026-08-26 | `pnpm format:check` está en rojo en `main`, con 50 archivos                                    | Nadie lo nota: el CI corre lint pero no el formato, así que la deuda crece en silencio                                                                                                                                                                                                                                                                                                                                                                                                                            | Correr `pnpm format` en un commit propio y agregar el paso al workflow                                                                                                                                                                                                                                                          | Fase 5       | Pendiente |
| 2026-08-27 | Un comercio podía escribir stock, imágenes y variantes sobre el catálogo de otro               | Reproducido: el storefront de la víctima pasó de 30 a 10029 unidades, y su propio Admin seguía viendo 30. RLS valida la columna `tenant_id`, no de quién es el padre al que la fila apunta                                                                                                                                                                                                                                                                                                                        | Claves foráneas compuestas que llevan el tenant, en las 18 hijas. ADR-063, con 7 tests que fallan si se quita la migración                                                                                                                                                                                                      | Fase 5       | Resuelto  |
| 2026-08-27 | `anon` conservaba `EXECUTE` sobre todas las funciones pese al `revoke ... from public`         | No explotable con funciones `security invoker`, pero la primera `security definer` —crear un pedido— habría quedado invocable desde cualquier browser                                                                                                                                                                                                                                                                                                                                                             | `revoke ... from anon` explícito. ADR-064. PGlite no puede detectarlo: se verifica contra el proyecto real                                                                                                                                                                                                                      | Fase 5       | Resuelto  |
| 2026-08-27 | `catalog_search` nunca se probó contra datos de otra tienda                                    | El fixture creaba la tienda ajena y no le ponía productos: borrar el filtro de tienda dejaba la suite en 36/36 verde                                                                                                                                                                                                                                                                                                                                                                                              | Producto ajeno en el fixture + dos casos sobre el camino de la secret key. Con ellos, el mismo sabotaje da 17 fallos                                                                                                                                                                                                            | Fase 5       | Resuelto  |
| 2026-08-27 | `STOREFRONT_DOMAIN` quedaba horneado en el bundle y `deploy` no reconstruía                    | Cargarla en el Worker no hacía nada. El segundo comercio habría servido el catálogo del primero, y desde Fase 5 le habría escrito los pedidos en el tenant equivocado                                                                                                                                                                                                                                                                                                                                             | Pasa a leerse en runtime; `deploy` construye siempre. ADR-052 corregido                                                                                                                                                                                                                                                         | Fase 5       | Resuelto  |
| 2026-08-27 | Guardar stock en una tienda sin sucursal se descartaba en silencio                             | El Admin mostraba éxito y el producto quedaba invendible; en un import de 500 filas, las 500 decían ok                                                                                                                                                                                                                                                                                                                                                                                                            | La función falla nombrando la causa. Lo destapó un test existente que dependía del descarte                                                                                                                                                                                                                                     | Fase 5       | Resuelto  |
| 2026-08-27 | ADR-052 nombraba `assertCan`/`assertSameTenant` como la defensa del camino secret-key          | No tienen un solo llamador fuera de sus tests: quien escribiera el checkout asumiría una guarda inexistente                                                                                                                                                                                                                                                                                                                                                                                                       | ADR-052 corregido con lo que defiende de verdad y con lo que eso le exige a Fase 5                                                                                                                                                                                                                                              | Fase 5       | Resuelto  |
| 2026-08-27 | Correr `pnpm e2e` en local deja pedidos de prueba en el proyecto de desarrollo                 | El seed restituye el catálogo pero no borra pedidos, así que el Admin se llena de basura entre corridas. En CI no pasa: la base es efímera                                                                                                                                                                                                                                                                                                                                                                        | El teardown borra los pedidos cuyo correo termina en `@e2e.test`, en un subproceso: hecho en el mismo proceso, el cliente de Supabase dejaba sockets abiertos y Node en Windows moría con una aserción de libuv, devolviendo error con todo en verde                                                                            | Fase 6       | Resuelto  |
| 2026-08-27 | Un producto cuyas variantes no declaran atributos quedaba invendible                           | El Admin permite crearlo, el catálogo devolvía su stock correctamente y el PDP igual mostraba «Sin stock»: sin atributos no había opciones, la selección quedaba vacía y no resolvía ninguna variante. Ninguna variante del seed tiene atributos vacíos, así que el caso nunca se ejercitó                                                                                                                                                                                                                        | Sin atributos, la dimensión por la que se elige es la variante misma, y su título es el valor. Cinco tests que fallan sin el arreglo                                                                                                                                                                                            | Fase 5       | Resuelto  |
| 2026-08-27 | La guarda contra el doble submit del checkout no se puede verificar desde afuera               | Cuándo se libera depende de si la respuesta llega antes que el segundo click: contra una base local pasa, contra una remota no. Un test sobre eso pasa por latencia, no por corrección                                                                                                                                                                                                                                                                                                                            | Cerrado con la justificación registrada: el e2e afirma la garantía —un solo pedido— y la guarda queda como endurecimiento, sin test propio                                                                                                                                                                                      | Fase 6       | Resuelto  |
| 2026-08-27 | El carrito no valida lo que lee de `localStorage`, y toda excepción se ve como «carrito vacío» | Con la forma vieja de `CartLine`, el día del deploy de Fase 5 cada cliente con carrito guardado lo ve vacío mientras el badge dice que tiene ítems                                                                                                                                                                                                                                                                                                                                                                | Parse validador + versión de la clave, al reemplazar el store en T2                                                                                                                                                                                                                                                             | Fase 5       | Pendiente |
| 2026-08-27 | Dos pestañas: la segunda pisa el carrito de la primera                                         | Caché de módulo que no relee y `persist` que escribe el array entero. El cliente pierde ítems sin ninguna señal                                                                                                                                                                                                                                                                                                                                                                                                   | Releer al escribir y escuchar `storage`, en T2                                                                                                                                                                                                                                                                                  | Fase 5       | Pendiente |
| 2026-08-27 | El carrito no tiene tope de cantidad: 44 unidades de un producto con 4 en stock                | `CartLine` no lleva `available` y `CartContents` monta el selector sin `max`                                                                                                                                                                                                                                                                                                                                                                                                                                      | `available` en la línea, en T2                                                                                                                                                                                                                                                                                                  | Fase 5       | Pendiente |
| 2026-08-27 | El subtotal suma monedas distintas a mano en vez de usar `addMoney`                            | Sumó Gs. 389.000 + USD 50 como si fueran guaraníes, sin error ni aviso                                                                                                                                                                                                                                                                                                                                                                                                                                            | Usar `addMoney`, que ya existe y falla fuerte, en T2                                                                                                                                                                                                                                                                            | Fase 5       | Pendiente |
| 2026-08-27 | El Admin lee el stock sumado de todas las sucursales y lo escribe a una sola                   | Con dos sucursales, cada guardado sin tocar el campo infla el total: 30 → 50 → 70. Hoy no alcanzable porque no hay pantalla de sucursales                                                                                                                                                                                                                                                                                                                                                                         | Decidir el modelo de stock por sucursal                                                                                                                                                                                                                                                                                         | Fase 8       | Pendiente |
| 2026-08-27 | Un negativo en una sucursal se compensa contra otra en la suma                                 | El descuadre queda invisible en todas las lecturas, que es lo que el espejo del ERP quería evitar                                                                                                                                                                                                                                                                                                                                                                                                                 | Exponer el negativo por sucursal en el Admin                                                                                                                                                                                                                                                                                    | Fase 8       | Pendiente |
| 2026-08-27 | `p_per_page` no tiene techo y el sitemap pagina de a 500 sin límite                            | Una ruta pública de SEO puede agotar el pool de conexiones por el que pasará el checkout                                                                                                                                                                                                                                                                                                                                                                                                                          | Resuelto: `least(p_per_page, 200)` en las cinco funciones paginadas, por sustitución mecánica verificada por diff. El sitemap pagina de a 200                                                                                                                                                                                   | Fase 12      | Resuelto  |
| 2026-08-27 | Ninguna ruta on-demand emite `Cache-Control`                                                   | Sin headers, un proxy intermedio tiene permiso de cachear heurísticamente. Los `/api/*` de Fase 5 devuelven datos por cliente                                                                                                                                                                                                                                                                                                                                                                                     | `no-store` en los endpoints nuevos; revisar las páginas                                                                                                                                                                                                                                                                         | Fase 5       | Pendiente |
| 2026-08-27 | El setup de e2e deja la secret key en claro en `dist/server/.dev.vars`                         | No se despliega ni se sirve —verificado—, pero queda en disco hasta el próximo build                                                                                                                                                                                                                                                                                                                                                                                                                              | Borrarla en el teardown                                                                                                                                                                                                                                                                                                         | Fase 5       | Pendiente |
| 2026-08-26 | El deploy necesita los secretos del Worker cargados a mano                                     | Sin ellos el storefront responde 500 sin cuerpo, y nada dice qué falta                                                                                                                                                                                                                                                                                                                                                                                                                                            | Cargados en `pick-commerce`. Además el sitio ahora responde 503 nombrando las variables ausentes                                                                                                                                                                                                                                | Fase 4       | Resuelto  |
| 2026-08-26 | El script de deploy apuntaba a `dist/client/wrangler.json`, que el build ya no emite           | El deploy fallaba antes de empezar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Corregido a `dist/server/wrangler.json`, verificado con `--dry-run` sobre el script real                                                                                                                                                                                                                                        | Fase 4       | Resuelto  |
| 2026-08-26 | El Admin escribe el stock en la primera sucursal de la tienda                                  | Con más de un depósito, el ajuste va al que no es                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Selector de sucursal en el formulario                                                                                                                                                                                                                                                                                           | Fase 8       | Pendiente |
| 2026-08-26 | El bundle del Admin pasa los 500 KB en un solo chunk                                           | Sólo afecta la primera carga de una app detrás de login                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Una pantalla por chunk con `React.lazy`. La primera carga pasó de 714 KB a ~561 KB, y lo pesado sólo baja al visitarse. ADR-071                                                                                                                                                                                                 | Fase 6       | Resuelto  |
| 2026-08-26 | El `site` del storefront apuntaba a un dominio inexistente                                     | Canonical, og:url, JSON-LD y sitemap anunciaban una dirección que no resuelve, anulando el SEO y el GEO de Fase 2                                                                                                                                                                                                                                                                                                                                                                                                 | Corregido a la URL real del Worker; `SITE_URL` acepta el dominio sin esquema                                                                                                                                                                                                                                                    | Fase 4       | Resuelto  |
| 2026-08-26 | El Admin no acota por el dominio desde el que se entra                                         | Sólo se nota cuando una misma persona administra varios comercios: el branding dice uno y el selector muestra todos. El aislamiento de datos no depende de esto, lo da RLS                                                                                                                                                                                                                                                                                                                                        | Decidido que no: el Admin es una sola aplicación en un dominio compartido (ADR-062), el aislamiento lo da RLS y el selector resuelve la comodidad. ADR-072                                                                                                                                                                      | Fase 6       | Resuelto  |
| 2026-08-26 | `stores.domain` admite un solo dominio por tienda                                              | Un comercio con `.com` y `.com.py` necesitaría dos tiendas                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Modelo decidido —tabla `store_domains` de alias con 301 al canónico— e implementación diferida al primer caso real. ADR-074                                                                                                                                                                                                     | Fase 6       | Resuelto  |
| 2026-08-28 | `membresiasDe` devolvía las membresías de todo el equipo con el rol ajeno                      | La consulta no filtraba por usuario porque un comentario afirmaba que RLS lo hacía; RLS acota por organización, no por persona. Latente tres fases: apareció al cablear el gating, cuando el Admin le mostró a un `viewer` los controles de un `owner`. La base rechazó todo igual                                                                                                                                                                                                                                | Filtrado por `user_id`, con un test de PGlite que fija el comportamiento de la política para que el motivo no se pierda. ADR-073                                                                                                                                                                                                | Fase 6       | Resuelto  |
| 2026-08-28 | La guarda del último owner impedía dar de baja una organización                                | Reproducido: `delete from organizations` cascadea a `memberships` y disparaba el trigger, que fallaba diciendo que faltaba un propietario cuando la organización se estaba yendo. Offboarding de un cliente imposible                                                                                                                                                                                                                                                                                             | El trigger se saltea si la organización ya no existe, que es el orden que garantiza Postgres en una cascada. Test de los dos lados. ADR-068                                                                                                                                                                                     | Fase 6       | Resuelto  |
| 2026-08-28 | Dos tests de e2e clicaban islands antes de que hidrataran                                      | Fallo intermitente que parecía de la aplicación: el botón existe, el click no hace nada y el drawer nunca abre. Aparece o no según lo cargada que esté la máquina, así que en CI sería ruido rojo sin causa                                                                                                                                                                                                                                                                                                       | Esperar a que no queden `astro-island[ssr]`, que es la señal que da Astro al terminar de hidratar. Tres corridas seguidas en verde                                                                                                                                                                                              | Fase 6       | Resuelto  |
| 2026-08-28 | El compilador de React no memoiza el listado de productos                                      | TanStack Table devuelve funciones que no se pueden memoizar sin arriesgar interfaz vieja, así que el compilador saltea el componente entero. Con veinte filas no se nota                                                                                                                                                                                                                                                                                                                                          | Aceptado y anotado en el archivo; el lint lo avisa en cada corrida. Si alguna vez pesa, la salida es virtualizar                                                                                                                                                                                                                | Fase 8       | Pendiente |
| 2026-08-28 | El Admin no tiene e2e propio                                                                   | Las pantallas se validan con unitarios, PGlite, typecheck y un recorrido manual con tres roles. Un cambio que rompa el gating o un formulario no lo detecta nadie automáticamente                                                                                                                                                                                                                                                                                                                                 | Resuelto el 29/08: `e2e/admin.spec.ts` entra, abre los dos menús del sidebar, cambia de tienda, navega y cierra sesión. 6 tests entre desktop y mobile. Lo motivó un fallo que ningún otro control detectaba. ADR-087                                                                                                           | Fase 8       | Resuelto  |
| 2026-08-28 | El buscador de pedidos no encontraba nada con el número tal como se muestra                    | La tabla muestra «#1028» y el heno guardaba «1028», así que quien buscaba el pedido que tenía delante recibía cero resultados. Se lee como que el buscador está roto, y los tres primeros términos que se prueban al verificarlo —número, nombre, correo— funcionan todos                                                                                                                                                                                                                                         | El heno guarda el número con almohadilla; el filtro busca subcadenas, así que las dos formas andan. Test que falla sin el cambio. ADR-078                                                                                                                                                                                       | Fase 6       | Resuelto  |
| 2026-08-28 | No había forma de marcar un pedido como pagado                                                 | `payment_status` existía desde Fase 5 y ninguna pantalla lo tocaba. Con transferencia bancaria, que es el único medio, cobrar es una persona mirando un comprobante: sin esto la operación de cobro no existía                                                                                                                                                                                                                                                                                                    | `admin_set_payment_status`, con registro en la timeline y control en la lista y en el detalle. ADR-077                                                                                                                                                                                                                          | Fase 6       | Resuelto  |
| 2026-08-28 | Archivar un producto era un camino de ida                                                      | La fila dejaba de ofrecer el botón al archivar, así que un producto archivado por error quedaba, para quien miraba la lista, roto. Sólo se recuperaba abriendo el formulario                                                                                                                                                                                                                                                                                                                                      | Interruptor de publicado/archivado en la fila, y «Publicar» en lote con la misma semántica. ADR-076                                                                                                                                                                                                                             | Fase 6       | Resuelto  |
| 2026-08-28 | Las miniaturas del catálogo se ven rotas en el Admin                                           | Los medios guardan rutas del storefront (`/products/x.jpg`) que desde el dominio del Admin no resuelven. No es nuevo; el rediseño lo hizo visible                                                                                                                                                                                                                                                                                                                                                                 | Los medios del seed pasaron al bucket propio, así que sus URLs son absolutas y resuelven desde cualquier dominio. Las pegadas a mano ya eran absolutas. ADR-082                                                                                                                                                                 | Fase 7       | Resuelto  |
| 2026-08-28 | El sidebar subió la primera carga del Admin de 561 KB a 707 KB                                 | Sus primitivas —menús, tooltips, la hoja de mobile— las carga la cáscara. Se compró una navegación que aguanta las secciones que faltan                                                                                                                                                                                                                                                                                                                                                                           | Aceptado y medido. Si molesta, cargar la hoja de mobile y el tooltip bajo demanda dentro del propio primitive. ADR-075                                                                                                                                                                                                          | Fase 8       | Pendiente |
| 2026-08-29 | El uuid del tenant llegó al HTML del PDP y rompió el smoke del checkout                        | Al mover los medios al bucket, la ruta de las imágenes —que lleva el tenant— quedó antes en el HTML que el id de variante. El helper del test sacaba «el primer uuid con esa forma», así que empezó a comprar una variante inexistente y fallaba con un 409 de stock que no tenía nada que ver                                                                                                                                                                                                                    | El helper ancla en las props serializadas de la island. Una heurística que funciona hasta que el HTML cambia es una bomba con temporizador. ADR-082                                                                                                                                                                             | Fase 7       | Resuelto  |
| 2026-08-29 | `Astro.locals.runtime.ctx` ya no existe: es `locals.cfContext`                                 | Los tipos que leí eran de una versión vieja del adapter que quedó en el store de pnpm; la instalada es otra. No falla al compilar sino al ejecutarse, y sólo en la ruta que lo usa — el primer pago de prueba respondió 500                                                                                                                                                                                                                                                                                       | Corregido, y el error del adapter era explícito. Leer los tipos de `node_modules/.pnpm/` sin mirar la versión es leer los de cualquiera                                                                                                                                                                                         | Fase 7       | Resuelto  |
| 2026-08-29 | Ningún POST del Admin puede llegar al storefront sin montar CORS                               | La comprobación de origen de Astro rechaza los POST de otro origen salvo con un `content-type` que no sea de formulario, y `no-cors` sólo puede mandar justamente esos tres. El endpoint de drenaje quedaba inalcanzable                                                                                                                                                                                                                                                                                          | El endpoint es un GET —idempotente y sin parámetros— y además el middleware drena de forma oportunista cada 30 s. ADR-081                                                                                                                                                                                                       | Fase 7       | Resuelto  |
| 2026-08-29 | Sin dominio verificado, Resend sólo entrega a la casilla del dueño de la cuenta                | Comprobado: un pedido con correo de comprador real devuelve 403 con el motivo. El pipeline funciona; el techo es de la cuenta                                                                                                                                                                                                                                                                                                                                                                                     | Verificar un dominio en resend.com/domains y cargar `EMAIL_FROM` antes del piloto. Hasta entonces, los avisos sólo llegan a la casilla propia                                                                                                                                                                                   | Fase 12      | Pendiente |
| 2026-08-29 | La cola de correos no se ve desde el Admin                                                     | Si un aviso falla cinco veces se abandona en silencio: queda en la tabla con `attempts = 5` y nadie se entera, mientras el comprador espera un correo que no va a llegar. Hoy sólo se ve consultando la base                                                                                                                                                                                                                                                                                                      | Resuelto: el detalle del pedido muestra los avisos que no salieron, distinguiendo los que están en cola de los abandonados. Por RPC `security definer` que devuelve metadatos y nunca el payload (ADR-102)                                                                                                                      | Fase 10      | Resuelto  |
| 2026-08-28 | Ninguna imagen de producto se optimiza, aunque el componente diga que sí                       | Medido en producción: el catálogo emite un `srcset` de ocho candidatos que apuntan todos al mismo archivo. Las del seed viven en `public/`, que Astro nunca procesa, y las remotas no están autorizadas en `image.remotePatterns`. 324 KB de imágenes en la primera página y 6 KB de HTML de un `srcset` que no ofrece nada                                                                                                                                                                                       | Bucket propio con host estable, autorizado en `image.remotePatterns`. El catálogo emite `/_image?…&w=640&f=webp` y el `srcset` tiene candidatos reales. ADR-082                                                                                                                                                                 | Fase 7       | Resuelto  |
| 2026-08-28 | Cargar una imagen de producto sólo admite pegar una URL                                        | No hay subida de archivos, así que los medios dependen de hosts ajenos que pueden caerse o bloquear el hotlink; y como los hosts son cualquiera, no se pueden autorizar para optimizar sin abrir el patrón a todo `https`, que convertiría al storefront en un redimensionador gratis para terceros                                                                                                                                                                                                               | Botón de subida en el formulario, con las dimensiones medidas en el browser. El camino de pegar URL se conserva para medios de un ERP. ADR-082                                                                                                                                                                                  | Fase 7       | Resuelto  |

Ejemplos de hallazgos:

- un ERP no soporta reservas;
- una categoría necesita un atributo no contemplado;
- un provider exige un webhook adicional;
- un flujo de checkout tiene un edge case real;
- una decisión de UI no escala a Wholesale.

Cuando el hallazgo implique una decisión arquitectónica, crear además una entrada en `DECISIONS.md`.

---

| 2026-08-30 | El e2e del Admin corría sobre `vite preview`, no sobre el artefacto que se despliega | Servía `dist` estático, así que ninguna ruta de servidor existía en la corrida. Iba al revés de lo que argumenta el propio comentario de `playwright.config.ts` para el storefront, y estuvo así desde que el Admin tuvo e2e | Resuelto: pasa a `wrangler dev`, que es workerd. El teardown mata el árbol de procesos y no sólo el puerto, porque el workerd huérfano se queda con el 4322 y rompe la corrida siguiente por un motivo que no se parece a la causa. ADR-103 | Fase 11 | Resuelto |
| 2026-08-30 | El e2e no puede detectar un `run_worker_first` mal configurado | Medido quitándolo: la suite siguió en verde. `wrangler dev` ejecuta el Worker para una ruta sin asset la declare o no, mientras que en producción, con Workers Assets, la documentación dice que caería en el `index.html` del SPA. Es una divergencia dev/producción sobre la línea que hace existir al servidor del Admin | Se verifica desplegando y pidiéndole una ruta `/api/` al sitio real, que es lo que se hizo. Queda escrito en `e2e/ia.spec.ts` para que el verde no se lea como una garantía que no da | Fase 11 | Pendiente |
| 2026-08-30 | `store_settings` es legible por cualquier miembro de la organización, incluido un `viewer` | Para moneda y medios de pago está bien y fue deliberado. Pero es una propiedad que no estaba escrita en ningún lado, y la encontró de casualidad la primera configuración sensible: una credencial cifrada guardada ahí la habría podido leer todo el equipo | La credencial de IA fue a su propia tabla sin políticas (ADR-105). Queda anotado para la próxima configuración que no sea pública: la pregunta hay que hacerla antes, no al llegar | Fase 11 | Pendiente |
| 2026-08-30 | El enriquecimiento nunca corrió contra una credencial de OpenAI real | El cuerpo del pedido y la lectura de la respuesta salieron de la documentación, y están cubiertos por tests con respuestas fijas. Lo verificado contra la API de verdad es sólo el rechazo de una clave inválida: un 401 llega antes que cualquier validación del cuerpo, así que la forma del pedido no se probó | Resuelto: probado con una clave real sobre un producto con varias imágenes | Fase 12 | Resuelto |

| 2026-08-30 | El listado del catálogo tarda 2,3 segundos con 5000 productos | Medido sobre el proyecto de desarrollo con la ida y vuelta en 115 ms: la PLP tarda 2.323 ms en la primera página y 3.719 ms en la 100, mientras el Admin entero se mantiene por debajo de 140 ms. No es falta de índices, y el diagnóstico anotado acá era **medio cierto**, que es peor que equivocado. Eran dos costos distintos. (1) `lowest` era una subconsulta correlacionada contra el CTE `precios`; un CTE no tiene índices, así que lo recorría entero una vez por producto: 25 millones de filas, y 1995 de los 2159 ms de la primera página. (2) Armar el JSON de todos y quedarse con 24 —lo que decía la nota— sí ocurre, pero **sólo en las páginas profundas**: Postgres 17 empuja el tope adentro de la ventana con un `Run Condition` sobre el `row_number()`, y ese empuje es sólo del límite superior. En la página 1 la ventana para a las 24 sola; en la 100 entrega 2400 y se descartan 2376 ya serializados | Resuelto con las dos cosas: `minimos` agrega el mínimo una vez, y el corte de página va antes de serializar. Con 5006 productos: página 1 **2287 -> 233 ms**, página 100 **3886 -> 229 ms**, búsqueda **2191 -> 194 ms**. Plano de la primera página a la última, que era el criterio. Las 44 pruebas de paridad en verde. El PDP nunca estuvo afectado, aunque use la misma función: con `p_handle` el filtro entra antes | v1.1 | Resuelto |
| 2026-08-30 | El presupuesto de peso no cubría el catálogo, que no entra | `pnpm budget` medía las dos páginas prerenderizadas y el catálogo nunca dejó HTML en disco, así que jamás se pesó. Al medirlo por primera vez dio 26,6 KB gzip contra los 25 declarados: es el `ClientRouter`, comprado a propósito para que filtrar no recargue la página | Se le da su propio presupuesto de 28 KB con el motivo escrito, en vez de aflojar el de todo el sitio para que entre uno. Si alguna vez molesta, la salida es cargar el router sólo cuando haya facetas (ADR-106) | v1.1 | Pendiente |
| 2026-08-30 | El contenido de Políticas y Preguntas frecuentes es el de la demo | Sale de un módulo del storefront, no del CMS. Un comercio real necesita las suyas, y hoy eso es editar código y desplegar. El mismo diagnóstico que ya se aplicó al nombre de la tienda y a la colección destacada | Una sección de páginas en el CMS, que ya administra la portada por secciones. Anotado en `LIMITACIONES.md` para que el piloto lo sepa antes | v1.1 | Pendiente |
| 2026-08-30 | El restore de un backup no se ejerció nunca | Los backups automáticos del proyecto existen, con la retención del plan. Nadie restauró uno, así que el tiempo de recuperación es desconocido — y un backup que no se probó es una suposición | Restaurar sobre un proyecto nuevo y cronometrarlo. Es media hora y convierte una suposición en un número | v1.1 | Pendiente |

| 2026-08-31 | La sección de Categorías mostraba **todas** las categorías, siempre | No había forma de elegir cuáles ni en qué orden: una tienda con las cuarenta y dos que trae un ERP publicaba las cuarenta y dos en la portada. Y el orden salía de un número escrito en cada categoría, así que reordenar la portada obligaba a abrirlas de a una | Resuelto: la sección elige cuáles y en qué orden, en `settings.categoryIds`. Vacío sigue significando todas, así que las secciones que ya existían no cambian. Sin migración: la columna de ajustes existe desde la Fase 9 para esto | v1.1 | Resuelto |
| 2026-08-31 | Las categorías no se podían borrar | Se creaban y se editaban, y nada más. Una categoría escrita mal quedaba en el catálogo para siempre | Resuelto: se borran, avisando que los productos quedan sin categoría —`on delete set null`— y que las subcategorías caen con ella. El permiso y la política ya lo admitían: faltaba la pantalla | v1.1 | Resuelto |
| 2026-08-31 | Editar el último elemento de una lista mandaba la vista al tope | El formulario se abría **encima** de la lista, así que para editar algo del final había que desplazarse hasta arriba para escribir. Pasaba en categorías, en slides y en avisos | Resuelto: modal en desktop, hoja desde abajo en mobile (ADR-109) | v1.1 | Resuelto |
| 2026-08-31 | El botón de guardar desaparecía al bajar en un formulario largo | Vivía arriba a la derecha. Con tres tarjetas de campos, se terminaba de escribir abajo y había que volver arriba para confirmar | Resuelto: barra pegajosa al pie en producto, promoción, colección y sección. `sticky` y no `fixed`, para no tapar el último campo en un teléfono (ADR-109) | v1.1 | Resuelto |
| 2026-08-31 | Las tablas repartían el ancho por contenido | Sin anchos declarados, «Ítems» quedaba con una columna ancha y el número flotando en el medio, y «Cliente» se comía el espacio que le faltaba a «Total» | Resuelto: ancho declarado en lo que tiene tamaño conocido —números, fechas, estados, acciones— y el resto absorbe. En pedidos, clientes, promociones y productos | v1.1 | Resuelto |
| 2026-08-31 | La lista de clientes traía todo sin forma de acotar por tiempo | Paginaba, pero no se podía preguntar «quién me compró este mes». Con un año de operación es una lista que no se lee | Resuelto: filtro por última compra, en el servidor. Mira la última compra y no la fecha de alta, porque un cliente se crea con su primer pedido | v1.1 | Resuelto |
| 2026-08-31 | «A dónde lleva» un slide era un campo de texto libre | Había que conocer la forma de la URL y acordarse del slug exacto. Un destino mal escrito no falla: lleva a un catálogo vacío, así que el error se descubre navegando | Resuelto: se elige de una lista que sale de las **facetas reales** del catálogo —categorías, marcas y los atributos que el comercio declaró filtrables—. Si una tienda no vende por género, la opción no aparece; si mañana lo declara, aparece sola. Queda el texto libre para lo demás | v1.1 | Resuelto |
| 2026-08-31 | `pago-simulado.spec.ts` sacaba el id de variante con «el primer uuid con esa forma» | Es el uuid del **tenant**: viaja en la ruta de las imágenes del bucket, que está antes en el HTML. El carrito quedaba con una variante inexistente y el checkout lo vaciaba diciendo que el producto no estaba disponible, un síntoma que no se parece a la causa. Es el mismo fallo que ADR-082 arregló en el smoke del checkout; este spec había quedado con la heurística vieja | Resuelto: ancla en las props que la página serializa para la island, como el otro | v1.1 | Resuelto |
| 2026-08-31 | `PLAYWRIGHT_SKIP_BUILD=1` hace que el e2e pruebe el build anterior | No es un fallo: es lo que la bandera dice. Pero al usarla para iterar rápido, el Admin que se prueba es el de la corrida pasada, y un cambio de interfaz da fallos que no tienen sentido — se perdió un rato largo depurando un artefacto viejo | Anotado. Al tocar la interfaz, correr sin la bandera. Si vuelve a costar, la salida es que el setup avise en la salida qué build está sirviendo | v1.1 | Pendiente |
| 2026-09-02 | Un servidor de otra corrida en 4321 o 4322 hacía que el e2e probara **ese** build | Misma familia que la fila de abajo, pero peor porque no hay bandera que lo avise. El setup mataba el 4322 con `kill-port` y no comprobaba el resultado, y del 4321 no se ocupaba nadie: si el kill fallaba, el `wait-on` encontraba respondiendo al servidor viejo y la suite corría contra él. Dio 2 fallos en `ia.spec.ts` que no reproducían en aislamiento y no tenían relación con lo que se había tocado | Resuelto: `liberarPuerto()` comprueba si el puerto contesta, lo libera y **vuelve a comprobar**; si sigue ocupado aborta nombrando el puerto y el motivo, en vez de probar un artefacto viejo. Se aplica a 4321 y 4322. Verificado ocupando el 4321 a propósito: la suite lo detecta, lo libera y da 99/99 | v1.1 | Resuelto |
| 2026-09-09 | El e2e está cableado a `@pick/demo`; Treeshop no tiene suite propia | `global-setup`, `global-teardown` y `playwright.config` construyen y sirven la demo. Treeshop se verificó a mano y con capturas de Playwright en cada cambio, que no es lo mismo que una suite que corra sola | Parametrizar el setup por app, o un segundo proyecto de Playwright con su `baseURL` y su build. Es lo que desbloquea que el CI pruebe al cliente | Treeshop | Pendiente |
| 2026-09-09 | El carrusel de la portada muestra 8 productos y el cliente pidió 10 | `PRODUCTOS_POR_SECCION` es una constante del Core. Cambiarla afecta a todas las tiendas | Pasarlo a `settings.limit` de la sección, con la constante como default. Es un retoque de presentación: va al jsonb, no a una migración | Treeshop | Pendiente |
| 2026-09-09 | Envío por departamento (Etapa 3 de Treeshop) | Camelot cobra 30 000 a los 18 departamentos, o sea que hoy es una tarifa plana. El cliente quiere la tabla editable. Toca `create_order` por cuarta vez, `OrderAddress`, el checkout y la tarjeta Envío del Admin | Es la única feature de negocio nueva del cliente y va con el procedimiento de siempre: definición vigente, cambio mínimo, diff verificado, sabotaje en PGlite | Treeshop | Pendiente |
| 2026-09-09 | `sontres.shop` no está desplegado | La app corría sólo en local. Faltaban el Worker, los secretos de runtime y el dominio, y `INFRAESTRUCTURA.md` y `ONBOARDING.md` describían un solo storefront | Resuelto el 2026-09-10: Worker `treeshop` desplegado a mano con sus secretos y `SITE_URL`, KV de sesiones creado solo, y los tres hostnames atados por API —`sontres.shop` y `www` al storefront, `admin.sontres.shop` al Admin—. Supabase Auth acepta el dominio del Admin. Los documentos describen los dos caminos de alta. Queda la propagación del DNS, que es del registrador | Treeshop | Resuelto |
| 2026-09-10 | Resend no tiene verificado `sontres.shop` | La clave de Resend en `.env` es **de sólo envío**: no puede dar de alta dominios ni leerlos. Sin dominio verificado, los correos a compradores reales devuelven 403 | Dar de alta el dominio en el panel de Resend y cargar sus registros DNS en la zona de Cloudflare. Es del usuario; con los registros a mano, cargarlos es un minuto | Treeshop | Pendiente |

# Changelog de avance

| Fecha      | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Fase     | Avance antes | Avance después |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -----------: | -------------: |
| —          | Roadmap inicial                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —        |           0% |             0% |
| 2026-08-23 | Fase 0: monorepo pnpm, TypeScript/ESLint/Prettier, Tailwind v4, paquetes `@pick/commerce-types` y `@pick/commerce-core`, apps `admin` y `demo`, CI y estructura de migraciones Supabase                                                                                                                                                                                                                                                                             | Fase 0   |           0% |            85% |
| 2026-08-23 | Fase 0 cerrada: deploy a Cloudflare Workers por push y proyecto Supabase de desarrollo verificado                                                                                                                                                                                                                                                                                                                                                                   | Fase 0   |          85% |           100% |
| 2026-08-23 | Fase 1: tokens de diseño, `@pick/commerce-astro` con Product Card/Price/Grid y PLP demo con catálogo mock                                                                                                                                                                                                                                                                                                                                                           | Fase 1   |           0% |            20% |
| 2026-08-23 | Fase 1: layout (Container/Header/Footer), primeras islands (Quantity, Add to Cart) y PDP demo                                                                                                                                                                                                                                                                                                                                                                       | Fase 1   |          20% |            40% |
| 2026-08-23 | Fase 1: Variant Selector con swatches, derivación de opciones en el core con tests, y Breadcrumb con JSON-LD                                                                                                                                                                                                                                                                                                                                                        | Fase 1   |          40% |            55% |
| 2026-08-23 | Fase 1: recetas de clases compartidas, primitives Button/Badge y Product Gallery sin JavaScript                                                                                                                                                                                                                                                                                                                                                                     | Fase 1   |          55% |            65% |
| 2026-08-23 | Fase 1: Hero/Banner/Categorías/Carrusel, Cart Drawer con store persistido y separación de chunks por island                                                                                                                                                                                                                                                                                                                                                         | Fase 1   |          65% |            80% |
| 2026-08-23 | Fase 1: catálogo facetado server-side sobre ruta on-demand, con búsqueda, orden y paginación                                                                                                                                                                                                                                                                                                                                                                        | Fase 1   |          80% |            88% |
| 2026-08-23 | Fase 1: PLP sin full reload con ClientRouter acotado, drawer mobile sin JS, y JS del storefront reducido 27%                                                                                                                                                                                                                                                                                                                                                        | Fase 1   |          88% |            92% |
| 2026-08-23 | Fase 1 cerrada: shadcn sobre Base UI en el Admin, contrato de customización fijado con test, y regresión de tokens corregida                                                                                                                                                                                                                                                                                                                                        | Fase 1   |          92% |           100% |
| 2026-08-24 | Smoke de navegación con Playwright en CI; corregido el panel de filtros invisible en desktop                                                                                                                                                                                                                                                                                                                                                                        | Fase 1   |         100% |           100% |
| 2026-08-24 | Fase 2: SEO y GEO (canonical, Open Graph, JSON-LD, sitemap, robots, llms.txt), 404, políticas, FAQ y página de carrito                                                                                                                                                                                                                                                                                                                                              | Fase 2   |           0% |            80% |
| 2026-08-24 | Correcciones de UX de la demo: sheet de filtros en mobile, orden en el PLP, "Aplicar" sólo sin JavaScript                                                                                                                                                                                                                                                                                                                                                           | Fase 2   |          80% |            85% |
| 2026-08-24 | Fase 2 cerrada: buscador y orden del header, presupuesto de performance en CI, baseline de CWV                                                                                                                                                                                                                                                                                                                                                                      | Fase 2   |          85% |           100% |
| 2026-08-24 | Fase 3: schema multitenant, RLS y pruebas de aislamiento sobre Postgres en proceso                                                                                                                                                                                                                                                                                                                                                                                  | Fase 3   |           0% |            55% |
| 2026-08-24 | Migración aplicada al proyecto Supabase y aislamiento verificado con JWTs reales                                                                                                                                                                                                                                                                                                                                                                                    | Fase 3   |          55% |            65% |
| 2026-08-24 | Fase 3 cerrada: adapter de Supabase, resolución de tenant y Auth en el Admin                                                                                                                                                                                                                                                                                                                                                                                        | Fase 3   |          65% |           100% |
| 2026-08-26 | Fase 4: schema de catálogo, `catalog_search` con paridad verificada contra el core, y seed reproducible                                                                                                                                                                                                                                                                                                                                                             | Fase 4   |           0% |            55% |
| 2026-08-26 | Fase 4: el storefront lee el catálogo de Postgres on-demand, sitemap dinámico, facetas declaradas por la tienda y tramos de precio                                                                                                                                                                                                                                                                                                                                  | Fase 4   |          55% |            80% |
| 2026-08-26 | Fase 4: CRUD de productos en el Admin, con listado paginado, búsqueda por SKU y guardado atómico                                                                                                                                                                                                                                                                                                                                                                    | Fase 4   |          80% |            90% |
| 2026-08-26 | Fase 4 cerrada: import y export de catálogo por CSV, con preview que no escribe y reporte por producto                                                                                                                                                                                                                                                                                                                                                              | Fase 4   |          90% |           100% |
| 2026-08-26 | Storefront en línea: secretos del Worker, dirección pública corregida y falla legible cuando falta configuración                                                                                                                                                                                                                                                                                                                                                    | Fase 4   |         100% |           100% |
| 2026-08-26 | Primera corrida real del CI: valida ADR-058 y destapa que el e2e colgaba fuera de un agente; documentada la infraestructura en INFRAESTRUCTURA.md                                                                                                                                                                                                                                                                                                                   | Fase 4   |         100% |           100% |
| 2026-08-27 | Revisión adversarial: cerrado el agujero cross-tenant de las claves foráneas, el `EXECUTE` de `anon` y el dominio horneado en el build                                                                                                                                                                                                                                                                                                                              | Fase 5   |           0% |           100% |
| 2026-08-27 | Fase 5 T1: schema de pedidos y `create_order` idempotente con revalidación y descuento de stock                                                                                                                                                                                                                                                                                                                                                                     | Fase 5   |          35% |           100% |
| 2026-08-27 | Fase 5 T2 y T3: cart service, checkout, confirmación y vista de pedidos del Admin                                                                                                                                                                                                                                                                                                                                                                                   | Fase 5   |         100% |           100% |
| 2026-08-28 | Fase 6 T1: `admin_dashboard`, `admin_customers`, `admin_team` y `admin_save_settings`, con el invariante del último owner en un trigger                                                                                                                                                                                                                                                                                                                             | Fase 6   |           0% |            40% |
| 2026-08-28 | Fase 6 T2 y T3: resumen, clientes, equipo y configuración, con gating por rol y una pantalla por chunk                                                                                                                                                                                                                                                                                                                                                              | Fase 6   |          40% |            85% |
| 2026-08-28 | Fase 6 cerrada: acciones en lote con TanStack Table, provisionamiento por CLI y limpieza de los pedidos que dejaba el e2e                                                                                                                                                                                                                                                                                                                                           | Fase 6   |          85% |           100% |
| 2026-08-28 | Correcciones de uso del Admin: buscar por «#número», marcar pagado, publicar y archivar con un interruptor, y navegación con sidebar                                                                                                                                                                                                                                                                                                                                | Fase 6   |         100% |           100% |
| 2026-08-28 | `pnpm seed:dummy`: catálogo de prueba desde dummyjson para ejercitar paginación, búsqueda y lotes; medido de paso que ninguna imagen se optimiza                                                                                                                                                                                                                                                                                                                    | Fase 6   |         100% |           100% |
| 2026-08-29 | Fase 7 T1 y T2: `record_payment` idempotente, cola de correos por trigger, y los puertos `PaymentProvider` y `NotificationProvider` con sus adapters                                                                                                                                                                                                                                                                                                                | Fase 7   |           0% |            55% |
| 2026-08-29 | Fase 7 T3: pasarela simulada de punta a punta, correos por Resend, medios en Supabase Storage con optimización efectiva y reset de contraseña                                                                                                                                                                                                                                                                                                                       | Fase 7   |          55% |            90% |
| 2026-08-29 | Fase 7 cerrada: smoke del pago aprobado, rechazado y del webhook repetido; P-002 resuelta y P-001 acotada                                                                                                                                                                                                                                                                                                                                                           | Fase 7   |          90% |           100% |
| 2026-08-29 | Fase 8: el piloto de ERP pasa de Camelot a Estilo Sport, con el puerto `ERPAdapter` en el core, el adapter del ORDS y el importador acotado. 100 productos y 194 variantes reales en la base, idempotente en la segunda corrida                                                                                                                                                                                                                                     | Fase 8   |           0% |            70% |
| 2026-08-29 | El sidebar del Admin volvió a funcionar —los dos menús lanzaban una excepción de Base UI al abrirse— y el Admin ganó su primer smoke: 6 tests entre desktop y mobile que cubren login, menús, cambio de tienda, navegación y cierre de sesión                                                                                                                                                                                                                       | Fase 8   |          70% |            75% |
| 2026-08-29 | Los tres códigos de un producto separados —SKU del modelo, interno del ERP, de barra del proveedor—, con el hallazgo de 7 variantes que el ERP duplica y a las que se les sumaba el stock. Fotos sin recortar y breadcrumb corregido                                                                                                                                                                                                                                | Fase 8   |          75% |            85% |
| 2026-08-29 | Imágenes del catálogo de Estilo Sport migradas desde el proyecto del cliente al bucket propio: 129 fotos en 75 de los 100 productos, optimizadas por `/_image`, con RLS del origen verificada antes de usar su clave                                                                                                                                                                                                                                                | Fase 8   |          75% |            85% |
| 2026-08-29 | T2 de la Etapa A: lint, typecheck, 189 unitarios, build y 59 tests de Playwright en verde. Al intentar medir a escala apareció que el `healthCheck` da verde con el ERP caído, así que vuelve a abrirse                                                                                                                                                                                                                                                             | Fase 8   |          85% |            82% |
| 2026-08-29 | Fase 8 cerrada con la Etapa A completa. La B se descarta para este cliente, que no da escritura sobre su ERP ni contra un entorno de prueba; el `healthCheck` y la medición a escala pasan al backlog                                                                                                                                                                                                                                                               | Fase 8   |          82% |           100% |
| 2026-08-29 | Fase 9 Etapa A: motor de promociones en el core como especificación ejecutable, tabla con su RLS y el permiso `promotion.write`, y `create_order` calculando el descuento dentro de su transacción. ADR-091 y ADR-092                                                                                                                                                                                                                                               | Fase 9   |           0% |            35% |
| 2026-08-29 | El catálogo muestra el precio efectivo —incluido `lowest`, que gobierna el filtro y el orden por precio— y el carrito y el checkout toman el dinero de la misma función que el pedido, con desglose y campo de cupón                                                                                                                                                                                                                                                | Fase 9   |          35% |            50% |
| 2026-08-29 | Etapa A cerrada: el Admin crea campañas sin código, con preview de alcance y gating por `promotion.write`. Verificado de punta a punta contra la tienda de Estilo Sport                                                                                                                                                                                                                                                                                             | Fase 9   |          50% |            60% |
| 2026-08-29 | Fase 9 cerrada. Etapa B: las secciones de la home son colecciones —manual o dinámica, que es una consulta guardada—, más banners y la pantalla de categorías. `newest` y `best-selling` en las dos implementaciones. ADR-093                                                                                                                                                                                                                                        | Fase 9   |          60% |           100% |
| 2026-08-29 | La portada pasa a componerse por **secciones** con tipo y layout: banner principal con slides, avisos, carruseles y categorías, todo ordenable. Corrige el modelo de ADR-093, que sólo servía para los carruseles. ADR-094                                                                                                                                                                                                                                          | Fase 9   |         100% |           100% |
| 2026-08-29 | Dieciséis mejoras de uso en el Admin: confirmación en todo borrado, orden por flechas, migas de pan, íconos de acción, validación que se ve y acciones desde las listas. ADR-096                                                                                                                                                                                                                                                                                    | Fase 9   |         100% |           100% |
| 2026-08-29 | Fase 9: el Admin se reorganiza con la distribución de Shopify —encabezado con ícono y acción principal, contenido en tarjetas, filtros y paginación adentro— y se unifican paginación, desplegables, estados vacíos y de error (ADR-097)                                                                                                                                                                                                                            |
| 2026-08-29 | Contenido deja de ser una pantalla con pestañas: el sidebar despliega Secciones, Colecciones y Categorías, que pasan a ser rutas reales. Se va el parámetro `?tab=` y sus doce call sites sin tipar (ADR-098)                                                                                                                                                                                                                                                       |
| 2026-08-30 | Fase 10 Etapa A: la tubería de eventos. Captura del lado del servidor —cero JavaScript nuevo—, sesión anónima sin banner, `store_events` con RLS, puerto `AnalyticsDestination` que cierra P-003, y la pantalla de Analytics en el Admin. La conversión sale de `orders` y sólo cuenta el tramo medido (ADR-099)                                                                                                                                                    |
| 2026-08-30 | Fase 10 cerrada. Etapa B: `order_items` guarda el costo, así que hay margen —siempre con su cobertura, porque un margen parcial no es un margen—. «Lo más vendido» pasa a ser «Ventas por producto»: tabla paginada con dos modos, margen y export CSV. Y un aviso que no salió se ve en el pedido (ADR-101, ADR-102)                                                                                                                                               |
| 2026-08-30 | Después de comprar, el carrito podía volver a llenarse: una revalidación en vuelo lo reescribía tras vaciarlo. `replaceLines` deja de resucitar un carrito vacío (ADR-100)                                                                                                                                                                                                                                                                                          |
| 2026-08-30 | Fase 11 cerrada: BYOK con la credencial cifrada, el Worker propio del Admin y el enriquecimiento de producto que propone sin escribir                                                                                                                                                                                                                                                                                                                               | Fase 11  |           0% |           100% |
| 2026-08-30 | Fase 12: el storefront dice el nombre de su tienda, existe el costo de envío y el modo demostración, las funciones paginadas tienen techo y v1 queda cerrada salvo el piloto                                                                                                                                                                                                                                                                                        | Fase 12  |           0% |            90% |
| 2026-08-31 | Repaso de interfaz del Admin: panel de edición, barra de acciones al pie, desplegables de shadcn, íconos de Hugeicons, zona de arrastre, anchos de tabla, borrado y paginación de categorías, selección de categorías por sección y filtro de tiempo en clientes                                                                                                                                                                                                    | v1.1     |          98% |            98% |
| 2026-09-01 | El listado del catálogo pasa de 2287 a 233 ms en la primera página y de 3886 a 229 en la 100, con 5006 productos: `lowest` era una subconsulta correlacionada contra un CTE, y el corte de página iba después de serializar. Eran dos costos, no uno                                                                                                                                                                                                                | v1.1     |          98% |            98% |
| 2026-09-02 | **Treeshop**, el primer cliente real: `apps/treeshop/` como app hermana en el monorepo (ADR-110), tienda `sontres.shop` provisionada, y el catálogo de Camelot importado con `pnpm camelot:importar` —3752 productos, 10 241 variantes, 4054 fotos— con la conversión de dólares a guaraníes por producto (ADR-111). Portada sembrada con `pnpm treeshop:home`; hero y avisos de marca esperan el arte del cliente                                                  | Treeshop |           0% |            60% |
| 2026-09-10 | Treeshop abre por novedad: el importador conserva la fecha de alta de Camelot, «Novedades» es opción y default de la PLP, y «En trendy» es una colección dinámica por novedad. Al ordenar así, la tanda de agosto —sin fotografiar en Camelot— pasaba a ser las primeras seis páginas: los productos sin foto se ocultan a pedido de la tienda, con la misma mecánica que el stock y el default al revés (ADR-112) | Treeshop |           75% |            78% |
| 2026-09-09 | Treeshop, primera ronda de correcciones del cliente sobre la tienda en local: logo inline, header pegajoso y transparente sobre el hero, pie propio, PLP con filtros como ícono y controles pastilla. En los paquetes, con default igual: slot `logo`, `CartButton` ícono, `--radius-button`, `--color-media`, flechas y auto-avance opt-in en los carruseles (ADR-113). Los productos sin stock salen del listado por defecto, con el ajuste en el Admin (ADR-112) | Treeshop |          60% |            75% |

---

# Próximo paso recomendado

1. Fase 0 — Foundation.
2. Fase 1 — Design System.
3. Fase 3 — Multitenancy/Domain Model en paralelo con Fase 2.
4. Crear temprano el Track Camelot en modo read-only si existe acceso.
5. No esperar a terminar todo v1 para crear la primera demo real.

---

# Requerimientos transversales añadidos

Estos requisitos aplican a varias fases y no deben tratarse como backlog cosmético.

## UX / Interaction

**Avance: 94%**

- [x] Definir loading/pending/error/success states para acciones asíncronas. En Add to Cart y en el login del Admin.
- [x] Add to Cart con feedback inmediato y prevención de doble submit. El bloqueo va con un ref, no con estado: dos clicks en el mismo tick pasarían ambos.
- [x] PLP filters sin full page reload. ClientRouter acotado a la PLP (ADR-042).
- [x] Skeletons para grid/listas relevantes. Filas skeleton en las tablas del Admin y bloques en el resumen y la configuración; en la PLP, `aria-busy` y atenuado mientras el router trae la página — no placeholders, porque la ruta es on-demand y el HTML ya llega con productos.
- [x] Focus states y keyboard accessibility. `focus-visible` en todo lo accionable; verificado con Playwright.
- [x] Pointer/cursor para elementos accionables.
- [x] Mobile UX revisada en Storefront y Admin. Playwright corre todo el smoke también en viewport mobile.
- [x] `prefers-reduced-motion` en motion premium. `motion-reduce` en galería, carrusel y transiciones de card.

## Data loading / Pagination

**Avance: 75%**

- [x] Paginación PLP. Con ventana de páginas y `rel=prev/next`.
- [x] Server-side filters/sort. Ruta on-demand; nunca se filtra en el browser (ADR-024).
- [x] Paginación Admin Products. En el servidor, con búsqueda por título, marca y SKU.
- [x] Paginación Admin Orders. En el servidor, con búsqueda por número, nombre, correo y teléfono, y filtro por estado.
- [x] Paginación Admin Customers. En el servidor, con búsqueda por nombre, correo y teléfono.
- [ ] Paginación Promotions/Discounts.
- [ ] Paginación Audit/Sync logs.
- [x] Evitar fetch de datasets completos. En el storefront y en las tres listas del Admin.

## PLP Facets

**Avance: 90%**

- [x] Accordion filters. `<details>` nativo, sin JavaScript.
- [x] Talla/variante.
- [~] Género. Declarado en `attribute_definitions` y filtrable; la faceta aparece cuando un producto lo use.
- [x] Marca.
- [x] Color.
- [~] Categoría/subcategoría. Categoría lista como faceta de producto; la subcategoría espera la taxonomía de Fase 4.
- [x] Precio. Cuatro tramos sobre el mínimo y el máximo del catálogo, con radios: dos tramos a la vez darían un rango contradictorio.
- [x] Atributos dinámicos. Las facetas se proyectan desde los atributos reales de las variantes.
- [x] Counts. Cada faceta ignora su propia selección al contar, o sus otras opciones darían cero.
- [x] "Ver más". `<details>` anidado, sin JavaScript.
- [x] URL state. Compartible y recargable.
- [x] Mobile filter drawer. Sheet con `<dialog>` nativo (ADR-049).

## Multi-currency

**Avance: 82%**

- [x] Moneda base.
- [x] Monedas de display.
- [x] Moneda de checkout. Separada de la mostrada: mostrar en USD no es cobrar en USD.
- [x] Tipo de cambio manual.
- [x] Audit del cambio. `actualizarTasa` devuelve la configuración y su entrada de auditoría juntas: no se puede cambiar la tasa sin obtener qué auditar.
- [x] Regla de redondeo.
- [x] UI Admin. Tipo de cambio manual con su fecha, quién lo cambió y auditoría en la misma transacción.
- [ ] Product/PDP price display.
- [~] Compatibilidad ERP/gateway documentada. La mitad del ERP sí: el ORDS de Estilo Sport entrega enteros en PYG, que es directamente la unidad mínima del tipo `Money`, sin decimales ni conversión (ADR-085). Falta la del gateway, que espera a P-001.

## Linked Colors

**Avance: 30%**

- [x] Modelar product families/siblings. Tabla `product_groups` y `product_group_id` en el producto.
- [ ] `linkedColors` feature.
- [ ] Product Card swatches.
- [ ] PDP sibling navigation.
- [~] Compatibilidad con ERP que modela colores como productos separados. **Confirmado con datos reales:** el ORDS de Estilo Sport hace exactamente eso —457 modelos existen como códigos distintos que sólo difieren en el color, y un mismo modelo de mochila llega a 52 productos separados—. Es el caso para el que existe `product_groups` (ADR-026). El importador todavía no los agrupa: hacerlo por el nombre es una heurística sobre texto libre y necesita decidirse aparte.

## Premium Motion

**Avance: 0%**

- [ ] Extension pattern para GSAP/Motion.
- [ ] Carga lazy/selectiva.
- [ ] ScrollTrigger demo.
- [ ] Reduced motion.
- [ ] Performance budget.
