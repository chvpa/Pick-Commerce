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

| Versión | Objetivo                                    | Estado | Avance |
| ------- | ------------------------------------------- | -----: | -----: |
| v1      | Commerce Core vendible + primer piloto real |   TODO |     0% |
| v2      | Operación avanzada, AI Commerce y escala    |   TODO |     0% |
| v3      | MCP, intelligence layer y expansión LATAM   |   TODO |     0% |

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

**Avance: 85%**

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
- [~] Configurar deploy inicial a Cloudflare. Config de wrangler validada con `--dry-run` en ambas apps y comandos de deploy documentados en el README. Falta: crear el KV namespace `SESSION` que exige `@astrojs/cloudflare`, y correr el primer deploy con credenciales.
- [!] Crear Supabase project de desarrollo. Bloqueado: requiere decidir organización y aprobar el costo. La estructura local (`supabase/`, migraciones) ya está lista.
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

**Avance: 0%**

Objetivo: construir los LEGO visuales reutilizables.

- [ ] Instalar/configurar shadcn + Base UI en Admin/UI package cuando corresponda.
- [ ] Definir tokens base: color, typography, spacing, radius, container.
- [ ] Crear primitives UI esenciales.
- [ ] Crear layout primitives.
- [ ] Crear Header y Footer base.
- [ ] Crear Product Card.
- [ ] Crear Product Price.
- [ ] Crear Product Image/Gallery base.
- [ ] Crear Variant Selector.
- [ ] Crear Quantity Selector.
- [ ] Crear Add to Cart.
- [ ] Crear Product Grid.
- [ ] Crear Product Carousel.
- [ ] Crear Cart Drawer.
- [ ] Crear Search UI.
- [ ] Crear Filter UI.
- [ ] Crear PLP faceted filters con accordion, counts, URL state y mobile drawer.
- [ ] Crear swatches/linked colors UI configurable.
- [ ] Crear Hero/Banner.
- [ ] Crear Category Section.
- [ ] Crear Breadcrumb.
- [ ] Confirmar support de variants, slots, tokens, props y `className`.

**Definition of Done**

- demo visual muestra una Home, PLP y PDP con componentes reales
- los componentes aceptan customización sin forks
- no existe lógica de negocio hardcodeada al theme

---

## Fase 2 — Storefront Shell

**Avance: 0%**

Objetivo: storefront Astro funcional y rápido.

- [ ] Configurar Astro.
- [ ] Configurar Preact islands.
- [ ] Implementar Home.
- [ ] Implementar Collection/PLP.
- [ ] Implementar Product/PDP.
- [ ] Implementar Search.
- [ ] Implementar paginación/incremental loading del PLP.
- [ ] Evitar full page reload al filtrar/ordenar.
- [ ] Implementar Cart.
- [ ] Implementar Checkout shell.
- [ ] Implementar Account shell.
- [ ] Implementar Policies/FAQ.
- [ ] Implementar 404.
- [ ] Implementar metadata SEO.
- [ ] Implementar JSON-LD base.
- [ ] Implementar sitemap/robots/canonical.
- [ ] Definir budgets de performance razonables.
- [ ] Verificar que sólo los componentes interactivos hidratan.

**Definition of Done**

- navegación real end-to-end con catálogo mock
- storefront usable sin backend completo
- lighthouse/performance baseline registrado

---

## Fase 3 — Multitenancy, Auth y Domain Model

**Avance: 0%**

Objetivo: modelo de datos y autorización confiables.

- [ ] Crear organizations.
- [ ] Crear stores.
- [ ] Crear locations.
- [ ] Crear users/memberships.
- [ ] Crear roles/permissions.
- [ ] Crear feature flags.
- [ ] Crear store settings.
- [ ] Configurar Supabase Auth.
- [ ] Configurar RLS.
- [ ] Implementar tenant resolution.
- [ ] Crear audit log base.
- [ ] Definir Domain Services.
- [ ] Evitar acceso directo descontrolado del Admin a tablas sensibles.

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

| Fecha | Hallazgo | Impacto | Acción | Fase destino | Estado |
| ----- | -------- | ------- | ------ | ------------ | ------ |
| —     | —        | —       | —      | —            | —      |

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

**Avance: 0%**

- [ ] Definir loading/pending/error/success states para acciones asíncronas.
- [ ] Add to Cart con feedback inmediato y prevención de doble submit.
- [ ] PLP filters sin full page reload.
- [ ] Skeletons para grid/listas relevantes.
- [ ] Focus states y keyboard accessibility.
- [ ] Pointer/cursor para elementos accionables.
- [ ] Mobile UX revisada en Storefront y Admin.
- [ ] `prefers-reduced-motion` en motion premium.

## Data loading / Pagination

**Avance: 0%**

- [ ] Paginación PLP.
- [ ] Server-side filters/sort.
- [ ] Paginación Admin Products.
- [ ] Paginación Admin Orders.
- [ ] Paginación Admin Customers.
- [ ] Paginación Promotions/Discounts.
- [ ] Paginación Audit/Sync logs.
- [ ] Evitar fetch de datasets completos.

## PLP Facets

**Avance: 0%**

- [ ] Accordion filters.
- [ ] Talla/variante.
- [ ] Género.
- [ ] Marca.
- [ ] Color.
- [ ] Categoría/subcategoría.
- [ ] Precio.
- [ ] Atributos dinámicos.
- [ ] Counts.
- [ ] "Ver más".
- [ ] URL state.
- [ ] Mobile filter drawer.

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
