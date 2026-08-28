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
| v1      | Commerce Core vendible + primer piloto real | IN PROGRESS |    32% |
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
- [x] Confirmar que `AGENTS.md`, `PROJECT.md`, `ROADMAP.md`, `DECISIONS.md` y `ENGINEERING_HARNESS.md` forman parte del repo.

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
- [x] Definir budgets de performance razonables. 25 KB de JS y 20 KB de CSS por página, gzip, verificado en CI con `pnpm budget`.
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

**Avance: 0%**

Objetivo: cobro y comunicación transaccional.

- [ ] Definir `PaymentProvider`.
- [ ] Implementar primer gateway real.
- [ ] Verificar webhooks.
- [ ] Crear payment status.
- [ ] Manejar retries/idempotency.
- [ ] Implementar transferencia bancaria manual.
- [ ] Definir `NotificationProvider`.
- [ ] Implementar Resend.
- [ ] Email order_received.
- [ ] Email order_confirmed.
- [ ] Email order_shipped/delivered cuando corresponda.
- [ ] Password/reset emails.

**Definition of Done**

- pago sandbox/test pasa end-to-end
- webhook repetido no duplica efectos
- pedido genera notificación esperada

---

## Fase 8 — ERP Adapter Architecture + Camelot Shadow Pilot

**Avance: 0%**

Objetivo: validar adapters con un ERP real sin poner operación en riesgo.

- [ ] Definir `ERPAdapter`.
- [ ] Definir capability matrix.
- [ ] Crear mapper/normalizer.
- [ ] Crear validator.
- [ ] Crear sync logs.
- [ ] Crear healthCheck.
- [ ] Implementar adapter Camelot read-only.
- [ ] Mapear catálogo Camelot.
- [ ] Mapear stock.
- [ ] Mapear precios cuando corresponda.
- [ ] Mapear locations.
- [ ] Crear shadow catalog.
- [ ] Crear diff/reconciliation report.
- [ ] Medir tiempos con catálogo grande.
- [ ] Probar delta sync.
- [ ] Documentar limitaciones del ERP.
- [ ] Evaluar si soporta reservations/webhooks.

**No bloquear**
Esta fase puede comenzar antes de que v1 esté completa si el acceso al ERP está disponible.

**Definition of Done**

- Pick Commerce puede clonar/sincronizar catálogo real sin escribir en ERP
- diferencias pueden auditarse
- source of truth queda explícito

---

## Fase 9 — Promotions y CMS v1

**Avance: 0%**

Objetivo: merchandising real.

- [ ] Promotion model.
- [ ] percentage discount.
- [ ] fixed amount.
- [ ] minimum cart.
- [ ] minimum quantity.
- [ ] free shipping.
- [ ] coupon.
- [ ] start/end date.
- [ ] product/category/collection targeting.
- [ ] prioridad/stackability mínima.
- [ ] preview/simulation básica.
- [ ] banners desktop/mobile.
- [ ] banner links a colección/producto/ruta.
- [ ] category image/icon.
- [ ] featured/new/best sellers sections.
- [ ] manual/dynamic collections en CMS.

**Definition of Done**

- Admin puede crear una campaña de descuento sin código
- storefront refleja promoción correctamente

---

## Fase 10 — Analytics v1

**Avance: 0%**

Objetivo: métricas comerciales esenciales.

- [ ] Definir event schema.
- [ ] page_view.
- [ ] product_view.
- [ ] search.
- [ ] search_no_results.
- [ ] add_to_cart.
- [ ] begin_checkout.
- [ ] checkout_completed.
- [ ] coupon_applied.
- [ ] Dashboard ventas.
- [ ] AOV.
- [ ] units.
- [ ] conversion básica.
- [ ] best sellers.
- [ ] slow movers básico.
- [ ] search insights.
- [ ] export CSV.
- [ ] margen cuando exista costo.
- [ ] abstraer storage para migración futura.

**Definition of Done**

- métricas coinciden con orders para una ventana de prueba
- los eventos no bloquean UX del storefront

---

## Fase 11 — OpenAI v1

**Avance: 0%**

Objetivo: AI útil sin volverla requisito del ecommerce.

- [ ] BYOK OpenAI por tenant.
- [ ] Storage cifrado de API key.
- [ ] Test connection.
- [ ] AI enrichment de producto.
- [ ] OCR/vision de etiqueta cuando corresponda.
- [ ] Generación de nombre/description/category/attributes.
- [ ] Human review antes de datos dudosos.
- [ ] Prohibir inventar datos críticos.
- [ ] Search query understanding básico.
- [ ] AI summary de analytics opcional.

**Definition of Done**

- un tenant sin OpenAI sigue funcionando normalmente
- un tenant con key puede enriquecer un producto
- secrets no aparecen en frontend/logs

---

## Fase 12 — Demo + Pilot Hardening

**Avance: 0%**

Objetivo: vender y operar el primer piloto.

- [ ] Crear preset Blank.
- [ ] Crear preset Fashion.
- [ ] Crear preset Sport o Wholesale.
- [ ] Crear demo real.
- [ ] Crear seed data.
- [ ] Crear modo checkout demo.
- [ ] Crear checklist de onboarding.
- [ ] Crear observability básica.
- [ ] Crear error tracking.
- [ ] Crear backups/restore procedure.
- [ ] Revisar RLS.
- [ ] Revisar webhooks/idempotency.
- [ ] Ejecutar Playwright critical path.
- [ ] Ejecutar pruebas con catálogo grande.
- [ ] Registrar known limitations.
- [ ] Procesar piloto real.

**Definition of Done**

- un prospecto puede probar una demo 100% basada en Commerce Core
- primer retailer puede operar sin intervención técnica constante

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

## ERP — Camelot

**Avance: 0%**

- [ ] obtener documentación/acceso.
- [ ] mapear endpoints/files.
- [ ] clone read-only.
- [ ] diff.
- [ ] sync strategy.
- [ ] benchmark catálogo grande.

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

| Fecha      | Hallazgo                                                                                       | Impacto                                                                                                                                                                                                                                                                                                                     | Acción                                                                                                                                                                                                                                                                | Fase destino | Estado    |
| ---------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| 2026-08-24 | Los requisitos transversales quedaron en 0% con la mitad ya hecha                              | El ROADMAP dejó de reflejar el estado real                                                                                                                                                                                                                                                                                  | Reconciliados contra el código                                                                                                                                                                                                                                        | —            | Resuelto  |
| 2026-08-24 | Falta estado de carga en el grid al filtrar la PLP                                             | El usuario no ve que algo pasó entre el click y los resultados                                                                                                                                                                                                                                                              | `aria-busy` y atenuado del grid mientras el router trae la página. No son placeholders: la ruta es on-demand y el HTML ya llega con productos                                                                                                                         | Fase 4       | Resuelto  |
| 2026-08-24 | La faceta de precio necesita rango, no valores discretos                                       | Con muchos precios la faceta sería inusable                                                                                                                                                                                                                                                                                 | Cuatro tramos calculados sobre el catálogo entero                                                                                                                                                                                                                     | Fase 4       | Resuelto  |
| 2026-08-24 | La verificación de RLS con JWTs reales es manual                                               | No corre en CI: exige credenciales fuera del repo                                                                                                                                                                                                                                                                           | Repetirla al tocar RLS y antes del piloto                                                                                                                                                                                                                             | Fase 12      | Pendiente |
| 2026-08-24 | Revisión adversarial de Fase 1 interrumpida                                                    | Quedó sin ejecutar; puede haber hallazgos no vistos                                                                                                                                                                                                                                                                         | Relanzarla sobre el código actual                                                                                                                                                                                                                                     | —            | Pendiente |
| 2026-08-24 | Lighthouse completo no corre en CI                                                             | El presupuesto de bytes acota, pero no cubre CWV bajo red real                                                                                                                                                                                                                                                              | Ejecutar en pre-release                                                                                                                                                                                                                                               | Fase 12      | Pendiente |
| 2026-08-26 | El drawer del carrito abrió vacío una vez en 3 corridas del smoke                              | Un cliente agregaba al carrito y no veía lo que agregó                                                                                                                                                                                                                                                                      | Causa encontrada el 27/08: `ADD_TO_CART_EVENT` es fire-and-forget y las dos islands hidratan por separado; si el clic llegaba antes de que el drawer montara, el evento se perdía. Ahora la apertura se pide en el módulo compartido y el drawer la consume al montar | Fase 5       | Resuelto  |
| 2026-08-26 | El deploy de Cloudflare no espera al CI                                                        | Los dos salen del mismo push y corren en paralelo: un commit que rompe los tests llega a producción igual, y antes de que la corrida termine                                                                                                                                                                                | Desplegar desde el propio CI, como último paso después del e2e, y desconectar Workers Builds                                                                                                                                                                          | Fase 12      | Pendiente |
| 2026-08-26 | El e2e sólo funcionaba porque lo corría un agente de código                                    | La primera corrida real del CI quedó colgada una hora en `pnpm e2e`: `astro preview` sólo se demoniza con `--background` o cuando detecta un agente, y el runner no lo es                                                                                                                                                   | Bandera `--background` en `e2e/global-setup.ts`. Comprobado sin las variables del agente: sin la bandera el comando no vuelve, con ella sí. CI en verde de punta a punta en 3m 37s                                                                                    | Fase 4       | Resuelto  |
| 2026-08-26 | `pnpm format:check` está en rojo en `main`, con 50 archivos                                    | Nadie lo nota: el CI corre lint pero no el formato, así que la deuda crece en silencio                                                                                                                                                                                                                                      | Correr `pnpm format` en un commit propio y agregar el paso al workflow                                                                                                                                                                                                | Fase 5       | Pendiente |
| 2026-08-27 | Un comercio podía escribir stock, imágenes y variantes sobre el catálogo de otro               | Reproducido: el storefront de la víctima pasó de 30 a 10029 unidades, y su propio Admin seguía viendo 30. RLS valida la columna `tenant_id`, no de quién es el padre al que la fila apunta                                                                                                                                  | Claves foráneas compuestas que llevan el tenant, en las 18 hijas. ADR-063, con 7 tests que fallan si se quita la migración                                                                                                                                            | Fase 5       | Resuelto  |
| 2026-08-27 | `anon` conservaba `EXECUTE` sobre todas las funciones pese al `revoke ... from public`         | No explotable con funciones `security invoker`, pero la primera `security definer` —crear un pedido— habría quedado invocable desde cualquier browser                                                                                                                                                                       | `revoke ... from anon` explícito. ADR-064. PGlite no puede detectarlo: se verifica contra el proyecto real                                                                                                                                                            | Fase 5       | Resuelto  |
| 2026-08-27 | `catalog_search` nunca se probó contra datos de otra tienda                                    | El fixture creaba la tienda ajena y no le ponía productos: borrar el filtro de tienda dejaba la suite en 36/36 verde                                                                                                                                                                                                        | Producto ajeno en el fixture + dos casos sobre el camino de la secret key. Con ellos, el mismo sabotaje da 17 fallos                                                                                                                                                  | Fase 5       | Resuelto  |
| 2026-08-27 | `STOREFRONT_DOMAIN` quedaba horneado en el bundle y `deploy` no reconstruía                    | Cargarla en el Worker no hacía nada. El segundo comercio habría servido el catálogo del primero, y desde Fase 5 le habría escrito los pedidos en el tenant equivocado                                                                                                                                                       | Pasa a leerse en runtime; `deploy` construye siempre. ADR-052 corregido                                                                                                                                                                                               | Fase 5       | Resuelto  |
| 2026-08-27 | Guardar stock en una tienda sin sucursal se descartaba en silencio                             | El Admin mostraba éxito y el producto quedaba invendible; en un import de 500 filas, las 500 decían ok                                                                                                                                                                                                                      | La función falla nombrando la causa. Lo destapó un test existente que dependía del descarte                                                                                                                                                                           | Fase 5       | Resuelto  |
| 2026-08-27 | ADR-052 nombraba `assertCan`/`assertSameTenant` como la defensa del camino secret-key          | No tienen un solo llamador fuera de sus tests: quien escribiera el checkout asumiría una guarda inexistente                                                                                                                                                                                                                 | ADR-052 corregido con lo que defiende de verdad y con lo que eso le exige a Fase 5                                                                                                                                                                                    | Fase 5       | Resuelto  |
| 2026-08-27 | Correr `pnpm e2e` en local deja pedidos de prueba en el proyecto de desarrollo                 | El seed restituye el catálogo pero no borra pedidos, así que el Admin se llena de basura entre corridas. En CI no pasa: la base es efímera                                                                                                                                                                                  | El teardown borra los pedidos cuyo correo termina en `@e2e.test`, en un subproceso: hecho en el mismo proceso, el cliente de Supabase dejaba sockets abiertos y Node en Windows moría con una aserción de libuv, devolviendo error con todo en verde                  | Fase 6       | Resuelto  |
| 2026-08-27 | Un producto cuyas variantes no declaran atributos quedaba invendible                           | El Admin permite crearlo, el catálogo devolvía su stock correctamente y el PDP igual mostraba «Sin stock»: sin atributos no había opciones, la selección quedaba vacía y no resolvía ninguna variante. Ninguna variante del seed tiene atributos vacíos, así que el caso nunca se ejercitó                                  | Sin atributos, la dimensión por la que se elige es la variante misma, y su título es el valor. Cinco tests que fallan sin el arreglo                                                                                                                                  | Fase 5       | Resuelto  |
| 2026-08-27 | La guarda contra el doble submit del checkout no se puede verificar desde afuera               | Cuándo se libera depende de si la respuesta llega antes que el segundo click: contra una base local pasa, contra una remota no. Un test sobre eso pasa por latencia, no por corrección                                                                                                                                      | Cerrado con la justificación registrada: el e2e afirma la garantía —un solo pedido— y la guarda queda como endurecimiento, sin test propio                                                                                                                            | Fase 6       | Resuelto  |
| 2026-08-27 | El carrito no valida lo que lee de `localStorage`, y toda excepción se ve como «carrito vacío» | Con la forma vieja de `CartLine`, el día del deploy de Fase 5 cada cliente con carrito guardado lo ve vacío mientras el badge dice que tiene ítems                                                                                                                                                                          | Parse validador + versión de la clave, al reemplazar el store en T2                                                                                                                                                                                                   | Fase 5       | Pendiente |
| 2026-08-27 | Dos pestañas: la segunda pisa el carrito de la primera                                         | Caché de módulo que no relee y `persist` que escribe el array entero. El cliente pierde ítems sin ninguna señal                                                                                                                                                                                                             | Releer al escribir y escuchar `storage`, en T2                                                                                                                                                                                                                        | Fase 5       | Pendiente |
| 2026-08-27 | El carrito no tiene tope de cantidad: 44 unidades de un producto con 4 en stock                | `CartLine` no lleva `available` y `CartContents` monta el selector sin `max`                                                                                                                                                                                                                                                | `available` en la línea, en T2                                                                                                                                                                                                                                        | Fase 5       | Pendiente |
| 2026-08-27 | El subtotal suma monedas distintas a mano en vez de usar `addMoney`                            | Sumó Gs. 389.000 + USD 50 como si fueran guaraníes, sin error ni aviso                                                                                                                                                                                                                                                      | Usar `addMoney`, que ya existe y falla fuerte, en T2                                                                                                                                                                                                                  | Fase 5       | Pendiente |
| 2026-08-27 | El Admin lee el stock sumado de todas las sucursales y lo escribe a una sola                   | Con dos sucursales, cada guardado sin tocar el campo infla el total: 30 → 50 → 70. Hoy no alcanzable porque no hay pantalla de sucursales                                                                                                                                                                                   | Decidir el modelo de stock por sucursal                                                                                                                                                                                                                               | Fase 8       | Pendiente |
| 2026-08-27 | Un negativo en una sucursal se compensa contra otra en la suma                                 | El descuadre queda invisible en todas las lecturas, que es lo que el espejo del ERP quería evitar                                                                                                                                                                                                                           | Exponer el negativo por sucursal en el Admin                                                                                                                                                                                                                          | Fase 8       | Pendiente |
| 2026-08-27 | `p_per_page` no tiene techo y el sitemap pagina de a 500 sin límite                            | Una ruta pública de SEO puede agotar el pool de conexiones por el que pasará el checkout                                                                                                                                                                                                                                    | `least(p_per_page, 200)` dentro del RPC                                                                                                                                                                                                                               | Fase 12      | Pendiente |
| 2026-08-27 | Ninguna ruta on-demand emite `Cache-Control`                                                   | Sin headers, un proxy intermedio tiene permiso de cachear heurísticamente. Los `/api/*` de Fase 5 devuelven datos por cliente                                                                                                                                                                                               | `no-store` en los endpoints nuevos; revisar las páginas                                                                                                                                                                                                               | Fase 5       | Pendiente |
| 2026-08-27 | El setup de e2e deja la secret key en claro en `dist/server/.dev.vars`                         | No se despliega ni se sirve —verificado—, pero queda en disco hasta el próximo build                                                                                                                                                                                                                                        | Borrarla en el teardown                                                                                                                                                                                                                                               | Fase 5       | Pendiente |
| 2026-08-26 | El deploy necesita los secretos del Worker cargados a mano                                     | Sin ellos el storefront responde 500 sin cuerpo, y nada dice qué falta                                                                                                                                                                                                                                                      | Cargados en `pick-commerce`. Además el sitio ahora responde 503 nombrando las variables ausentes                                                                                                                                                                      | Fase 4       | Resuelto  |
| 2026-08-26 | El script de deploy apuntaba a `dist/client/wrangler.json`, que el build ya no emite           | El deploy fallaba antes de empezar                                                                                                                                                                                                                                                                                          | Corregido a `dist/server/wrangler.json`, verificado con `--dry-run` sobre el script real                                                                                                                                                                              | Fase 4       | Resuelto  |
| 2026-08-26 | El Admin escribe el stock en la primera sucursal de la tienda                                  | Con más de un depósito, el ajuste va al que no es                                                                                                                                                                                                                                                                           | Selector de sucursal en el formulario                                                                                                                                                                                                                                 | Fase 8       | Pendiente |
| 2026-08-26 | El bundle del Admin pasa los 500 KB en un solo chunk                                           | Sólo afecta la primera carga de una app detrás de login                                                                                                                                                                                                                                                                     | Una pantalla por chunk con `React.lazy`. La primera carga pasó de 714 KB a ~561 KB, y lo pesado sólo baja al visitarse. ADR-071                                                                                                                                       | Fase 6       | Resuelto  |
| 2026-08-26 | El `site` del storefront apuntaba a un dominio inexistente                                     | Canonical, og:url, JSON-LD y sitemap anunciaban una dirección que no resuelve, anulando el SEO y el GEO de Fase 2                                                                                                                                                                                                           | Corregido a la URL real del Worker; `SITE_URL` acepta el dominio sin esquema                                                                                                                                                                                          | Fase 4       | Resuelto  |
| 2026-08-26 | El Admin no acota por el dominio desde el que se entra                                         | Sólo se nota cuando una misma persona administra varios comercios: el branding dice uno y el selector muestra todos. El aislamiento de datos no depende de esto, lo da RLS                                                                                                                                                  | Decidido que no: el Admin es una sola aplicación en un dominio compartido (ADR-062), el aislamiento lo da RLS y el selector resuelve la comodidad. ADR-072                                                                                                            | Fase 6       | Resuelto  |
| 2026-08-26 | `stores.domain` admite un solo dominio por tienda                                              | Un comercio con `.com` y `.com.py` necesitaría dos tiendas                                                                                                                                                                                                                                                                  | Modelo decidido —tabla `store_domains` de alias con 301 al canónico— e implementación diferida al primer caso real. ADR-074                                                                                                                                           | Fase 6       | Resuelto  |
| 2026-08-28 | `membresiasDe` devolvía las membresías de todo el equipo con el rol ajeno                      | La consulta no filtraba por usuario porque un comentario afirmaba que RLS lo hacía; RLS acota por organización, no por persona. Latente tres fases: apareció al cablear el gating, cuando el Admin le mostró a un `viewer` los controles de un `owner`. La base rechazó todo igual                                          | Filtrado por `user_id`, con un test de PGlite que fija el comportamiento de la política para que el motivo no se pierda. ADR-073                                                                                                                                      | Fase 6       | Resuelto  |
| 2026-08-28 | La guarda del último owner impedía dar de baja una organización                                | Reproducido: `delete from organizations` cascadea a `memberships` y disparaba el trigger, que fallaba diciendo que faltaba un propietario cuando la organización se estaba yendo. Offboarding de un cliente imposible                                                                                                       | El trigger se saltea si la organización ya no existe, que es el orden que garantiza Postgres en una cascada. Test de los dos lados. ADR-068                                                                                                                           | Fase 6       | Resuelto  |
| 2026-08-28 | Dos tests de e2e clicaban islands antes de que hidrataran                                      | Fallo intermitente que parecía de la aplicación: el botón existe, el click no hace nada y el drawer nunca abre. Aparece o no según lo cargada que esté la máquina, así que en CI sería ruido rojo sin causa                                                                                                                 | Esperar a que no queden `astro-island[ssr]`, que es la señal que da Astro al terminar de hidratar. Tres corridas seguidas en verde                                                                                                                                    | Fase 6       | Resuelto  |
| 2026-08-28 | El compilador de React no memoiza el listado de productos                                      | TanStack Table devuelve funciones que no se pueden memoizar sin arriesgar interfaz vieja, así que el compilador saltea el componente entero. Con veinte filas no se nota                                                                                                                                                    | Aceptado y anotado en el archivo; el lint lo avisa en cada corrida. Si alguna vez pesa, la salida es virtualizar                                                                                                                                                      | Fase 8       | Pendiente |
| 2026-08-28 | El Admin no tiene e2e propio                                                                   | Las pantallas se validan con unitarios, PGlite, typecheck y un recorrido manual con tres roles. Un cambio que rompa el gating o un formulario no lo detecta nadie automáticamente                                                                                                                                           | Evaluar un smoke de Playwright del Admin cuando aparezcan flujos de dinero en él                                                                                                                                                                                      | Fase 7       | Pendiente |
| 2026-08-28 | El buscador de pedidos no encontraba nada con el número tal como se muestra                    | La tabla muestra «#1028» y el heno guardaba «1028», así que quien buscaba el pedido que tenía delante recibía cero resultados. Se lee como que el buscador está roto, y los tres primeros términos que se prueban al verificarlo —número, nombre, correo— funcionan todos                                                   | El heno guarda el número con almohadilla; el filtro busca subcadenas, así que las dos formas andan. Test que falla sin el cambio. ADR-078                                                                                                                             | Fase 6       | Resuelto  |
| 2026-08-28 | No había forma de marcar un pedido como pagado                                                 | `payment_status` existía desde Fase 5 y ninguna pantalla lo tocaba. Con transferencia bancaria, que es el único medio, cobrar es una persona mirando un comprobante: sin esto la operación de cobro no existía                                                                                                              | `admin_set_payment_status`, con registro en la timeline y control en la lista y en el detalle. ADR-077                                                                                                                                                                | Fase 6       | Resuelto  |
| 2026-08-28 | Archivar un producto era un camino de ida                                                      | La fila dejaba de ofrecer el botón al archivar, así que un producto archivado por error quedaba, para quien miraba la lista, roto. Sólo se recuperaba abriendo el formulario                                                                                                                                                | Interruptor de publicado/archivado en la fila, y «Publicar» en lote con la misma semántica. ADR-076                                                                                                                                                                   | Fase 6       | Resuelto  |
| 2026-08-28 | Las miniaturas del catálogo se ven rotas en el Admin                                           | Los medios guardan rutas del storefront (`/products/x.jpg`) que desde el dominio del Admin no resuelven. No es nuevo; el rediseño lo hizo visible                                                                                                                                                                           | Paliado: la miniatura va dentro del recuadro gris, así que sin imagen queda el recuadro. Resolver las rutas contra el dominio de la tienda exige que el resumen de tienda lo lleve                                                                                    | Fase 7       | Pendiente |
| 2026-08-28 | El sidebar subió la primera carga del Admin de 561 KB a 707 KB                                 | Sus primitivas —menús, tooltips, la hoja de mobile— las carga la cáscara. Se compró una navegación que aguanta las secciones que faltan                                                                                                                                                                                     | Aceptado y medido. Si molesta, cargar la hoja de mobile y el tooltip bajo demanda dentro del propio primitive. ADR-075                                                                                                                                                | Fase 8       | Pendiente |
| 2026-08-28 | Ninguna imagen de producto se optimiza, aunque el componente diga que sí                       | Medido en producción: el catálogo emite un `srcset` de ocho candidatos que apuntan todos al mismo archivo. Las del seed viven en `public/`, que Astro nunca procesa, y las remotas no están autorizadas en `image.remotePatterns`. 324 KB de imágenes en la primera página y 6 KB de HTML de un `srcset` que no ofrece nada | Comprobado que autorizar el host lo arregla —el mismo componente pasa a emitir `/_image?…&w=640&f=webp`, 28 KB contra 62—. La implementación va con el host de medios definitivo. ADR-079, P-002                                                                      | Fase 7       | Pendiente |
| 2026-08-28 | Cargar una imagen de producto sólo admite pegar una URL                                        | No hay subida de archivos, así que los medios dependen de hosts ajenos que pueden caerse o bloquear el hotlink; y como los hosts son cualquiera, no se pueden autorizar para optimizar sin abrir el patrón a todo `https`, que convertiría al storefront en un redimensionador gratis para terceros                         | Subida al almacenamiento propio desde el Admin, con un host por despliegue y su `remotePatterns`. Es P-002 y ADR-079 le puso el número                                                                                                                                | Fase 7       | Pendiente |

Ejemplos de hallazgos:

- un ERP no soporta reservas;
- una categoría necesita un atributo no contemplado;
- un provider exige un webhook adicional;
- un flujo de checkout tiene un edge case real;
- una decisión de UI no escala a Wholesale.

Cuando el hallazgo implique una decisión arquitectónica, crear además una entrada en `DECISIONS.md`.

---

# Changelog de avance

| Fecha      | Cambio                                                                                                                                                                                  | Fase   | Avance antes | Avance después |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -----------: | -------------: |
| —          | Roadmap inicial                                                                                                                                                                         | —      |           0% |             0% |
| 2026-08-23 | Fase 0: monorepo pnpm, TypeScript/ESLint/Prettier, Tailwind v4, paquetes `@pick/commerce-types` y `@pick/commerce-core`, apps `admin` y `demo`, CI y estructura de migraciones Supabase | Fase 0 |           0% |            85% |
| 2026-08-23 | Fase 0 cerrada: deploy a Cloudflare Workers por push y proyecto Supabase de desarrollo verificado                                                                                       | Fase 0 |          85% |           100% |
| 2026-08-23 | Fase 1: tokens de diseño, `@pick/commerce-astro` con Product Card/Price/Grid y PLP demo con catálogo mock                                                                               | Fase 1 |           0% |            20% |
| 2026-08-23 | Fase 1: layout (Container/Header/Footer), primeras islands (Quantity, Add to Cart) y PDP demo                                                                                           | Fase 1 |          20% |            40% |
| 2026-08-23 | Fase 1: Variant Selector con swatches, derivación de opciones en el core con tests, y Breadcrumb con JSON-LD                                                                            | Fase 1 |          40% |            55% |
| 2026-08-23 | Fase 1: recetas de clases compartidas, primitives Button/Badge y Product Gallery sin JavaScript                                                                                         | Fase 1 |          55% |            65% |
| 2026-08-23 | Fase 1: Hero/Banner/Categorías/Carrusel, Cart Drawer con store persistido y separación de chunks por island                                                                             | Fase 1 |          65% |            80% |
| 2026-08-23 | Fase 1: catálogo facetado server-side sobre ruta on-demand, con búsqueda, orden y paginación                                                                                            | Fase 1 |          80% |            88% |
| 2026-08-23 | Fase 1: PLP sin full reload con ClientRouter acotado, drawer mobile sin JS, y JS del storefront reducido 27%                                                                            | Fase 1 |          88% |            92% |
| 2026-08-23 | Fase 1 cerrada: shadcn sobre Base UI en el Admin, contrato de customización fijado con test, y regresión de tokens corregida                                                            | Fase 1 |          92% |           100% |
| 2026-08-24 | Smoke de navegación con Playwright en CI; corregido el panel de filtros invisible en desktop                                                                                            | Fase 1 |         100% |           100% |
| 2026-08-24 | Fase 2: SEO y GEO (canonical, Open Graph, JSON-LD, sitemap, robots, llms.txt), 404, políticas, FAQ y página de carrito                                                                  | Fase 2 |           0% |            80% |
| 2026-08-24 | Correcciones de UX de la demo: sheet de filtros en mobile, orden en el PLP, "Aplicar" sólo sin JavaScript                                                                               | Fase 2 |          80% |            85% |
| 2026-08-24 | Fase 2 cerrada: buscador y orden del header, presupuesto de performance en CI, baseline de CWV                                                                                          | Fase 2 |          85% |           100% |
| 2026-08-24 | Fase 3: schema multitenant, RLS y pruebas de aislamiento sobre Postgres en proceso                                                                                                      | Fase 3 |           0% |            55% |
| 2026-08-24 | Migración aplicada al proyecto Supabase y aislamiento verificado con JWTs reales                                                                                                        | Fase 3 |          55% |            65% |
| 2026-08-24 | Fase 3 cerrada: adapter de Supabase, resolución de tenant y Auth en el Admin                                                                                                            | Fase 3 |          65% |           100% |
| 2026-08-26 | Fase 4: schema de catálogo, `catalog_search` con paridad verificada contra el core, y seed reproducible                                                                                 | Fase 4 |           0% |            55% |
| 2026-08-26 | Fase 4: el storefront lee el catálogo de Postgres on-demand, sitemap dinámico, facetas declaradas por la tienda y tramos de precio                                                      | Fase 4 |          55% |            80% |
| 2026-08-26 | Fase 4: CRUD de productos en el Admin, con listado paginado, búsqueda por SKU y guardado atómico                                                                                        | Fase 4 |          80% |            90% |
| 2026-08-26 | Fase 4 cerrada: import y export de catálogo por CSV, con preview que no escribe y reporte por producto                                                                                  | Fase 4 |          90% |           100% |
| 2026-08-26 | Storefront en línea: secretos del Worker, dirección pública corregida y falla legible cuando falta configuración                                                                        | Fase 4 |         100% |           100% |
| 2026-08-26 | Primera corrida real del CI: valida ADR-058 y destapa que el e2e colgaba fuera de un agente; documentada la infraestructura en INFRAESTRUCTURA.md                                       | Fase 4 |         100% |           100% |
| 2026-08-27 | Revisión adversarial: cerrado el agujero cross-tenant de las claves foráneas, el `EXECUTE` de `anon` y el dominio horneado en el build                                                  | Fase 5 |           0% |           100% |
| 2026-08-27 | Fase 5 T1: schema de pedidos y `create_order` idempotente con revalidación y descuento de stock                                                                                         | Fase 5 |          35% |           100% |
| 2026-08-27 | Fase 5 T2 y T3: cart service, checkout, confirmación y vista de pedidos del Admin                                                                                                       | Fase 5 |         100% |           100% |
| 2026-08-28 | Fase 6 T1: `admin_dashboard`, `admin_customers`, `admin_team` y `admin_save_settings`, con el invariante del último owner en un trigger                                                 | Fase 6 |           0% |            40% |
| 2026-08-28 | Fase 6 T2 y T3: resumen, clientes, equipo y configuración, con gating por rol y una pantalla por chunk                                                                                  | Fase 6 |          40% |            85% |
| 2026-08-28 | Fase 6 cerrada: acciones en lote con TanStack Table, provisionamiento por CLI y limpieza de los pedidos que dejaba el e2e                                                               | Fase 6 |          85% |           100% |
| 2026-08-28 | Correcciones de uso del Admin: buscar por «#número», marcar pagado, publicar y archivar con un interruptor, y navegación con sidebar                                                    | Fase 6 |         100% |           100% |
| 2026-08-28 | `pnpm seed:dummy`: catálogo de prueba desde dummyjson para ejercitar paginación, búsqueda y lotes; medido de paso que ninguna imagen se optimiza                                        | Fase 6 |         100% |           100% |

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

**Avance: 78%**

- [x] Moneda base.
- [x] Monedas de display.
- [x] Moneda de checkout. Separada de la mostrada: mostrar en USD no es cobrar en USD.
- [x] Tipo de cambio manual.
- [x] Audit del cambio. `actualizarTasa` devuelve la configuración y su entrada de auditoría juntas: no se puede cambiar la tasa sin obtener qué auditar.
- [x] Regla de redondeo.
- [x] UI Admin. Tipo de cambio manual con su fecha, quién lo cambió y auditoría en la misma transacción.
- [ ] Product/PDP price display.
- [ ] Compatibilidad ERP/gateway documentada.

## Linked Colors

**Avance: 20%**

- [x] Modelar product families/siblings. Tabla `product_groups` y `product_group_id` en el producto.
- [ ] `linkedColors` feature.
- [ ] Product Card swatches.
- [ ] PDP sibling navigation.
- [ ] Compatibilidad con ERP que modela colores como productos separados.

## Premium Motion

**Avance: 0%**

- [ ] Extension pattern para GSAP/Motion.
- [ ] Carga lazy/selectiva.
- [ ] ScrollTrigger demo.
- [ ] Reduced motion.
- [ ] Performance budget.
