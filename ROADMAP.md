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

**Avance: 0%**

Objetivo: catálogo universal utilizable.

- [ ] Crear Product.
- [ ] Crear Variant.
- [ ] Crear SKU/barcode.
- [ ] Crear Price/Cost.
- [ ] Modelar currencies/exchange rate manual.
- [ ] Modelar product groups/sibling products para colores relacionados.
- [ ] Crear Media.
- [ ] Crear Category/Taxonomy.
- [ ] Crear Attribute Definitions.
- [ ] Crear Product Attribute Values.
- [ ] Crear Collections manuales.
- [ ] Crear Dynamic Collections básicas.
- [ ] Crear stock por location.
- [ ] Registrar source of truth por campo cuando corresponda.
- [ ] Crear status activo/inactivo/archivado.
- [ ] Implementar CRUD Admin.
- [ ] Implementar CSV template.
- [ ] Implementar preview y validación de import CSV.
- [ ] Implementar export CSV básico.

**Definition of Done**

- se puede representar moda, libro y ferretería sin cambiar schema core
- catálogo importado aparece en storefront
- variantes y stock funcionan

---

## Fase 5 — Cart, Checkout y Orders

**Avance: 0%**

Objetivo: convertir catálogo en pedidos reales.

- [ ] Crear cart service.
- [ ] Agregar/quitar/actualizar ítems.
- [ ] Validar variantes.
- [ ] Validar stock en Add to Cart cuando el provider lo permita.
- [ ] Revalidar stock antes de confirmar checkout.
- [ ] Crear customer/address mínimo.
- [ ] Crear checkout.
- [ ] Crear order.
- [ ] Crear order items snapshot.
- [ ] Crear order status.
- [ ] Crear timeline.
- [ ] Crear idempotency para creación de pedidos.
- [ ] Implementar guest checkout.
- [ ] Crear página de confirmación.
- [ ] Crear vista Admin de pedidos.
- [ ] Crear quick status.

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

**Avance: 0%**

Objetivo: operación diaria sin tocar base de datos.

- [ ] Dashboard Resumen.
- [ ] Productos.
- [ ] Pedidos.
- [ ] Clientes.
- [ ] Promociones básicas.
- [ ] CMS/Banners.
- [ ] Equipo.
- [ ] Roles predeterminados.
- [ ] Configuración.
- [ ] Configuración de métodos de pago habilitados.
- [ ] Configuración de moneda/tipo de cambio.
- [ ] Integraciones.
- [ ] Analytics básico.
- [ ] Búsqueda/filtros.
- [ ] Bulk actions prioritarias.
- [ ] Estados de loading/error/empty.
- [ ] Responsive razonable para tablet/desktop.

**Definition of Done**

- operador puede administrar catálogo y pedidos sin herramientas técnicas
- superadmin puede provisionar tenant manualmente

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

| Fecha      | Hallazgo                                                          | Impacto                                                        | Acción                                    | Fase destino | Estado    |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- | ------------ | --------- |
| 2026-08-24 | Los requisitos transversales quedaron en 0% con la mitad ya hecha | El ROADMAP dejó de reflejar el estado real                     | Reconciliados contra el código            | —            | Resuelto  |
| 2026-08-24 | Falta estado de carga en el grid al filtrar la PLP                | El usuario no ve que algo pasó entre el click y los resultados | Skeletons en el grid                      | Fase 4       | Pendiente |
| 2026-08-24 | La faceta de precio necesita rango, no valores discretos          | Con muchos precios la faceta sería inusable                    | Definir con datos reales                  | Fase 4       | Pendiente |
| 2026-08-24 | La verificación de RLS con JWTs reales es manual                  | No corre en CI: exige credenciales fuera del repo              | Repetirla al tocar RLS y antes del piloto | Fase 12      | Pendiente |
| 2026-08-24 | Revisión adversarial de Fase 1 interrumpida                       | Quedó sin ejecutar; puede haber hallazgos no vistos            | Relanzarla sobre el código actual         | —            | Pendiente |
| 2026-08-24 | Lighthouse completo no corre en CI                                | El presupuesto de bytes acota, pero no cubre CWV bajo red real | Ejecutar en pre-release                   | Fase 12      | Pendiente |

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

**Avance: 88%**

- [x] Definir loading/pending/error/success states para acciones asíncronas. En Add to Cart y en el login del Admin.
- [x] Add to Cart con feedback inmediato y prevención de doble submit. El bloqueo va con un ref, no con estado: dos clicks en el mismo tick pasarían ambos.
- [x] PLP filters sin full page reload. ClientRouter acotado a la PLP (ADR-042).
- [ ] Skeletons para grid/listas relevantes. Pendiente: hoy el filtrado no muestra estado de carga en el grid.
- [x] Focus states y keyboard accessibility. `focus-visible` en todo lo accionable; verificado con Playwright.
- [x] Pointer/cursor para elementos accionables.
- [x] Mobile UX revisada en Storefront y Admin. Playwright corre todo el smoke también en viewport mobile.
- [x] `prefers-reduced-motion` en motion premium. `motion-reduce` en galería, carrusel y transiciones de card.

## Data loading / Pagination

**Avance: 40%**

- [x] Paginación PLP. Con ventana de páginas y `rel=prev/next`.
- [x] Server-side filters/sort. Ruta on-demand; nunca se filtra en el browser (ADR-024).
- [ ] Paginación Admin Products.
- [ ] Paginación Admin Orders.
- [ ] Paginación Admin Customers.
- [ ] Paginación Promotions/Discounts.
- [ ] Paginación Audit/Sync logs.
- [x] Evitar fetch de datasets completos. En el storefront; el Admin todavía no tiene listas.

## PLP Facets

**Avance: 75%**

- [x] Accordion filters. `<details>` nativo, sin JavaScript.
- [x] Talla/variante.
- [-] Género. Es un atributo de catálogo; aparece cuando la taxonomía de Fase 4 lo declare.
- [x] Marca.
- [x] Color.
- [~] Categoría/subcategoría. Categoría lista como faceta de producto; la subcategoría espera la taxonomía de Fase 4.
- [-] Precio. Necesita rango, no valores discretos: se define con datos reales en Fase 4.
- [x] Atributos dinámicos. Las facetas se proyectan desde los atributos reales de las variantes.
- [x] Counts. Cada faceta ignora su propia selección al contar, o sus otras opciones darían cero.
- [x] "Ver más". `<details>` anidado, sin JavaScript.
- [x] URL state. Compartible y recargable.
- [x] Mobile filter drawer. Sheet con `<dialog>` nativo (ADR-049).

## Multi-currency

**Avance: 0%**

- [ ] Moneda base.
- [ ] Monedas de display.
- [ ] Moneda de checkout.
- [ ] Tipo de cambio manual.
- [ ] Audit del cambio.
- [ ] Regla de redondeo.
- [ ] UI Admin.
- [ ] Product/PDP price display.
- [ ] Compatibilidad ERP/gateway documentada.

## Linked Colors

**Avance: 0%**

- [ ] Modelar product families/siblings.
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
