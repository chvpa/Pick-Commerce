# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Este repo usa IA como parte activa del desarrollo. La continuidad arquitectónica entre sesiones la sostienen los documentos, no la conversación: **no asumir que el mensaje actual trae todo el contexto**. Ante una duda de arquitectura, la respuesta está en `DECISIONS.md` antes que en la intuición.

## Estado actual

**Fases 0 a 7 cerradas. Fase 8 (ERP Adapter) al 70%.** El avance real siempre está en `ROADMAP.md`; esto es sólo la orientación de arranque.

- **Fase 0** — monorepo pnpm, CI, deploy a Cloudflare Workers por push.
- **Fase 1** — design system: tokens, componentes `.astro` e islands Preact.
- **Fase 2** — storefront: Home, PLP facetada server-side, PDP, carrito, SEO y GEO.
- **Fase 3** — multitenancy: schema con RLS aplicado a Supabase, adapter y Auth en el Admin.
- **Fase 4** — catálogo en Postgres: storefront on-demand, CRUD en el Admin e import/export CSV.
- **Fase 5** — pedidos: cart service, checkout guest, `create_order` idempotente
  que revalida y descuenta stock, y vista de pedidos en el Admin.
- **Fase 6** — Admin v1: resumen derivado de los pedidos, clientes, equipo,
  configuración de pagos y moneda, acciones en lote y gating por rol.
- **Fase 7** — cobro y avisos: contrato `PaymentProvider` con una pasarela
  simulada, cola de correos por trigger enviada con Resend, medios propios en
  Supabase Storage y reset de contraseña.
- **Fase 8** (en curso) — ERP: puerto `ERPAdapter` con matriz de capacidades,
  adapter del Oracle ORDS de **Estilo Sport** —el piloto pasó de Camelot, que
  sigue apagado— e importador acotado. Etapa A: el ERP entra y **nada sale**,
  porque la tienda actual del cliente sigue facturando contra el mismo Oracle.

El contenido de la demo lo siembra `pnpm seed` desde `scripts/seed-data.ts`, que es la
única fuente: el mock in-memory ya no existe. Para entrar al Admin hace falta un usuario,
que crea `pnpm admin:crear`.

```text
packages/
  commerce-types/    contratos compartidos + tipos generados de la base
  commerce-core/     dominio sin framework: dinero, catálogo, variantes, SEO, autorización
  commerce-ui/       tokens de diseño, recetas de clases e islands Preact
  commerce-astro/    componentes .astro de presentación estática
  adapter-supabase/  clientes, repositorios y sesión
  adapter-resend/    envío de correos transaccionales
  adapter-payment-simulated/  pasarela de prueba; el contrato vive en el core
  adapter-erp-estilosport/    Oracle ORDS tras un proxy; corre en Node, no en el Worker
apps/
  admin/             React 19 + Vite 8 + Tailwind v4 + shadcn sobre Base UI
  demo/              Astro 7 + Preact islands + Tailwind v4 + adapter Cloudflare
supabase/            migraciones y pruebas de aislamiento entre tenants
e2e/                 Playwright: navegación y presupuesto de performance
```

Los paquetes se consumen como fuente (`exports` → `src/`), sin build propio. Ver ADR-029.

## Comandos

```bash
pnpm dev            # admin (5273) + demo (4321)
pnpm lint           # ESLint en todo el workspace
pnpm typecheck      # tsc / astro check por paquete
pnpm test           # unitarios + aislamiento de tenants; node:test, sin runner externo
pnpm e2e            # Playwright, desktop y mobile, contra el build de producción
pnpm budget         # presupuesto de peso por página; falla si se excede
pnpm build
pnpm db:new <n>     # nueva migración; ver supabase/migrations/README.md
pnpm db:apply <sql> # aplica una migración al proyecto remoto
pnpm db:types       # regenera los tipos desde el schema remoto
pnpm seed           # siembra el catálogo de demostración; idempotente
pnpm seed:dummy [n] # catálogo de prueba desde dummyjson (--limpiar para quitarlo)
pnpm erp:importar --tienda <slug> [--limite 100] [--dry-run]   # catálogo desde el ERP
pnpm tienda:crear <slug> <nombre>      # provisiona organización, tienda, sucursal y settings
pnpm admin:crear <email> <password> [rol] [org]   # usuario del Admin; sin org, la demo
```

Deploy: `pnpm --filter <app> run deploy`. El `run` **no es opcional** — `deploy` es un comando built-in de pnpm y sin `run` nunca llega al script del paquete.

Supabase se opera por CLI/API con las credenciales de `.env`, nunca por MCP: ese servidor está reservado a otro proyecto y no ve éste. Las migraciones se aplican con la API de Management, que sólo necesita `SUPABASE_ACCESS_TOKEN`.

---

# El harness

Obligatorio para toda unidad de trabajo. No es documentación de referencia: se aplica siempre.

```text
PLAN → DEVELOP → TEST → REVIEW → OK/FIX → UPDATE DOCS
```

## PLAN

5–10 minutos para una tarea normal. Producir: objetivo, archivos afectados, contratos de datos, comportamiento esperado, tests, riesgos, y **qué queda fuera de scope**.

Antes de modificar arquitectura, buscar en `DECISIONS.md`. Si la decisión ya existe: respetarla, o registrar por qué debe cambiar. No escribir un documento de arquitectura nuevo para cada botón.

## DEVELOP

Implementar la mínima solución completa. No duplicar lógica, no hardcodear cliente ni vertical, no exponer secrets, no saltar RLS, no introducir framework nuevo sin ADR.

## TEST — por niveles, sin sobre-testear

| Tier   | Cuándo               | Qué correr                                                                       |
| ------ | -------------------- | -------------------------------------------------------------------------------- |
| **T0** | durante desarrollo   | typecheck + lint del paquete afectado                                            |
| **T1** | al cerrar una tarea  | lint + typecheck + tests relevantes; build si afecta al build                    |
| **T2** | al cerrar una fase   | `pnpm lint`/`typecheck`/`build` + Playwright de los critical paths modificados   |
| **T3** | pre-release / piloto | suite crítica completa, RLS, webhooks/idempotency, migraciones, smoke en staging |

Priorizar correctness de: orders, stock, payments, tenants, permissions, ERP, promotions, migrations. Baja prioridad: componentes visuales, copy, spacing.

Si una tarea simple lleva más tiempo testeándose que desarrollándose, revisar el enfoque.

## REVIEW

- **Correctness**: ¿cumple el comportamiento? ¿rompe una decisión previa? ¿maneja error/loading/empty?
- **Arquitectura**: ¿está en la capa correcta? ¿acoplado a un cliente? ¿debía ser adapter/capability/flag?
- **Seguridad**: ¿secretos en cliente o logs? ¿respeta tenant y permisos? ¿inputs externos sin validar?
- **Riesgo comercial**: ¿puede crear doble order? ¿vender sin stock? ¿aplicar dos veces un descuento? ¿duplicar webhook? ¿divergir del ERP?

## FIX

Fallo → causa raíz → mínimo arreglo seguro → volver a correr el test relevante. No reiniciar la fase ni refactorizar en masa salvo que la causa raíz lo exija.

## UPDATE DOCS

**Una unidad de trabajo no está terminada hasta que los documentos dicen la verdad.** No es un extra ni se deja para después: un documento desactualizado es peor que uno inexistente, porque se le cree.

Al cerrar cualquier implementación:

- `ROADMAP.md` — marcar el checkbox, actualizar el porcentaje de la fase **y el de los bloques transversales que la tarea tocó**, agregar la fila al changelog.
- `DECISIONS.md` (ADR-XXX) — cuando cambia arquitectura, se adopta o descarta una dependencia, aparece un tradeoff, cambia el scope o una integración obliga a modificar un contrato.
- `CLAUDE.md` — cuando cambia el estado de las fases, aparece un paquete o un comando nuevo, o se descubre una restricción que condiciona el diseño.
- `PROJECT.md` — sólo si cambia la fuente de verdad del producto.

También va al `ROADMAP.md` lo que aparece y no estaba previsto: un bloqueo, o una tarea retroactiva que descubrió el trabajo. Si no bloquea la fase actual, va a `Backlog / Retroactividad` en vez de interrumpirla — **y ese backlog vacío es una señal de que no se está registrando, no de que no haya hallazgos**.

Dos errores concretos que ya se cometieron acá y no deben repetirse:

- Los bloques de **requisitos transversales** quedaron en 0% durante tres fases mientras se implementaban. Se marcan al cerrar cada tarea, no al final.
- Un ítem se difirió con el motivo equivocado —"espera Fase 3" cuando en realidad esperaba Fase 5—. Al diferir algo, verificar **qué** lo desbloquea, no suponerlo.

## Cerrar: informe corto

Al terminar una unidad de trabajo, reportar en este formato. Sin reportes largos salvo que haya un problema.

```text
Implemented
- ...

Validated
- lint / typecheck / tests, con la evidencia

Pending
- ...

Docs
- ROADMAP actualizado
- DECISIONS actualizado si correspondía
```

`Pending` no es opcional: si algo quedó fuera, se dice. Bajar el scope es decisión del usuario, no propia.

---

# Verificación: no dar por bueno lo que no se comprobó

Cada regla sale de un fallo real cometido en este repo, y cada una costó un ciclo.

**Verificar el artefacto final, no un proxy.** Contar etiquetas `<img>` en el HTML no prueba que las imágenes carguen: hubo tres rotas porque los archivos referenciados nunca se crearon. Si el entregable es una página, comprobar que los recursos resuelvan; si es un dato, comprobar el valor.

**Ejecutar el comando exacto que correrá en CI o producción.** Validar `wrangler deploy --dry-run` no validó `pnpm --filter <app> deploy`, que fallaba en una capa superior. El dry-run de la sub-capa no valida el camino completo del comando.

**Antes de decir que el CI pasa, correr su secuencia sobre un clone limpio.** Un `pnpm install --frozen-lockfile` en el repo local ya instalado esconde fallos que sí aparecen en un clone nuevo.

**Reproducir el fallo y confirmar la hipótesis antes de arreglar.** El badge que no renderizaba se aisló con un experimento mínimo — string vs JSX — antes de tocar la arquitectura. Sin ese paso el arreglo habría sido una conjetura.

**No afirmar "validado" sin la evidencia a la vista.** Si se reporta que algo pasa, mostrar la salida. Si un paso se salteó, decirlo.

**En un ADR, registrar la razón real, no la primera hipótesis.** ADR-032 afirmó que Preact era imposible cuando en realidad era posible vía named slots y sólo era peor. Un ADR con la justificación equivocada envenena decisiones futuras.

---

# Documentación de terceros

El conocimiento previo del modelo está desactualizado respecto de este repo: cuando se creó, el ecosistema ya iba en Astro 7, Vite 8 y TypeScript 7. **No decidir sobre comportamiento de terceros desde memoria.**

Ir a la documentación oficial cuando:

- algo no funciona y la causa no es obvia;
- se usa una API o integración por primera vez;
- se está por asumir una restricción ("no se puede pasar X", "esto no soporta Y");
- se elige o se sube una versión — confirmar con `npm view <pkg> version` y los rangos de peers, en vez de suponer;
- una decisión de arquitectura se apoya en cómo se comporta una herramienta.

## Cuando falta información

En este orden, antes de decidir:

1. estos documentos;
2. el código;
3. los tests;
4. la documentación oficial del provider o la integración;
5. un mock explícito, sólo si el contrato ya está definido.

**No inventar comportamiento de un ERP, un medio de pago ni una API.** Un adapter que asume una capacidad que el proveedor no tiene produce overselling, cobros mal conciliados o pedidos que el ERP rechaza — y el error aparece en producción, no en el typecheck. Si el contrato real no se conoce, decirlo y avanzar con un mock declarado como tal, nunca con una suposición disfrazada de implementación.

Cuando un ADR se apoye en comportamiento de terceros, **citar la doc**. Referencias vigentes: [Astro](https://docs.astro.build), [adapter Cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [Tailwind v4](https://tailwindcss.com/docs), [Supabase](https://supabase.com/docs).

Restricciones de Astro ya verificadas contra la doc, que condicionan el diseño:

- Los componentes de framework sólo reciben props serializables. JSX y render props como prop **no funcionan** desde `.astro`; los named slots en kebab-case sí llegan como props camelCase.
- Una island Preact **no puede importar** componentes `.astro`. El contenido baja desde la página.
- Un `<img>` crudo no recibe ningún procesamiento: usar `<Image />` de `astro:assets`.
- Las imágenes en `public/` nunca se optimizan.
- Tailwind no escanea `node_modules`: cada paquete `@pick/*` con componentes necesita su `@source` en `tokens.css`, o sus clases no se generan y **nada falla** (ADR-044).
- CSS **no** puede mostrar el contenido de un `<details>` cerrado, pero **sí** puede mostrar y ocultar un `<dialog>` en ambas direcciones: un `display` sin acotar a `[open]` o `:modal` lo deja visible estando cerrado (ADR-045, ADR-049).
- Las islands se importan por subpath, nunca desde el barrel: desde el barrel Vite las agrupa en un solo chunk y toda página descarga las que no usa (ADR-040).
- Astro colapsa el espacio entre dos expresiones adyacentes: `{a} {b}` sale pegado. Usar una sola expresión.
- El contexto de Workers es `Astro.locals.cfContext`, no `locals.runtime.ctx`: eso último existía en adapters viejos y **falla en runtime**, no al compilar. Todo trabajo posterior a la respuesta va con su `waitUntil`.
- Un Worker de Cloudflare **no puede hacerse `fetch` a sí mismo** (error 1042). Lo que el storefront tenga que hacer sobre sí mismo, lo hace llamando a la función.
- El `fetch()` de un Worker **descarta el puerto no estándar** en producción —`host:3001` termina pidiendo el 443— y bloquea las IPs crudas por sus protecciones anti-SSRF. En local con Miniflare funciona, así que falla recién al desplegar. Por eso el importador del ERP es un script de Node (ADR-085).
- La comprobación de origen de Astro rechaza todo POST de otro origen salvo con un `content-type` que no sea de formulario, y `no-cors` sólo puede mandar los tres que sí lo son: **ningún POST cross-origin del browser llega** sin montar CORS.
- Una migración que dependa de una extensión o de un schema que PGlite no tenga —`pg_net`, `storage`— deja la suite de aislamiento sin arrancar. Va guardada con un `do` que compruebe que existe.

---

# Documentos como fuente de verdad

Este proyecto trata los docs como autoridad, no como notas. Leer en orden antes de trabajar:

1. [AGENTS.md](AGENTS.md) — protocolo de trabajo con IA, reglas Core vs cliente, reglas UX.
2. [PROJECT.md](PROJECT.md) — qué es Pick Commerce, stack aprobado, arquitectura, scope de v1.
3. [ROADMAP.md](ROADMAP.md) — fases, checkboxes, avance, backlog.
4. [DECISIONS.md](DECISIONS.md) — ADR-001..066 + decisiones pendientes P-001..005.
5. [ENGINEERING_HARNESS.md](ENGINEERING_HARNESS.md) — versión extendida del harness de arriba.
6. [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md) — cómo corre el proyecto: CI, Workers,
   entornos, credenciales y diagnóstico.

Si el código contradice un documento, no asumir que el código gana: identificar si es bug, deuda o decisión nueva, y registrarlo.

---

# Restricciones que no se negocian

Rompen la arquitectura si se violan, y no son obvias desde el código:

- **Un solo Commerce Core.** Nada de forks por industria o cliente (`Pick Fashion`, etc.). Las diferencias van en presets, feature flags, attributes y adapters. No hardcodear nombres de clientes en el Core.
- **Stack cerrado.** Storefront: Astro + Preact islands + Tailwind v4 + Cloudflare. Admin: React + Vite + TanStack (Router/Query/Table) + shadcn/Base UI + RHF + Zod. Backend: Supabase/Postgres/Auth/RLS. AI: **sólo OpenAI**, BYOK por tenant, key cifrada server-side y nunca en el browser. Email: Resend. No introducir otro framework/provider sin ADR.
- **El ERP conserva autoridad** sobre stock, precios, costos y SKUs cuando sea su source of truth. Cada campo sincronizable declara su origen; los campos ERP se bloquean localmente. Los adapters declaran capabilities (`supportsReservations`) — no prometer cero overselling si el ERP no las tiene.
- **Fuera del core:** facturación, notas de crédito, refunds, returns engine, contabilidad. MCP tampoco puede ejecutarlos, y respeta siempre `user_id`/`tenant_id`/`role`/`permissions`; las escrituras sensibles usan PREVIEW → CONFIRM → EXECUTE.
- **Toda entidad de negocio lleva tenant scope** y se protege con RLS + autorización en el servicio de dominio. El frontend nunca es la capa de autorización.
- **Stock:** navegación usa mirror cacheado; Add to Cart valida contra el provider cuando sea viable; checkout **siempre** revalida antes de confirmar. Creación de order con idempotency.
- **Paginación obligatoria** en cualquier dataset que pueda crecer (PLP, products, orders, customers, promotions, audit/sync logs). Filtros y sort server-side. Nada de traer el catálogo completo para filtrar en el browser.
- **UX es Definition of Done**, no polish: loading/pending, success, error recuperable, disabled, prevención de doble submit, skeletons en listas y grids, focus visible, keyboard, cursor en todo lo accionable, mobile a la par de desktop. Una acción asíncrona sin estado perceptible no está terminada.
  - **PLP**: filtros facetados, actualización sin full page reload, paginación o carga incremental. Nunca filtrar miles de productos en el browser.
  - **Admin**: tablas paginadas con empty y error states. Nunca cargar todos los productos, pedidos, clientes ni promociones.
- **Motion premium es opt-in**: GSAP/ScrollTrigger sólo lazy-loaded en la página que lo usa, respetando `prefers-reduced-motion`. Nunca en el bundle base.

# Anti-overengineering

Abstraer desde v1 **sólo** donde ya se sabe que habrá múltiples providers: ERP, Payments, Notifications, AI interface, Analytics destination, Storage/media. Para todo lo demás: ¿hay dos implementaciones reales o una necesidad clara de reemplazo? Si no, implementar la mínima solución completa.

Antes de agregar una feature al Core, clasificarla (sección 32 de `PROJECT.md`): reusable → Core detrás de flag/config/capability; puramente visual o de una campaña → storefront override del cliente; dudosa → incubar desacoplada y reevaluar al segundo caso real.

# Idioma

La documentación y los commits están en español; el código, identificadores y nombres de dominio en inglés.
