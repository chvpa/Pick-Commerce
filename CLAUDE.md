# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado actual

El repo contiene **sólo documentación**. No hay código, monorepo, package.json ni git aún. La primera tarea real es Fase 0 — Foundation de `ROADMAP.md` (crear monorepo pnpm, packages `@pick/*`, app `admin`, storefront Astro demo, Supabase, CI, deploy Cloudflare).

Comandos objetivo una vez exista el monorepo (definidos como Definition of Done de Fase 0, aún no implementados): `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Documentos como fuente de verdad

Este proyecto trata los docs como autoridad, no como notas. Leer en orden antes de trabajar:

1. [AGENTS.md](AGENTS.md) — protocolo de trabajo con IA, reglas Core vs cliente, reglas UX.
2. [PROJECT.md](PROJECT.md) — qué es Pick Commerce, stack aprobado, arquitectura, scope de v1.
3. [ROADMAP.md](ROADMAP.md) — fases, checkboxes, avance, backlog.
4. [DECISIONS.md](DECISIONS.md) — ADR-001..027 + decisiones pendientes P-001..005.
5. [ENGINEERING_HARNESS.md](ENGINEERING_HARNESS.md) — loop PLAN→DEVELOP→TEST→REVIEW→OK/FIX→UPDATE DOCS, tiers de test T0–T3.

Si el código contradice un documento, no asumir que el código gana: identificar si es bug, deuda o decisión nueva, y registrarlo.

**Actualizar docs al cerrar trabajo** es parte del Definition of Done: `ROADMAP.md` cuando una tarea/fase cambia de estado; `DECISIONS.md` (formato ADR-XXX) cuando cambia arquitectura, dependencia, scope o tradeoff; `PROJECT.md` sólo si cambia la fuente de verdad del producto.

## Restricciones que no se negocian

Estas rompen la arquitectura si se violan, y no son obvias desde el código:

- **Un solo Commerce Core.** Nada de forks por industria o cliente (`Pick Fashion`, etc.). Las diferencias van en presets, feature flags, attributes y adapters. No hardcodear nombres de clientes en el Core.
- **Stack cerrado.** Storefront: Astro + Preact islands + Tailwind v4 + Cloudflare. Admin: React + Vite + TanStack (Router/Query/Table) + shadcn/Base UI + RHF + Zod. Backend: Supabase/Postgres/Auth/RLS. AI: **sólo OpenAI**, BYOK por tenant, key cifrada server-side y nunca en el browser. Email: Resend. No introducir otro framework/provider sin ADR.
- **El ERP conserva autoridad** sobre stock, precios, costos y SKUs cuando sea su source of truth. Cada campo sincronizable declara su origen; los campos ERP se bloquean localmente. Los adapters declaran capabilities (`supportsReservations`) — no prometer cero overselling si el ERP no las tiene.
- **Fuera del core:** facturación, notas de crédito, refunds, returns engine, contabilidad. MCP tampoco puede ejecutarlos, y respeta siempre `user_id`/`tenant_id`/`role`/`permissions`; las escrituras sensibles usan PREVIEW → CONFIRM → EXECUTE.
- **Toda entidad de negocio lleva tenant scope** y se protege con RLS + autorización en el servicio de dominio. El frontend nunca es la capa de autorización.
- **Stock:** navegación usa mirror cacheado; Add to Cart valida contra el provider cuando sea viable; checkout **siempre** revalida antes de confirmar. Creación de order con idempotency.
- **Paginación obligatoria** en cualquier dataset que pueda crecer (PLP, products, orders, customers, promotions, audit/sync logs). Filtros y sort server-side. Nada de traer el catálogo completo para filtrar en el browser.
- **UX es Definition of Done**, no polish: loading/pending, success, error recuperable, disabled, prevención de doble submit, skeletons, focus visible, keyboard, mobile a la par de desktop. Una acción asíncrona sin estado perceptible no está terminada.
- **Motion premium es opt-in**: GSAP/ScrollTrigger sólo lazy-loaded en la página que lo usa, respetando `prefers-reduced-motion`. Nunca en el bundle base.

## Anti-overengineering

Abstraer desde v1 **sólo** donde ya se sabe que habrá múltiples providers: ERP, Payments, Notifications, AI interface, Analytics destination, Storage/media. Para todo lo demás la regla es: ¿hay dos implementaciones reales o una necesidad clara de reemplazo? Si no, implementar la mínima solución completa.

Antes de agregar una feature al Core, clasificarla (sección 32 de `PROJECT.md`): reusable → Core detrás de flag/config/capability; puramente visual o de una campaña → storefront override del cliente; dudosa → incubar desacoplada y reevaluar al segundo caso real.

## Testing

No correr la suite completa por cada cambio. Tiers de `ENGINEERING_HARNESS.md`: **T0** durante desarrollo (typecheck + lint del package afectado), **T1** al cerrar tarea (lint + typecheck + tests relevantes), **T2** al cerrar fase (`pnpm lint`/`typecheck`/`build` + Playwright de critical paths modificados), **T3** sólo pre-release.

Priorizar correctness de: orders, stock, payments, tenants, permissions, ERP, promotions, migrations. Baja prioridad: componentes visuales, copy, spacing.

## Idioma

La documentación y los commits están en español; el código, identificadores y nombres de dominio en inglés.
