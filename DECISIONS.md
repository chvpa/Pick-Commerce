# Pick Commerce — DECISIONS.md

> Registro de decisiones y retroactividad.
>
> El objetivo es evitar que la IA o futuros desarrolladores vuelvan a debatir decisiones ya tomadas sin conocer su contexto.

---

# Cómo registrar una decisión

Formato:

```text
ADR-XXX — Título
Fecha:
Estado: Accepted | Superseded | Revisit
Contexto:
Decisión:
Por qué:
Consecuencias:
Revisar si:
```

No hace falta crear un archivo por ADR.

---

## ADR-001 — Astro para Storefront

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Contexto**  
El storefront debe priorizar velocidad, SEO, mínimo JavaScript y customización total.

**Decisión**  
Usar Astro + TypeScript + Tailwind CSS v4 + Preact islands.

**Por qué**

- la mayor parte del storefront puede renderizarse como HTML;
- Preact cubre interacción puntual;
- evita hidratar una SPA completa;
- encaja con Cloudflare Workers.

**Consecuencias**

- componentes interactivos deben diseñarse como islands;
- evitar lógica global cliente innecesaria.

**Revisar si**

- una futura necesidad requiere interactividad global dominante o una limitación real de Astro.

---

## ADR-002 — React + Vite para Admin

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Contexto**  
El Admin es una aplicación autenticada con tablas, filtros, forms, realtime, dashboards y state complejo. No necesita SEO/SSR.

**Decisión**  
Usar React + Vite + TypeScript.

**Por qué**

- menor complejidad conceptual;
- excelente DX para SPA;
- no necesitamos Server Components/SSR de Next;
- la lógica de dominio vive fuera del framework.

**Consecuencias**

- Admin consume Commerce API/Services;
- no esconder lógica de negocio en server actions de framework.

**Revisar si**

- aparecen requisitos SSR/server rendering reales dentro del Admin.

---

## ADR-003 — Admin único multitenant

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**  
Una sola aplicación Admin para todos los clientes.

**Por qué**

- mantenimiento centralizado;
- nuevas funcionalidades disponibles para todos;
- evita deployments por tenant;
- simplifica soporte.

**Consecuencias**

- RLS y tenant scoping son críticos;
- roles, memberships y feature flags son parte del core.

---

## ADR-004 — Storefront independiente por cliente

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**  
Cada cliente puede tener repo/deploy propio, consumiendo paquetes compartidos `@pick/*`.

**Por qué**

- branding y customización sin contaminar otros clientes;
- deploy/rollback independiente;
- dominio independiente;
- core actualizable vía versiones.

**Consecuencias**

- evitar copiar el core dentro del repo del cliente;
- mantener compatibilidad de paquetes.

---

## ADR-005 — Supabase como backend/base inicial

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**  
Usar Supabase/Postgres/Auth/RLS.

**Por qué**

- Postgres;
- auth;
- RLS;
- rapidez para v1;
- buen balance entre velocidad de desarrollo y control.

**Consecuencias**

- diseñar schema y migrations cuidadosamente;
- no depender de acceso directo irrestricto desde frontend.

---

## ADR-006 — Cloudflare como edge/hosting

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**  
Usar Cloudflare para storefront deploy, CDN, Workers, seguridad y R2 cuando corresponda.

**Consecuencias**

- cada storefront puede tener Worker/proyecto independiente;
- revisar límites y compatibilidad del runtime al incorporar dependencias.

---

## ADR-007 — Commerce Core no es ERP

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**  
Pick Commerce administra experiencia de venta, catálogo enriquecido, pedidos, promociones y analytics. No reemplaza contabilidad/ERP.

**Consecuencias**

- source of truth debe ser explícito;
- devoluciones, notas de crédito y procesos fiscales quedan fuera del core inicial.

---

## ADR-008 — Devoluciones y reembolsos fuera de v1

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**

- no crear returns engine en v1;
- no procesar refunds;
- no emitir notas de crédito;
- mostrar contacto/política del comercio;
- reflejar estado posterior si ERP lo informa.

**Por qué**

- la operación fiscal ocurre en ERP/proveedor;
- duplicarla crea riesgo de inconsistencias.

---

## ADR-009 — Validación de stock en carrito y checkout

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**

- navegación usa inventory mirror;
- Add to Cart valida contra ERP/provider cuando sea viable;
- checkout revalida siempre antes de confirmar;
- reservations dependen de capabilities del ERP.

**Consecuencias**

- no depender del ERP para cada page view;
- adapter debe declarar capacidades.

---

## ADR-010 — Sucursales representadas en Pick Commerce

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**  
Mantener `locations` aunque ERP ya maneje sucursales.

**Por qué**

- pickup;
- routing;
- analytics;
- stock visible;
- disponibilidad;
- reglas del storefront.

**Consecuencias**

- mapear `erp_location_id`;
- ERP sigue siendo autoridad cuando corresponda.

---

## ADR-011 — Catálogo universal mediante atributos

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
No agregar cientos de columnas específicas por industria.

Usar:

- core universal;
- taxonomy;
- attribute definitions;
- product/variant attribute values;
- metafields.

**Por qué**
Permite vender desde moda hasta ferretería sin forks.

---

## ADR-012 — OpenAI solamente

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
La primera etapa integra únicamente OpenAI.

**Por qué**

- reducir superficie;
- evitar adapters sin valor inmediato;
- mejorar foco y mantenimiento.

**Consecuencias**

- mantener interface AI suficientemente limpia;
- no implementar Claude/Gemini por anticipado.

---

## ADR-013 — OpenAI BYOK

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
Cada tenant puede agregar su propia OpenAI API key.

**Por qué**

- evita sistema de créditos;
- evita subsidios y billing adicional;
- consumo pertenece al comercio.

**Consecuencias**

- secrets cifrados server-side;
- key nunca en frontend;
- ecommerce funciona sin AI key.

---

## ADR-014 — MCP separado de OpenAI API

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**

- OpenAI API: AI dentro de Pick Commerce.
- MCP: operar Pick Commerce desde ChatGPT.

**Consecuencias**
Un cliente puede usar uno sin el otro.

---

## ADR-015 — MCP sin funciones fiscales

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
MCP puede consultar y operar productos, promociones, colecciones, campañas, analytics, catálogo y sync según permisos.

MCP no puede:

- facturar;
- emitir nota de crédito;
- reembolsar;
- manipular contabilidad.

**Consecuencias**

- RBAC obligatorio;
- acciones sensibles usan preview/confirm/execute;
- audit log.

---

## ADR-016 — Email con Resend; WhatsApp fuera del core

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
Usar Resend para notificaciones transaccionales.

**Por qué**
Agregar WhatsApp implicaría WABA, números, templates, inbox, agentes y operación omnicanal.

**Consecuencias**
Mantener `NotificationProvider` para integración futura sin implementarla ahora.

---

## ADR-017 — Demos reales

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
Todas las demos deben correr sobre Commerce Core real.

**Por qué**
Evita vender features inexistentes y prueba continuamente el engine.

**Consecuencias**
Puede existir `demo mode`, pero no lógica ficticia incompatible con producción.

---

## ADR-018 — Camelot como shadow ERP pilot

**Fecha:** 2026-08-23  
**Estado:** Superseded por ADR-084 — Camelot sigue apagado y el piloto pasó a Estilo Sport, que además es bidireccional

**Decisión**
Usar Camelot como caso real, inicialmente read-only.

**Flujo**

```text
ERP
→ adapter
→ normalizer
→ Pick shadow catalog
→ diff/reconciliation
```

**Por qué**
Permite validar escala y datos reales sin afectar operación actual.

**Revisar si**
El ERP permite un sandbox o writes seguros.

# Decisiones pendientes

| ID    | Tema                                   | Motivo                                                                                                                                                             |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-001 | Primer gateway real                    | Sigue abierta: el contrato y un proveedor simulado ya existen (ADR-080); falta el adapter real y sus credenciales                                                  |
| P-002 | ~~Storage media definitivo~~           | **Resuelta:** Supabase Storage, por estar ya en el stack (ADR-082). R2 queda como salida si el egress pesa                                                         |
| P-003 | ~~Analytics store inicial~~            | **Resuelta:** Postgres detrás de un puerto `AnalyticsDestination` (ADR-099). Analytics Engine muestrea, y el DoD exige cruzar eventos con `orders` en una consulta |
| P-004 | ~~Primera estrategia de reservations~~ | **Resuelta:** el ORDS de Estilo Sport no las tiene, así que validar → cobrar → empujar, sin prometer cero overselling (ADR-084, ADR-085)                           |
| P-005 | CLI/provisioner exacto                 | Puede empezar manual y automatizarse luego                                                                                                                         |

---

# Retroactividad

Cuando algo descubierto obligue a cambiar una decisión:

1. no borrar la decisión anterior;
2. marcarla `Superseded`;
3. crear una nueva decisión;
4. explicar el trigger;
5. actualizar `PROJECT.md` si cambia la fuente de verdad;
6. actualizar `ROADMAP.md` si cambia scope o fases.

---

## ADR-019 — Core vs Client Override

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**  
Una feature reutilizable entra al Core detrás de config/feature flag/capability. Una necesidad puramente visual o exclusiva permanece en el storefront del cliente.

**Regla de promoción**
Si una feature nace específica pero aparece un segundo caso real, evaluar moverla al Core.

**Por qué**
Evita dos extremos:

- Core contaminado por excepciones;
- múltiples implementaciones duplicadas de una misma capacidad.

---

## ADR-020 — Multi-moneda pertenece al Core

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
Soportar moneda base, monedas mostradas, moneda de checkout y tipo de cambio configurable.

Inicialmente se soporta tipo de cambio manual. Un provider automático puede agregarse posteriormente.

**Por qué**
Es una necesidad generalizable, especialmente en Paraguay/LATAM.

**Consecuencias**
Mostrar conversión y cobrar son conceptos separados.

---

## ADR-021 — Payment Methods declarativos

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
Configurar medios habilitados mediante lista/capabilities, no mediante lógica hardcodeada.

Ejemplo:

```text
payments.enabled = ["bank_transfer", "bancard"]
```

---

## ADR-022 — UX es Definition of Done

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
Loading, pending, skeleton, error, success, disabled y focus states forman parte del comportamiento esperado de una feature.

No se consideran polish opcional.

**Consecuencias**
Una operación asincrónica que "se congela" sin feedback no está terminada.

**Agregado el 2026-09-12 — un control que promete algo que no existe se saca**
El corolario estaba aplicado tres veces y escrito sólo en los mensajes de commit,
así que la cuarta vez se iba a discutir de cero. La regla: si una función no
existe, su control no se deja inerte ni «por ahora» — se saca, o se cablea a algo
que sí funcione.

- El header de Treeshop nació sin corazón de wishlist: no existe en el sistema y
  un corazón que no hace nada es peor que no tenerlo (commit 03fcf31).
- Salió el ícono «Mi cuenta»: no hay cuentas de comprador, y eso es v2
  (commit 1c7a734).
- El ícono de buscar sí llevaba a algún lado —al catálogo, sin campo donde
  escribir— y es el caso que costó: se reportó como «el buscador no funciona»
  después de una semana sin buscador. No se sacó, se cableó: abre un diálogo con
  el formulario, y sin JavaScript es un enlace al formulario visible del catálogo
  (commit 6c9beac).

La versión preventiva ya está en el código: las flechas de un carrusel nacen
`hidden` y las muestra el script, así que sin él no queda un control muerto
(`packages/commerce-astro/src/primitives/carrusel-controles.ts`, ADR-113).

---

## ADR-023 — PLP usa faceted filtering

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
Filtros dinámicos basados en taxonomía/atributos y dataset actual.

Orden inicial:

1. talla/variante;
2. género;
3. marca;
4. color;
5. categoría;
6. precio;
7. atributos específicos.

Accordion inicialmente colapsado salvo preset.

---

## ADR-024 — Paginación obligatoria

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
No cargar datasets completos en Storefront ni Admin cuando puedan crecer significativamente.

**Consecuencias**
Queries deben soportar limit/cursor/page, filters y sort.

---

## ADR-025 — Motion premium es opt-in

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
CSS/View Transitions cubren micro-interacciones simples. GSAP + ScrollTrigger es la opción premium principal para Astro/Preact. Motion se usa sólo dentro de islands React explícitas cuando aporte una ventaja clara. Ninguna librería premium forma parte del bundle base.

**Consecuencias**

- lazy loading;
- reduced motion;
- progressive enhancement;
- performance budget.

---

## ADR-026 — Linked Colors

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
Soportar swatches y productos relacionados por color tanto si el ERP los modela como variantes como si los modela como productos separados.

**Consecuencias**
La UX abstrae la diferencia, pero el modelo conserva SKU, stock, URL e identidad reales.

---

## ADR-027 — Presets sin estética genérica de template

**Fecha:** 2026-08-23  
**Estado:** Accepted

**Decisión**
No usar por defecto recursos visuales repetitivos como uppercase + wide tracking, gradients/glows arbitrarios o cards idénticas para todos los verticales.

**Por qué**
Los presets deben sentirse diseñados para un contexto comercial, no generados desde una plantilla genérica.

---

## ADR-028 — Monorepo pnpm sin orquestador de builds

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
El monorepo arranca con dos paquetes y dos apps. Turborepo/Nx aportan caché y
grafo de tareas, pero también configuración y una dependencia más que mantener.

**Decisión**
Usar sólo `pnpm workspaces` con scripts recursivos (`pnpm -r`). No incorporar
Turborepo ni Nx todavía.

**Por qué**
A esta escala el build completo tarda segundos: la caché no resuelve un problema
que aún no existe.

**Revisar si**
El build completo pasa de ~1 minuto, o el CI se vuelve el cuello de botella.

---

## ADR-029 — Paquetes internos consumidos como código fuente

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
`@pick/*` puede distribuirse compilado (tsup/rollup) o exponer `src/` y dejar que
el bundler de cada app lo compile.

**Decisión**
Mientras los paquetes sean internos, `exports` apunta a `src/*.ts`. No hay paso
de build por paquete.

**Por qué**

- elimina una capa de configuración y un artefacto que se desincroniza;
- Vite y Astro ya compilan TypeScript del workspace;
- el sourcemap apunta al código real al depurar.

**Consecuencias**

- los imports internos llevan extensión `.ts` explícita
  (`allowImportingTsExtensions`);
- **antes de publicar `@pick/*` en un registry** para storefronts de clientes hay
  que agregar build y `exports` con tipos compilados: un consumidor externo no
  puede depender de nuestro `src/`.

**Revisar si**
Se publica el primer paquete versionado fuera del monorepo (ADR-004).

---

## ADR-030 — `node:test` como runner de tests

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
Node 24 ejecuta TypeScript nativamente y trae `node:test` y `node:assert` en la
librería estándar.

**Decisión**
Usar `node --test` en vez de Vitest o Jest.

**Por qué**

- cero dependencias de testing en el árbol;
- sin configuración ni transpilación intermedia;
- suficiente para la prioridad del harness: dinero, stock, orders, permisos.

**Consecuencias**

- requiere Node >= 22 (`engines` lo declara);
- no hay `jsdom` ni renderizado de componentes: los tests de UI llegarán con
  Playwright, que el harness ya define como framework de critical paths.

**Revisar si**
Se necesita testear componentes en unidad, o mocking que la stdlib no cubra.

---

## ADR-031 — Prettier adoptado; TypeScript fijado en 6.0

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
`ROADMAP.md` dejaba abierto si usar Prettier. Por otro lado, TypeScript 7.0 (el
compilador nativo) ya es estable, pero `typescript-eslint` declara
`typescript >=4.8.4 <6.1.0` y `@astrojs/check` declara `^5 || ^6`.

**Decisión**

- Adoptar Prettier para formato y ESLint (flat config) sólo para reglas.
- Fijar TypeScript en `^6.0.3`, la última versión que el tooling soporta.

**Por qué**
Separar formato de linting evita reglas de estilo peleando con el formateador.
Adoptar TS 7 hoy dejaría `pnpm lint` y `pnpm typecheck` fuera de soporte, y esos
dos comandos son la Definition of Done.

**Consecuencias**
Prettier también normaliza los `.md` del repo, incluidos los documentos de
contexto.

**Revisar si**
`typescript-eslint` y `@astrojs/check` amplían su rango a TypeScript 7.

---

## ADR-032 — Componentes estáticos en `.astro`, Preact sólo para islands

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
La primera versión de Product Card se escribió como componente Preact en
`@pick/commerce-ui`. Al renderizarla desde una página `.astro` se descubrió que
**no se puede pasar markup como prop a un componente de framework**: un badge
pasado como string aparece en el HTML, el mismo badge como elemento JSX se
descarta en silencio. Las expresiones de `.astro` no producen vnodes de Preact.

La documentación de Astro lo confirma: sólo se serializan objetos, números,
strings, Array, Map, Set, RegExp, Date, BigInt, URL y typed arrays. Sobre JSX y
render props dice explícitamente que _"passing React's 'render props' to
framework components from an Astro component will not work"_.

Existe un workaround: los **named slots** en kebab-case sí llegan a un
componente React/Preact como props en camelCase, así que un
`<span slot="badge">` habría funcionado sin cambiar de framework. Es decir, el
problema original era solucionable sin migrar a `.astro`.

**Decisión**

- Los componentes de presentación estática se escriben en `.astro` y viven en
  `@pick/commerce-astro`. Usan `<slot />`, que sí funciona.
- Preact queda reservado para islands con interactividad real: Add to Cart,
  Variant Selector, Quantity, Cart Drawer, filtros de PLP, búsqueda.
- `@pick/commerce-ui` conserva los tokens y utilidades compartidas (`cn`) y
  alojará esas islands. Al no contener `.astro`, el Admin puede consumirlo.

**Por qué**
El motivo real no es que Preact fuera imposible, sino el costo: la documentación
de Astro recomienda _"use framework components only for interactive islands;
otherwise, plain `.astro` components deliver better performance"_. Una Product
Card no tiene interactividad propia, así que pagar hidratación por ella es
gratuito en contra.

Coincide además con ADR-001 y con el reparto de paquetes de PROJECT.md §5, que
ya distingue `commerce-ui` de `commerce-astro`. La PLP resultante envía **cero
JavaScript**: el HTML generado no tiene un solo `<script>`.

**Consecuencias**

- Un componente que exista en ambos mundos (por ejemplo Price, estático en PLP y
  reactivo dentro del selector de variante del PDP) tendrá dos envoltorios de
  markup. Es aceptable porque la lógica real vive en `@pick/commerce-core` y se
  testea una sola vez; el envoltorio duplicado son ~20 líneas.
- La versión Preact de cada componente se crea recién cuando una island la
  necesita, no por anticipado.

**Restricción heredada**
Astro tampoco permite lo inverso: _"you cannot import `.astro` components in a
UI framework component"_. Una island Preact no puede contener componentes
`.astro`, así que el Cart Drawer y el Variant Selector deberán recibir su
contenido por props/children desde la página, no importarlo.

**Revisar si**
El storefront necesita hidratación tan extendida que mantener dos capas deje de
compensar.

---

## ADR-033 — Tokens de diseño como CSS de Tailwind v4

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
Tailwind v4 define el tema en CSS con `@theme`, no en `tailwind.config.js`. Los
presets necesitan redefinir el sistema visual sin tocar los componentes.

**Decisión**
Los tokens viven en `@pick/commerce-ui/tokens.css` y son **semánticos**
(`--color-fg-muted`, `--color-sale`, `--aspect-product`), no nombres de color.
Un preset redefine variables; no sobreescribe clases.

`tokens.css` incluye su propio `@source '../'` porque Tailwind no escanea
`node_modules`, y los paquetes del workspace llegan al app por symlink: sin eso
las clases usadas dentro de los componentes no se generan.

**Consecuencias**

- Agregar un paquete con componentes obliga a incluir su `@source`.
- `--aspect-product` permite que moda use retrato y ferretería cuadrado sin
  forkear la Product Card, según el principio de un solo Core.

---

## ADR-034 — Imágenes de producto vía `astro:assets`

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
La primera Product Card usaba un `<img>` crudo. Astro no procesa esas etiquetas:
se pierden la conversión de formato, el `srcset` responsive y la garantía de
reserva de espacio. En un ecommerce la imagen **es** el peso de la página, y
ENGINEERING_HARNESS.md §22 ya pedía verificar formato y tamaños antes de cerrar
una lista.

**Decisión**
`ProductCardMedia` usa `<Image />` de `astro:assets` con `layout="constrained"`
y un `sizes` que refleja el grid real.

`ProductImage.width` y `.height` pasan a ser **obligatorias** en
`@pick/commerce-types`. Sin dimensiones no hay prevención de CLS, así que todo
medio que entre por ERP, CSV o upload debe registrarlas.

**Consecuencias**

- Cada storefront debe autorizar el host de sus medios en `image.remotePatterns`
  o `image.domains`; sin eso las imágenes remotas se muestran sin optimizar,
  aunque conservan la prevención de CLS.
- Las imágenes en `public/` nunca se optimizan. Sirven para placeholders del
  demo, no para catálogo real: el catálogo vendrá de R2 o Supabase Storage como
  URL remota autorizada.
- El adapter de Cloudflare queda con su `imageService` por defecto
  (`cloudflare-binding`), que optimiza en runtime. Es lo correcto para un
  catálogo remoto; `'compile'` sólo serviría si todas las imágenes fueran
  locales y las rutas prerenderizadas.

---

## ADR-035 — El alta al carrito entra por un módulo, no por props

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
`AddToCart` es una island y necesita ejecutar una acción asíncrona. El patrón
habitual sería recibir el handler por props, pero la documentación de Astro lo
prohíbe: las funciones _"can only be used during the component's server
rendering and cannot be used to provide interactivity"_. Una función que baje
desde `.astro` no existe en el browser.

**Decisión**
La acción entra por `@pick/commerce-ui/cart/add-to-cart`, un módulo con una
única función `addToCart(input): Promise<void>`. En Fase 1 sólo emite un
`CustomEvent`; en Fase 5 se reemplaza su cuerpo por la llamada real al cart
service, sin tocar ningún componente.

El contrato es asíncrono desde ahora aunque todavía no haya red, para que el
botón implemente pending y error de entrada y no se agreguen después.

**Por qué no un registry ni inyección de dependencias**
Hay una sola implementación. Un registro de handlers sería una abstracción sin
segundo caso, justo lo que descarta la regla anti-overengineering. Un módulo con
una función es el seam mínimo que permite el reemplazo en un solo archivo.

**Consecuencias**

- Ninguna island puede recibir callbacks desde una página `.astro`; el patrón se
  repetirá en Cart Drawer, filtros de PLP y búsqueda.
- El evento `pick:add-to-cart` permite que un storefront reaccione (abrir el
  drawer, analytics) sin acoplarse al Core.

---

## ADR-036 — Base UI como capa de primitives del Admin

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
`PROJECT.md` §4 nombra shadcn y Base UI para el Admin. La motivación planteada
era que Base UI optimiza mejor que Radix. Se verificó antes de aceptarla.

**Qué dicen los datos**

- La documentación de Base UI **no hace ninguna afirmación** sobre bundle size ni
  tree-shaking. Sus ventajas declaradas son ser headless, accesible y componible.
- `@base-ui/react` y `radix-ui` declaran ambos `sideEffects: false`, que es lo
  que habilita el tree-shaking. En ese eje son equivalentes.
- El tamaño desempaquetado no es comparable: `radix-ui` (105 KB) es un
  re-export delgado sobre ~30 paquetes que se instalan igual, mientras
  `@base-ui/react` (9,5 MB) trae todos los componentes en un paquete con ESM,
  CJS y tipos. Ninguno de los dos números predice el bundle final.

**La premisa no se sostiene: no hay diferencia de optimización demostrable.**

Además, el eje está mal elegido para dónde se aplica. Esto es el **Admin**, una
SPA autenticada sin SEO: `PROJECT.md` §2.8 dice que el Admin prioriza
productividad y mantenibilidad, no bytes. El presupuesto de performance que
importa es el del storefront, y el storefront no usa ninguna de las dos.

**Decisión**
Usar Base UI igual, pero por los motivos correctos:

- lo mantiene el equipo que creó Radix, Material UI y Floating UI, incluido el
  autor original de Radix;
- API unificada en un solo paquete en vez de ~30 dependencias separadas, lo que
  simplifica versionado y upgrades;
- está estable en 1.7.0 y en desarrollo activo;
- ya figura en `PROJECT.md`, así que mantenerlo evita una divergencia entre el
  documento y el código.

**Corrección de un dato previo**
Se reportó antes que Base UI estaba en `1.0.0-rc.0` y por lo tanto no era
estable. Era incorrecto: ese es el paquete viejo `@base-ui-components/react`,
congelado tras el renombre. El paquete vigente es **`@base-ui/react`, estable en
1.7.0**.

**Consecuencias**

- Aplica sólo al Admin. El storefront usa componentes propios: shadcn es
  React-only y los componentes estáticos son `.astro` con cero JavaScript.
- Al instalar, usar la CLI de shadcn (`init --monorepo`, `add -c apps/admin`),
  que copia el código fuente al repo. No transcribir componentes a mano.

**Revisar si**
Base UI introduce fricción real con la CLI de shadcn, o si aparece una medición
concreta de bundle que cambie el análisis. En cualquiera de los dos casos, Radix
es el reemplazo directo.

---

## ADR-037 — El estilo compartido son recetas de clases, no componentes

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
ADR-032 dejó el storefront con dos capas de render que no pueden compartir
componentes: `.astro` estático y Preact hidratado. El botón de "Agregar al
carrito" vive en Preact y el resto de los botones en `.astro`, así que el estilo
corría riesgo de divergir.

**Decisión**
El estilo vive en funciones agnósticas de framework —`buttonVariants()`,
`badgeVariants()`— que devuelven un string de clases. `Button.astro` y los
botones Preact las consumen; ninguna de las dos capas redefine el estilo.

**Por qué no `cva`**
Con dos recetas y tres variantes cada una, una función con dos objetos de
lookup son veinte líneas. `cva` se justifica cuando aparezcan variantes
compuestas reales.

**Consecuencias**
La duplicación que ADR-032 aceptaba queda acotada al markup. El estilo, que es
lo que efectivamente diverge con el tiempo, tiene un solo origen.

---

## ADR-038 — La galería de producto es CSS, no una island

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
Una galería con miniaturas parece pedir JavaScript. Pero `astro:assets` sólo
existe en `.astro`: una galería en Preact tendría que volver a `<img>` crudo y
perder srcset y conversión de formato — justo en el componente más pesado del
PDP, y contra ADR-034.

**Decisión**
La tira principal es un contenedor con `scroll-snap` y las miniaturas son
anchors a cada imagen. Al navegar al ancla el browser desplaza el contenedor.
Cero JavaScript, funciona sin hidratar y conserva `<Image />`.

**Consecuencias**

- Los anclas se derivan del handle del producto, no de un valor aleatorio: dos
  builds del mismo contenido dan el mismo HTML y no invalidan la caché.
  Verificado comparando el hash de dos builds consecutivos.
- El contenedor lleva `tabindex="0"` y `role="group"` para que sea alcanzable
  por teclado, y `motion-reduce:scroll-auto`.
- Un zoom o un lightbox sí necesitarían una island; se agrega cuando se pidan,
  sobre este marcado.

---

## ADR-039 — Estado del carrito por eventos del DOM y `localStorage`

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
El drawer vive en el layout y el botón de compra en el PDP: son islands
distintas y Astro no comparte estado entre ellas. La documentación recomienda
Nano Stores, pero también lista los eventos del DOM como alternativa válida.

Hay un segundo problema que ninguna librería de estado resuelve: el storefront
es un MPA. Cada navegación vuelve a montar las islands, así que un carrito sólo
en memoria se vaciaría al pasar del PDP al catálogo.

**Decisión**
Un módulo `cart/store` mantiene las líneas, las persiste en `localStorage` y
avisa con un `CustomEvent`. Sin dependencia nueva: el evento de alta ya existía
por ADR-035.

**Por qué no Nano Stores**
Haría falta igual la persistencia, así que no evita el `localStorage`. Con un
solo consumidor por página, un evento del DOM y una función de suscripción
cubren el caso en menos código.

**Consecuencias**

- Cada línea guarda un snapshot de presentación (título, precio, imagen), igual
  que hará la orden en `PROJECT.md` §13: el drawer no vuelve al catálogo y un
  cambio de precio no reescribe lo que el cliente vio.
- Las lecturas de `localStorage` van dentro de `try/catch`: en modo privado o
  con storage lleno el carrito degrada a memoria en vez de romper la página.
- El estado se lee **después** de montar, no en el primer render, porque el HTML
  del servidor no puede conocer el `localStorage` y habría mismatch de
  hidratación.
- Esto es un espejo de cliente, no autoridad. El stock se revalida siempre en
  checkout (ADR-009), y en Fase 5 el store pasa a hablar con el cart service.

---

## ADR-040 — Las islands se importan por subpath, nunca desde el barrel

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
Con `CartButton`, `CartDrawer` y `ProductPurchase` exportados desde el
`index.ts` de `@pick/commerce-ui`, el build generó **un solo chunk de 39 KB con
las tres**, y toda página lo descargaba entero. El catálogo bajaba el código del
selector de variantes que nunca usa.

**Decisión**
Cada island tiene su propia entrada en `exports` y se importa por subpath
(`@pick/commerce-ui/cart/CartDrawer`). El barrel queda para utilidades y recetas,
que son server-side y se compilan al HTML.

**Medición**
Tras separar, los chunks quedan por island: `CartButton` 831 B, `CartDrawer`
3 KB, `ProductPurchase` 4,3 KB. El catálogo ya no descarga `ProductPurchase`.
El total de la home es 59 KB sin comprimir, **~20 KB gzip**.

**Pendiente**
El chunk dominante no es ninguna island sino `jsxRuntime` (28,6 KB / 9,2 KB
gzip), presente en toda página con al menos una island. Es desproporcionado para
Preact y hay que investigarlo antes de cerrar el presupuesto de performance de
Fase 2.

**Consecuencias**
Agregar una island al barrel vuelve a unir los chunks sin que nada falle. Al
crear una island nueva hay que agregarle su `exports`.

---

## ADR-041 — `cn` con config recortada de tailwind-merge

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
El chunk más grande del storefront pesaba 28,6 KB y se descargaba en toda página
con al menos una island. Rollup lo había bautizado `jsxRuntime.module.js` por
uno de sus miembros, lo que desvió el diagnóstico hacia Preact.

Medición del contenido real: 27.319 de 28.610 bytes (95,5 %) eran clsx más la
config por defecto de tailwind-merge; sólo 419 bytes eran el jsx factory de
Preact. No había `preact/compat` ni duplicación entre chunks.

**Decisión**
`cn` pasa a `createTailwindMerge` con los grupos de utilidades que el design
system usa. La documentación de tailwind-merge señala `createTailwindMerge` como
el camino soportado para dejar la config por defecto fuera del bundle;
`extendTailwindMerge`, en cambio, la conserva.

**Medido**

|       |               antes |              después |
| ----- | ------------------: | -------------------: |
| chunk | 28.610 B / 9.181 gz |   9.315 B / 3.991 gz |
| home  |                   — | 31.862 B / 14.147 gz |
| PDP   |                   — | 36.162 B / 16.125 gz |

**El riesgo y su mitigación**
Un grupo no declarado deja de resolver conflictos **sin error ni warning**. El
test de `cn` compara la versión recortada contra el tailwind-merge completo
sobre las combinaciones reales de las recetas: si alguna diverge, falla ahí. Al
exponer una utilidad nueva como override hay que agregar su grupo y un caso.

**Corrección de una medición previa**
Se había contado `signals.module.js` (7,8 KB) como parte del payload. No lo es:
el renderer de `@astrojs/preact` lo trae con un `import()` dinámico condicionado
a `data-preact-signals`, y ninguna island pasa signals. Verificado: no aparece
en el HTML ni hay `modulepreload`.

---

## ADR-042 — PLP sin recarga completa: form GET más `ClientRouter` acotado

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
ADR-024 exige filtros server-side y las reglas UX exigen no recargar la página
entera al filtrar. Las dos cosas parecen incompatibles.

**Alternativas descartadas, con evidencia**

- **Página prerenderizada**: en Cloudflare no ve el query string. Comprobado:
  devuelve `q=""` ante `?q=x`. Por eso la PLP es `prerender = false`.
- **Astro Actions**: su runtime sólo expone POST. Un POST no da URL compartible
  ni cacheable. Actions es para mutaciones, no para leer un listado.
- **Server islands**: la URL de fetch se hornea en build sin los search params y
  su `Astro.url` apunta a `/_server-islands/...`, así que no ve los filtros.
- **Island que hace fetch y reemplaza el grid**: habría que escribir a mano el
  fetch, el `pushState`, el back/forward, el estado pending y el anuncio a
  lectores de pantalla. Más código y más bundle que `ClientRouter`, y encima no
  funciona sin JavaScript.

**Decisión**
`<form method="get">` nativo más `<ClientRouter />` **sólo en la PLP**. Sin
JavaScript el usuario pulsa "Aplicar" y todo funciona; con JavaScript el submit
se intercepta y no hay recarga completa.

**Detalles que muerden**

- El `<form>` va vacío y los controles se asocian con `form="plp"`. Así el mismo
  panel es sidebar en desktop y disclosure en mobile sin duplicar inputs, que
  mandaría cada valor dos veces.
- `page` **no** es un campo del form: cambiar un filtro debe volver a la página
  1. `sort` **sí**, o se perdería al filtrar.
- `ClientRouter` hace `scrollTo(0,0)` y manda el foco al `<body>`. Se corrige en
  `astro:after-swap` restaurando scroll y foco, con `preventScroll` — sin él el
  foco vuelve a desplazar la página.
- El total va en el `<title>` porque el announcer del router lo lee al navegar.

**Costo**
`ClientRouter` son 16,3 KB / 5,6 KB gzip, y sólo los paga `/catalogo`. La home y
el PDP no lo cargan: verificado en el HTML generado.

---

## ADR-043 — shadcn sobre Base UI en el Admin: procedimiento verificado

**Fecha:** 2026-08-23
**Estado:** Accepted — implementa ADR-036

**Confirmación de la duda que quedó abierta**
shadcn **sí** soporta Base UI, y desde julio de 2026 es su opción por defecto;
Radix sigue soportado. No se elige con un registry ni un namespace aparte sino
con el flag `-b base` en `init`, que queda persistido en `components.json` como
`"style": "base-nova"`. El paquete que instala es `@base-ui/react ^1.7.0`,
exactamente el que nombraba ADR-036.

**Procedimiento**

```bash
cd apps/admin
pnpm dlx shadcn@latest init -b base -p nova -y --no-reinstall
pnpm dlx shadcn@latest add button -y
```

Tres trampas encontradas al ejecutarlo:

1. **`baseUrl` rompe el typecheck.** La guía oficial de shadcn para Vite manda
   agregar `baseUrl` al tsconfig, pero en TypeScript 6 eso es el error TS5101.
   Alcanza con `paths`, que desde TS 4 se resuelve relativo al tsconfig.
2. **`--monorepo` no es lo que parece**: scaffoldea un monorepo nuevo con
   Turborepo. Para agregar a un workspace existente se corre desde `apps/admin`,
   o desde la raíz con `-c apps/admin`.
3. **El alias de Vite necesita `fileURLToPath`.** Con `new URL(...).pathname`,
   en Windows y con un espacio en la ruta del repo, el alias resuelve a
   `/C:/.../Pick%20commerce/...` y el build muere con `os error 123`.

**Alcance**
Los componentes viven en `apps/admin/src/components/ui`, **no** en
`@pick/commerce-ui`: ese paquete es Preact y shadcn es React. Un
`@pick/admin-ui` compartido sería abstracción especulativa mientras haya una
sola app React.

**Dependencias que arrastra el init**, no declaradas antes en el stack:
`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
`tw-animate-css`, `@fontsource-variable/geist` —reemplazado por
`@fontsource-variable/onest` el 2026-09-02, cuando la tipografía del Admin pasó a
ser Onest—, y — la menos obvia — `shadcn` como dependencia de **runtime**, porque
`styles.css` hace `@import "shadcn/tailwind.css"`.

**Nota de tamaño**
El Admin queda en 72,9 KB gzip de JavaScript. Es aceptable: `PROJECT.md` §2.8
dice que el Admin prioriza productividad y mantenibilidad, y el presupuesto de
performance que importa es el del storefront.

---

## ADR-044 — Los `@source` de Tailwind se declaran en `tokens.css`, no en cada app

**Fecha:** 2026-08-23
**Estado:** Accepted

**Contexto**
Tailwind v4 no escanea `node_modules`, y los paquetes del workspace llegan a las
apps por symlink. `tokens.css` declaraba `@source` sólo para `commerce-ui`, así
que las clases que sólo existen dentro de `commerce-astro` nunca se generaban.

**El fallo es silencioso y por eso peligroso.** El HTML sale con la clase, el
CSS sin la regla, y nada falla: ni el build, ni el typecheck, ni el lint. Se
detectó porque `aspect-(--aspect-product)` había desaparecido del CSS, dejando
las imágenes de producto sin relación de aspecto — es decir, reintroduciendo el
layout shift que ADR-034 existía para evitar.

**Decisión**
`tokens.css` declara el `@source` de todos los paquetes `@pick/*` con
componentes, no sólo el suyo. Se pone ahí y no en cada app justamente para que
ninguna pueda olvidarlo.

**Por qué es seguro**
Verificado: un `@source` que apunta a un paquete inexistente se ignora sin error
ni warning, y el build sigue. Listar `commerce-astro` no rompe a un storefront
que sólo use `commerce-ui`.

**Deuda**
Las rutas son relativas dentro del monorepo. Al publicar los paquetes a un
registry dejan de resolver y habrá que enviar CSS compilado — mismo disparador
que ADR-029.

**Regla que queda**
Un paquete nuevo con componentes necesita su línea de `@source` en `tokens.css`.
Sin ella sus estilos no existen, y nada avisa.

---

## ADR-045 — El panel de filtros no puede ser un `<details>`

**Fecha:** 2026-08-24
**Estado:** Accepted — corrige la implementación de ADR-042

**Qué se rompió**
El panel de filtros de la PLP se había resuelto con un `<details>` que en
desktop se forzaba visible por CSS (`.plp-filtros > div { display: flex }`) y en
mobile quedaba como disclosure. **No funciona.** Un `<details>` cerrado oculta su
contenido con `content-visibility` sobre un slot interno del navegador, y
ninguna regla CSS aplicada al hijo lo revela.

Resultado en producción: en desktop el panel entero era invisible. Sin
checkboxes, sin botón "Aplicar", sin forma de filtrar. El catálogo se veía
completo y sin controles.

**Por qué no se detectó antes**
Toda la verificación de la PLP se había hecho con `curl`, comprobando que el
HTML contuviera los elementos. Los elementos estaban: el problema era CSS, que
`curl` no evalúa. El fallo lo encontró el primer test de Playwright que abrió la
página en un navegador de verdad.

**Decisión**
El panel es un `<div>`. En desktop siempre visible y el disparador oculto; en
mobile lo abre un `<button>` con `aria-expanded` y `aria-controls`.

El atributo `hidden` lo pone el script, no el servidor: **sin JavaScript el
panel queda visible también en mobile**, así que filtrar nunca depende de que
cargue el script.

**Consecuencia general**
CSS puede ocultar lo que el navegador muestra, pero no mostrar lo que el
navegador oculta por estado del DOM. Un truco CSS sobre `<details>`, `<dialog>`
o `<select>` sólo funciona en una dirección.

---

## ADR-046 — GEO: el JSON-LD lo genera el Core y no puede afirmar lo que no sabe

**Fecha:** 2026-08-24
**Estado:** Accepted

**Contexto**
Los motores generativos —ChatGPT, Perplexity, los resúmenes de IA de Google—
son un canal de descubrimiento de producto, no una curiosidad. Optimizar para
que entiendan el catálogo (GEO) es parte del valor de Pick Commerce, no un
extra.

**Ventaja que ya teníamos sin nombrarla**
La mayoría de los crawlers de IA **no ejecutan JavaScript**. Un storefront hecho
como SPA es casi invisible para ellos. El nuestro sirve todo el contenido en
HTML desde el servidor (ADR-032), así que la base de GEO ya estaba puesta.

**Decisión**
El JSON-LD se genera en `@pick/commerce-core` a partir de los tipos del
dominio, no se escribe a mano en cada página. Es un objeto plano, así que se
testea.

**La regla que no se negocia:** el JSON-LD no puede afirmar lo que no sabemos.
Una oferta por variante con su SKU, su precio y su disponibilidad reales; nada
de rangos inventados ni de `InStock` por defecto. Un `availability` falso es una
promesa rota a un buscador, y en comercio eso termina en un cliente enojado.

Cubierto: `Product` con `Offer` por variante, `ItemList` en la PLP,
`Organization` en la home, `BreadcrumbList` en el PDP y `FAQPage` en las
preguntas frecuentes — este último es el que más aprovecha un motor generativo,
porque entrega pares pregunta/respuesta ya delimitados.

**`llms.txt`**
Se publica según llmstxt.org. **No lista los productos**: el spec pide contenido
curado y un catálogo real haría un archivo inmanejable. Lista las entradas al
catálogo y las categorías; el detalle de cada producto ya está en el JSON-LD de
su PDP. Las versiones `.md` por página quedan fuera hasta tener evidencia de que
los motores las consumen.

**Corrección de una premisa**
Se creía que Cloudflare convertía las páginas a markdown para IA. No lo hace:
AI Crawl Control es control y monitoreo —permitir o bloquear crawlers, ver
cuáles acceden, cobrar por crawl— no conversión de formato. El trabajo de GEO
es nuestro.

---

## ADR-047 — Crawlers de IA permitidos por defecto, con flag por tenant

**Fecha:** 2026-08-24
**Estado:** Accepted

**Decisión**
`robots.txt` deja entrar a los crawlers de IA por defecto. El comercio que no lo
quiera lo apaga con `features.allowAiCrawlers`.

**Por qué ese default**
Un comercio quiere que le encuentren los productos. La visibilidad en respuestas
de IA vale más que el riesgo de que le lean el catálogo, que además es público.

**Por qué es un flag y no una constante**
Es una decisión comercial del comercio, no técnica. Un mayorista con precios
sensibles puede querer lo contrario, y la regla del repo dice que lo
configurable va detrás de un flag.

**Detalle de implementación que importa**
Bloquear requiere un bloque `User-agent:` **por cada bot**. Un `User-agent: *`
no alcanza: varios sólo obedecen una regla dirigida a su propio nombre. Hay un
test que lo fija.

---

## ADR-048 — Una sola forma de URL en canonical, og:url, sitemap y JSON-LD

**Fecha:** 2026-08-24
**Estado:** Accepted

**Qué se rompió**
El canonical, el `og:url` y el sitemap emitían `/productos/x/` con barra final
—el default de Astro con `build.format: 'directory'`— mientras el JSON-LD decía
`/productos/x`. Dos URLs distintas para la misma página: el buscador recibe
señales contradictorias sobre cuál indexar.

**Decisión**
`SeoContexto` declara `trailingSlash` y el Core construye todas sus URLs con esa
política. Un archivo con extensión y una ruta con query nunca la llevan.

**Además**
Las combinaciones de filtros del catálogo salen con `noindex,follow`. Indexarlas
multiplicaría URLs casi idénticas y dispersaría la autoridad del catálogo;
`follow` deja que los productos se sigan descubriendo desde ahí.

---

## ADR-049 — El panel de filtros es un `<dialog>` que cambia de rol con `:modal`

**Fecha:** 2026-08-24
**Estado:** Accepted — reemplaza la solución de ADR-045

**Contexto**
En mobile el panel desplegaba una lista inline. Lo correcto es un sheet, y el
patrón ya estaba resuelto en el Cart Drawer con `<dialog>` nativo: foco, Escape
y backdrop los aporta el navegador.

El problema era servir con un solo elemento dos formas distintas —sidebar en
desktop, sheet en mobile— sin duplicar los inputs, porque duplicarlos mandaría
cada valor dos veces en el form.

**Decisión**
Un único `<dialog>`, que nace con `open`. `:modal` distingue los dos estados:

- `[open]:not(:modal)` → panel en el flujo. Es el sidebar de desktop **y** el
  fallback de quien no tiene JavaScript.
- `:modal` → sheet anclado abajo, con backdrop. Sólo en mobile, al pulsar el
  botón.

**La regla que costó dos errores**
Ninguna regla propia puede declarar `display` fuera de esos dos selectores. El
navegador oculta un `<dialog>` cerrado y lo muestra al abrirlo; un `display`
suelto le gana **en ambas direcciones**. Declararlo en la regla base dejó el
sheet visible estando cerrado, tapando el botón que debía abrirlo.

Es la contracara de ADR-045: con `<details>` el CSS no puede mostrar lo que el
navegador oculta; con `<dialog>` puede de más.

**Otras dos correcciones del mismo reporte**

- **"Aplicar" sobraba**: con JavaScript los filtros se aplican al tocarlos. El
  botón sigue en el HTML porque es el único camino sin JavaScript, y el script
  lo oculta y muestra en su lugar uno que sólo cierra el sheet. Su contenedor
  **no** es `md:hidden`: sin eso, en desktop sin JavaScript no había forma de
  enviar los filtros.
- **El orden salió del panel**: ordenar es una decisión frecuente y no debería
  exigir abrir un sheet. Vive en la cabecera de resultados, visible siempre.

**Verificado en las cuatro combinaciones** de viewport y JavaScript, incluido
que filtrar sin JavaScript funcione en ambos anchos, y que el sheet sobreviva al
swap de ClientRouter al tocar un filtro.

---

## ADR-050 — Volver a la configuración completa de tailwind-merge

**Fecha:** 2026-08-24
**Estado:** Accepted — supersede a ADR-041

**Qué pasó**
ADR-041 recortó la configuración de tailwind-merge con `createTailwindMerge`
para sacar 27 KB del bundle, y dejó un test que comparaba la versión recortada
contra la completa. **El test pasaba y la aplicación estaba rota.**

La configuración clasificaba `border-b` como color de borde, así que
`cn('border-b border-border')` devolvía `'border-border'`. El header perdió su
borde inferior, el footer el superior y el cart drawer el izquierdo. Lo mismo
con los radios: `rounded-md rounded-t-lg` perdía el radio base.

**Por qué el test no lo atrapó**
Comparaba sólo las combinaciones que producen las **recetas**. Los bordes los
producen los **componentes**, que no estaban cubiertos. El test verificaba una
muestra y se leía como si verificara el contrato.

**Decisión**
`cn` vuelve a la configuración por defecto de tailwind-merge. El costo medido es
real —la home pasa de 14,1 a 19,9 KB gzip— y se acepta: un design system que
descarta clases en silencio cuesta más que 5,8 KB.

Los casos que fallaron quedan como test de regresión, no como muestra.

**La lección, que vale más que el ADR**
Una optimización cuyo modo de fallo es _silencioso_ necesita una verificación
**exhaustiva**, no ilustrativa. Si no se puede verificar exhaustivamente, no
conviene hacerla. ADR-041 nombraba el riesgo y aun así lo subestimó: el
"mitigado con un test" era falso.

---

## ADR-051 — Orden por defecto del header y presupuesto de performance

**Fecha:** 2026-08-24
**Estado:** Accepted

**Header**
Orden por defecto en desktop: **logo · navegación · buscador · wishlist ·
cuenta · carrito**. Es el orden del DOM, así que desktop no necesita ninguna
regla de `order`; mobile se reacomoda con `order-*` en tres filas, porque en una
sola el buscador queda aplastado.

Cada posición es un slot, incluidas `wishlist` y `account`, que hoy están
vacías. Un storefront que quiera otro arreglo compone distinto sin forkear el
componente.

El buscador vive en el header y no en el hero: así está disponible en todas las
páginas, incluida la PLP, donde además conserva la consulta activa.

**Presupuesto**
`pnpm budget` mide el peso gzip por página siguiendo la **cadena de imports**,
no sólo lo que el HTML referencia — una medición previa que contaba sólo lo
referenciado dio 42 KB donde eran 59. Corre en CI.

Límites: **25 KB de JS y 20 KB de CSS por página, comprimidos.** Hoy: 19,5–21,5
KB de JS y 5,3 KB de CSS.

`/catalogo` es on-demand y no deja HTML en disco, así que el script no la ve.
La cubre un test de Playwright que mide lo que el navegador descarga de verdad,
y que además verifica que la home **no** cargue ClientRouter: si se colara al
layout, toda página del sitio pagaría 5,6 KB gzip de más.

**Baseline de Core Web Vitals** (preview local con workerd, sin latencia):

| Ruta                 |    LCP | CLS |  TTFB |
| -------------------- | -----: | --: | ----: |
| `/`                  |  60 ms |   0 | 11 ms |
| `/catalogo`          | 104 ms |   0 | 40 ms |
| `/productos/:handle` | 104 ms |   0 | 62 ms |

CLS en 0 confirma que las dimensiones obligatorias de imagen (ADR-034) y el
token de aspecto (ADR-044) hacen lo que debían.

Lighthouse completo queda como paso manual de pre-release (T3): en CI aporta
ruido y lentitud frente a un presupuesto determinista.

---

## ADR-052 — Dos capas de autorización, y la secret key nunca en el browser

**Fecha:** 2026-08-24
**Estado:** Accepted

**La pregunta**
¿El storefront consulta Supabase directo confiando en RLS, o pasa por un
servicio de dominio?

**La respuesta empieza por una distinción que faltaba**
El storefront **no es el browser**. Sus páginas se prerenderizan en build o se
resuelven en el Worker; ninguna de las dos corre en el cliente. Así que la
pregunta real no es "¿el frontend puede hablar con la base?" sino "¿dónde vive
la autorización?".

**Decisión**

- Los contratos viven en `@pick/commerce-core`; un adapter de Supabase los
  implementa. Ni el storefront ni el Admin arman queries a mano.
- El **Admin** consulta con el JWT del usuario, y **RLS** es lo que impide que
  una query devuelva filas de otra organización.
- El **storefront** y los jobs consultan desde el servidor con la secret key,
  que **saltea RLS por completo**. En ese camino lo que acota los datos es que
  la tienda se resuelve en el servidor y viaja como primer parámetro de cada
  consulta (ver más abajo).
- El browser nunca habla con Supabase para nada sensible. La publishable key
  puede llegar al cliente; la secret key jamás.

**Por qué las dos capas y no una**
RLS sola no alcanza porque la secret key la saltea, y hay caminos legítimos que
la usan. La otra capa sola no alcanza porque no protege a quien consulte la base
por otra vía. Cada una cubre el hueco de la otra.

**Corrección (27/08/2026): qué defiende realmente el camino de la secret key**
Este ADR decía que en ese camino defendían `assertCan` y `assertSameTenant`. Es
falso, y se verificó: esas dos funciones **no tienen un solo llamador fuera de
sus propios tests**. Lo que efectivamente acota los datos es otra cosa, y
conviene nombrarla bien porque es sobre lo que hay que construir:

1. La tienda **nunca llega desde el cliente**. Se resuelve en el servidor a
   partir de la configuración del deploy (`STOREFRONT_DOMAIN` → `stores.domain`)
   y es el primer parámetro de los cinco métodos de `RepositorioCatalogo`. Un
   endpoint que aceptara un `storeId` del body rompería la única garantía que hay.
2. El SQL filtra por esa tienda: `catalog_search` acota por `p_store_id` y por
   `status = 'active'`, y con `p_store_id` nulo devuelve vacío —falla cerrado—.
3. Desde 27/08/2026, el **schema** impide que una fila cuelgue del catálogo de
   otro comercio: las claves foráneas incluyen el tenant. Eso no era así, y se
   explotó: ver la migración `aislamiento_en_claves_foraneas`.

`assertCan` y `assertSameTenant` siguen siendo el contrato del día que exista un
servicio de dominio con un actor identificado —MCP, jobs, API pública—. Hoy no
hay actor en el storefront: no hay usuario detrás de una visita anónima. Decir
que corren cuando no corren es peor que no decir nada, porque quien escriba el
próximo endpoint asume una guarda que no existe.

**Qué exige esto de Fase 5**
Los endpoints que escriben pedidos resuelven la tienda con `tiendaActual()` y
**jamás** aceptan `storeId`, `tenant_id` ni precios del cliente: el precio de
cada línea se lee de la base dentro de la misma transacción que crea el pedido.
`product_variants` no tiene `store_id` —sólo `tenant_id` y `product_id`—, así
que resolver una variante recibida del browser obliga a joinear por
`products.store_id`. El atajo (`select ... in (ids)` con la secret key) devuelve
variantes de cualquier comercio, con su precio y su costo.

**Los permisos son datos, no comparaciones de rol**
Las políticas llaman a `app.has_permission(tenant, permiso)` en vez de comparar
`role = 'owner'`. Agregar un rol no obliga a reescribir RLS.

Eso obliga a mantener la lista en dos lenguajes —SQL para las políticas,
TypeScript para el servicio—. La fuente de verdad es `ROLE_PERMISSIONS` en el
core, y **un test compara ambas**: si divergen, falla. Dos listas de permisos
que se separan en silencio son un agujero de autorización.

**Detalle que hay que saber al tocar RLS**
`app.current_tenants()` es `SECURITY DEFINER` a propósito. La política de
`memberships` necesita consultar `memberships`, y hacerlo directo entra en
recursión infinita; la función saltea RLS y rompe el ciclo. Lleva `search_path`
fijo, porque sin él un search_path manipulado redirige las tablas que consulta.

---

## ADR-053 — El aislamiento entre tenants se verifica con Postgres en proceso

**Fecha:** 2026-08-24
**Estado:** Accepted

**Contexto**
La Definition of Done de Fase 3 es que dos tenants coexistan sin verse. Eso no
se demuestra leyendo políticas: hay que ejecutarlas.

Verificarlo exigía Docker —que no está disponible— o un Supabase remoto, que
habría dejado las pruebas fuera de CI. Una prueba de seguridad que corre "cuando
alguien se acuerda" no protege nada.

**Decisión**
Las pruebas corren sobre **PGlite**, Postgres compilado a WASM, en el mismo
proceso de Node. Aplica las migraciones reales del repo, no una copia, y aplica
RLS igual que el servidor. Corre en CI en cada commit, sin Docker.

**Verificado que las pruebas sirven**
No alcanza con que pasen. Se rompieron dos políticas a propósito y fallaron:
cambiar el filtro de tenant por `using (true)` tumbó 2 casos, y darle
`member.manage` al rol staff tumbó 3.

**Lo que NO cubre, y cómo se cubrió**
El arnés recrea lo mínimo del esquema `auth`, así que no detectaría un cambio de
comportamiento de Supabase Auth. Eso se verificó aparte, contra el proyecto
real: dos usuarios creados por la Admin API, autenticados con JWT de verdad y
consultando por PostgREST.

| Prueba con JWT real                 | Resultado                 |
| ----------------------------------- | ------------------------- |
| A ve organizaciones                 | sólo la suya              |
| B ve organizaciones                 | sólo la suya              |
| viewer escribe en su organización   | 403                       |
| owner escribe en organización ajena | 403                       |
| owner escribe en la suya            | 201                       |
| `anon` con la publishable key       | `42501 permission denied` |

Los datos de prueba se borraron después; el proyecto quedó con el schema y sin
filas.

Esa verificación es **manual y puntual**: no corre en CI, porque exige
credenciales que no viven en el repo. Repetirla al tocar RLS o al subir de
versión de Supabase.

**Además**
Se quitó la extensión `pgcrypto`: `gen_random_uuid()` está en el core de
Postgres desde la 13, así que era una dependencia que no hacía falta.

---

## ADR-054 — El adapter no filtra Supabase al resto de la aplicación

**Fecha:** 2026-08-24
**Estado:** Accepted — implementa ADR-052

**Decisión**
`@pick/adapter-supabase` expone tres clientes, y cada uno declara qué protege:

| Cliente             | Key               | Qué lo protege                                 |
| ------------------- | ----------------- | ---------------------------------------------- |
| `clienteDeBrowser`  | publishable       | RLS. Persiste sesión; es el del Admin.         |
| `clienteDeUsuario`  | publishable + JWT | RLS. Para render server-side con identidad.    |
| `clienteDeServidor` | **secret**        | Nada: saltea RLS. Sólo el servicio de dominio. |

`clienteDeServidor` **lanza si se lo crea en el browser**. No es paranoia: basta
un import mal ubicado para que un bundler meta la secret key en el bundle del
cliente, y ese error no lo detecta ni el typecheck ni el lint. Hay un test que
lo verifica simulando `window`.

**Ni el Admin ni el storefront importan `@supabase/supabase-js`.** El primer
intento hacía que el Admin importara el tipo `Session` del SDK, lo que habría
filtrado el tipo del proveedor a toda la aplicación y convertido un cambio de
adapter en un cambio transversal. La suscripción a la sesión vive en el adapter
y devuelve un tipo propio.

**Detalle que la documentación de Supabase advierte y es fácil pasar por alto**
`onAuthStateChange` emite también al suscribirse —evento `INITIAL_SESSION`—, así
que una carga inicial aparte duplica la consulta y dispara renders en cascada.
Y llamar a funciones de Supabase dentro del callback puede bloquear, por lo que
el trabajo se difiere.

**Una consulta que parece incompleta y no lo es**
`membresiasDe` no filtra por `user_id`. **RLS ya lo hace.** Agregar la cláusula
daría la impresión de que la seguridad depende del cliente; si esa cláusula
fuera lo único que separa a un tenant de otro, bastaría con quitarla para ver
todo.

**Verificado en el bundle del Admin**: la secret key real no aparece, y
`clienteDeServidor` se tree-shakea. Cuidado con el chequeo: el propio SDK
contiene el literal `sb_secret_` en su validación de formato, así que buscar esa
cadena da un falso positivo.

---

## ADR-055 — El catálogo se resuelve en SQL, con `queryCatalog` como especificación ejecutable

**Fecha:** 2026-08-26
**Estado:** Accepted

> **Acotado por ADR-126.** La paridad con `queryCatalog` sigue valiendo para todo
> lo que no es el término de búsqueda. La búsqueda con término usa `pg_trgm` desde
> ADR-125 y tiene tests propios, así que el «nada de `pg_trgm`» de abajo ya no rige.

**Contexto**
ADR-024 prohíbe traer el catálogo completo para filtrar en el browser, así que
filtros, orden, paginación y facetas tienen que resolverse antes de devolver los
ítems. `queryCatalog` en el core ya fijaba esa semántica con sus propios tests, y su
propio comentario anticipaba que "en Fase 4 el cuerpo pasa a ser una query a
Postgres y la firma no cambia".

**Decisión**
La implementación de producción es la función SQL `catalog_search`, que devuelve
ítems, facetas y totales en un solo round-trip. `queryCatalog` **no se
reemplaza**: queda como especificación ejecutable de la semántica.

El contrato es literal: `catalog_search(tienda, q)` equivale a
`queryCatalog(activos(tienda), q)`.

**Por qué una función y no consultas sueltas**
Las facetas con self-exclusion necesitan recorrer el mismo conjunto varias veces
con filtros distintos. Hacerlo desde el cliente serían N+1 round-trips, o traer
todo y contar en JavaScript, que es exactamente lo que ADR-024 prohíbe.

**Cómo se verifica, y por qué así**
Veinticuatro casos corren los mismos fixtures por las dos implementaciones y
comparan el resultado: cada filtro, OR dentro de una faceta y AND entre facetas,
los cuatro órdenes, búsqueda multi-término y por SKU, clamp de página, rango de
precio.

Existe por ADR-050: cuando el modo de fallo es silencioso, la verificación tiene
que ser exhaustiva y no ilustrativa. Un count de faceta mal calculado en SQL no
rompe nada — muestra un número equivocado y nadie se entera.

**Se comprobó que los tests detectan divergencias**, no sólo que pasan: quitar la
self-exclusion tumba 6 casos, dejar pasar borradores tumba 18, romper el orden de
las variantes tumba 1.

**Una divergencia real que apareció y cambió el core**
Con un filtro sin resultados, el core emitía facetas con la lista de valores
vacía y el RPC las omitía. Ganó el RPC: una faceta sin opciones es un accordion
vacío que no ayuda a filtrar ni a deshacer nada, y emitirla era un artefacto de
"juntar los nombres primero y contar después", no un comportamiento diseñado. La
faceta cuyo filtro está activo nunca queda vacía, porque se excluye a sí misma
del conteo.

**Lo que sólo existe en SQL**
El filtro por estado `active`. El core recibe productos ya filtrados, así que esa
regla no tiene dónde vivir en TypeScript — y sin ella un select ingenuo publica
borradores. Tiene su propio test.

**Consecuencias**

- Un bug de la función se corrige con una migración nueva que sólo trae
  `create or replace`: minutos, sin tocar una fila.
- Todo lo usado es core de Postgres, así que las pruebas corren en PGlite sin
  Docker (ADR-053). Nada de `pg_trgm`: la búsqueda usa `position(token in texto)`,
  que es la misma coincidencia literal de subcadena que `includes` en JavaScript
  y no obliga a escapar `%` ni `_`.
- El orden de la lista de facetas lo define `attribute_definitions.position` en
  producción, y en el core es el orden de iteración de un objeto de JavaScript.
  Los tests comparan el contenido de las facetas, no ese orden incidental.
- El PDP no tiene consulta propia: pasa un `p_handle` al mismo RPC. Dos consultas
  distintas podrían divergir en qué consideran publicado o en cómo suman el stock.

---

## ADR-056 — Decisiones del schema de catálogo

**Fecha:** 2026-08-26
**Estado:** Accepted

**`availableQuantity` se suma al leer, no se materializa**
Ni columna mantenida por trigger ni vista: el RPC suma `inventory_levels` en la
consulta. Una columna materializada es drift esperando su momento — el sync del
ERP reescribe el inventario en bloque, y cualquier desincronización deja al
storefront vendiendo con un número que no es.

**`inventory_levels.available` no lleva `check (available >= 0)`**
Es un espejo del ERP (ADR-009) y un ERP puede reportar negativo. Recortarlo a
cero escondería el overselling en vez de mostrarlo.

**`product_variants.position` es obligatorio**
La PLP muestra la primera variante y su precio es el que ve el cliente. Sin un
orden explícito, ese precio dependería del plan de ejecución de Postgres.

**Una colección dinámica es una consulta guardada**
`collections.rules` tiene exactamente la forma de `CatalogFilters`, así que la
resuelve el mismo `catalog_search` que la PLP. Cero motor de reglas nuevo.

**El origen por campo se guarda sólo cuando es excepción**
`field_sources` es un objeto como `{"price": "ERP"}`; la ausencia significa
COMMERCE. Guardar sólo las excepciones evita reescribir la fila entera cada vez
que aparece un campo nuevo. Un valor corrupto degrada a COMMERCE: el default
seguro es que el comercio pueda editar, no que quede bloqueado sin saber por qué.

**El stock escribe con `catalog.write`**
No se inventa un permiso `inventory.write` porque hoy ningún rol distingue
"edita catálogo" de "ajusta stock". Se separa cuando exista uno que lo pida.

**La profundidad de la taxonomía no tiene constraint**
`categories.parent_id` permite el árbol de PROJECT.md §8; los tres niveles se
acotan en el Admin. Un CHECK no puede recorrer el árbol, y un trigger sería más
código que el riesgo que cubre.

**Reversión**
Ambas migraciones sólo crean objetos y no alteran nada de Fase 3, así que
revertir es un `drop` de las tablas nuevas, la función y el enum, sin pérdida
posible de datos ajenos al catálogo.

---

## ADR-057 — El storefront se resuelve on-demand y lee la base en runtime

**Fecha:** 2026-08-26
**Estado:** Accepted

**Decisión**
La home, la PLP, el PDP, `llms.txt` y el sitemap de URLs se resuelven en el
Worker. Siguen prerenderizadas las páginas que no dependen del catálogo: carrito,
políticas, preguntas frecuentes, `robots.txt` y el índice de sitemaps.

**Por qué**
Prerenderizar el catálogo obliga a reconstruir el sitio con cada precio y cada
cambio de stock, y en un catálogo grande el build crece sin techo. Un comercio
que publica un producto espera verlo, no esperar un deploy.

**Configuración en runtime, no incrustada**
`SUPABASE_URL` y `SUPABASE_SECRET_KEY` se declaran en `astro:env` como
`server`/`secret`. Una URL no es un secreto, pero las variables públicas se
incrustan al construir, y el mismo artefacto tiene que poder correr contra el
Supabase local del CI y contra el remoto sin reconstruirse. `STOREFRONT_DOMAIN`
sí es pública, con default: es lo que decide qué tienda sirve este deploy.

**Cuatro cosas que costaron una vuelta cada una**

1. **Una ruta on-demand no puede reescribir a una prerenderizada.**
   `Astro.rewrite('/404')` desde el PDP falla con "unable to find a component
   instance": no hay componente que instanciar, sólo un HTML en disco. Por eso
   `404.astro` es on-demand. La alternativa —devolver una respuesta vacía con
   status 404— da el código correcto y una pantalla en blanco.

2. **El canonical hay que normalizarlo.** Prerenderizada, la página sólo existía
   en `/productos/x/`. On-demand, el pathname llega como lo pidió el cliente, así
   que `/productos/x` declaraba un canonical sin barra mientras su propio JSON-LD
   decía lo contrario: la señal contradictoria que el canonical existe para
   evitar. `SeoHead` pasa por `urlAbsoluta`, la misma función del JSON-LD y del
   sitemap.

3. **`.dev.vars` no va donde dice la documentación del adapter.** Dice "la raíz
   del proyecto Astro"; ahí no se lee. wrangler lo busca junto a su archivo de
   configuración, y el que usa el preview es el que genera el build en
   `dist/server`. Lo escribe el setup de e2e, después de construir, porque el
   build vacía `dist`.

4. **`astro dev` no veía el `.env`.** Vive en la raíz del monorepo y Vite lo
   busca en la de la app. Se resuelve con `vite.envDir`, no duplicando el archivo:
   dos lugares para la misma credencial terminan divergiendo.

**Lo que enseñó el primer deploy, y cambió el diseño**

`astro:env` **evalúa todos los secretos declarados al cargar el módulo**, aunque
nadie los importe. El módulo generado hace, en su cuerpo:

```js
var SUPABASE_URL = _internalGetSecret('SUPABASE_URL');
```

Con una credencial ausente eso lanza antes de que corra nada —antes del
middleware, antes de la ruta— y el Worker responde **500 con el cuerpo vacío**.
Ni la pantalla ni los logs dicen qué falta. Es el peor error posible de
diagnosticar y le pasa justo a quien despliega esto por primera vez: pasó acá, y
costó tres intentos entender que el problema no era dónde estaban las variables
sino que no había forma de preguntarlo.

Por eso los dos secretos se declaran `optional: true` —no porque puedan faltar,
sino para que Astro no valide— y la comprobación la hace `src/middleware.ts`, que
responde 503 con una página que los nombra. 503 y no 500: la aplicación está
bien, es el entorno el que no está listo, y un buscador que recibe 503 vuelve a
intentar en vez de desindexar.

Dos detalles del middleware que no son obvios: también corre al prerenderizar
—donde no hay entorno, así que sin la guarda de `context.isPrerendered` la página
de error queda horneada en el HTML estático—, y `getSecret` no es la vía de
escape que sugiere la documentación: valida contra el schema igual que el import.

**`site` y `STOREFRONT_DOMAIN` no son lo mismo, y hoy son distintos**
`site` es la dirección pública: de ahí salen el canonical, el `og:url`, el JSON-LD
y el sitemap. `STOREFRONT_DOMAIN` es la llave con la que el Worker busca la tienda
en `stores.domain`; tiene que coincidir con ese campo, no con el dominio desde el
que se sirve. El primer deploy quedó anunciando `pick-demo.pages.dev` —un dominio
que no existe— mientras servía desde otro, y el sitio funcionaba igual: los dos
valores son independientes y sólo uno estaba mal.

**El nombre del Worker vive en el repo**
`apps/demo/wrangler.jsonc` declaraba `pick-demo` mientras el Worker desplegado se
llama `pick-commerce`. Un `pnpm deploy:demo` desde local habría creado un Worker
nuevo en vez de actualizar el que sirve el sitio.

**Logs**
`observability.enabled` va en el `wrangler.jsonc`, no en un panel: sin logs, un
error en producción no deja rastro en ningún lado.

**El sitemap ya no lo genera una integración**
`@astrojs/sitemap` sólo conoce las rutas que existen al construir, y los
productos dejaron de existir ahí. `sitemap-0.xml` se emite desde la base,
paginando (ADR-024) y avisando por log si se topa con el límite de 50.000 URLs
del protocolo: un sitemap truncado en silencio se lee como completo.

**Lo que impide que una página se vuelva on-demand sin que nadie se entere**
`pnpm budget` mide el peso de las páginas que quedan en disco. Si una desaparece,
el presupuesto seguiría en verde midiendo cada vez menos. Ahora la lista de
páginas prerenderizadas es exacta —falla si falta una y también si sobra— y las
rutas on-demand tienen su propio presupuesto medido por red en Playwright.

**Las facetas las declara la tienda**
La PLP ya no trae una lista de atributos escrita en la página: pide las
`attribute_definitions` marcadas `filterable` y arma con ellas la whitelist de
parámetros, las etiquetas y el orden. Un atributo nuevo aparece solo. La marca y
la categoría siguen fijas porque son campos del producto, no atributos.

**Precio**
Cuatro tramos calculados sobre el mínimo y el máximo del catálogo entero, no del
resultado, para que no se muevan bajo el dedo al filtrar. Son radios y no
checkboxes: dos tramos a la vez darían un rango contradictorio.

**Consecuencias**

- El Worker hace de una a tres consultas por página. La tienda, sus categorías y
  sus facetas se memoizan 60 segundos por isolate; el catálogo no se cachea.
- El deploy necesita `SUPABASE_URL` y `SUPABASE_SECRET_KEY` cargados como
  secretos del Worker. Sin ellos el sitio responde 500, con el mensaje exacto de
  qué variable falta.

---

## ADR-058 — El CI levanta su propia base, sin secretos

**Fecha:** 2026-08-26
**Estado:** Accepted

**Decisión**
El runner levanta un stack de Supabase local con `supabase start` y corre el
build, el presupuesto y los tests de navegación contra él.

**Por qué no apuntar al proyecto de desarrollo**
Habría que poner una secret key en los secrets del repositorio, y esa key saltea
RLS: quien pueda leer un log de CI o abrir un PR con un workflow modificado tiene
la base entera. Además, cualquiera editando datos a mano rompería las corridas de
todos.

**Qué gana**
Cero secretos en el repo y en la configuración del CI, y una corrida reproducible:
las mismas migraciones y el mismo seed en cada ejecución.

**Detalles que importan**

- El nombre de las claves que emite `supabase status -o env` cambió entre
  versiones del CLI. El workflow acepta los dos nombres antes que fallar con una
  variable vacía.
- El seed lo corre el propio setup de Playwright, no un paso aparte: es el mismo
  camino en local y en CI, y es idempotente.
- Los tests de navegación afirman números concretos —"2 productos" en color
  Negro, "Gs. 389.000" en la campera—. Sin un seed determinista esos números no
  significarían nada.

**Lo que no cubre**
`pnpm test` sigue corriendo sobre PGlite y no necesita Docker: el aislamiento
entre tenants y la paridad del catálogo se verifican sin levantar nada. Sólo los
tests de navegación necesitan el stack.

**Verificado en el CI** (26/08/2026)
La secuencia no se pudo correr localmente —esta máquina no tiene Docker—, así que
se validó en el runner. La corrida de `a30f795` terminó en verde en **3m 37s de
punta a punta**: el stack local levanta (1m 45s), las migraciones aplican desde
cero, el build corre contra esa base y los tests de navegación pasan en 29s.

**Y lo que esa corrida encontró**
El paso siguiente, `pnpm e2e`, quedó colgado indefinidamente. La causa no estaba
en el CI sino en el setup de Playwright: `astro preview` sólo se manda al fondo
con `--background` **o cuando Astro detecta que lo corre un agente de código**
(`am-i-vibing`, en `astro/dist/cli/preview/index.js`). Como el desarrollo de este
repo pasa por un agente, el preview se demonizaba solo y el `execSync` volvía; en
el runner —que no es ningún agente— arranca en primer plano y no vuelve nunca.
Lo mismo le habría pasado a cualquier persona corriendo `pnpm e2e` en su terminal.

Vale como recordatorio de por qué la regla del harness dice ejecutar el comando
exacto que correrá en CI: acá el comando era el mismo y **el entorno** era el que
cambiaba el comportamiento, que es todavía más difícil de ver. Comprobado en las
dos direcciones antes de dar el arreglo por bueno: sin la bandera y sin las
variables del agente, el comando no vuelve —timeout, código 124—; con ella
vuelve en el acto y `astro preview stop` encuentra el pid.

---

## ADR-059 — Un campo opcional llega ausente, nunca nulo

**Fecha:** 2026-08-26
**Estado:** Accepted

**Contexto**
`ProductVariant.compareAtPrice` está declarado `?: Money` —opcional—, y el RPC lo
devolvía como `null`. En TypeScript `null !== undefined`, así que un chequeo
correcto contra el contrato —`variant.compareAtPrice !== undefined`— daba
verdadero para un null y el PDP reventaba al elegir una variante sin precio
anterior.

**Lo encontró el smoke de navegación, no el typecheck.** No podía verlo: el tipo
decía una cosa y el dato traía otra. Un `as` en el borde del adapter no es una
verificación, es una promesa.

**Decisión**
Las funciones que devuelven entidades del dominio aplican `jsonb_strip_nulls`.
Un campo opcional viaja ausente. Vale para toda función futura, no sólo para
`catalog_search`.

**Por qué en el origen y no en cada consumidor**
Defenderse con `!= null` en cada lectura es perseguir el mismo bug para siempre,
y deja el tipo mintiendo. Corregido en SQL, el dato honra el contrato y el
chequeo del consumidor vuelve a ser correcto.

**Cómo se sostiene**
Un test recorre cada ítem del resultado y falla si encuentra un `null` en
cualquier profundidad. Es la clase entera, no el campo que se rompió.

---

## ADR-060 — CRUD de productos en el Admin

**Fecha:** 2026-08-26
**Estado:** Accepted

**Stack**
Se adoptan TanStack Router y Query, React Hook Form y Zod: son los del stack
aprobado en PROJECT.md y no necesitan discusión.

**TanStack Table no se instala todavía.** La tabla de productos tiene cinco
columnas, pagina en el servidor y no ordena en el cliente: un `<table>` con las
primitivas de shadcn es menos código que las definiciones de columnas. Se adopta
cuando aparezca la primera necesidad real —selección múltiple, orden por columna
o virtualización—, que es el criterio de la sección de anti-overengineering.

**Rutas en código, sin generación de archivos.** Son cuatro rutas; el router por
archivos añade un paso de build y un archivo generado al repo. Se revisa cuando
la lista pese.

**Dos funciones nuevas en la base**

`admin_products` no reusa `catalog_search`: el Admin ve borradores y archivados,
que esa función excluye por diseño, y muestra lo que un operador mira en una
tabla —cuántas variantes, cuánto stock, desde qué precio—. Además busca por SKU,
y con PostgREST solo no se puede filtrar el padre por una columna de la tabla
embebida.

`admin_save_product` escribe las cuatro tablas de un producto en una
transacción. Desde el browser serían cuatro peticiones sin transacción, y una
que falle a mitad deja el producto con las variantes viejas borradas y las
nuevas sin crear. Es también el cuerpo que reusará el import de CSV: una fila del
archivo es exactamente ese payload.

Las dos son `security invoker`: **RLS decide**. Un viewer recibe el error de la
base, no de la interfaz, y hay un test que lo comprueba.

**Los campos del ERP se protegen en el servidor, no sólo en el formulario**
El formulario los deshabilita, pero el frontend no es la capa de autorización:
una petición armada a mano llegaría igual. La función ignora los valores que
lleguen para un campo cuyo `field_sources` diga ERP, y conserva el almacenado.

**Archivar y no borrar**
Un producto puede estar en pedidos. `archived` lo saca del storefront y conserva
el historial; borrarlo dejaría referencias huérfanas.

**Tres cosas de interfaz que el typecheck no ve, y el smoke sí**

1. **Un enlace con pinta de botón es un enlace.** Envolver un `Link` en `Button`
   le pone `role="button"`, y un lector de pantalla lo anuncia como botón cuando
   en realidad navega —además de perder "abrir en otra pestaña". Las clases dan
   el aspecto; la semántica la da el `<a>`.
2. **Una etiqueta al lado del control no lo etiqueta.** Sin `htmlFor` no hay
   asociación, y el campo se anuncia sin nombre. El control va dentro del
   `<label>`, que asocia sin inventar un id por campo.
3. **`useWatch` y no `watch()`.** El compilador de React no puede memoizar la
   función que devuelve `useForm` y saltea el componente entero; el lint lo
   avisa.

**`<select>` nativo**
Teclado, lectores de pantalla y el selector del sistema en mobile ya vienen
resueltos, y no cuesta JavaScript. Es el mismo criterio que en el storefront.

**Credenciales**
`pnpm admin:crear <email> <password>` crea un usuario y le da acceso a la
organización de demostración. Las credenciales van por argumento y **no viven en
el repo**: un usuario y una contraseña commiteados terminan, tarde o temprano,
existiendo en producción.

**Limitación conocida, corregida el 2026-09-27**
El stock se escribía en la primera sucursal de la tienda. Ahora el formulario
nombra la sucursal y con más de una ofrece elegirla; un número suelto falla en vez
de elegir a ciegas. Ver ADR-136.

---

## ADR-061 — Import y export de catálogo por CSV

**Fecha:** 2026-08-26
**Estado:** Accepted

**Forma del archivo**
Una fila por variante, agrupadas por `handle`. Es la forma que usan las
plataformas de comercio y la única que representa un producto con varias
combinaciones en un archivo plano. Los datos del producto los fija la primera
fila de su handle: repetirlos en cada fila es inevitable, y hacer ganar a la
última dejaría el resultado dependiendo del orden.

**El archivo no lleva imágenes, y eso obligó a corregir el guardado**
Un medio necesita ancho y alto —obligatorios contra CLS, ADR-034— y quien
escribe una planilla no los tiene.

Pero `admin_save_product` reemplazaba los medios siempre: borraba todos e
insertaba los del payload. Importar sobre un producto existente le habría
borrado las fotos sin avisar. **Era una pérdida de datos silenciosa.** Ahora vale
la misma convención que ya usaba el stock: la clave ausente significa "no tocar",
y sólo un array explícito reemplaza. Es la diferencia entre "no dije nada de las
imágenes" y "quiero que no tenga ninguna".

Hay un test para cada mitad de esa convención, y se comprobó que el primero
detecta la regresión: forzando el borrado incondicional, falla.

**Cada producto es atómico por separado**
`import_products` guarda cada uno en su propio bloque `begin/exception`, que en
plpgsql es una subtransacción. Sin eso, un SKU repetido en la fila 400 de un
archivo de 500 tiraría el import entero y el operador tendría que adivinar dónde
quedó. Devuelve un reporte fila por fila —qué entró, qué no y por qué— que se
puede descargar: un import que sólo dice "listo" obliga a revisar el catálogo a
mano.

**Preview que no escribe**
El archivo se valida entero antes de tocar la base: cuántos productos se crean,
cuántos se actualizan y qué filas se rechazan, con el número de línea de la
planilla y el motivo. Una fila inválida se descarta sola; el resto entra.

**Las reglas de validación son las del formulario**
El mapeo vive en el Admin y no en el Core —el Core no depende de Zod, y esto es
una función del Admin—, y reusa los mismos esquemas. Si las validaciones
estuvieran en dos lados, el CSV aceptaría lo que el formulario rechaza.

**La identidad de un producto en un archivo es su handle**
Se resuelve en `import_products` y no dentro de `admin_save_product`: en el
formulario, crear con un handle que ya existe tiene que fallar con el error de la
restricción única, no pisar en silencio otro producto. La de una variante es su
SKU dentro de ese producto, para que actualizar no la borre y la vuelva a crear
—lo que perdería su id y su stock—.

**Para un producto que el archivo nombra, el archivo manda**
Sus variantes pasan a ser exactamente las del archivo. Es lo que hace que
exportar, editar en una planilla y volver a importar sea predecible, y hay un
test que verifica esa ida y vuelta: el producto que sale es igual al que entra.

**Lotes de 50**
Ni uno por uno —serían cientos de peticiones— ni todos juntos, que puede pasarse
del límite del cuerpo de la petición. Con un lote por vez además se puede mostrar
avance.

**El export pagina**
Un catálogo grande no entra en una consulta (ADR-024). Y el archivo lleva BOM:
sin él, Excel abre un CSV UTF-8 con la codificación del sistema y "Campera
técnica" aparece rota. Es el primer archivo que el comercio abre.

**Un bug que apareció escribiendo esto**
El formulario mandaba el _slug_ de la categoría donde `products.category_id`
espera un UUID. No se había notado porque el smoke creaba productos sin
categoría. `CategoriaCatalogo` ahora lleva su id: la faceta del storefront viaja
por slug —es lo que aparece en la URL— y el Admin guarda el id. No son
intercambiables.

---

## ADR-062 — Modelo de dominios: un storefront por cliente, un Admin compartido

**Fecha:** 2026-08-26
**Estado:** Accepted

**Decisión**
Cada comercio usa **su propio dominio**: `estilosport.com.py`, no
`estilosport.pick-commerce.com` ni ningún subdominio nuestro. El Admin de ese
comercio vive en `admin.estilosport.com.py`.

**Storefront: un despliegue por cliente**
Es lo que ya declara PROJECT.md §6 —"cada storefront sí puede tener un despliegue
independiente"— y lo que el código asume. Dar de alta un comercio son tres
valores de configuración, ninguno de ellos código:

|                                | Valor                        |
| ------------------------------ | ---------------------------- |
| `stores.domain`                | `estilosport.com.py`         |
| `STOREFRONT_DOMAIN` del Worker | `estilosport.com.py`         |
| `SITE_URL`                     | `https://estilosport.com.py` |

Los dos primeros tienen que coincidir entre sí: uno es la llave, el otro el dato.
El tercero es la dirección pública, de donde salen el canonical y el sitemap
(ADR-057).

**Admin: un solo despliegue, con alias por cliente**
PROJECT.md §6 también dice que el Admin no se despliega por cliente, y se
mantiene. `admin.estilosport.com.py` es un dominio propio apuntando al **mismo**
Worker que el de cualquier otro comercio.

Desplegarlo por cliente daría N aplicaciones que actualizar, y un fallo de
seguridad habría que parcharlo N veces. Sobre todo: **no mejoraría el
aislamiento**, porque el aislamiento no lo da el despliegue.

**Qué garantiza que un comercio no vea datos de otro**
RLS más la autorización en el servicio de dominio (ADR-052), no el dominio desde
el que se entra. El usuario de un comercio tiene membresía en una sola
organización y la base filtra por eso en cada consulta; el Admin podría estar
servido desde cualquier dirección y el resultado sería el mismo. Lo verifican las
pruebas de aislamiento sobre Postgres en proceso (ADR-053), que se comprobó que
fallan al romper las políticas a propósito.

**Lo que queda abierto, y por qué puede esperar**
El Admin no mira el dominio por el que se entró: muestra las organizaciones donde
el usuario tiene membresía. Eso sólo se nota cuando **una misma persona**
administra varios comercios, que es el caso de la agencia que opera Pick Commerce
—nosotros—, no el de un comercio. Acotar el Admin por dominio queda en el
backlog.

Igual queda que `stores.domain` admite **un solo dominio por tienda**. Un comercio
con `.com` y `.com.py` apuntando al mismo negocio necesitaría hoy dos filas, o sea
dos tiendas. El `www.` no cuenta: ya se normaliza.

---

## ADR-063 — El aislamiento entre comercios vive en las claves foráneas, no en las políticas

**Fecha:** 2026-08-27
**Estado:** Accepted

**Qué pasó**
La revisión adversarial previa a Fase 5 encontró que un comercio podía escribir
filas colgadas del catálogo de otro. No se dedujo: se reprodujo. Un owner del
tenant B, con `catalog.write` únicamente sobre B, insertando con **su propio**
`tenant_id`:

```sql
insert into inventory_levels (tenant_id, variant_id, location_id, available)
values ('<B>', '<variante de A>', '<sucursal de B>', 9999);   -- pasaba
```

El storefront de A pasó de 30 unidades a 10029. El Admin de A siguió mostrando
30: la fila envenenada pertenece a B, así que RLS se la esconde justamente a la
víctima. Lo mismo con `product_media` sobre un producto ajeno —una imagen
arbitraria en la PDP de otro comercio— y con `product_variants` —una variante
fantasma con precio y SKU propios—.

**Por qué RLS no lo veía**
La política de escritura evalúa `app.has_permission(tenant_id, 'catalog.write')`,
o sea **la columna `tenant_id` de la fila que se inserta**, no a quién pertenece
el padre al que esa fila apunta. Y la verificación de la clave foránea tampoco
ayuda: Postgres [no aplica políticas](https://www.postgresql.org/docs/current/sql-createpolicy.html)
durante los chequeos de integridad referencial. Cada tabla hija declaraba dos
constraints independientes —`tenant_id` por un lado, la FK al padre por otro— y
nada las ataba.

El `variant_id` no es un secreto: `catalog_search` lo emite en cada ítem y el PDP
lo serializa en el HTML.

**Decisión**
Las claves foráneas llevan el tenant: `foreign key (variant_id, tenant_id)
references product_variants (id, tenant_id)`. Los padres ganan `unique (id,
tenant_id)` para poder ser destino. Son 18 claves foráneas, todas las hijas del
catálogo y de multitenancy.

**Por qué así y no filtrando en las lecturas**
Filtrar por tenant en cada consulta —`and il.tenant_id = v.tenant_id`— también
tapaba el síntoma, pero hay que acordarse en cada consulta nueva, para siempre, y
el modo de fallo de olvidarse es silencioso. Con la FK, la fila **no puede
existir**: lo garantiza Postgres, una vez, y una fila que no existe no necesita
filtrarse. Es la misma razón por la que el stock no lleva `check (available >=
0)` pero sí lleva esta restricción: acá no se está escondiendo un dato incómodo,
se está impidiendo un dato imposible.

**Dos detalles que cuestan tiempo si no se saben**

- `products.category_id` es `on delete set null`. Con una FK compuesta y sin
  lista de columnas, Postgres intentaría anular también `tenant_id`, que es `not
null`, y borrar una categoría fallaría. La sintaxis `on delete set null
(category_id)` existe desde Postgres 15; el proyecto corre 17.6 y PGlite 18.3.
- `feature_flags.store_id` es nullable —un flag sin tienda vale para toda la
  organización—. Con MATCH SIMPLE, que es el default, una FK compuesta con
  alguna columna nula no se verifica, que es exactamente lo que ese caso
  necesita.

**Verificación**
`supabase/tests/aislamiento-fk.test.ts` afirma los siete ataques. Se comprobó que
**los siete pasan** —o sea que el test falla— quitando esta migración. Incluye
dos casos de control: que un comercio sí pueda colgar filas de lo suyo, y que
borrar una categoría deje el producto sin categoría en vez de romper. Sin ellos,
una FK rota "hacia el lado seguro" pasaría los siete y rompería el producto.

**Consecuencia para Fase 5**
`order_items.variant_id` nace con el mismo patrón. Un pedido no puede referenciar
una variante de otro comercio.

---

## ADR-064 — `revoke ... from public` no le quita nada a `anon`

**Fecha:** 2026-08-27
**Estado:** Accepted

**El hallazgo**
Cada función cerraba con `revoke all on function ... from public`, y el
comentario al lado afirmaba que con eso `anon` —el rol del browser— quedaba
afuera. Es falso. Consultado contra el proyecto real, las cuatro funciones
mostraban:

```
postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
```

Supabase declara un `default privilege` que concede EXECUTE **directamente al rol
`anon`** sobre cada función creada en `public`. `revoke from public` sólo quita el
permiso del pseudo-rol PUBLIC; un grant directo a un rol no se toca. El revoke
funcionaba —ninguna función conservaba la entrada de PUBLIC— y no servía para lo
que decía servir.

**Por qué no era explotable, y por qué importaba igual**
`catalog_search` es `security invoker`: `anon` entraba a la función y lo frenaba
el `revoke ... from anon` sobre las **tablas**. La defensa que operaba era la
segunda capa, no la que el comentario nombraba —y eso sólo se puede saber
mirando, que es el problema—.

Deja de ser inofensivo con la primera función `security definer`, que es
exactamente lo que pide crear un pedido con guest checkout: quedaría invocable
desde cualquier browser con la publishable key, corriendo con privilegios de
dueño, con los parámetros que elija quien llame.

**Decisión**
El revoke va explícito por rol: `revoke all on function ... from anon`. Toda
función nueva lo declara.

**Lo que esto le enseña al harness**
PGlite **no puede detectarlo**: no reproduce los default privileges de Supabase,
así que para la suite el agujero era invisible. Es un caso donde el entorno de
prueba es más seguro que producción, que es la dirección peligrosa. Los grants de
funciones nuevas se verifican contra el proyecto real, no sólo en PGlite.

---

## ADR-065 — El carrito sigue siendo un espejo; la autoridad es `create_order`

**Fecha:** 2026-08-27
**Estado:** Accepted

**La pregunta**
El ROADMAP pide un "cart service". ¿Eso es una tabla `carts` en la base?

**Decisión: no.** El carrito sigue viviendo en `localStorage` —ADR-039 ya lo
declaró "espejo de cliente, no autoridad"— y el cart service es un endpoint que
lo valida: `POST /api/cart/validate`. Devuelve, para cada línea, el **precio y el
stock de la base**, y los problemas de las que no se pueden comprar.

Una tabla `carts` exigiría sesión anónima persistida, merge al identificarse y
limpieza de carritos abandonados. Ninguno de los checkboxes de la fase lo pide, y
ninguna pantalla lo consumiría: sería infraestructura para una necesidad que
todavía no existe.

**Qué gana el espejo con esto**
Antes, la línea guardaba lo que la página había serializado al renderizarse. Un
precio cambiado quedaba viejo en el carrito hasta que alguien recargara. Ahora la
línea se guarda con lo que el servidor acaba de decir, y lleva el stock conocido
—que es lo que le faltaba al selector de cantidad para tener un techo—.

**La degradación no es uniforme, y ahí está el criterio**

| Qué pasó                                                | Qué hace `addToCart`                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| La variante no existe, no está publicada o no hay stock | **Lanza.** El botón muestra el error. Agregar igual sería mentir.                         |
| Red caída, 5xx, JSON roto                               | **Agrega igual.** No sabemos nada del producto, y el checkout revalida siempre (ADR-009). |

Quedarse sin poder comprar por un 502 pasajero es peor que un carrito optimista
que el checkout va a corregir.

**El checkout requiere JavaScript**
Es consecuencia de lo anterior: si el carrito vive en el navegador, el servidor no
puede renderizar un checkout con su contenido. La página lo dice con un
`<noscript>` y ofrece `/carrito`, que sí funciona sin JS. La alternativa —carrito
en el servidor— es la tabla que se descartó arriba.

**La confirmación no consulta el pedido**
Tras crear el pedido, el checkout lo guarda en `sessionStorage` y redirige. No hay
endpoint público para pedir un pedido por su número, y no es un olvido: la
numeración es secuencial por tienda, así que un endpoint así sería un recorrido
por los pedidos del comercio. Cuando exista "ver mi pedido" será con un token por
pedido.

**Reglas para los `/api/*`, que salieron de mirar los endpoints que ya había**

- **El mensaje del adapter nunca llega al cuerpo.** El adapter lanza
  `No se pudo consultar el carrito: <mensaje de Postgres>`, y el reflejo al
  escribir un endpoint es devolver `e.message`. Eso publica nombres de tablas y
  restricciones. Va al log del Worker; afuera, un texto fijo.
- **`no-store` siempre.** Ninguna ruta on-demand emitía `Cache-Control`, y el
  sitemap enseña `public, max-age=3600` sobre datos de un tenant. Estas
  respuestas son por cliente.
- **Lo que llega de afuera se acota**, y **rechazar no es descartar**: la primera
  versión filtraba las líneas fuera de rango en silencio, así que un carrito con
  una cantidad absurda llegaba como carrito vacío y el endpoint respondía "tu
  carrito está vacío" sobre un carrito que tenía algo. Ahora una línea mal formada
  es un 400 que lo dice.

---

## ADR-066 — Un pedido se crea una sola vez, y el stock se descuenta al crearlo

**Fecha:** 2026-08-27
**Estado:** Accepted

**Idempotencia: dos mecanismos, no uno**
La clave la genera el checkout **al montarse**, no al hacer click, y la conserva
entre reintentos; se renueva sólo tras un éxito. Con esa clave:

1. `create_order` busca primero si ya existe un pedido con ella y lo devuelve.
2. `unique (store_id, idempotency_key)` lo garantiza igual si dos peticiones
   llegan a la vez: la que pierde recibe `unique_violation`, la atrapa y devuelve
   la que ganó.

Que sean dos no es redundancia por miedo: el primero cubre el reintento del
usuario, el segundo la carrera. Se comprobó desactivando cada uno por separado —el
test sigue en verde con cualquiera de los dos— y **los dos a la vez**, que es
cuando falla. En la UI, además, el botón se deshabilita y hay una guarda por
referencia para el doble click que ocurre antes de que el estado se pinte.

**El pedido descuenta stock. Es la decisión discutible de la fase.**
Hoy no existe ningún adapter de ERP: todo el stock es de Pick Commerce. Si crear
el pedido no descontara, la revalidación sería teatro —dos personas comprando la
última unidad pasarían las dos, siempre—. El descuento va dentro de la misma
transacción, con las filas de inventario bloqueadas en orden determinista de
`variant_id` para que dos checkouts simultáneos no se traben.

Cada línea guarda **de qué sucursal salió cada unidad** (`stock_allocation`). Sin
eso, cancelar un pedido tendría que adivinar dónde devolverlo, y con más de una
sucursal adivinaría mal.

Cuando el stock sea del ERP (Fase 8) esto se revisa por capabilities, que es lo
que manda ADR-009: sin `supportsReservations` no se promete cero overselling. La
política de reparto —de la sucursal con más stock hacia abajo— es una elección
mínima, no una decisión de logística; el modelo real de sucursales está en el
backlog.

**Sin paridad core/SQL, y por qué**
ADR-055 exige una implementación gemela en el core para `catalog_search` porque su
modo de fallo es **silencioso**: un count mal calculado no rompe nada. `create_order`
falla ruidoso, y su parte riesgosa —transacción, bloqueos, `unique`, contador— es
justamente la que no se puede traducir a un gemelo en memoria. Una paridad acá
probaría lo que no importa.

En su lugar: funciones puras en el core con tests unitarios, y el RPC probado
directo en PGlite. Los tests se validaron contra cuatro sabotajes —idempotencia,
revalidación, filtro de tienda y precio—. El del precio **no falló al primer
intento**, y eso destapó un hueco propio: comprobaba el total, que se calcula
aparte del `unit_price` que se guarda, así que un precio del cliente podía entrar
en la línea sin mover el total. Un test que no se intenta romper no se sabe si
sirve.

**Dos cosas que el SQL enseñó al probarlo**

- La numeración con `xmax` para distinguir insert de update era innecesariamente
  oscura. Un contador que guarda **el último número usado** y devuelve lo que
  acaba de incrementar dice lo mismo en una línea.
- Dos líneas de la misma variante se validaban por separado contra el stock
  entero y después se descontaban las dos: con 5 unidades, dos líneas de 3 pasaban
  y el inventario terminaba en −1. Las líneas se consolidan por variante antes de
  mirar nada, en el core y en el SQL. Un carrito bien formado no las manda; el
  payload viene del browser.

**El evento que abre el drawer no alcanzaba**
`ADD_TO_CART_EVENT` es fire-and-forget, y las dos islands que participan hidratan
por separado: el bloque de compra vive en el PDP y el drawer en el layout. Si el
clic llegaba antes de que el efecto del drawer montara, nadie oía el evento y el
carrito se llenaba sin que se abriera nada.

Estaba registrado desde el 26/08 como «el drawer abrió vacío una vez en 3
corridas» —el síntoma, no la causa— y sin reproducción. Se reprodujo corriendo el
smoke con `CI=1`: falla una de cada cuatro, y sólo en mobile. El mensaje decía
`element(s) not found`, no «invisible», y ahí estaba la pista: un `<dialog>`
cerrado no está en el árbol de accesibilidad, así que el drawer **no había
abierto**, no había abierto vacío.

El arreglo no es esperar más ni cambiar la prioridad de hidratación: es que la
solicitud sobreviva. `pedirAperturaDelCarrito()` la deja en el módulo del store
—uno solo para todas las islands, porque Rollup lo hoistea a un chunk
compartido— y el drawer la consume al montar. Quien llega tarde la encuentra.

Ocho corridas seguidas en verde después, contra una de cada cuatro antes, más
tres tests unitarios del mecanismo, que es la parte determinista.

**Estados**
`cancelled` es terminal; el resto se mueve libre, incluso hacia atrás. Un operador
que marcó "enviado" por error tiene que poder volver, y la timeline registra los
dos movimientos. Una máquina de estados rígida produciría pedidos trabados que se
destraban editando la base a mano. Cancelar es distinto porque devuelve stock:
salir de cancelado obligaría a volver a descontar algo que puede haberse vendido.

---

## ADR-067 — El resumen del Admin se deriva de los pedidos, no de eventos

**Fecha:** 2026-08-28
**Estado:** Accepted

El dashboard responde «cuánto vendí», no «cuánta gente miró». Todo sale de
`orders` y `order_items` con una función `admin_dashboard`; no hay `page_view`,
ni `add_to_cart`, ni conversión. Ese seguimiento es Fase 10 y no se adelanta:
media capacidad de analytics es peor que ninguna, porque el panel invita a leer
tasas que no puede calcular.

Un criterio que se repite y conviene tener escrito: **un pedido cancelado no es
una venta**. Queda fuera de ventas, de la cantidad de pedidos, del ticket
promedio, de lo más vendido y de lo que gastó cada cliente. Sí entra en el
desglose por estado, porque ahí lo que se mira es la operación y no la
facturación: al operador le importa cuántos se cancelaron.

«Últimos pedidos» ignora el período a propósito. Es la bandeja de entrada, no una
métrica: filtrarla por el rango dejaría el panel vacío justo el día que no hubo
ventas, que es cuando se lo mira.

Lo más vendido agrupa por el **snapshot** de la línea (título, variante, SKU) y
no por `variant_id`. El pedido guarda lo que se vendió ese día: si después le
cambian el título a la variante el histórico no se reescribe, y si la variante se
borra lo vendido no desaparece del informe.

Es `security invoker`, como el resto de las `admin_*`: para un usuario de otro
comercio las políticas no devuelven filas y el resumen sale en cero, sin ninguna
guarda propia. Agrega sobre `orders (store_id, created_at)`, que es exactamente
lo que cubre `orders_listado_idx`. A escala de un comercio alcanza; si alguna vez
no alcanzara, la salida es una vista materializada, no un índice más.

---

## ADR-068 — El equipo: el invariante vive en un trigger, los correos en un definer

**Fecha:** 2026-08-28
**Estado:** Accepted

**No hay RPC para cambiar un rol, y es deliberado**
`memberships_escritura` ya exige `member.manage` para update y delete, así que el
Admin escribe directo por PostgREST. Un `admin_set_member_role` no habría cerrado
nada: el update directo que la política permite seguiría existiendo, y la guarda
del RPC sería una segunda puerta con candado al lado de una abierta.

Por eso «una organización no se queda sin owner» es un **trigger**. Es un
invariante de los datos, así que se defiende en los datos: frena al Admin, al
update directo, a la secret key y a los scripts por igual. Verificado por los
tres caminos.

Usa `for update` y no un `count`: dos propietarios bajándose a la vez leerían
cada uno al otro y pasarían los dos. Con el lock, el segundo espera, vuelve a
mirar cuando el primero confirmó, y ya no encuentra a nadie.

**Dos cosas que costaron una corrección cada una**

`new` no está asignado en un DELETE, y `old.role = 'owner' and (tg_op = 'DELETE'
or new.role <> 'owner')` no lo esquiva: plpgsql evalúa la expresión entera como
SQL y ahí no hay cortocircuito garantizado. Van dos salidas tempranas separadas.

Y la primera versión hacía **imposible dar de baja una organización**:
`memberships` cascadea desde `organizations`, así que la baja disparaba el
trigger y fallaba diciendo que le faltaba un propietario, cuando lo que pasaba es
que se estaba yendo. Se reprodujo antes de tocar nada. La corrección se apoya en
que Postgres borra la fila padre antes de cascadear: si la organización ya no
está, no hay a quién dejar al mando. Los dos lados tienen test.

**`admin_team` es `security definer`, y por eso verifica el permiso**
Los correos viven en `auth.users`, que el rol de la aplicación no puede
consultar; sin eso la pantalla mostraría uuids. Como saltea RLS, la primera línea
de la función es `member.manage` — el mismo permiso que exige la política de
escritura. Es la diferencia con las `admin_*` de catálogo y pedidos, que no
verifican nada porque no lo necesitan.

**El alta sigue por CLI**
Crear un usuario exige la secret key, y el Admin es una SPA estática que no puede
tenerla sin dejarla en el bundle de cualquiera. Se hace con `pnpm admin:crear`, y
la pantalla lo dice en vez de esconder la ausencia. Invitar por correo desde la
interfaz exigiría una superficie de servidor propia del Admin —hoy no existe— y
eso es un ADR aparte, no un detalle de esta pantalla.

---

## ADR-069 — La configuración y su auditoría se guardan juntas o no se guardan

**Fecha:** 2026-08-28
**Estado:** Accepted

PROJECT.md §33 pide registrar quién cambió el tipo de cambio manual. La forma de
incumplirlo sin que nadie lo note es que la segunda escritura falle sola, así que
las dos van en `admin_save_settings`, que es una transacción.

Es `security definer` por dos razones distintas, y conviene no confundirlas:

1. `audit_log` no tiene grant de insert para la aplicación —se lee, no se
   escribe— así que el cliente no podría registrarlo ni queriendo.
2. El `actor_id` lo fija la función con `auth.uid()`, no el payload. Un registro
   de auditoría donde el actor lo declara el propio actor no sirve como
   evidencia.

Como saltea RLS, verifica `settings.write` en la primera línea. Una tienda
inexistente y una ajena dan el **mismo** error: un mensaje distinto para cada caso
le confirmaría a un tercero qué ids de tienda existen.

**Merge de primer nivel, no reemplazo ni merge profundo**
El Admin manda sólo la sección que editó —`{"currency": ...}` o `{"payments":
...}`— y la función hace `settings || p_settings`. Con reemplazo completo, guardar
los medios de pago borraría la configuración de moneda sin que nada lo diga. Con
merge profundo sería imposible borrar una clave. Dentro de una sección sí
reemplaza, y es lo correcto: el formulario que la edita la conoce entera.

Dos operadores tocando la misma sección a la vez: gana el último. Aceptado para un
comercio con un operador; si deja de serlo, se resuelve con una versión optimista.

Del lado de la interfaz, la firma de `actualizarTasa` —que devuelve la
configuración y su entrada de auditoría **juntas**— hace que no se pueda guardar
una sin obtener la otra. La regla vive en un solo lugar, no repetida en un
esquema del formulario que podría divergir.

---

## ADR-070 — TanStack Table entra en el listado de productos, y sólo ahí

**Fecha:** 2026-08-28
**Estado:** Accepted

ADR-060 dejó escrito que la tabla se adopta cuando aparezca selección múltiple,
orden por columna o virtualización. Apareció la primera, con las acciones en lote.

Se usa **sólo para modelar filas y selección**: `manualPagination` y
`manualFiltering`, porque la búsqueda, el filtro y la paginación siguen siendo del
servidor (ADR-024). Traer el catálogo al browser para que la tabla lo ordene sería
exactamente lo que esa decisión prohíbe. El listado de pedidos no se migró: no lo
necesita.

**Versión 8, pineada.** La última es 9.2.3, pero la 9.0.0 salió el 2026-08-04 y
en veinticuatro días lleva seis publicaciones; la 8.21.3 es de abril de 2025 y es
la línea que documenta el resto del ecosistema. Se revisa cuando la 9 se asiente.

Tiene un costo declarado: el compilador de React **no memoiza** esa pantalla,
porque `useReactTable` devuelve funciones que no se pueden memoizar sin arriesgar
interfaz vieja. El lint lo avisa, el aviso queda y el comentario del archivo lo
explica. Con veinte filas por página no se nota; si alguna vez se notara, la
salida es virtualizar.

La selección se limpia al cambiar de página, de búsqueda o de filtro: actuar sobre
filas que ya no están a la vista es la forma de archivar veinte productos sin
querer. Y el update en lote lleva `store_id` en el `where` además de los ids: los
ids llegan del browser, así que el filtro por tienda no es decoración.

---

## ADR-071 — Cada pantalla del Admin es su propio chunk

**Fecha:** 2026-08-28
**Estado:** Accepted

El bundle pasaba los 500 KB en un solo archivo (backlog #32). Con cinco pantallas
más, dividir dejó de ser opcional.

Se usa `React.lazy` con un solo `<Suspense>` alrededor del `<Outlet/>`, y no
`lazyRouteComponent` del router, por una razón concreta: dos pantallas reciben
props del parámetro de la ruta y el componente de ruta no las recibe. Un
mecanismo para todas es más fácil de seguir que dos. Las rutas siguen declaradas
en código: son once, y el router por archivos añade un paso de build y un archivo
generado al repositorio.

Medido: la primera carga pasó de **714 KB en un chunk a 561 KB** repartidos entre
el runtime y la cáscara, y lo pesado —el formulario de producto, el importador,
los esquemas de Zod, la tabla— sólo baja cuando se visita.

**Actualización del 28/08:** el sidebar devolvió parte de eso. Sus primitivas
—menús, tooltips y la hoja de mobile— las carga la cáscara, así que la primera
carga quedó en **707 KB** sobre un total de 965 KB en 27 chunks. Frente al punto
de partida no se ganó peso inicial; se ganó que cinco de esas pantallas ya no
bajan hasta que alguien las abre, y se pagó por una navegación que aguanta más
secciones. Está anotado, y la salida si alguna vez molesta es cargar la hoja de
mobile y el tooltip bajo demanda dentro del propio primitive.

Lo que queda en la cáscara son React, el router, TanStack Query, el cliente de
Supabase y el sidebar. Bajar de ahí ya no es dividir, es cambiar de dependencias.

---

## ADR-072 — La URL no define qué tenant ve el Admin

**Fecha:** 2026-08-28
**Estado:** Accepted

Registrado como pendiente en el backlog: si `admin.estilosport.com.py` debería
mostrar sólo Estilo Sport. **Decisión: no**, y no hay nada que implementar.

ADR-062 fijó que el Admin es una sola aplicación en un solo dominio, compartida
por todos los comercios; el storefront es el que tiene dominio propio por cliente.
Acotar por URL exigiría un despliegue de Admin por dominio, que es justamente lo
que ADR-062 descartó.

El aislamiento de datos no depende de esto y nunca dependió: lo da RLS. Lo único
que cambia es la comodidad de quien administra varios comercios, y para eso está
el selector de tienda, que además ahora decide qué puede hacer la persona —una
misma cuenta puede ser propietaria de un comercio y sólo lectura de otro—.

Se revisa si alguna vez hay un Admin con marca blanca, que es un producto distinto.

---

## ADR-073 — Preguntar «mis membresías» no es lo mismo que confiar en RLS

**Fecha:** 2026-08-28
**Estado:** Accepted

`membresiasDe` consultaba `memberships` **sin filtrar por usuario**, con un
comentario que decía que RLS ya lo hacía. No lo hace: `memberships_lectura` acota
por organización —`tenant_id in (select app.current_tenants())`— porque un
miembro tiene que poder ver a su equipo. La consulta devolvía una fila por cada
compañero, y el mapeo le estampaba a todas el id del usuario actual con el rol
ajeno.

Quedó latente tres fases porque nadie consumía el rol. Al cablear el gating de la
interfaz apareció enseguida: el Admin le mostraba a un `viewer` los controles de
un `owner`, porque tomaba la primera fila de su organización. La base rechazó
cada operación igual —esa capa nunca dependió de acá— pero la pantalla mentía
sobre lo que la persona podía hacer.

La corrección es un `.eq('user_id', ...)`, y la lección es la del comentario que
lo justificaba mal: **RLS responde «qué filas puedo ver», no «cuál es la mía»**.
Confiar en una política para acotar algo que no acota es un error que no se nota
hasta que alguien lee el resultado. El test de PGlite fija el comportamiento de la
política —un viewer ve el rol de los owners de su organización— para que el
motivo del filtro no se vuelva a perder.

Vale también al revés: el gating del frontend es cortesía, no seguridad. Se
comprobó con tres usuarios reales —owner, staff y viewer— que la base rechaza
igual lo que la interfaz oculta.

---

## ADR-074 — Dominios alternativos: alias con un canónico

**Fecha:** 2026-08-28
**Estado:** Accepted

`stores.domain` admite un solo dominio, así que un comercio con `.com` y `.com.py`
necesitaría dos tiendas — y dos catálogos, y dos listas de pedidos (backlog #35).

El modelo queda decidido: una tabla `store_domains (domain primary key, tenant_id,
store_id)` con los alias, y `stores.domain` sigue siendo el canónico. Un alias
responde con un 301 al canónico; nunca sirve contenido. Así el tenant se sigue
resolviendo por un solo dominio, el SEO no se parte en dos —que es el problema
real de servir el mismo catálogo en dos direcciones— y `catalog_search` no cambia.

**La implementación se difiere hasta el primer caso real.** Hoy no hay ningún
comercio con dos dominios, y la tabla vacía sólo agregaría una consulta al camino
de resolución de tenant, que es el más caliente del storefront.

---

## ADR-075 — La navegación del Admin es un sidebar

**Fecha:** 2026-08-28
**Estado:** Accepted

Con seis secciones la barra horizontal ya se quedaba corta, y la lista sólo va a
crecer: promociones, contenido e integraciones están en fases siguientes. Se
adopta el bloque `sidebar-07` de shadcn como modelo, que existe para `base-nova`
—la variante sobre Base UI que fija ADR-043— así que no hubo que traducir nada.

Del bloque se conservan las primitivas (`ui/sidebar.tsx` y lo que arrastra) y se
descarta el andamiaje: `nav-main`, `nav-projects`, `team-switcher`, `nav-user` y
su `app-sidebar` traían «Upgrade to Pro», «Billing», «Add team» y proyectos de
ejemplo. Dejar eso es peor que no tener sidebar: cada opción falsa es una promesa
que la aplicación no cumple. En su lugar hay un solo componente con lo que este
Admin tiene de verdad — la tienda activa arriba, las seis secciones en el medio,
la sesión abajo.

**Tres cosas que el cambio obligó a corregir**

El `use-mobile` que trae shadcn arranca en `undefined` y siembra el valor real
dentro de un efecto, lo que dispara un render en cascada en cada montaje y lo
rechaza el lint del repo. Reescrito con `useSyncExternalStore`, que es
exactamente para esto.

La cabecera ahora aporta el `h1` de cada página, así que las pantallas que
repetían ese mismo título lo perdieron y las que aportan uno más específico —el
nombre de un cliente, el número de un pedido— bajaron a `h2`. Antes del cambio
varias páginas tenían dos `h1`.

Y las miniaturas del catálogo se rompían: los medios guardan rutas del storefront
(`/products/x.jpg`) que desde el dominio del Admin no resuelven. No es nuevo, se
volvió visible. La miniatura pasa a ir **dentro** del recuadro gris, así que
cuando no carga queda el recuadro en vez del icono de imagen rota. Resolverlas
contra el dominio de la tienda es otra cosa, y está en el backlog.

**El costo, medido:** la cáscara carga las primitivas del sidebar —menús,
tooltips, la hoja de mobile— así que la primera carga subió de 561 KB a 707 KB.
Se acepta: es una aplicación detrás de un login, y lo que se compra es una
navegación que aguanta las secciones que faltan. La salida, si molesta, es cargar
la hoja de mobile y el tooltip bajo demanda dentro del propio primitive.

---

## ADR-076 — Publicar y archivar es un interruptor, no un botón de ida

**Fecha:** 2026-08-28
**Estado:** Accepted

Archivar un producto desde el listado era un camino de ida: la fila dejaba de
ofrecer el botón y no había forma de volver sin abrir el formulario. Un producto
archivado por error quedaba, para quien miraba la lista, roto.

El listado pasa a tener un interruptor: encender publica —venga el producto de
donde venga, que es lo que significa «habilitarlo de nuevo»— y apagar archiva,
con confirmación porque lo saca de la tienda. La etiqueta de estado sigue al
lado, así que `draft` e `inactive` se ven aunque el interruptor no pueda
representarlos; esos dos se eligen desde el formulario, que es donde caben los
cuatro.

Un interruptor no puede con cuatro estados, y la alternativa —un selector como el
de pedidos— resolvía lo mismo mostrando dos opciones que casi nadie usa desde una
lista. La decisión es que la lista opere el eje que se usa a diario y el
formulario conserve el modelo completo.

Las acciones en lote cambiaron para decir lo mismo: «Publicar» en vez de
«Desarchivar a borrador». Que en lote y de a uno el mismo control signifique
cosas distintas es peor que el riesgo de publicar de más, que además se deshace
con el mismo interruptor.

---

## ADR-077 — El estado de pago es un eje aparte del estado del pedido

**Fecha:** 2026-08-28
**Estado:** Accepted

`payment_status` existía desde Fase 5 y ninguna pantalla lo tocaba: un pedido
nacía `pending` y se quedaba ahí para siempre. Con transferencia bancaria —el
único medio de la demo— cobrar es una persona mirando un comprobante, así que sin
esto la operación de cobro no existía.

Es una función y no un update directo —que las políticas ya permitirían— porque
el cambio tiene que quedar en la timeline. Quién marcó un pedido como pagado y
cuándo es exactamente lo que se va a querer saber el día que el dinero no
aparezca. Repetir el mismo valor no registra nada: una timeline con veinte
entradas idénticas no es historial.

Va separado de `admin_set_order_status` porque son dos ejes distintos: un pedido
puede estar entregado y sin cobrar, o pagado y todavía en preparación. Meterlos en
la misma máquina de estados obligaría a inventar combinaciones que nadie pidió.

Un pedido cancelado no cambia su estado de pago. Si hubo que devolver plata eso es
un refund, y los refunds están fuera del core (ADR-008); marcarlo pagado acá sólo
produciría una contabilidad que no coincide con nada.

---

## ADR-078 — Buscar un pedido por su número, con o sin almohadilla

**Fecha:** 2026-08-28
**Estado:** Accepted

El buscador de pedidos «no funcionaba». Funcionaba: el heno guardaba `1028` y la
tabla muestra `#1028`, así que quien buscaba el pedido que estaba mirando escribía
la almohadilla y recibía cero resultados, sin ninguna pista de por qué.

La corrección es guardar el número **con** la almohadilla, porque el filtro busca
subcadenas y `1028` sigue apareciendo dentro de `#1028`. Los dos funcionan con un
carácter de cambio.

Lo que vale la pena registrar no es el arreglo sino cómo se encontró. Los tres
términos que se probaron primero —el número, el nombre, el correo— funcionaban
todos, y el reporte parecía equivocado. Apareció al probar lo que una persona
escribe de verdad: lo que tiene delante, copiado tal como se ve. Un buscador se
prueba con lo que la interfaz muestra, no con lo que la base guarda.

---

## ADR-079 — Hoy no se optimiza ninguna imagen de producto, y por qué eso decide P-002

**Fecha:** 2026-08-28
**Estado:** Accepted

Salió de una pregunta: si referenciar una URL es peor que subir la imagen a un
bucket. La respuesta obligó a mirar qué hace el storefront de verdad, y lo que
hace es nada.

**Medido en producción.** El catálogo emite `<img>` con un `srcset` de ocho
candidatos —`640w`, `750w`, `828w`…— que apuntan **todos al mismo archivo**. No
hay conversión de formato, ni redimensionado, ni elección real. La primera página
baja 324 KB de imágenes y 6 KB de HTML son ese `srcset` que no ofrece nada.

La causa está en la documentación de Astro, y es explícita: «Astro's image
components will only process images from authorized image sources specified in
your configuration. Remote images from other sources will be displayed with no
processing». Y para las locales: «Images stored in the `public/` folder are never
optimized». Las cinco imágenes del seed viven en `public/`, y `astro.config.mjs`
no declara ningún `image.remotePatterns`. O sea que **ninguno de los dos caminos
que existen hoy pasa por el optimizador**, aunque el componente `<Image />` esté
puesto en todas partes y el adapter de Cloudflare inyecte el binding `IMAGES`.

**Comprobado, no supuesto.** Autorizando `cdn.dummyjson.com` y reconstruyendo, el
mismo componente pasa a emitir `/_image?href=…&w=640&f=webp`, con candidatos de
anchos distintos, y la variante de 640 pesa 28 KB contra 62 KB del original. El
experimento se revirtió: fijar el CDN de unos datos de prueba en la configuración
de producción sería exactamente la clase de atajo que después nadie encuentra.

**Lo que esto decide sobre P-002.** La pregunta parecía de latencia —un host
ajeno, otro handshake— y la latencia es lo de menos. Lo determinante es que
`remotePatterns` es una **lista de hosts**, así que:

- Con los medios en un almacenamiento propio hay **un** host estable que se
  autoriza una vez, y a partir de ahí todo se redimensiona y se convierte.
- Con URLs pegadas a mano no hay lista posible: los hosts son los que sean. La
  única forma de autorizarlas sería abrir el patrón a todo `https`, y eso
  convierte al storefront en un redimensionador de imágenes gratis para
  cualquiera que arme una URL — con Cloudflare Images, además, facturable.

Por eso pegar una URL no puede optimizarse **por diseño**, no por una limitación
que se arregle configurando mejor. Es el argumento que faltaba para cerrar P-002 a
favor de almacenamiento propio, y el que hay que tener presente al elegir entre
Supabase Storage y R2: los dos sirven, y lo que decide es costo y operación, no
rendimiento.

Un bucket, por sí solo, tampoco optimiza: sigue haciendo falta autorizar su host.
Lo que el bucket aporta es que ese host **exista y sea uno**.

Queda sin implementar a propósito. La carga de archivos desde el Admin, el host
de medios por despliegue y su `remotePatterns` son P-002, y esta entrada existe
para que esa decisión se tome con el número delante en vez de por intuición.

---

## ADR-080 — El primer `PaymentProvider` es un gateway simulado, declarado como tal

**Fecha:** 2026-08-29
**Estado:** Accepted

P-001 sigue abierta: no hay credenciales de sandbox de ningún proveedor
paraguayo. La alternativa era escribir el adapter de Bancard desde la memoria del
modelo, y eso es exactamente lo que este repo prohíbe — un adapter que asume una
capacidad que el proveedor no tiene produce cobros mal conciliados, y el error
aparece en producción, no en el typecheck.

Así que se implementó el **contrato completo** (PROJECT.md §14: `createPayment`,
`getPaymentStatus`, `verifyWebhook`, `healthCheck`, `cancelPayment` opcional) y un
proveedor simulado que lo cumple. El simulado dice que es simulado en el nombre
del paquete, en el id del método (`simulated_card`), en la etiqueta del checkout,
en la casilla del Admin y en la propia pantalla de pago.

**Qué ejercita de verdad**, que es lo que justifica que exista: el checkout
redirigiendo a una pasarela externa; un webhook firmado que hay que verificar
antes de creerle; el mismo webhook llegando tres veces; y un pago **rechazado**,
que es el camino que nadie prueba y siempre está roto.

**Qué no valida:** conciliación, cuotas, monedas del proveedor, tiempos de
acreditación, y los modos de fallo que sólo existen cuando hay un tercero. El
día que haya credenciales, el adapter real se escribe contra su documentación y
este queda para desarrollo.

**Sin tabla de intentos de pago.** Todo lo que el flujo necesita —pedido, tienda,
monto, resultado— viaja en un token firmado con HMAC-SHA256 sobre Web Crypto, que
existe igual en Node y en workerd. Un gateway real trae su propio identificador y
su propia forma de consultarlo; inventar la tabla ahora sería modelar para un
proveedor que todavía no se eligió.

**El pedido se crea antes de cobrar, no después.** Es lo que permite que un pago
rechazado deje un pedido que el comercio puede rescatar por otro medio, en vez de
un carrito perdido. Y por eso el rechazo **no vuelve al checkout**: al navegar, la
island se desmonta y su clave de idempotencia se pierde, así que un reintento
crearía un segundo pedido con su stock descontado otra vez. La confirmación dice
que el pedido quedó registrado y que el comercio se va a contactar.

`bank_transfer` no tiene proveedor y no es un olvido: no hay nada que cobrar en
línea. Un `PaymentProvider` para transferencia sería un adaptador vacío alrededor
de una ausencia.

---

## ADR-081 — Los correos salen de una cola en la base, no de un trigger que llame por HTTP

**Fecha:** 2026-08-29
**Estado:** Accepted

Un aviso al comprador tiene que ser tan seguro como el pedido que lo origina: «se
creó el pedido pero no se avisó» no puede pasar. Por eso el correo se **encola en
la misma transacción** que el evento del pedido, con un trigger sobre
`order_events`. Si la transacción se cae, no hay ni pedido ni aviso.

**Por qué no `pg_net`.** Está disponible en el proyecto, y mandar el correo desde
el trigger parecía más directo. Dos razones lo descartan: metería la URL y la
clave del proveedor dentro de una migración, y sobre todo **no corre en PGlite**
—la suite de aislamiento aplica todas las migraciones, así que una dependencia de
extensión ahí deja los 177 tests sin poder arrancar—. Con la cola, encolar es SQL
puro y enviar es trabajo de la aplicación, donde los secretos ya viven y donde se
puede reintentar.

**El trigger es `security definer`, y no es opcional.** Corre dentro de
`admin_set_order_status`, que es invoker: o sea con el rol del operador del
Admin, que no tiene ningún permiso sobre la cola —la tabla no tiene políticas—.
Sin definer, el insert fallaría y se caería el cambio de estado entero.

**El corte del ciclo es estructural.** Marcar un correo como enviado inserta un
evento `email_sent`, que vuelve a disparar el trigger. Al no estar en el mapeo de
eventos que producen correo, sale sin encolar. Que el corte sea la **ausencia de
una rama** y no una condición explícita es lo que hace que un tipo de evento nuevo
sea seguro por defecto. Hay un test que lo fija.

**El intento se cuenta al reclamar, no al fallar.** Un drenaje que se muere a
mitad —el Worker se corta, la red se cae— ya gastó su turno, así que una fila no
se reintenta para siempre. El tope es cinco.

**Dos drenajes simultáneos pueden reclamar la misma fila**, y contra eso no hay
lock sino la clave de idempotencia que Resend recibe con el id de la fila
(verificado en su documentación: header `Idempotency-Key`, vence a las 24 horas,
256 caracteres). La defensa está donde se envía, no donde se reclama.

**Quién drena.** El checkout y el webhook llaman a la función directo, con
`waitUntil` — un Worker de Cloudflare no puede hacerse `fetch` a sí mismo. El
middleware drena de forma oportunista como mucho una vez cada treinta segundos
por isolate, aprovechando el tráfico del sitio. Y el Admin, que vive en otro
dominio, tiene un endpoint para empujar.

Ese endpoint es un **GET**, y la razón es concreta: la comprobación de origen de
Astro rechaza todo POST de otro origen salvo que traiga un `content-type` que no
sea de formulario, y un `fetch` en modo `no-cors` —el único que no exige montar
CORS— sólo puede mandar justamente los tres que se consideran de formulario. O
sea que **ningún POST del browser del Admin podría llegar**. Los métodos seguros
no pasan por esa comprobación, el endpoint no recibe parámetros y es idempotente.

Va **sin autenticación**: sólo vacía la cola de la tienda de este despliegue, cada
fila se manda una vez y el contenido no se devuelve. Lo peor que puede hacer un
extraño es adelantar un envío. Lo que sí podría, con insistencia y el proveedor
caído, es quemar los cinco intentos de una fila; está anotado, y si pasa, un
secreto compartido es una línea de cada lado.

**Resend por REST, sin SDK.** La superficie que se usa es un endpoint. El paquete
oficial es un envoltorio de `fetch` alrededor de eso, y agregar una dependencia
para cuarenta líneas la hace más difícil de auditar, no menos. El stack cerrado
nombra al proveedor, no a su cliente.

**Cuatro eventos y no los ocho de PROJECT.md §24.** `welcome` y `back_in_stock`
exigen cuentas de comprador y suscripciones que no existen; `order_preparing` es
ruido. Se agregan cuando haya a quién mandárselos.

---

## ADR-082 — Los medios viven en Supabase Storage, y por eso ahora se optimizan

**Fecha:** 2026-08-29
**Estado:** Accepted — **cierra P-002**

ADR-079 midió que ninguna imagen de producto se optimizaba, y explicó por qué eso
decidía la elección de almacenamiento: `image.remotePatterns` de Astro es una
**lista de hosts**, así que las URLs pegadas a mano no forman lista y no se pueden
autorizar sin abrir el patrón a todo `https`. Con medios propios hay un host
estable que se autoriza una vez.

Se elige **Supabase Storage** sobre R2: ya está en el stack, no agrega credenciales
ni un servicio más que operar, y el rendimiento no distingue a los dos —eso ya lo
resolvió ADR-079—. R2 sigue siendo la salida si el egress llega a pesar.

**El bucket es público; lo que se protege es escribir.** El catálogo de una tienda
se ve sin credenciales, y servir por URL firmada obligaría a renovarlas en cada
render. Subir y borrar exigen `catalog.write` sobre el tenant, por una política de
Storage.

**La convención del path es la política:** `{tenant_id}/{archivo}`. El primer
directorio _es_ el tenant, y la política lo castea a uuid antes de comprobar el
permiso — un path fuera de convención no falla la comparación, falla el casteo,
que es un rechazo más difícil de eludir.

Se verificó contra el proyecto real que `postgres` puede crear políticas sobre
`storage.objects` pese a que la tabla sea de `supabase_storage_admin`; el bloque
va guardado con un `do` porque PGlite no tiene el schema `storage` y sin la
guarda la suite de aislamiento no arrancaría.

**El patrón autorizado es `**.supabase.co` acotado por pathname** a los objetos
públicos de un bucket `product-media`. El comodín es necesario porque la URL del
proyecto se lee en runtime y `remotePatterns` se decide al construir. El alcance
del abuso queda dicho: el optimizador quedaría disponible para buckets
`product-media` públicos de otros proyectos Supabase. Se cierra el día que haya un
dominio de medios propio.

**Las imágenes del seed migran.** Si se quedaban en `public/`, la demo insignia
seguía sin optimizar nada y el ítem quedaba abierto de hecho. De paso arregla las
miniaturas del Admin: una ruta relativa no resuelve desde su dominio, una URL
absoluta sí.

Eso tuvo una consecuencia que ningún tipo podía anticipar: el uuid del tenant
pasó a aparecer en el HTML del PDP, dentro de la ruta de las imágenes. El smoke
del checkout sacaba el id de variante buscando «el primer uuid con esa forma» en
la página, y empezó a comprar una variante inexistente — fallando con un 409 de
stock que no tenía nada que ver. El helper ahora ancla en las props serializadas.
Una heurística que funciona hasta que el HTML cambia no es una heurística, es una
bomba con temporizador.

---

## ADR-083 — El reset de contraseña lo hace Supabase Auth, no código propio

**Fecha:** 2026-08-29
**Estado:** Accepted

El enlace de recuperación lleva un token que sólo Supabase sabe acuñar y validar.
Escribir uno propio significaría manejar expiración, un solo uso y almacenamiento
seguro — tres cosas fáciles de hacer casi bien, y «casi bien» en recuperación de
cuentas es una puerta abierta.

**El correo sale por el SMTP de Supabase, no por la API de Resend.** Apuntar ese
SMTP a Resend es configuración del proyecto y queda como runbook en
INFRAESTRUCTURA.md, no automatizado: es una operación única, y meterla en un
script obligaría a versionar credenciales SMTP.

Hasta que se configure, aplica el límite del SMTP por defecto de Supabase —pocos
correos por hora y sólo a miembros del proyecto—, que es exactamente el mismo
techo que el sandbox de Resend sin dominio verificado. Alcanza para el Definition
of Done; para un piloto hay que verificar un dominio.

**El formulario responde siempre lo mismo**, exista o no la cuenta, por el mismo
motivo por el que el login no distingue usuario inexistente de contraseña
incorrecta: decirlo convierte el formulario en una forma de averiguar qué correos
tienen acceso al Admin.

**La sesión de recuperación se distingue de una normal.** Entrar por el enlace
produce una sesión válida como cualquier otra, así que sin esa señal el Admin
mostraría el panel y la persona se iría sin cambiar la contraseña que vino a
cambiar. `observarSesion` reporta el contexto y la pantalla de contraseña nueva se
muestra **antes** del router.

---

## ADR-084 — El piloto de ERP pasa de Camelot a Estilo Sport

**Fecha:** 2026-08-29
**Estado:** Accepted — **supersede a ADR-018**

Camelot está apagado y no hay fecha. Estilo Sport tiene un ERP en producción, con
acceso, con documentación de integración escrita, y —lo que más vale— con una
historia de incidentes pagados: el stock por lote pisándose en junio de 2026 y
pedidos enviados al ERP antes de cobrarlos en abril de 2026.

Eso cambia lo que es esta fase. **No es diseñar un contrato de ERP desde cero, es
portar y generalizar uno que ya funciona.** Cada regla de ese documento vale más
que cualquier abstracción inventada, porque cada una costó un incidente.

Y cambia el alcance de lo que se valida. Camelot estaba definido como un clon
read-only para medir escala y mapeo; Estilo Sport es bidireccional, que es el
bucle operativo que el piloto necesita. Un clon valida la demo de venta; el bucle
valida que se puede operar.

Camelot no se descarta: cuando vuelva, sirve como segundo ERP, que es el caso que
de verdad prueba si el contrato abstrae o si está moldeado sobre un solo
proveedor.

**P-004 —estrategia de reservations— queda decidida por los datos:** el ORDS de
Estilo Sport no ofrece reservas, así que el orden es validar → cobrar → empujar, y
no se promete cero overselling. Se reabre si aparece un ERP que las tenga.

---

## ADR-085 — El adapter de ERP corre fuera del Worker, y el contrato vive en el core

**Fecha:** 2026-08-29
**Estado:** Accepted

**El Worker no puede hablar con este ERP.** El proxy del ORDS está publicado en
`http://<ip>:3001`, y el `fetch()` de un Worker de Cloudflare **descarta el puerto
no estándar en producción** —`https://host:8080` termina pidiendo el 443— además
de bloquear las IPs crudas por sus protecciones anti-SSRF. Verificado contra la
documentación y contra el issue donde Cloudflare lo cerró como limitación
conocida, no como bug ([cloudflare-docs#4299](https://github.com/cloudflare/cloudflare-docs/issues/4299),
[Workers VPC](https://developers.cloudflare.com/workers-vpc/)).

Lo peligroso es que **en local con Miniflare funciona**: el fallo aparece recién
al desplegar, y sólo en la ruta que lo usa. Es la misma forma del error de
`locals.runtime.ctx` en Fase 7.

La consecuencia es de diseño, no de configuración: **el importador es un script de
Node**, no una ruta del storefront. Así la restricción no aplica y no hay que
tocar la infraestructura del cliente para probar el adapter.

Lo que **sí** necesita el Worker —el chequeo de stock en vivo al agregar al
carrito y cualquier sync programado— queda bloqueado hasta que el proxy esté en un
hostname con TLS sobre 443. Sin una zona en Cloudflare, la salida más barata es
Caddy con un hostname tipo `<ip-con-guiones>.sslip.io`, que da certificado sin
comprar dominio ni mover nameservers; con una zona, Cloudflare Tunnel además
permite cerrar el puerto.

**Qué va en el core y qué en el adapter.** En `commerce-core/src/erp.ts`: el
puerto `ERPAdapter`, la matriz `ERPCapabilities`, la forma normalizada `ERPItem`,
la agregación por variante y el agrupamiento en productos. En el adapter: el
cliente HTTP, el parseo del JSON y **la normalización de tallas**.

Esa última división es deliberada y contradice el plan original. La regla
`"105" → "10.5"` no es un concepto de ERP: es un artefacto de que el campo del
ORDS tiene tres caracteres de ancho. Subirla al core sería convertir la rareza de
un proveedor en una regla universal a partir de una sola muestra, que es
exactamente lo que este repo prohíbe.

**Todo se verificó contra el cable, no contra la documentación**, y las dos
difieren en cuatro puntos que quedan registrados porque afectan el mapeo:

| Lo que dice el doc                        | Lo que manda el ORDS (9032 filas, 29/08/2026)                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Ocho campos                               | **Once**: agrega `familia`, `linea` y `marca`                                                                                        |
| `rubro` es la pista de categoría          | `rubro` vale `'GENERICO'` **siempre**; la que sirve es `familia`, con 147 valores                                                    |
| `cant_dispon` y `precio_vta` son strings  | Son **números**. El adapter acepta las dos formas                                                                                    |
| Una fila por lote/depósito, hay que sumar | Hoy **no se repite ningún `cod_barra`**. Se agrega igual: si el ORDS cambia de consulta, el error sería silencioso y costaría dinero |

La regla de talla salió de los 70 valores reales, no de la descripción: los once
de tres dígitos terminan todos en 5, y los nueve que ya vienen con punto tienen
parte entera de un dígito. `"8.5"` entra en tres caracteres y viaja con punto;
`"10.5"` no entra y viaja como `"105"`. Por eso `erp_size` se guarda tal cual
llegó: reconstruirla es adivinar el ancho del campo, y una talla mal escrita
factura mal.

**La configuración del ERP no está por tenant todavía.** Vive en el `.env` del
script. Se vuelve obligatoria —tabla propia con la credencial cifrada— el día que
el sync corra en el Worker, que sirve a todos los tenants desde un solo
despliegue. Hoy sería abstraer sin un segundo caso.

---

## ADR-086 — Etapa A: el ERP entra, nada sale

**Fecha:** 2026-08-29
**Estado:** Accepted

La tienda actual de Estilo Sport sigue viva y le manda pedidos al mismo Oracle. Si
Pick también empezara a mandarlos habría **dos emisores contra un ERP que no
deduplica**: su propia documentación dice que un pedido repetido se anula a mano.

Así que el contrato de envío se define y el adapter declara `supportsOrderPush`,
pero nada lo cablea. Coincide con el Definition of Done que la Fase 8 ya tenía
—«sin escribir en ERP»— y con el motivo por el que ADR-018 eligió read-only: se
valida sin poner en riesgo una operación real.

**El envío de pedidos ni siquiera se implementó contra un mock.** El `Order` de
Pick no tiene con qué armar el payload: le faltan el CI/RUC del comprador, el
`internal_code` por línea y la talla nativa de la variante. Escribir el
constructor hoy exigiría inventar la forma de su entrada y rehacerla cuando esos
campos existan. Lo que la Etapa B necesita queda nombrado, que es más útil que
código que hay que tirar.

**Lo que sí se cerró es la otra mitad del no-negociable.** «El ERP conserva
autoridad sobre lo que le pertenece» se cumplía para los campos del producto y
para el precio, pero `admin_save_product` escribía `inventory_levels` sin mirar
`field_sources`: el stock, que es lo único que un ERP posee de verdad, era el
único campo sin proteger. Ahora se saltea en silencio, igual que el precio, y no
corta — el formulario manda el stock de todas las variantes en cada guardado, así
que un error dejaría sin poder editar el título de un producto del ERP.

**Actualización del 2026-08-29, al cerrar la fase:** la Etapa B no está diferida,
está **descartada para este cliente**. Estilo Sport no da permiso de escritura
sobre su Oracle ni contra un entorno de prueba, así que ni siquiera se puede
validar el payload contra el ERP real. Al motivo original —dos emisores contra un
ERP que no deduplica— se le suma que el acceso no existe, y eso convierte a la
Etapa B en trabajo para el próximo ERP que sí lo dé.

Esto no debilita la fase: lo que había que validar era **que la arquitectura de
adapters aguanta un ERP real**, y eso se validó con el flujo de entrada, que es
el que trae las rarezas. El de salida es el más fácil de los dos —armar un JSON
con datos propios— y el difícil era interpretar los de otro. Lo que sí queda sin
prueba es el ida y vuelta completo, y hay que decirlo al vender el piloto en vez
de dar por hecho que un adapter bidireccional está validado en las dos
direcciones.

---

## ADR-087 — Un rótulo de menú vive dentro de su grupo, y el Admin gana un smoke

**Fecha:** 2026-08-29
**Estado:** Accepted

`DropdownMenuLabel` es un `Menu.GroupLabel` de Base UI, y **fuera de un
`Menu.Group` no se degrada: lanza**. El menú de usuario y el selector de tiendas
del sidebar lo tenían como hermano del grupo en vez de como hijo, así que abrir
cualquiera de los dos tiraba la excepción `MenuGroupContext is missing` y se
llevaba la pantalla puesta. En producción el mensaje llega minificado —«Base UI
error #31»—, que es lo que hace que el síntoma no apunte a la causa.

El arreglo va en los dos lugares que lo usan y no en el primitive: `GroupLabel`
se comporta como Base UI manda, y meterlo adentro del grupo además es lo
correcto —el menú queda con `role="group"` y su `aria-labelledby`, que es para lo
que la pieza existe—.

**Por qué no lo vio nadie hasta ahora.** El typecheck pasa, el lint pasa, y el
control se ve perfecto: sólo falla al hacerle clic. El selector de tiendas
llevaba así desde la Fase 6 y no daba la cara porque con una sola tienda dibuja
una variante inerte; apareció al existir una segunda organización. Un fallo que
espera a que crezcan los datos para manifestarse es exactamente lo que un smoke
tiene que cubrir, y el Admin no tenía ninguno —figuraba en el backlog desde la
Fase 6—.

El smoke afirma que el menú **abre**, no que el botón existe. Contar botones
habría dado verde con la aplicación rota, que es la trampa de este bug.

**Un segundo defecto que encontró el smoke al escribirlo.** En mobile el sidebar
es un sheet modal, y tocar una sección navegaba **sin cerrarlo**: la pantalla
nueva quedaba tapada por el menú y, como un sheet marca el resto de la página
`aria-hidden`, un lector de pantalla tampoco llegaba al contenido. Se cierra al
navegar. En desktop no hay sheet y no cambia nada.

**Lo que el smoke necesita en la base.** Un usuario, porque el Admin vive detrás
de un login, y una **segunda tienda**, porque con una sola el selector no es un
menú y el test pasaría sin ejercitar lo que se rompió. Los dos los crea y los
borra la corrida.

**Y una tercera cosa que destapó armar todo esto:** el CI construía el Admin sin
`VITE_SUPABASE_URL` ni `VITE_SUPABASE_PUBLISHABLE_KEY`, así que el bundle salía
mostrando la pantalla de «falta configuración». No lo notaba nadie porque nada
probaba el Admin. El workflow ahora las exporta.

---

## ADR-088 — Las fotos se copian del proyecto del cliente, no se referencian

**Fecha:** 2026-08-29
**Estado:** Accepted

El ORDS no tiene imágenes: son once campos y ninguno es una URL. Las fotos de
Estilo Sport están cargadas a mano en el Supabase de su tienda actual, así que
el origen es ese proyecto y no el ERP.

**Se copian al bucket propio en vez de apuntar al ajeno**, por dos razones que
apuntan al mismo lado. La primera es de control: referenciar dejaría el catálogo
colgando de un proyecto que no administramos, y el día que roten una clave o
limpien un bucket el storefront se queda sin fotos. La segunda es medible:
`image.remotePatterns` autoriza `product-media`, no `product-images`, así que una
URL ajena **no se optimiza** — exactamente el problema que ADR-079 midió y que
ADR-082 resolvió.

Comprobado: el catálogo emite `/_image?…&w=1056&f=webp` y devuelve 42,5 KB donde
el original pesa 49 KB.

**El cruce es por `internal_code`**, que es el `codigo` de Oracle que los dos
proyectos guardan: Pick en `products`, el otro en `product_variants`. Cruzan 100
de 100; 75 tienen foto y 25 no la tienen tampoco en el origen.

**La ruta de destino se deriva del código y la posición** —`{tenant}/erp/{codigo}-{n}.webp`—
y no de un uuid. Con un nombre aleatorio, repetir la migración acumularía copias
huérfanas en el bucket; derivándola, la segunda corrida sobrescribe en el mismo
lugar. Verificado: dos corridas seguidas dejan 129 archivos y 129 filas.

**Sobre la credencial.** Se lee con la `anon` del proyecto de origen, que no es un
secreto —viaja en el browser de su tienda— pero cuya seguridad depende
enteramente de RLS. Antes de usarla se comprobó desde afuera, que es el paso 1
que el propio documento del cliente exige: el catálogo se lee y **ninguna** de
las diez tablas sensibles devuelve una sola fila. No se probaron escrituras: una
que saliera bien sería un cambio real en la base de un comercio vivo.

Un detalle que costó un susto: con esa clave, las tablas sensibles responden
**200 con un array vacío**, no un 403. Leer eso como «expuesta» es un falso
positivo — es RLS filtrando, que es el comportamiento correcto. La exposición
sería un 200 **con filas**.

---

## ADR-089 — Los tres códigos de un producto, cada uno en su nivel

**Fecha:** 2026-08-29
**Estado:** Accepted — **corrige el mapeo de ADR-085**

La Fase 8 los confundió: puso el código del ERP en el producto y usó el código de
barras como SKU de la variante. Son tres cosas distintas, y mezclarlas se paga al
facturar, porque el ERP espera recibir **el suyo**:

|                   | Qué es                                                    | Dónde vive                       | ¿Único?        |
| ----------------- | --------------------------------------------------------- | -------------------------------- | -------------- |
| **SKU**           | el código del modelo: `NK123-01`, donde `-01` es el color | `products.sku`                   | sí, por tienda |
| **internal_code** | el código del ERP del comercio                            | `product_variants.internal_code` | **no**         |
| **barcode**       | el impreso en la caja, del proveedor                      | `product_variants.barcode`       | **no**         |

**Que los dos últimos no lleven unicidad es la decisión, no un olvido.** Según el
ERP, su código se repite en todo el modelo o cambia en cada talla; y hay modelos
con un solo código impreso para todas las tallas. Una restricción parecería
prolija y rechazaría catálogos legítimos.

De ahí sale todo lo demás:

- **El producto se agrupa y se cruza por el SKU.** Es lo único estable a nivel
  producto. Agrupar por el código del ERP daría un producto por talla en cuanto
  aparezca un ERP que codifique por variante.
- **La variante se cruza dentro de su producto**, y el orden lo decide el
  catálogo, no una suposición: el código de barras si de hecho distingue las
  tallas de ese modelo, si no el del ERP, y al final la talla. Para eso existe
  `discrimina()`.
- **`product_variants.sku` se queda con ese nombre** y pasa a significar lo que
  es: el identificador único de la variante, derivado (`{modelo}-{talla}`).
  Renombrarlo era más honesto y son 89 usos en 30 archivos — checkout, pedidos,
  búsqueda, import CSV—; la concesión está anotada acá para que nadie lo lea como
  «el SKU».

### El hallazgo que salió de esto y valía plata

Reescribir la clave de agregación destapó **7 variantes que el ERP trae dos
veces** con códigos distintos: `CCOB001` contra `ccob001`, `lt'005` contra
`lt-005`, dos EAN para la misma zapatilla. Las dos filas traen **el mismo número
de unidades**: es la misma mercadería cargada dos veces, no dos lotes.

Sumarlas —que es lo que hacía la agregación anterior— publicaría el doble del
stock que existe. Así que ahora se distinguen los dos casos:

- varias filas del **mismo artículo** (mismo código de barras) → lotes → **se suman**
- varias filas de la **misma variante** con artículos distintos → duplicado de
  carga → **no se suman**, gana la primera y el resto se reporta

El arreglo de fondo va en el ERP del cliente, no acá; lo que corresponde es no
tragárselo. Por eso `fetchInventory` devuelve el agregado entero y no sólo las
filas: un contrato que descarte los duplicados obliga a cada llamador a
redescubrirlos.

---

## ADR-090 — La foto entra entera en su caja

**Fecha:** 2026-08-29
**Estado:** Accepted

La card recortaba con `object-cover` dentro de una caja 3:4. Con fotografía
propia y consistente eso es lo correcto —llena la caja y la grilla queda
perfecta— y por eso nunca se notó: las imágenes del seed miden exactamente 0,75.

Un catálogo que recibe packshots de sus proveedores trae de todo. Medido sobre
uno real: las proporciones van de **0,32 a 2,89** y sólo el 26 % son cuadradas.
Con `cover`, de una riñonera apaisada se veía la franja del medio.

`--fit-product`, al lado del `--aspect-product` que ya existía, con `contain` por
defecto. **`contain` es el default correcto para una plataforma** porque nunca
destruye una foto: lo peor que hace es dejar aire. `cover` pasa a ser lo que se
elige cuando se tiene la fotografía bajo control.

Se aplica también a la galería del PDP, que tenía el mismo recorte. El hero y las
fichas de categoría se quedan en `cover`: ahí la imagen es decorativa y llenar el
espacio es lo que se quiere.

---

## ADR-091 — El motor de promociones es plano, y el core es su especificación

**Fecha:** 2026-08-29
**Estado:** Accepted

**Contexto**
PROJECT.md §15 dibuja una `Promotion` con `conditions[]` y `actions[]`, y una
lista de casos que incluye Buy X Get Y, 2x1 y bundles. Los checkboxes de la Fase
9 piden bastante menos: porcentaje, monto fijo, mínimo de compra, mínimo de
cantidad, cupón, vigencia, alcance y una stackability mínima.

**Decisión**
El modelo es **plano**: columnas, no arrays de reglas. `discount_type` con
`discount_value`, un `target` jsonb con la forma `{kind, ids}`, y las condiciones
de carrito como dos columnas nulables.

La semántica vive en `packages/commerce-core/src/promotions.ts` y **es la
especificación ejecutable**; `cart_promotions` y `catalog_search` la reflejan.

**Por qué**
Un motor de reglas para estos casos sería un intérprete que hay que depurar sin
ganar nada: `conditions[]` con un solo tipo de condición posible es una lista de
un elemento con ceremonia. Cuando aparezca el primer Buy X Get Y real habrá que
revisarlo, y ese es el segundo caso que ADR-019 pide esperar.

Lo del core como especificación es el mismo razonamiento de ADR-055 aplicado a
otro modo de fallo silencioso: un descuento mal calculado **no lanza ninguna
excepción**, sólo cobra mal. Ahí la única defensa es una implementación de
referencia con tests y una comparación automática, que es lo que hace
`supabase/tests/promociones.test.ts` con catorce escenarios corridos contra las
dos implementaciones.

**La división catálogo/carrito no es una elección**
Una promoción con `min_subtotal`, `min_quantity` o `code` **no se puede mostrar
en la PLP**: no hay carrito todavía contra el que evaluar la condición. De ahí
salen dos clases —de catálogo, que se ve en la grilla y aplica igual al comprar;
de carrito, que aplica recién al agregar— y la regla `esDeCatalogo`. El Admin lo
dice en la lista y en el formulario, para que el comercio no se pregunte por qué
su promoción con mínimo no aparece en la vidriera.

**El descuento se aplica por unidad, no sobre el subtotal de la línea**
Con un producto de 10 guaraníes al 15 %, por unidad da 8 y tres unidades 24;
sobre el subtotal da 15 % de 30 = 5, o sea 25. **La PLP diría 8 cada uno y el
carrito cobraría 25 por tres.** Aplicando por unidad, catálogo, carrito y pedido
coinciden por construcción y no por casualidad.

**El redondeo, y una hipótesis que resultó falsa**
`percentageOf` redondea al medio **alejándose del cero**, como `Math.round`. En
SQL eso obliga a `numeric`: el primer comentario que se escribió decía que era
por pérdida de precisión del float, y al sabotear el test se descubrió que
pasaba igual. El motivo real es otro: `round(double precision)` de Postgres
redondea **al par** —15 % de 30 son 4,5 y da 4— mientras que `round(numeric)` da 5. Se comprobó con las dos formas sobre los mismos valores antes de dejarlo
escrito, y el escenario de paridad se cambió por uno cuyo descuento cae justo en
la mitad, porque el anterior no distinguía nada.

**Stackability, en una frase**
Se recorren por prioridad; una promoción que no combina se aplica sólo si
todavía no se aplicó ninguna, y corta la cadena. El desempate por id no es
cosmético: sin orden total, dos promociones de igual prioridad podrían
encadenarse en distinto orden en el catálogo y en el carrito, y con descuentos
encadenados eso da precios distintos.

**Consecuencias**
`promotion.write` es un permiso nuevo, para owner y admin. El precedente de
ADR-056 dice no inventar permisos cuando ningún rol distingue —por eso el stock
escribe con `catalog.write`—, pero acá sí hay distinción: una campaña es una
decisión de precio, y las de precio ya viven detrás de `settings.write`, que el
staff no tiene. Un repositor que carga productos no debería poder publicar un
40 %.

El alcance por colección existe en el modelo, en el SQL y en el core, pero el
formulario del Admin ofrece sólo catálogo entero, categorías y productos: las
colecciones todavía no tienen pantalla donde crearse, y ofrecer apuntar a algo
que no se puede crear sería una opción muerta. Aparece con el CMS de la Etapa B.

---

## ADR-092 — El descuento lo calcula el servidor, y el carrito no suma por su cuenta

**Fecha:** 2026-08-29
**Estado:** Accepted

**Contexto**
`create_order` ya tenía escrita la regla: «el payload dice qué y cuánto, jamás a
qué precio». Con promociones aparece la misma pregunta para el descuento, y una
segunda: quién calcula el total que el comprador ve antes de confirmar.

**Decisión**
El monto del descuento sale siempre de `cart_promotions`, una función de la base.
El browser puede mandar el **código** del cupón y nada más. El endpoint del
carrito llama a esa misma función; no suma por su cuenta.

**Por qué el endpoint tampoco suma**
Al conectar el catálogo apareció una incoherencia introducida en el mismo
trabajo: la PLP mostraba 120.000 con un 20 % activo, el carrito 150.000 porque
leía `product_variants.price` a secas, y `create_order` cobraba 120.000. **Tres
números para lo mismo**, y el del medio es el que el comprador mira antes de
decidir.

El arreglo no fue enseñarle al carrito a descontar —eso deja dos
implementaciones que hay que mantener de acuerdo— sino que use la misma función
que el pedido. Un solo cálculo no puede divergir de sí mismo.

**El tope de uso, con la condición adentro del update**
`update promotions set usage_count = usage_count + 1 where id = ... and
(usage_limit is null or usage_count < usage_limit)`, comprobando las filas
afectadas. Un `select` del contador seguido de un `update` deja pasar dos pedidos
simultáneos con el último cupón, y el segundo descuenta sin derecho: es la misma
carrera que ADR-065 evita con el `unique` de la clave de idempotencia.

Se consume **después** de la revalidación del carrito, para que un carrito
inválido no gaste el cupón, y si falla se corta la transacción entera: preferible
a cobrar un descuento que ya no existe.

**El pedido guarda el snapshot, no la referencia**
`orders.applied_promotions` copia id, título, código, tipo, valor y monto. Mismo
motivo por el que `order_items` copia título y precio: la promoción se edita, se
archiva o cambia de porcentaje, y el pedido tiene que seguir contando su
historia.

**El subtotal se deriva y no se guarda**
El primer intento fue una columna `not null` con un check de que las tres
cuadraran, y rompió todos los `insert` de `orders` que ya existen —`create_order`
inserta el pedido y recién después le pone el total, y las fixtures insertan sin
pasar por ahí—. Exigirlo habría obligado a tocar cada sitio de inserción para
repetir un dato implícito. Como `total = subtotal - descuento`, el subtotal es
`total + descuento`: generada y almacenada, la mantiene Postgres, la invariante
no se puede violar porque no hay dos números que puedan discrepar, y ningún
llamador cambia. No contradice la advertencia de ADR-056 sobre columnas
materializadas: aquella es sobre un espejo que alguien tiene que acordarse de
actualizar, y acá no hay a quién se le pueda olvidar.

**`lowest` gobierna más de lo que parece**
En `catalog_search`, `lowest` no es sólo lo que se muestra: de él salen el filtro
de precio, el orden por precio y los extremos de la barra de rango. Dejarlo en el
precio de lista habría dado una grilla que **se ve bien y ordena mal** —el peor
tipo de bug, porque parece que funciona—, así que pasa a ser el mínimo efectivo.

**Coste**
Medido contra el catálogo de Estilo Sport, 100 productos y 194 variantes: 110 ms
sin promociones contra 109 ms con una sobre todo el catálogo, dentro del ruido.
El `case` que saltea `apply_chain` cuando el producto no tiene promociones es lo
que hace que una tienda sin campañas —el estado normal— no pague nada. **No está
medido a 9000 variantes**; si degradara, la salida sería materializar el precio
efectivo, y eso sí sería el drift que ADR-056 describe.

**Sobre los motivos de rechazo del cupón**
Se distingue «no existe» de «venció», «se agotó» y «no llega al mínimo». Quien
tiene un cupón legítimamente vencido merece saber que su código era real, y
descubrir códigos _vencidos_ no sirve de nada. Lo que no se hace es buscar por
prefijo ni por coincidencia parcial: eso sí sería una forma de encontrar códigos
probando.

**Un grant que era una foto**
La Fase 3 hizo `grant execute on all functions in schema app to authenticated`,
que no alcanza a las funciones creadas después, y `service_role` nunca tuvo
`usage` sobre ese schema. Las funciones nuevas de `app` llevan su grant
explícito. El síntoma aparecía al **crear un pedido**, no al aplicar la
migración, que es exactamente la clase de fallo que la migración sola no destapa.

---

## ADR-093 — Las secciones de la home son colecciones, no un modelo aparte

> **Superseded en parte por ADR-094.** El acierto —no inventar tres tipos de
> sección para tres carruseles de productos— se conserva. El error fue creer que
> _toda_ sección es una colección: un hero no lo es, y los mosaicos tampoco.

**Fecha:** 2026-08-29
**Estado:** Accepted

**Contexto**
La Fase 9 pedía «featured/new/best sellers sections» y «manual/dynamic
collections en CMS» como ítems distintos. La lectura obvia es un modelo de
secciones con un tipo por cada una.

**Decisión**
No hay modelo de secciones. **Una sección de la home es una colección con
`home_position`.** Destacados es una colección manual; Novedades y Más vendidos
son dinámicas con su orden.

Para que eso alcance, `CatalogSort` gana `newest` y `best-selling`, y
`collections` gana `subtitle`, `published`, `home_position` y `sort`.

**Por qué**
Tres tipos de sección serían tres formas de decir lo mismo, y el comercio
tendría que aprender cuál usar cuándo. Con una sola, la pregunta que se hace es
la suya —«esta lista la armo yo» contra «esta se arma sola»— y no una taxonomía
nuestra. Y una cuarta sección no pedida —«lo más barato», «una marca»— sale sin
tocar código.

Además evita el `COLECCION_DESTACADA = 'ofertas'` que vivía en el storefront: su
propio comentario decía que era «una decisión del comercio, no del Core», y
tenía razón en el diagnóstico y no en el remedio. Era una decisión del comercio
guardada en el código: cambiarla exigía desplegar, y toda tienda tenía que
llamar igual a su colección destacada.

**Las dinámicas ya estaban decididas**
ADR-056 dice «una colección dinámica es una consulta guardada»: `collections.rules`
tiene la forma de `CatalogFilters` desde la Fase 4 y la resuelve el mismo
`catalog_search`. Lo único que faltaba era implementarlo. Cero motor de reglas.

**Dónde se aplican las reglas, que es lo que costaba acertar**
Van junto a la búsqueda y al rango de precio, **no** junto a los filtros de
faceta. Esos se auto-excluyen del conteo de su propia faceta —para que con
«color: Negro» activo el color siga mostrando cuántos hay en Azul— y una regla
de colección que hiciera eso dejaría la colección sin acotar en cuanto el
visitante toca un filtro: una colección «Todo negro» empezaría a ofrecer verdes.
Hay un test que lo fija y un sabotaje que lo confirma.

**Las ventas se agregan, no se guardan**
`best-selling` sale de un agregado sobre `order_items` en la propia consulta.
Una columna `units_sold` sería un contador que alguien tiene que acordarse de
actualizar, que es exactamente lo que ADR-056 describe con el stock. `Product`
lleva `unitsSold` como campo opcional para que el gemelo del core pueda ordenar
igual y la paridad de ADR-055 siga en pie.

**Lo que esto no resuelve**
Con la tienda sin ventas, todos los productos empatan en cero y «Más vendidos»
queda con un orden arbitrario. No se filtra por `unitsSold > 0` porque un orden
que además filtra es una función que hace dos cosas y sorprende. El formulario
lo dice mientras se elige el orden; publicar esa sección antes de tener pedidos
es una decisión del comercio, informada.

**`Banner` era la announcement bar**
El componente que se llamaba `Banner.astro` es la barra de anuncio —el «Envío
gratis en compras superiores a…»—, no un banner. PROJECT.md §17 los lista como
dos componentes distintos. Se renombró a `AnnouncementBar.astro` y el nombre
quedó libre para lo que de verdad es un banner.

En ese componente el texto va **fuera** de la imagen. Encima obligaría a un velo
para que se lea, y el velo apaga la foto que el comercio eligió; peor, con dos
imágenes de proporciones distintas —una por tamaño de pantalla— el punto donde
el texto queda legible cambia con el viewport y no hay forma de acertarle a los
dos.

**Permisos**
Todo el contenido detrás de `catalog.write`, sin permiso propio: ADR-056 dice no
inventar uno cuando ningún rol distingue, y acá no distingue —quien cura el
catálogo cura la vidriera—. Las promociones fueron la excepción porque son una
decisión de precio (ADR-091).

**Dos cosas que encontró la verificación y no la lectura**
La pestaña de la sección de contenido vivía en estado local, así que guardar una
colección devolvía a la pestaña de banners y la persona no veía lo que acababa
de crear. Pasó a la URL. Y el primer formulario rellenaba sus campos con un
efecto al llegar la consulta: el compilador de React lo rechaza, y con razón —
además de encadenar renders, mostraba el formulario vacío sobre una colección
que existía. Ahora los campos se montan con el dato ya puesto.

---

## ADR-094 — La home se compone por secciones, y el vocabulario queda fijo

**Fecha:** 2026-08-29
**Estado:** Accepted. **Corrige ADR-093.**

**Contexto**
ADR-093 decidió que «una sección de la home es una colección». Al usarlo apareció
que eso alcanza para los carruseles de productos y **no** para el resto: el
usuario pidió poder administrar «el banner principal, el que se ve al entrar,
con título, subtítulo y botón; y si son varios, que pasen como slides». Un hero
no es una colección, y el bloque de avisos que se había construido tampoco.

Además el pedido destapó que **el vocabulario estaba mezclado**. «Banner» se
estaba usando para dos cosas distintas, así que no había forma de pedir una sin
la otra.

**El vocabulario, que es media decisión**

| Nombre       | Qué es                                                              |
| ------------ | ------------------------------------------------------------------- |
| **hero**     | La pieza grande de arriba, con título, bajada y botón               |
| **slide**    | Cada pieza de un hero con varias. El conjunto es un _slideshow_     |
| **tiles**    | Mosaicos promocionales: los avisos secundarios de más abajo         |
| **sections** | Los bloques ordenados que componen la portada, cada uno con su tipo |

Son los términos de la industria —Shopify los llama «slideshow» y «sections»— y
no una invención local: alguien que viene de otra plataforma los reconoce.

**Decisión**
`home_sections` es el contenedor ordenado. Cada fila tiene un `type` —`hero`,
`tiles`, `products`, `categories`—, un `layout` —`static` o `slider`— y sus
`settings`. Las piezas gráficas viven en `banners` con `section_id`.

Lo que ADR-093 acertó se conserva: `products` es **un** tipo que apunta a una
colección, manual o dinámica. No hay un tipo por cada carrusel.

**Un slide y un mosaico son la misma fila**
Los dos llevan imagen, título, bajada y enlace; lo que cambia es el tipo de la
sección que los contiene. Dos tablas habrían duplicado el formulario, la subida
de imagen y la política de Storage para no ganar nada. `cta_label` es lo único
que los distingue en el dato: con él la pieza dibuja un botón, sin él el bloque
entero es el enlace.

**El slideshow no rota solo, y es deliberado**
Va por scroll-snap con puntos de navegación que son anclas, sin una línea de
JavaScript, igual que el carrusel de productos y la galería del PDP (ADR-038).
Auto-avanzar exigiría una island en la home, que es la página más liviana del
sitio y tiene presupuesto medido; y un hero que se mueve encima de quien está
leyendo es un problema de accesibilidad conocido antes que una preferencia. Si
un cliente lo pide, se agrega como island opt-in respetando
`prefers-reduced-motion`, que es lo que el repo exige para todo lo que se mueve.

**Lo que esto sacó del código**
El hero de la demo estaba escrito en `index.astro` con su imagen y su texto, y
`COLECCION_DESTACADA` fijaba qué colección se destacaba. Media portada era una
constante: cambiarla exigía desplegar, y toda tienda tenía la vidriera que ese
archivo dijera. Ahora `index.astro` **dibuja y no decide**, y el contenido de la
demo se siembra como datos.

**El `h1` que se perdió al hacerlo**
Sacar el hero fijo dejó la home **sin ningún `h1`**: los títulos de las secciones
son `h2` y deben seguir siéndolo. Una página sin encabezado es una página sin
título para un lector de pantalla y para un buscador. La home lleva ahora un
`h1` oculto con el nombre de la tienda, y el smoke afirma que hay exactamente
uno **sin mirar su texto**: el copy de la portada lo decide el comercio y
cambiarlo no puede ser una regresión.

**La migración conserva lo cargado**
Los banners que ya existían se dibujaban en grilla debajo del hero, así que eso
eran: mosaicos. Se les crea su sección en vez de dejarlos huérfanos —un banner
sin sección no lo mostraría nadie—. Las colecciones con `home_position` pasan a
secciones `products` con su orden. Borrar el trabajo de alguien por un cambio de
modelo no es una migración.

---

## ADR-095 — La pantalla se remonta al cambiar de tienda

**Fecha:** 2026-08-29
**Estado:** Accepted

**Contexto**
El usuario reportó que al cambiar de tienda en la sección de Contenido seguía
viendo el contenido de la anterior. Las consultas llevan el id de la tienda en su
clave, así que las listas **sí** se rehacían; el reporte parecía imposible
leyendo el código.

Reproducido con Playwright: con un formulario de edición abierto, cambiar de
tienda dejaba el formulario intacto, mostrando el registro de la tienda anterior
sobre una lista ya actualizada. Y guardarlo lo habría escrito en la tienda nueva.

**Decisión**
El `<Outlet>` del Admin lleva `key={tienda.id}`: la pantalla se **remonta** al
cambiar de tienda y todo su estado local se va con ella.

**Por qué ahí y no en cada pantalla**
El riesgo es de todas: cualquier borrador, filtro o selección abierta pertenece a
una tienda. Resetearlo pantalla por pantalla exige acordarse en cada pantalla
nueva, y es exactamente la clase de cosa que se olvida. Una línea en la cáscara
cubre las que hay y las que vengan.

**La lección de método**
No se encontró leyendo: se encontró reproduciéndolo. El código «se veía
correcto» porque la parte que fallaba —estado local que sobrevive a un cambio de
contexto— no está escrita en ningún lado; es lo que React hace por defecto.

---

## ADR-096 — Confirmar, ordenar y volver: las tres piezas que faltaban en el Admin

**Fecha:** 2026-08-29
**Estado:** Accepted.

> **Corregido en parte por ADR-098.** Las migas de contenido ya no arrancan en
> «Contenido»: esa pantalla dejó de existir y ahora redirige, así que enlazarla
> daría dos migas seguidas al mismo lugar. Todo lo demás —la confirmación, el
> orden por flechas, el resto de las migas— sigue vigente.

**Contexto**
Al usar el Admin recién terminado aparecieron dieciséis problemas de uso, casi
todos de la misma familia: controles que existían pero pedían al operador
traducir a mano una idea que la pantalla podía representar sola.

**Borrar pregunta, siempre, y con el mismo diálogo**
Había tres borrados sin ninguna confirmación —secciones, piezas y colecciones—
y **seis** usos de `window.confirm`. Ese modal es bloqueante, no se puede
estilar, no gestiona el foco, y varios navegadores dejan silenciarlo: en ese
caso la acción salía sin preguntar nada.

Se usa `AlertDialog` de Base UI y no `Dialog`: el primero no cierra con Escape ni
con un clic afuera. En un diálogo corriente el gesto de descartar es ambiguo
—¿me arrepentí o se me escapó el clic?— y acá la respuesta por defecto tiene que
ser no hacer nada, dicha explícitamente.

Dos decisiones sobre el texto. La pregunta nombra **lo que se borra** y no «este
elemento»: quien llega después de recorrer una lista larga necesita comprobar
que apuntó a la fila que creía. Y el botón dice el verbo —«Borrar», «Archivar»,
«Cancelar el pedido»— y no «Sí», que aislado no dice a qué.

`DialogoDeConfirmacion` es controlado además de traer su versión con disparador,
porque **no todo lo que hay que confirmar lo dispara un botón**: hay un
interruptor que archiva un producto y un `<select>` que cancela un pedido, y
fueron justamente esos dos los que se habían quedado con el `confirm()` nativo.
En el `<select>`, el control ya se movió cuando corre el `onChange`, así que se
lo devuelve **antes** de preguntar: dejarlo en «Cancelado» mientras el diálogo
está abierto haría que cancelar el diálogo dejara la fila mintiendo.

**El orden es la lista, no un número**
La posición de una sección se escribía como entero. Para poner un bloque arriba
de otro había que abrir los dos, mirar sus números y elegir uno intermedio: una
idea espacial traducida a aritmética por la persona equivocada.

Se eligieron flechas y no arrastrar-y-soltar. El repo no tiene librería de drag
and drop y sumar una exige un ADR; pero sobre todo, arrastrar no se puede hacer
con el teclado sin construir aparte todo el manejo de foco y los anuncios, así
que una implementación honesta termina teniendo **igual** estos botones. Con
listas de cinco o seis bloques, que es lo que tiene una portada, el arrastre no
agrega nada que compense.

La posición se **deriva** del orden y se renumera desde cero en cada cambio.
Guardarla de a una dejaría huecos y empates que después hay que desempatar.

**Migas de pan**
Entrar a editar una colección, una sección o una promoción dejaba sin forma de
volver salvo el botón del navegador, que en mobile ni está a la vista. Se
derivan de la ruta con reglas declaradas y no partiendo la URL en segmentos:
`/contenido/colecciones/$id` no tiene tres niveles navegables —`/contenido/
colecciones` no existe como pantalla— y unas migas que llevan a un 404 son
peores que no tenerlas. El último nivel no es enlace: es dónde estás.

**Lo que se sacó de la vista**
El `handle` de una colección salía del nombre y no tenía nada que decidir:
ofrecerlo era pedir que alguien eligiera un identificador técnico, y
equivocarse rompía en silencio la sección que la apuntaba. La opción «mostrar en
la home» de una colección decía lo mismo que la sección de tipo carrusel, desde
dos lados que podían contradecirse. Y el tipo de sección, que no se puede
cambiar, dejó de mostrarse como `<select>` deshabilitado: un control apagado
sigue pareciendo un control, e invita a un clic que no hace nada.

**Validación que se ve**
Los campos numéricos de una promoción convertían con `Number()` **antes** de
validar. Un texto se volvía `NaN` y el mensaje resultante hablaba de cero; peor,
tres campos ni siquiera renderizaban su error, así que el botón de guardar no
hacía nada y no había forma de saber por qué. Ahora se valida el texto tal como
se escribió, con mensajes que hablan de puntos y comas y no de enteros ni
decimales, y el componente `Campo` incluye el error como parte del campo: dejar
de mostrarlo deja de ser algo que uno pueda olvidarse.

**Un `update` sin filas no es un éxito**
`reordenar` no comprobaba cuántas filas tocaba. Si RLS filtra un update,
PostgREST devuelve éxito con cero filas: un reordenamiento sin permiso se veía
como si hubiera funcionado hasta recargar, y no había ningún error en ninguna
parte. Ahora se exige que haya tocado exactamente una.

**Un `click()` de Playwright no espera a la petición**
El test del reordenamiento fallaba culpando al reordenamiento, que funcionaba:
`click()` vuelve apenas despacha el clic, y el `page.reload()` inmediato abortaba
la petición en vuelo. Se espera a que la pantalla lo refleje y **recién después**
se recarga, que además prueba las dos cosas por separado: que cambió, y que
quedó guardado.

**Alcance del hero**
El banner principal dejó de ofrecer «uno debajo del otro»: un hero ocupa el alto
de la pantalla, y tres apilados empujan el catálogo tan abajo que nadie llega.
Sus dos opciones son slides o de a dos. Las categorías ganaron la de carrusel,
que con muchas deja de ser un adorno.

---

## ADR-097 — La distribución del Admin se toma de Shopify, y las piezas repetidas se unifican

**Fecha:** 2026-08-29
**Estado:** Accepted

**Contexto**
Cada pantalla del Admin se había armado por su cuenta. El resultado no eran
errores sino un conjunto sin idioma común: el título vivía en la barra de arriba
mientras el contenido empezaba sin contexto; la acción principal aparecía a veces
al lado de un párrafo, a veces debajo de un filtro; la paginación estaba escrita
cuatro veces —una de las copias ya con otro espaciado—; el mismo `<select>`
existía con **tres alturas distintas** según qué pantalla lo hubiera pegado; y la
caja de error estaba copiada en diez lugares, cada una con su redacción y su
botón. El pedido fue explícito: **reubicar lo que ya hay** siguiendo la
distribución y la tipografía del Admin de Shopify, sin traer nada que Shopify
tenga y nosotros no.

**Lo que se adopta**

- **El título vive en el contenido, no en la barra.** `PaginaAdmin` pone ícono,
  nombre, una línea de descripción y las acciones en una sola fila. La barra de
  arriba queda con el botón del panel y las migas, y nada más.
- **La acción principal siempre en el mismo lugar**: arriba a la derecha, y es la
  única oscura. En las pantallas de lista es el enlace de alta; en las de
  formulario, Guardar.
- **El contenido va en tarjetas** sobre un fondo apagado —`--background` pasó de
  blanco puro a un gris muy claro—. Es lo que separa «esto es una lista» de «esto
  es la página» sin líneas divisorias sueltas.
- **Filtros, barra de selección y paginación viven dentro de la tarjeta que
  gobiernan.** Sueltos arriba o abajo se leían como bloques independientes de la
  página, y no lo son.
- **Los ajustes usan la sección anotada**: a la izquierda de qué se trata, a la
  derecha los controles. Con las tarjetas sueltas había que leer los campos para
  saber qué hacía cada una.
- **Las métricas ponen el rótulo antes y chico, el número después y grande**, que
  es el orden en que se lee una métrica.

Lo que **no** se copia, porque no lo tenemos: buscador global, pestañas de vista
guardadas, barra de progreso de configuración, ni la barra de guardado
contextual.

**El botón de guardar fuera del `<form>`**
Para que Guardar esté arriba a la derecha, el `<form>` envuelve a la página en
tres de los cuatro formularios. En el de secciones no se puede: abajo cuelga el
editor de slides, con sus propios botones, que dentro de un formulario lo
enviarían sin querer. Ahí se usa el atributo `form` de HTML —`<button
type="submit" form="form-seccion">`—, que asocia el botón a un formulario que no
lo contiene. Es plataforma, no JavaScript, y evita tanto el formulario anidado
como levantar el estado del editor a la pantalla.

**Lo que se unificó, y por qué importa más que el aspecto**
`Paginacion`, `SELECT`, `EstadoVacio`, `EstadoDeError`, `Esqueleto`,
`TituloDeTarjeta` y `BarraDeFiltros` pasaron a `components/pagina.tsx`. No es
prolijidad: cada copia era un lugar donde el siguiente arreglo podía no llegar, y
ya había divergencia visible —tres alturas de desplegable y dos espaciados de
paginación—. `EstadoDeError` además **trae su propio botón de reintentar**, para
que un error sin salida deje de ser algo que uno pueda olvidarse de ofrecer.

Lo que **no** se unificó: hay dos componentes `Campo`. El compartido pide `id` y
usa `htmlFor`; el del formulario de producto mete el control dentro del `<label>`
porque sus campos vienen de `register()` sin id. Tipográficamente ya son
idénticos, así que unificarlos significaría inventar veinte ids para no cambiar
nada de lo que se ve. Queda anotado, no hecho.

**El interruptor es el estado**
En promociones, colecciones y secciones convivían un interruptor y una etiqueta
diciendo lo mismo, y la etiqueta ocupaba la columna más ancha de la tabla. Queda
el interruptor, que además **es** la acción. Los tests que afirmaban sobre la
etiqueta pasaron a afirmar sobre `aria-checked`, que es el estado real y no su
descripción.

**Consecuencia en los tests**
Dos afirmaciones del smoke del Admin buscaban el texto «Borrador» y «Publicada».
No se relajaron: se movieron al atributo del interruptor, que es más estricto
—un texto puede aparecer en cualquier parte de la fila; `aria-checked` sólo puede
estar bien o mal—.

---

## ADR-098 — Contenido deja de ser una pantalla con pestañas y pasa a ser un grupo del sidebar

**Fecha:** 2026-08-29
**Estado:** Accepted. **Corrige ADR-096** en lo que decía de las migas de contenido.

**Contexto**
Secciones, Colecciones y Categorías vivían como tres pestañas dentro de una
pantalla «Contenido». La justificación original —están escrita en el componente—
era que el sidebar pasaba de siete entradas a diez y dejaba de leerse de un
vistazo. Al usarlo, el costo apareció del otro lado: para llegar a Categorías hay
que entrar a Contenido y recién ahí elegir, y desde el sidebar no se ve que esas
tres cosas existen.

**Decisión**
El sidebar gana un nivel. «Contenido» ya no navega: **despliega** las tres, que
son pantallas propias en `/contenido/secciones`, `/contenido/colecciones` y
`/contenido/categorias`.

**Por qué disclosure y no enlace al primer hijo**
Es lo que decide si el cambio sirve en mobile. Ahí el sidebar es un sheet modal
que se cierra al navegar: si «Contenido» fuera un enlace, tocarlo llevaría a
Secciones y **cerraría el menú antes de que las otras dos se vieran** — para
llegar a Colecciones habría que volver a abrirlo, que es exactamente el paso de
más que las pestañas ya cobraban. Como disclosure, un toque las muestra y el
segundo elige.

El estado es local y arranca en «abierto si ya estás adentro», así que entrar por
una miga o pegando la URL deja el menú diciendo dónde estás. No se sincroniza
después: si alguien lo cierra a propósito, se queda cerrado. Sincronizarlo sería
un control que se reabre solo.

Colapsado a íconos, el submenú está oculto por CSS
(`group-data-[collapsible=icon]:hidden`, que ya trae `SidebarMenuSub`), así que
tocar el grupo **primero abre la barra**: desplegar algo invisible es un clic que
no hace nada.

**Rutas reales, no un parámetro de búsqueda**
Cuál pestaña estaba abierta vivía en `?tab=`. Eran doce lugares que escribían ese
valor —el conmutador, cuatro navegaciones de los formularios, cuatro migas— y
**ninguno tipado**: `validateSearch` devolvía `{ tab?: string }`, `useSearch` iba
con cast a mano y `Miga.search` era un `Record<string, string>`. Un valor mal
escrito compilaba, pasaba el typecheck y en runtime caía en la primera pestaña
sin decir nada. Ese modo de falla —la navegación rota en silencio— es el que ya
había mandado a alguien a la pestaña equivocada después de guardar una colección.

Con rutas reales el destino es el path, el router valida, y `?tab=` desaparece
junto con sus doce call sites.

`/contenido` se conserva como ruta que redirige a `/contenido/secciones`. No se
borra porque quedan enlaces vivos —marcadores, historial— y un 404 sería peor.

**Las migas arrancan en la subpantalla**
ADR-096 las dejó como `Contenido → Colecciones → Nueva colección`. Ahora
`/contenido` redirige, así que esas dos primeras migas llevarían al mismo lugar.
Quedan en `Colecciones → Nueva colección`, y el tipo `Miga` pierde el campo
`search`, que existía sólo para esto.

**Lo que se ganó sin buscarlo**
Cada pantalla es su propio módulo y su propio chunk; el botón «Nueva categoría»
pudo volver al encabezado —antes vivía en una franja aparte porque la pantalla
compartida no podía tener tres acciones distintas—; y el smoke pasó de comprobar
que existe un `role="tab"` a comprobar que el grupo despliega y que cada entrada
llega a su pantalla, que es lo que la persona hace.

**Un helper de test que estaba mal desde antes**
`abrirSidebar` del smoke daba por hecho que en mobile el sheet estaba cerrado.
Con el disclosure eso dejó de ser cierto —desplegar no navega, así que el menú se
queda abierto— y la función se colgaba esperando que desapareciera. Se lo hizo
idempotente distinguiendo «abierto» de «cerrándose» con `data-ending-style`, que
es lo que marca Base UI mientras el panel se va. Preguntarlo con `getAttribute`
no sirve: sobre un elemento que puede no existir, espera hasta el timeout. Va en
el selector.

---

## ADR-099 — Los eventos aportan el denominador; `orders` aporta el dinero

**Fecha:** 2026-08-30
**Estado:** Accepted — **cierra P-003**

**Contexto**
ADR-067 dejó el resumen del Admin derivado de los pedidos y difirió el
seguimiento de navegación a esta fase, con un criterio que sigue mandando: media
capacidad de analytics es peor que ninguna, porque el panel invita a leer tasas
que no puede calcular.

El Definition of Done pide dos cosas —«las métricas coinciden con orders para una
ventana de prueba» y «los eventos no bloquean UX»— y hay que decir algo
incómodo: **la primera no alcanza**. Como el numerador de la conversión sale de
`orders`, coincide siempre, esté el denominador podrido o no. Lo que hay que
cuidar es el denominador, y la mitad de esta decisión habla de qué **no** contar.

**P-003: Postgres, detrás de un puerto**
`AnalyticsDestination` vive en el core con su implementación en
`adapter-supabase`, y la elección es un `if` en el storefront, como
`proveedorDePago`. Se elige Postgres y no Analytics Engine porque el DoD exige
cruzar eventos con pedidos en una sola consulta, y un almacén aparte —que además
muestrea— no puede sostener esa igualdad. El puerto es lo que mantiene abierta la
migración que PROJECT.md §22 pide.

**La división del trabajo, que es la decisión de fondo**
Los eventos aportan sesiones y pasos del embudo. `orders` aporta pedidos e
importes. La conversión es pedidos no cancelados sobre sesiones, así que coincide
con la facturación **por construcción** y no por casualidad, y el log de eventos
se puede tirar entero sin perder una venta.

**Captura del lado del servidor, cero JavaScript**
Los ocho eventos tienen un momento en que el Worker ya está trabajando: el
middleware, el render del PDP, de la PLP y del checkout, y dos endpoints. Además
de no costar peso —el presupuesto es 25 KB gzip y `/politicas` ya usa las dos
islands que el test permite—, hace que el seguimiento no dependa de que el
visitante no tenga un bloqueador, y cumple el segundo DoD sin esfuerzo.

Se acumula en `Astro.locals` y se vuelca una vez por request, con `waitUntil`.
Con `splice(0)` y no una lectura: `Astro.rewrite` **vuelve a correr la cadena de
middleware dentro del mismo request** —el PDP reescribe a `/404`— y leyendo el
buffer se insertaba todo dos veces.

**Lo que no se cuenta, que es donde se decide si el número sirve**

- **Bots.** El sitio los invita a propósito (ADR-046) y el sitemap publica el
  catálogo entero. Como no aceptan cookies, cada petición suya sería una sesión.
- **Precargas.** El `ClientRouter` de la PLP precarga todos los enlaces al pasar
  el mouse 80 ms, y cada precarga es un GET real. No infla el embudo —viaja con
  la misma cookie— pero sí las vistas.

Los dos filtros están en el core con tests, y contra navegadores reales además de
contra bots: descartar un navegador es el error caro, porque deja la conversión
mirando al techo y el número sigue siendo plausible.

**La deduplicación va al escribir**
Tres eventos se repiten sin que nadie repita nada: `checkout_completed` cuando se
reintenta con la misma clave de idempotencia, `coupon_applied` en cada
revalidación del carrito, y `search` cada vez que la PLP reenvía `q` al cambiar
de faceta. Un índice único parcial sobre `(store_id, type, dedupe_key)` los
descarta. Al escribir y no al leer, para que el log crudo quede honesto: es lo que
va a mirar quien dude del número.

**Distinguir el alta del carrito exigió un campo**
A `/api/cart/validate` llegan seis llamadas distintas y un carrito de una línea
sin cupón es byte a byte idéntico en todas. `addToCart` manda `intent: 'add'`; el
endpoint lo ignora salvo para el evento, así que es aditivo.

**La conversión sólo cuenta el tramo medido**
Apareció mirando el panel, no el código: decía «Compraron 6 · 600 %». `orders`
viene de la Fase 5 y está lleno; `store_events` nace hoy. Pedir «últimos 30 días»
el primer día comparaba treinta días de pedidos contra unas horas de sesiones. No
era del entorno de prueba: es lo que iba a ver toda tienda que lo activara.

Los pedidos se cuentan desde `greatest(p_from, primer_evento)`, y la función
devuelve `medidoDesde` para que la pantalla lo diga. La identidad con
`admin_dashboard` no se pierde: se vuelve **condicional y explícita** —coinciden
cuando el período está medido entero, que es el estado normal—.

**Sesión anónima, sin banner**
Cookie propia, `HttpOnly`, `Secure`, `SameSite=Lax`, treinta minutos deslizantes,
y **sólo en respuestas HTML**: Astro adjunta las cookies al final de la cadena, y
sin esa condición viajaría también en el sitemap, que es la única respuesta con
`cache-control: public`. Sin IP y separada de la identidad del cliente
(PROJECT.md §23). No se usa la sesión del adapter de Cloudflare: su binding KV
está declarado sin `id`, cada sesión sería una escritura, y lo que hay que
guardar es un UUID que entra en la cookie.

**El carrito pasó a ser on-demand**
Con Workers Assets, una página que existe en disco se sirve **sin ejecutar el
Worker**: `/carrito` no producía ni vista ni cookie. Lo insidioso es que `astro
dev` y `astro preview` sirven todo por SSR, así que el número aparecía en
desarrollo y desaparecía al desplegar. `/politicas` y `/preguntas-frecuentes`
siguen estáticas y quedan declaradamente fuera de la medición, dicho en la
pantalla.

**Retención sin scheduler**
No hay `pg_cron`, ni cron trigger, ni acción programada. La purga de 180 días
viaja con el tráfico, con la misma compuerta por isolate que el drenaje de la cola
de correos. Techo declarado: si la tienda deja de recibir visitas, deja de
limpiarse — y una tienda sin visitas tampoco genera filas.

**Los errores no se tragan**
`enSegundoPlano` silencia los fallos, y acá eso sería lo peor: si el insert
fallara desde el primer despliegue, el sitio funcionaría perfecto y el panel
quedaría vacío sin una sola señal. Va con su propio `console.error`.

---

### Enmienda del 2026-09-20: faltaba el tercer descarte

Los dos descartes de arriba miran **la petición**. Faltaba el que mira **la
respuesta**, y era el que más pesaba: la página de error es `prerender = false`
a propósito (ADR-057), así que una ruta que no existe corre el middleware
entero, devuelve HTML y se anotaba como una página vista. Un escáner de
vulnerabilidades quedaba contado como visitante, y como no guarda cookies, cada
petición suya abría una sesión nueva.

Medido sobre el piloto antes de arreglarlo: **3823 de 6192 vistas y 1339 de 3278
sesiones eran de rutas inexistentes**. `/wp-admin/install.php` sola daba 584
sesiones. Como `sesiones` es el denominador de los tres escalones del embudo, el
panel venía subestimando la conversión en un 40% — exactamente el modo de falla
que este ADR describe («lo que se pudre es el denominador, en silencio»), con una
causa que no estaba prevista.

`cuentaComoVista` lo cierra: sólo cuenta un 200 con `content-type` de HTML, y
descarta `/404` porque la reescritura interna del PDP vuelve a entrar al
middleware —un solo 404 dejaba dos filas con rutas distintas—. Lo ya escrito se
purgó con `pnpm analytics:limpiar`.

Lo que sigue sin distinguirse, y ahora está en LIMITACIONES y en la nota al pie
del propio panel: un bot que pide la portada con user-agent de navegador y recibe
un 200. No hay señal para separarlo de una persona que entra y se va.

---

## ADR-100 — Un carrito vacío no se corrige, y por eso no resucita

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
El smoke del checkout fallaba de forma intermitente: después de comprar,
`/carrito` seguía mostrando el producto. Tres corridas idénticas daban verde,
verde, rojo, y la primera vez se registró como flake sin causa.

**La causa**
El checkout revalida el carrito contra el servidor y escribe la respuesta con
`replaceLines`. Al confirmar el pedido llama a `clear()` y navega — pero una
revalidación que ya había leído las líneas sigue viva y resuelve **después**,
escribiendo el carrito de antes. `location.assign` no detiene el JavaScript
pendiente: la navegación es asíncrona y la promesa alcanza a resolver.

El resultado para el comprador es del camino de dinero: llega a la confirmación
con su pedido hecho **y el carrito otra vez lleno**, listo para comprar lo mismo
de nuevo.

**La decisión**
`replaceLines` no escribe sobre un carrito vacío. Corregir es ajustar algo que
existe; un carrito vacío no tiene nada que ajustar, así que la única lectura
posible de «vacío» es que se vació a propósito — se compró, o se vació en otra
pestaña.

La guarda va en el store y no en quien llama porque **ahí está la escritura**: un
segundo llamador la heredaría, y el de hoy ya se olvidó una vez. Cubre además el
caso de las dos pestañas, que el arreglo en el checkout no habría cubierto.

ADR-115 acota esta regla: cuando el suscriptor es el que escribe, la guarda va en
el llamador, porque un store no puede saber quién escribió.

**Cómo se sabe que sirve**
Con un test determinista —agregar, `clear()`, `replaceLines` con lo que la
revalidación había leído— y con su sabotaje: quitar la guarda lo pone en rojo. La
carrera original no se puede reproducir a voluntad; su consecuencia sí.

Cambió el contrato: un test afirmaba que `replaceLines` escribe sobre un carrito
vacío. Se actualizó, que es lo honesto cuando la regla cambia por un motivo.

---

## ADR-101 — El margen se informa con su cobertura, o no se informa

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
El margen era el único ítem de la Fase 10 marcado como bloqueado, y no por
esfuerzo: por un dato que faltaba. `order_items` abre con este comentario —«Todo
lo que se muestra está copiado. Un pedido no vuelve al catálogo a averiguar
cuánto costaba»— y el costo había quedado fuera de ese «todo», aunque
`product_variants.cost` exista y se cargue por tres caminos.

**El costo se copia en la línea**
Mismo argumento que ya justifica copiar el título y el precio: el catálogo cambia
y el pedido tiene que poder decir cuánto se ganó **ese día**. Volver al catálogo
daría el costo de hoy.

Nullable a propósito. Hay comercios que no cargan costo, y los que lo cargan no
lo tienen en todo. Un `not null` con default cero diría margen del 100 %, y no
saber es mejor que mentir.

**Los pedidos viejos no se rellenan.** No tienen costo y no lo van a tener: se
cuentan como cobertura faltante, que es la verdad. Rellenarlos desde el catálogo
sería inventar un número con apariencia de histórico.

**La decisión de fondo: el margen nunca va solo**
Se informa siempre junto a **qué fracción de los ingresos tiene costo conocido**.
Un margen sobre cobertura parcial no es un margen: con la mitad del catálogo sin
costo cargado, sumar sólo lo que lo tiene da el doble de lo real y parece
excelente. Y sin ninguna línea con costo se muestra un guion, no un cero — cero
es un margen, «no sé» no lo es.

Es el mismo criterio que `medidoDesde` en la conversión (ADR-099): cuando una
métrica se apoya en datos parciales, se declara el hueco en vez de dar un número
que no se puede explicar. Los dos casos aparecieron igual, mirando la pantalla y
no el código.

**«Lo más vendido» se convierte en «Ventas por producto»**
El top cinco de la Fase 6 servía para mirar de reojo y no para decidir nada: sin
paginación, sin margen, sin export. Ahora es una tabla paginada con dos modos —lo
que más se vendió y lo que no se movió— y su export a CSV.

Los dos modos en una tabla y no en dos tarjetas porque son la misma mirada desde
dos lados: qué conviene reponer y qué está inmovilizando plata. Separarlos
obligaría a comparar entre dos listas que nunca están a la misma altura.

**«Lo que no se movió» sale del catálogo, no de los pedidos**, porque lo que no se
vendió no tiene líneas. Por eso trae el stock: sin él, «no se vendió» es una
curiosidad; con él es cuánta plata está quieta. Un producto en borrador no
aparece — no es algo que no se mueve, es algo que todavía no salió.

**Dónde vive cada cosa**
Se mantiene la línea de ADR-067, ahora enunciada: **el Resumen responde por el
dinero y Analytics por el comportamiento.** Unidades, margen y ventas por
producto son dinero —lo quieto es capital parado— y van al Resumen. Sesiones,
embudo y búsquedas son comportamiento y siguen en Analytics.

**El export recorre la paginación**
No se pide «todo de una» ni en la pantalla ni en el RPC. La regla de ADR-024 —un
catálogo grande no entra en una consulta— no tiene una excepción para los
informes, y el export del catálogo ya resolvió esto igual.

En el CSV, un margen desconocido va **vacío y no cero**: en una planilla un cero
se suma y miente el total.

---

## ADR-102 — Un aviso que no salió se ve en el pedido

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
Deuda de la Fase 7 que el ROADMAP tenía anotada: un correo que falla cinco veces
se abandona **en silencio**. Queda en `notification_outbox` con `attempts = 5` y
nadie se entera. El comprador espera un aviso que no va a llegar y el comercio
cree que salió — y «te confirmamos el pedido» es parte de la venta, no una
cortesía.

**En el detalle del pedido, no en una pantalla de cola**
Es donde el operador está cuando le importa: está mirando ese pedido porque el
cliente preguntó. Una bandeja de la cola entera sería otra pantalla, y obligaría
a cruzar dos listas para responder una pregunta sobre un pedido.

Se distingue **en cola** de **abandonado**, porque la acción es distinta: uno sale
solo con la próxima visita al sitio, el otro no va a salir nunca y hay que avisar
por otro medio. Un solo mensaje para los dos casos habría hecho que el operador
persiguiera correos que estaban por salir.

**Por RPC y no por consulta**
`notification_outbox` no tiene políticas a propósito: guarda el pedido serializado
con la dirección del comprador. La función devuelve **metadatos y nunca el
payload** —qué aviso, a quién, cuántos intentos, si salió—.

Es `security definer`, así que saltea RLS: el filtro por organización es una línea
de esa función y ninguna otra. Sin ella, cualquier usuario del Admin leería la
cola de cualquier comercio pasando un id. Va con su test, y el test del comercio
ajeno existe justamente porque ese filtro no lo cubre nada más.

**Un fallo al leer los avisos no tapa el pedido.** Si el RPC falla, la lista viene
vacía y la venta se abre igual: no saber si el correo salió es malo, no poder ver
el pedido es peor.

---

## ADR-103 — El Admin gana un Worker, y existe sólo donde hace falta un secreto

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
ADR-068 dejó esto anotado y sin resolver: «invitar por correo desde la interfaz
exigiría una superficie de servidor propia del Admin —hoy no existe— y eso es un
ADR aparte». La Fase 11 lo obliga. BYOK guarda la clave de OpenAI de cada
comercio cifrada, y descifrarla en el navegador sería no cifrarla.

**El Worker va en el Admin, no en el storefront**
`apps/admin/wrangler.jsonc` suma un `main` y un `run_worker_first` acotado a
`/api/`, sobre el `assets` que ya tenía. Verificado contra la documentación de
Cloudflare y después **contra el sitio desplegado**: esas rutas ejecutan el
Worker y todo lo demás sigue cayendo en el `index.html` del SPA.

Las dos alternativas se descartaron por lo mismo, el radio de daño:

- **Una ruta en el Worker del storefront** era el diff más chico —cero
  infraestructura nueva— pero es cross-origin, así que exige montar CORS, y sobre
  todo pone la clave maestra de descifrado en el Worker público de más tráfico,
  que hoy no tiene un solo secreto de administración.
- **Una Edge Function de Supabase** corre en Deno, y los paquetes `@pick/*` se
  consumen como fuente TypeScript sin build (ADR-029). El filtro de campos
  prohibidos y el armado del prompt habría que duplicarlos o construirlos aparte,
  y dejarían de correr bajo `pnpm test`. Es el argumento decisivo: la regla que
  impide que la IA invente un precio no puede vivir en una copia.

**El Worker no tiene la secret key de Supabase, y no la va a tener**
Toma el `Authorization` de quien llamó y arma `clienteDeUsuario` con esa
identidad. Las funciones `ai_credential_*` son `security definer` y verifican
`settings.write` por su cuenta, así que **la autorización sigue estando en
Postgres**, que es donde está la del resto del Admin. El corolario es el que
importa: un agujero en este código no da acceso a la base más allá del que ya
tenía quien llamó.

Su único secreto propio es la clave maestra de cifrado.

**Sólo tres rutas, y las tres necesitan esa clave**
Leer si hay credencial y quitarla van directo por RPC desde el browser, como todo
lo demás del Admin. La regla queda enunciada para la próxima ruta que alguien
quiera agregar: **si no necesita la clave maestra, no va acá.** Sin ese criterio,
un servidor recién creado se llena de proxies que sólo agregan un salto.

**Dos runtimes, un handler**
En producción y en el e2e lo ejecuta workerd; en `pnpm dev` lo monta un plugin de
Vite de quince líneas que llama a **la misma función** `manejar`. No hay dos
implementaciones que puedan divergir, sólo dos runtimes, y el handler usa nada
más que APIs web estándar. Sin el plugin, una ruta nueva daría 404 en desarrollo
y andaría al desplegar — la divergencia al revés de la habitual, y por eso más
difícil de notar.

**El e2e del Admin pasó a `wrangler dev`**
Servía `dist` con `vite preview`, que no ejecuta ningún Worker: una ruta bajo
`/api/` habría dado 404 y los tests habrían pasado en verde sin probar nada. Es
además lo que el propio comentario de `playwright.config.ts` argumenta para el
storefront —correr contra el artefacto que se despliega— y de lo que el Admin era
la única excepción.

**Lo que el e2e no cubre, medido y no supuesto:** quitar `run_worker_first` deja
la suite en verde, porque `wrangler dev` ejecuta el Worker para una ruta sin
asset la declare o no. Esa configuración se verifica desplegando y pidiéndole una
ruta `/api/` al sitio real. Está escrito en el spec para que nadie lea el verde
como una garantía que no da.

---

## ADR-104 — La IA propone; aplicar y guardar es de la persona

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
El ROADMAP pide «human review antes de datos dudosos» y «prohibir inventar datos
críticos». La forma habitual de cumplirlo es una pantalla de aprobación, con su
estado intermedio, su cola y su permiso.

**No hay ninguna escritura nueva**
El enriquecimiento devuelve una propuesta al navegador y cada campo tiene su
«Usar», que es un `setValue` sobre el formulario que ya existía. Guardar sigue
siendo el botón de siempre, con `admin_save_product`. La revisión humana no es
una etapa del flujo: **es que no existe ningún camino por el que un dato
propuesto llegue a la base sin que alguien lo haya mirado y apretado.** Una
pantalla de aprobación habría agregado un estado que hay que mantener para
garantizar lo que la ausencia de escritura ya garantiza.

**Lo que no se propone, no se pide**
Los campos prohibidos —SKU, código de barras, stock, costo, precio, impuestos— no
están en el esquema de la respuesta, y en modo estricto la API no puede devolver
lo que el esquema no declara. La prohibición vive en el contrato y no en un
pedido dentro del prompt, que es una sugerencia.

Aun así el servidor recorta la respuesta a los campos permitidos, y el atributo
libre se filtra con el mismo criterio: `attributes` admite cualquier par, así que
un «Precio: 90.000» ahí adentro terminaría en la ficha igual. Es la puerta de
atrás del esquema estricto, y tiene su test.

Que el filtro sea redundante es el punto: **es lo que hace la regla
verificable.** El test le mete un precio y afirma que sale sin él. Sin eso,
«prohibir inventar datos críticos» es una frase en un ROADMAP.

**La categoría se resuelve contra las que existen**
El modelo devuelve un nombre y el servidor lo busca entre las categorías de la
tienda; sin coincidencia, la propuesta sale sin categoría. Una inventada no rompe
nada al proponerse, pero el operador la aplicaría creyendo que existe y el
producto quedaría sin clasificar — peor que verlo vacío, porque parece resuelto.

La comparación es por `slugify`, el mismo normalizador que ya usa el catálogo
para el handle, así que «Calzado Deportivo» y «calzado deportivo» son el mismo
nombre acá y allá.

**El ERP conserva autoridad también frente a la IA**
Un campo que administra el ERP se muestra en la propuesta pero **no se puede
aplicar**. En el formulario está deshabilitado, pero un `setValue` lo cambiaría
igual y el producto se guardaría con un valor que nadie escribió y que el próximo
sync pisa sin avisar. Es el mismo argumento de ADR-056, ahora con un actor nuevo.

**Se enriquece lo que está en pantalla**
El borrador viaja en el cuerpo del pedido en vez de leerse de la base: incluye los
cambios sin guardar, que es lo que el operador está mirando, y ahorra una
consulta. No hay riesgo de autorización en eso — lo único que el servidor decide
por su cuenta es si esta persona puede usar la credencial de esta tienda, y eso
lo decide el RPC.

**Los atributos son de la variante, y las fotos del producto**
Así que la correspondencia no es automática: la elige quien mira, con un selector
que sólo aparece si hay más de una variante. Y se **suman** a los que ya están en
vez de reemplazarlos, porque la IA mira una foto y no sabe el talle.

**Visión sobre las fotos que ya están**
El bucket `product-media` es público (ADR-082), así que las URLs se le pasan a
OpenAI tal cual, sin firmar nada. Tope de tres imágenes: la cuarta son ángulos
del mismo objeto y la paga el comercio. Si algún día el bucket se vuelve privado,
OpenAI recibe un 403 y la sugerencia empeora **en silencio**; queda dicho en el
adapter, que es donde se va a leer.

**Tags y SEO quedan afuera porque no tienen dónde caer.** `products` no tiene esas
columnas, y agregarlas para llenar un campo que nadie lee sería una migración
inventada: el SEO ya se deriva del título y la descripción, así que enriquecer
esos dos lo enriquece por construcción.

---

## ADR-105 — La credencial de IA se cifra contra una filtración de la base, y eso es todo lo que promete

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
BYOK: la clave de OpenAI es del comercio (PROJECT.md §25). Se guarda cifrada con
AES-GCM y la clave maestra vive sólo en el Worker del Admin, así que la tabla
entera no alcanza para usar la credencial de nadie.

**Qué protege, dicho sin adornos**
Una **filtración de la base**: un dump, un backup mal guardado, una política de
RLS rota. **No** protege del propio dueño del comercio, que es quien cargó la
clave y puede volver a pedir el ciphertext con el permiso que ya tiene. Decirlo
importa: un ADR que insinúe más de lo que da hace que alguien apoye una decisión
futura en una garantía que no existe, y ya pasó acá (ADR-032).

**Tabla propia, sin ninguna política**
No va en `store_settings`, que tiene política de lectura para todo miembro de la
organización: un `viewer` leería el ciphertext. Va en `ai_credentials` con el
molde de `notification_outbox` —RLS activa y ninguna política— y todo pasa por
tres funciones `security definer`.

**Tres funciones y no una con bandera**
`ai_credential_status` devuelve si hay credencial, en qué termina y con qué
modelo. `ai_credential_secret` devuelve el ciphertext. `admin_save_ai_credential`
guarda o borra. Un parámetro que decidiera si devolver el secreto es exactamente
la forma en que un día se devuelve el secreto: alcanza con una llamada que lo
pase mal. Las tres verifican `settings.write` en su primera línea, y el test del
comercio ajeno está tres veces porque cada `security definer` tiene su guarda y
equivocarse en una no rompe las otras dos.

**El iv va adentro del paquete**
Doce bytes al frente del ciphertext, todo en una columna. Con dos columnas hay
dos formas de que queden desparejas —una migración que copia una y no la otra, un
update parcial— y ninguna falla ruidosamente.

**GCM y no CBC** porque autentica: un ciphertext adulterado lanza en vez de
descifrar a basura. Tiene su test, y corrió también dentro de workerd: el cifrado
nunca se había ejecutado ahí y `crypto.subtle` es lo único de este módulo que
podía comportarse distinto entre runtimes.

**Sin versión de clave.** Rotar la maestra invalida lo guardado y hay que volver a
cargar las credenciales a mano. Es una decisión: hoy no hay ninguna en
producción, y una columna de versión sin nada que versionar es la abstracción que
la regla anti-overengineering desaconseja. Queda anotado en el código y en
INFRAESTRUCTURA, que es donde lo va a buscar quien rote.

**Guardar audita, y la auditoría no lleva el secreto**
En la misma transacción, por el criterio de ADR-069: cambiar la credencial de IA
de un comercio es un evento de seguridad. Registra qué pasó, quién y los últimos
cuatro caracteres — que alcanzan para reconocer cuál se cambió y para nada más.

**Se prueba antes de guardar**
El Worker le pide la lista de modelos a OpenAI —que no consume tokens— y sólo
entonces cifra y guarda. Una credencial que no sirve guardada sería una pantalla
que dice «configurada» y un botón que falla siempre. El botón de «Probar
conexión» queda igual para después: una clave se revoca del otro lado sin avisar.

**Dos clases de error, tratadas distinto**
Lo que dice OpenAI se le muestra al operador —es su cuenta y su factura, y
«rechazó la credencial» es lo que necesita para resolverlo—; lo que dice Postgres
queda en el log, porque publica nombres de tablas y no le sirve a nadie del otro
lado. Es la diferencia con el storefront, donde el mensaje del adapter nunca sale
porque lo leería un comprador.

Y un caso aparte: un JWT que la base rechaza sale como 401 «volvé a iniciar
sesión» y no como «probá de nuevo». Se descubrió probando el Worker contra la
base real, no leyendo el código, y sin eso una sesión vencida dejaba al Admin
repitiendo un botón que nunca iba a andar. Se distingue por el código de
PostgREST y no por el texto del mensaje, que cambia según el motivo y está en
inglés.

**El modelo lo elige el comercio**
Tres opciones con su precio a la vista, porque el que paga es él. Un modelo
guardado que ya no esté en la lista **no** cae al de por defecto: la llamada
falla diciendo que hay que elegir otro. Cambiarle el modelo a alguien sin avisar
es cambiarle la factura.

---

## ADR-106 — La tienda dice su nombre, y el presupuesto de peso se muda al e2e

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
`storeName: 'Pick Demo'` estuvo fijo en el código del storefront desde la Fase 1,
con un comentario que decía que en la Fase 3 pasaría a leerse de la base. Se
descubrió en la 8 y se arregla en la 12. El alcance era peor de lo anotado: no
era una constante sino **nueve títulos** con «Pick Demo» escrito a mano, más el
encabezado y el pie. Cualquier comercio servido por este Worker se anunciaba como
la demo, incluido el `<title>` que indexa un buscador.

**El nombre sale de `stores.name`, y el título lo compone el layout**
Cada página pasa sólo su parte —«Políticas», «Carrito»— y `Base.astro` agrega
`· ${nombre}`. Componerlo en un solo lugar es lo que hace imposible que la
próxima página se olvide; con el título entero en cada una, la novena repitió el
error de la primera.

**`siteUrl` **no** se toca: sigue siendo del despliegue.** No es el dominio desde
el que se sirve sino el que se declara público, y de él salen el canonical, el
`og:url` y el sitemap. Fijarlo por despliegue es lo que impide que dos hosts que
sirven lo mismo produzcan dos canonical distintos. Se verificó contra producción
antes de tocarlo: `SITE_URL` está bien puesta y el `robots.txt` desplegado apunta
a donde debe. Lo que sí se corrigió es su fallback, que era un dominio que no
existe.

**El anuncio se deriva del envío**
La barra decía «Envío gratis en compras superiores a Gs. 500.000» en toda tienda
que se sirviera, sin que nada lo respaldara. Ahora sale del mismo número que
cobra `create_order`: no puede prometer algo que la caja no vaya a cumplir, y
desaparece sola donde no hay envío gratis. Un anuncio libre es contenido, y para
eso está el CMS.

**Las páginas de contenido pasan a on-demand**
Con Workers Assets, una página que existe en disco **se sirve sin ejecutar el
Worker**, así que no puede preguntar de qué tienda es. `Políticas` y `Preguntas
frecuentes` llevan el nombre en el encabezado, así que dejan de prerenderizarse.

`robots.txt` y el índice de sitemaps **no**: sólo usan `siteUrl`. Para que eso
quedara dicho en los tipos y no en un comentario, se separó `OrigenDelSitio`
—dónde se sirve el sitio— de `SeoContexto` —eso más quién es el comercio—. Una
función que pide lo primero no puede depender de la base por accidente.

**Y eso deja a `pnpm budget` sin nada que medir, así que se retira**
Medía exactamente esas dos páginas leyendo el build en disco; con todo on-demand,
`dist/client` no contiene HTML. Su lista `ESPERADAS` falló al primer build, que
es justamente para lo que estaba.

El control no se pierde, se muda a `e2e/performance.spec.ts`, que ya medía sobre
la red y sólo le faltaba comprimir. Cubre **más** que antes —home, catálogo, PDP
y contenido, en vez de dos páginas— y mide el artefacto servido en vez del build
escrito. Antes de borrar nada se comprobó la paridad: la medición nueva da
**21,2 KB**, el mismo número exacto que daba la vieja.

**El catálogo no entraba en el presupuesto, y nadie lo sabía**
Al medirlo por primera vez dio **26,6 KB** contra los 25 declarados. No es una
regresión: es el `ClientRouter`, unos 5,6 KB que se compraron a propósito para
que filtrar no recargue la página, y el catálogo nunca dejó HTML en disco, así
que `pnpm budget` jamás lo pesó. Se le da su propio presupuesto de 28 KB con el
motivo escrito, en vez de aflojar el de todo el sitio para que entre uno.

**Efecto secundario que cierra un hueco:** las dos páginas de contenido ahora
producen vista y sesión, así que analytics dejó de tener páginas fuera de la
medición. El panel decía que no las contaba; ahora dice que las cuenta.

**Corrección del 2026-09-14: el presupuesto es una señal, no una compuerta.**
El dueño del proyecto lo fijó así después de que el corazón de la wishlist
pusiera el catálogo 149 bytes por encima del tope:

> No pasa nada si se pasa del presupuesto de peso. Ya estamos ahorrando usando
> Astro, así que no es limitante.

O sea: cuando un número de estos bloquea algo, **se sube el número y se escribe
el motivo**; no se tuerce el diseño para entrar. Lo que el presupuesto sigue
haciendo, y para lo que se lo quiere, es avisar cuando una página engorda sin
que nadie lo haya decidido — que es distinto de prohibir que engorde.

El caso que lo disparó igual terminó bien por otro motivo: la island se cambió
por un componente `.astro` con un `<script>` que Astro emite una vez, y eso es
menos código y cero hidratación por tarjeta. El ahorro de peso fue 0,3 KB y no
era el punto.

---

## ADR-107 — El envío lo calcula el servidor, y el pedido lo guarda

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
PROJECT.md §13 pide `shipping` entre lo que un pedido debe conservar y no existía:
`orders` guardaba `total_amount` a secas. Un comercio que despacha lo cobraba por
fuera del sistema, y el pedido decía que se pagó menos de lo que se pagó.

**Lo mínimo completo: una tarifa plana y un umbral**
Zonas, transportistas, cálculo por peso y retiro en sucursal quedan fuera.
«Pickup por sucursal» está en la Fase 0 de v2, así que adelantarlo acá sería
construir la mitad de una feature que ya tiene lugar.

**Se calcula en el servidor, como el descuento**
`create_order` lo lee de `store_settings` y lo suma; el carrito no manda un
importe de envío ni podría, porque sería el número que decide cuánto se cobra
elegido por quien paga. El checkout muestra el mismo número porque llama a la
**misma función del core** que replica la cuenta en SQL, no a una aproximación.
Hay un test que manda un envío de cero en el payload y afirma que se cobra igual.

**El umbral se mide contra el subtotal ya descontado.** Es la lectura honesta de
«compras desde X»: contra el subtotal sin descontar se regalaría el envío por una
compra que terminó costando menos que el umbral.

**El default es no cobrar.** Una tienda recién creada que empezara cobrando un
envío que nadie configuró le sumaría plata al total sin que el comercio lo sepa.
El silencio se resuelve hacia el lado que no cobra de más, igual que la
configuración de moneda y la de pagos.

**Una columna generada rompió por lo que no se ve**
`subtotal_amount` es `total + descuento`, y esa identidad valía mientras el total
era `subtotal − descuento`. Con el envío adentro pasaba a valer `subtotal +
envío`: el pedido informaba un subtotal de productos que incluía el flete y la
ficha no cerraba consigo misma.

Lo encontró el test, no la lectura del código, y es el riesgo propio de una
columna derivada: nadie tiene que acordarse de actualizarla, y por eso nadie se
acuerda de que existe cuando cambia la fórmula de la que depende. Ahora es
`total + descuento − envío`.

**«Ventas» del panel incluye el envío, y es a propósito.** Es lo facturado, que
es contra lo que un comercio concilia el banco. El margen y su cobertura se
calculan **sólo sobre las líneas de producto** (ADR-101), así que el envío no los
diluye: son dos preguntas distintas y cada una toma el número que le corresponde.

---

## ADR-108 — Un pedido de demostración se crea, se ve y no le escribe a nadie

**Fecha:** 2026-08-30
**Estado:** Accepted

**Contexto**
La demo pública crea pedidos reales y encola correos. Cada prospecto que prueba
deja un pedido indistinguible de uno de verdad y, con un dominio verificado en
Resend, le llega un aviso a quien haya escrito su dirección en un formulario de
demostración.

**El pedido se crea igual**
No se ramifica `create_order` ni se simula la confirmación. El prospecto tiene que
**ver el pedido entrar al Admin**: es la mitad de lo que se le está mostrando, y
una confirmación falsa no muestra nada. La alternativa —no escribir nada— era más
limpia y vendía menos, además de abrir una rama en el camino de dinero, que es el
que menos conviene ramificar.

**Un flag por tienda, no una tienda especial**
`store_settings.demo`, que `create_order` lee en la misma consulta que ya hace
para el envío: una lectura, dos usos. El pedido queda marcado con `is_demo`, y el
que corta los correos es el trigger de la cola —dos líneas junto a la guarda de
«sin correo no hay a quién escribirle», que es el mismo tipo de corte.

La comparación es exacta contra `true`, como en el core: un `demo: "no"` guardado
por error no puede apagarle los avisos a una tienda real. Y con `coalesce`,
porque `NULL = 'true'` da NULL y no falso — sin eso **todo pedido de toda tienda
sin configurar fallaba**, que es lo que encontró el test al primer intento.

**La marca queda en el pedido, no sólo en la tienda**
Importa cuando una tienda deja de ser demostración y se pone a vender: los
pedidos de antes siguen ahí, y el Admin los muestra marcados para que nadie los
despache. Guardarlo sólo en la configuración habría hecho que al apagar el modo
todos parecieran reales.

**El checkout lo avisa antes, no después.** Quien compra tiene que saber que no
va a recibir nada mientras todavía puede decidir.

---

## ADR-109 — El vocabulario de interacción del Admin

**Fecha:** 2026-08-31
**Estado:** Accepted

**Contexto**
Un repaso de las pantallas encontró que el Admin no tenía una forma de editar
sino varias, y que las tres piezas más usadas —editar, elegir, guardar— estaban
resueltas con lo más barato en cada pantalla. No es un problema estético: cada
una tenía un fallo concreto y comprobable.

**Editar abre un panel, no un formulario encima de la lista**
Con el formulario arriba, editar el último elemento de una lista mandaba la vista
al tope y había que desplazarse hasta arriba para escribir. El panel es un modal
en pantalla ancha y una hoja desde abajo en teléfono: la lista queda detrás —que
era la razón de editar en línea— sin mover el scroll.

Se descartó el panel lateral, que en desktop tapa justo la columna de acciones, y
la página propia por elemento, que para cuatro campos es un viaje de ida y vuelta
que pierde la lista de vista. Cuando un formulario crezca, su lugar **sí** es una
página; producto y promoción ya la tienen.

Efecto que no se buscaba y conviene registrar: con el panel abierto **no se puede
cambiar de tienda**, porque es modal. Eso cierra por construcción el fallo que
antes cubría un test —un borrador de una tienda guardándose en otra— y el test
pasó a comprobar la otra mitad, que el borrador se descarta si la tienda cambia.

**Las acciones de un formulario largo van al pie, pegajosas**
Vivían arriba a la derecha: al bajar a llenar un formulario de tres tarjetas, el
botón de guardar dejaba de verse. `sticky` y no `fixed` — una barra fija flota
sobre el contenido y en un teléfono tapa el último campo justo cuando se lo está
completando.

Ojo con lo que `sticky` **no** resuelve: mientras se recorre el medio de la
página, la barra sí cubre una franja. Se vio en una captura tapando el editor de
slides, que además traía su propio par de botones. Por eso ese editor pasó al
panel: dos «Guardar» compitiendo era peor que el problema original.

**Los desplegables son el Select de shadcn, detrás de un envoltorio**
El `<select>` nativo no se puede estilar de forma consistente entre navegadores y
no admite grupos con el mismo aspecto que el resto del Admin. La forma completa
del componente son cinco elementos anidados, y repetirlos en las veintipico de
pantallas que tienen un desplegable garantiza que alguna se escriba distinto: el
envoltorio deja el sitio de llamada tan corto como estaba —el control más sus
opciones— y los primitivos siguen disponibles para lo que necesite más.

Dos cosas que sólo aparecieron al mirarlo funcionando:

- El disparador mostraba el **valor** y no la etiqueta: una fila de pedido decía
  «received» en vez de «Recibido», y un filtro sin elegir quedaba vacío. Base UI
  lo resuelve con `items` en el `Root`, que se arma leyendo las propias opciones
  para que ninguna pantalla escriba las etiquetas dos veces.
- Los que estaban atados a react-hook-form con `register` dejaron de funcionar:
  un control de Base UI devuelve el valor elegido y no un evento, así que
  derramarle los manejadores no lo conecta con nada. Se leen con `useWatch` y se
  escriben con `setValue`, que es lo que esos formularios ya hacían con sus
  interruptores.

Y uno que el cambio **eliminó**: la lista de pedidos devolvía el `<select>` a su
valor anterior antes de preguntar si cancelar, porque el control nativo ya se
había movido solo. Un control controlado no se mueve hasta que el dato cambia, y
esa compensación se fue con su comentario.

**Los íconos son Hugeicons**
Reemplazan a lucide, que se desinstaló. Hugeicons no exporta componentes sino
**datos** de SVG que se dibujan con `<HugeiconsIcon icon={…} />`, y el Admin pasa
íconos como componentes por todos lados: el menú, las cabeceras de pantalla y los
botones de icono los reciben como prop.

Por eso hay un módulo puente, `components/iconos.tsx`, que envuelve cada dato en
un componente con la forma de llamada anterior. La alternativa era reescribir las
veintipico de pantallas y, de paso, perder el patrón de «pasá el ícono como
prop». El puente además concentra el inventario: el próximo cambio de librería es
ese archivo y no una búsqueda por todo el repositorio.

Dos nombres no existen en la librería nueva y quedan mapeados con su motivo a la
vista: `ChevronsUpDown` es `UnfoldMore` y `Trash2` es `Trash`. Los otros
veinticinco coinciden exactamente, lo que hizo que el cambio fuera una línea de
import por archivo.

**Se probó rellenar los íconos y se descartó.** Lucide y Hugeicons son de trazo;
`fill="currentColor"` funciona en los que son formas cerradas y no hace nada en
los que son líneas —el porcentaje, las barras del gráfico—, así que el menú
quedaba mezclado. Se midió con una captura antes de decidir.

**Subir una imagen es una zona de arrastre**
Reemplaza al `<input type="file">` crudo. El input sigue existiendo debajo,
oculto pero real, y la zona es un `<button>`: el teclado la alcanza con Tab y la
activa con Enter sin reimplementar nada. Arrastrar es un atajo, no el único
camino.

**Qué no cambió, y por qué se nombra**
El storefront no usa nada de esto. Su `<select>` de orden sigue siendo nativo:
es una página que se resuelve en el servidor, sin JavaScript propio, y un
desplegable de Base UI ahí costaría hidratación en el camino que tiene
presupuesto de peso.

---

## ADR-110 — Un cliente es una app en el monorepo, no un fork ni un despliegue de la demo

**Fecha:** 2026-09-02
**Estado:** Accepted

**Contexto**
Llegó el primer cliente real, Treeshop. `ONBOARDING.md` asumía que un comercio
nuevo era la misma `apps/demo` desplegada con otro `STOREFRONT_DOMAIN`, y eso
alcanza para una tienda que se conforme con el diseño de la demo. Treeshop no:
tipografía, color, header con enlaces al centro e íconos, hero a pantalla
completa, pie propio. Nada de eso son datos, es disposición y estética.

**Decisión**
Cada cliente con diseño propio es **una app hermana en `apps/`**, en el mismo
repositorio: `apps/treeshop/` al lado de `apps/demo/`. Comparte la base, el
Admin y los paquetes `@pick/*`; tiene sus páginas, sus componentes de
disposición, su preset de tokens y su Worker.

Lo que decide qué va a cada lado:

- **Estructura y comportamiento van al paquete.** El slot `logo` del `Header`,
  el modo ícono de `CartButton`, el token `--radius-button`, `--color-media`, las
  flechas de los carruseles: cosas que el próximo cliente también va a pedir, y
  entran con el default igual para que la demo no cambie.
- **Disposición y estética van a la app.** El header de Treeshop, su pie, su
  hoja de estilos, su portada.
- **Datos van a la base.** Categorías, secciones de la portada, envío, pagos.

Y la regla que sostiene todo: **importar, nunca copiar.** Lo que se copie de
`packages/` a la app deja de recibir mejoras. Si un componente del paquete no
alcanza, se le agrega un prop o un slot; si lo que hace falta no existe, se
escribe en la app. Al segundo cliente que pida lo mismo, sube al paquete
(PROJECT.md §32).

**Por qué no un fork ni otro repositorio**
El repositorio pasó a privado justamente para esto. Un fork por cliente
convierte cada mejora del Core en un merge a mano, que es lo que CLAUDE.md
prohíbe desde el día uno. Y en otro repositorio se pierde lo que hace seguras
las mejoras: los paquetes se consumen como fuente (ADR-029) y `pnpm typecheck`
corre sobre todas las apps, así que un cambio incompatible rompe en la máquina
de quien lo hace y no en la tienda del cliente.

**Lo que sigue hardcodeado a la demo, y se sabe**
`e2e/global-setup.ts`, `global-teardown.ts` y `playwright.config.ts` construyen
y prueban `@pick/demo`. Treeshop se verificó a mano y con capturas; su e2e
propio es deuda registrada. El latido de CI también apunta sólo a la demo.

---

## ADR-111 — El catálogo de Camelot entra por un script, no por el puerto ERP

**Fecha:** 2026-09-02
**Estado:** Accepted

**Contexto**
Los productos de Treeshop viven en el Supabase de Camelot, su ecommerce
anterior: 21 tablas con productos, variantes, fotos, marcas, categorías y costos
de envío por departamento. El repo tiene un puerto `ERPAdapter` con matriz de
capacidades y un adapter para el Oracle de Estilo Sport.

**Decisión**
`scripts/camelot-importar.ts` lee el Supabase de Camelot por REST y escribe el
catálogo de Pick. **No implementa `ERPAdapter`.** El puerto modela un feed de
inventario: `ERPItem` lleva código, talla, stock y precio, y no tiene dónde
llevar una imagen ni una marca. Pasar Camelot por ahí perdería la mitad de lo
que se vino a buscar. Un puerto se justifica con dos implementaciones del mismo
contrato, y ésta no lo es: es una migración de catálogo, idempotente y
repetible, no un ERP en vivo. Si Camelot vuelve como fuente de stock en tiempo
real, ahí sí entra por el puerto.

**La conversión de moneda es la decisión de plata**
Camelot tiene dos monedas en una columna que dice PYG: 424 productos en
guaraníes y 3328 en dólares, con un hueco vacío entre 1000 y 20 000 que hace la
separación verificable. Se convierte a **6100 Gs/USD**, decidido con el cliente,
como constante con nombre. La moneda se decide **por producto** mirando su
precio, y el costo la hereda: decidirla campo por campo habría multiplicado por
6100 los costos de diez productos que ya estaban en guaraníes —el guard lo
encontró en «Ropa Interior Lupo Blanco», precio 29 930 y costo 19 950—. Un
precio que caiga en el hueco **aborta la corrida**: no se adivina un precio.

**Lo que se aprendió corriéndolo dos veces**
PostgREST corta en 1000 filas sin avisar, y paginar sin `order` no garantiza
páginas disjuntas: la segunda corrida daba por nuevos productos que ya estaban
y chocaba contra los índices únicos de `handle` y `sku`. Los dos están
arreglados y la idempotencia se verificó con tres corridas seguidas que no
crean nada. El daño lo evitaron las restricciones de la base, no el script.

---

## ADR-112 — Los productos sin stock salen del listado por defecto; los sin foto, si la tienda lo pide

**Fecha:** 2026-09-09
**Estado:** Accepted

**Contexto**
De los 3752 productos de Treeshop, 378 tienen todas sus variantes en cero. En
el catálogo aparecían con la insignia «Sin stock», que es lo que la demo hace a
propósito para enseñar la insignia. El cliente pidió que no aparezcan, con eso
como default.

**Decisión**
`catalog_search` deja fuera del listado, la búsqueda, las facetas y las
colecciones todo producto sin ninguna variante con stock, **salvo que la tienda
pida mostrarlos** con `store_settings.settings.catalog.showOutOfStock = true`,
que se administra desde Configuración → Catálogo. El default es ocultar.

El filtro vive **dentro de la función**, leyendo la configuración como ya hace
`create_order` con el envío y el modo demo, y no en un parámetro: el catálogo,
la portada y el sitemap la llaman por tres caminos, y un parámetro que uno de
ellos olvidara pasar sería un agotado apareciendo en un lugar y no en otro.

**Con `p_handle` no filtra.** El PDP de un producto agotado sigue existiendo,
con «Sin stock» a la vista: un enlace que ayer funcionaba no puede dar 404
porque se vendió la última.

**La demo lo enciende.** `pnpm seed` le pone `showOutOfStock: true` porque
tiene una remera agotada para enseñar la insignia y el smoke del checkout la
espera. Las tiendas que no lo tienen configurado —Estilo Sport— pasan a ocultar.

**Medido:** el filtro no cambia el tiempo del catálogo (~345 ms con y ~365 ms
sin, el mismo día; la diferencia con los 233 ms de la Fase 12 es del día, se
midió la función anterior en las mismas condiciones). La suite de PGlite tiene
el caso en las dos direcciones y sabotear el filtro la pone en rojo.

**Los sin foto, al revés: se muestran salvo que la tienda pida ocultarlos**
(`catalog.hideWithoutImage`, 2026-09-10). Apareció al ordenar Treeshop por
novedad: la tanda de agosto entró al Supabase de Camelot sin fotografiar
—177 de los 200 más nuevos, 159 de ellos Puma— y era las primeras seis páginas
de la tienda; la web oficial de Camelot no las muestra por lo mismo. El default
es distinto del stock a propósito: que no haya stock es universal, no se vende
lo que no hay; que no haya foto es merchandising, una ferretería vende sin foto,
y el fixture entero de la suite de paridad no tiene ninguna. Treeshop lo
enciende. Misma mecánica, mismo lector, misma tarjeta del Admin, mismo respeto
por `p_handle`.

**Y el orden por defecto de Treeshop es «Novedades».** «Relevancia» es el orden
de alta, y en un catálogo que entró entero en una corrida eso era el uuid:
azar, que es lo que ponía fotos horribles primero. El importador ahora conserva
la fecha de alta de Camelot en `products.created_at`, «Novedades» existe como
opción del `SortSelect` —la demo la acepta, con su default igual— y «En trendy»
pasó de lista a mano a colección dinámica ordenada por novedad, que se mueve
sola cuando Camelot carga mercadería.

---

## ADR-113 — Los carruseles ganan flechas y auto-avance, opt-in y con JavaScript

**Fecha:** 2026-09-09
**Estado:** Accepted — extiende ADR-038, no lo revierte

**Contexto**
ADR-038 dejó los carruseles por scroll-snap sin JavaScript, y `HeroSlider`
decía que el auto-avance «se agrega como island opt-in si un cliente lo pide».
Treeshop lo pidió: flechas en el hero y en las filas de productos, y que el
hero avance solo.

**Decisión**
Un solo script compartido, `commerce-astro/primitives/carrusel-controles.ts`,
sin framework, y un componente `CarouselControls` que dibuja las flechas.
`HeroSlider` y `ProductCarousel` lo montan sólo con `controles`; `autoplay`
trae los milisegundos. El default sigue siendo el de ADR-038: sin JavaScript,
por scroll nativo, y la demo no carga nada nuevo.

Lo que el script garantiza, y por qué:

- **Las flechas nacen `hidden`** y las muestra el script. Sin JavaScript no hay
  flechas, no un botón que no hace nada.
- **El auto-avance respeta `prefers-reduced-motion`** —no arranca— y **se
  detiene** con el puntero encima, con el foco adentro y con la pestaña oculta.
  Un carrusel que se mueve bajo el mouse de quien lee es un problema de
  accesibilidad, no un efecto.
- **Al final vuelve al principio**: un carrusel que se frena en la última
  tarjeta parece roto.
- Un script y no una island: no hay estado que hidratar, sólo dos botones y un
  intervalo, y Astro lo agrupa una vez por página aunque haya tres carruseles.

Verificado en el navegador con dos slides: siguiente mueve una pantalla,
anterior vuelve, avanza solo a los seis segundos y no se mueve con el puntero
encima.

---

## ADR-114 — El envío se cobra por zona, y una zona desconocida nunca es gratis

**Fecha:** 2026-09-11
**Estado:** Accepted — extiende ADR-107

**Contexto**
ADR-107 dejó el envío como tarifa plana con umbral de gratis, y difirió las
zonas. Treeshop trae de Camelot dieciocho departamentos con costo —hoy todos a
30 000, pero el cliente quiere poder diferenciarlos sin tocar código—.

**Decisión**
`settings.shipping` gana `mode: 'zones'`: una tabla `zones: [{ name, amount }]`
y la tarifa general `amount`, que en este modo es **lo que paga una zona que no
está en la tabla**. `freeFrom` vale igual en los dos modos.

El comprador elige la zona en el checkout —un `<select>` que la página arma con
la tarifa escrita— y el importe se calcula donde siempre: `/api/cart/validate`
lo cotiza para el resumen y `create_order` lo cobra al confirmar, buscando la
zona por nombre sin distinguir mayúsculas ni espacios. La misma comparación vive
en `zonaDeEnvio` del core, que es lo que el endpoint del checkout usa para
rechazar una zona que no esté en la tabla antes de crear el pedido.

**La regla que importa: una zona desconocida, o ninguna, cobra la general y
nunca cero.** En el envío plano el silencio era un comercio que no configuró, y
se resolvía no cobrando. Acá el silencio es un comprador que no eligió, y
resolverlo regalando el envío sería un cobro decidido por quien paga — lo mismo
que ya se impide con el precio y con el descuento.

La zona queda guardada en `orders.address.zone` y se muestra en la confirmación,
el correo y el Admin.

**Lo que no entró**: zonas anidadas, tarifas por peso, transportistas y retiro
en sucursal. Pickup sigue en v2.

**Verificado**: 17 unitarios del core y 4 casos en PGlite —zona elegida, sin
distinguir mayúsculas, desconocida, ninguna, umbral, y que la zona se guarda—;
sabotear la rama de zona en `create_order` pone la suite en rojo. Treeshop
quedó sembrado con los dieciocho departamentos desde `delivery_costs`.

---

## ADR-115 — La guarda de una suscripción va en el llamador

**Fecha:** 2026-09-11
**Estado:** Accepted — acota la lectura de ADR-100, no lo revierte

**Contexto**
El checkout hace dos cosas con el espejo del carrito: lo revalida contra el
servidor y **lo corrige** con la respuesta (ADR-100), y está suscripto para
enterarse si la persona edita el carrito en otra pestaña. Las dos juntas se
llaman entre sí: `revalidar` escribe con `replaceLines`, el store avisa a los
suscriptos, la suscripción del propio formulario lo recibe y vuelve a revalidar.
Una petición al servidor por respuesta mientras el checkout esté abierto, en el
camino del dinero.

El defecto vivía desde la Fase 5 y no lo destapó ningún test: lo destapó la
primera compra sobre `sontres.shop`, con 20 validaciones en cinco segundos y un
solo carrito (commit c1cb0c5).

**Decisión**
La escritura propia se marca y la suscripción la ignora: una bandera
—`escribiendo`, en `packages/commerce-ui/src/checkout/CheckoutForm.tsx:134`— que
se levanta alrededor de `replaceLines` y que el callback de `subscribe`
comprueba antes de revalidar. La guarda vive **en el llamador**.

Alcanza una bandera de ida y vuelta porque el aviso del store es un
`CustomEvent` despachado en la misma vuelta que la escritura
(`packages/commerce-ui/src/cart/store.ts:141`): entre el `try` y el `finally` no
se cuela nada asíncrono.

**Por qué no va en el store, y por qué eso acota ADR-100**
ADR-100 puso su guarda en `replaceLines` «y no en quien llama porque ahí está la
escritura: un segundo llamador la heredaría». Esa razón es correcta para esa
guarda —«no resucitar un carrito vacío» es una propiedad del dato, y la necesita
cualquiera que escriba— y **acá lleva al arreglo equivocado**: un store no puede
saber quién escribió. Aplicada al pie de la letra, la única forma de meter esta
guarda adentro sería comparar el contenido antes de avisar, y eso vuelve
silenciosa una corrección legítima: el espejo dejaría de avisar de un cambio real
de otra pestaña por parecerse al que se acaba de escribir.

Y no hay herencia que perder. De los cuatro llamadores de `subscribe`, sólo el
checkout escribe desde adentro de su propio callback: `CartButton.tsx:35`,
`CartDrawer.tsx:41` y `CartView.tsx:22` sólo leen. La bandera está en el único
lugar donde hace falta.

**Cómo se sabe que sirve**
El e2e del envío cuenta las respuestas de `/api/cart/validate` con el checkout
abierto y exige exactamente una (`e2e/checkout.spec.ts`); sin la bandera da ocho.

---

## ADR-116 — Una pestaña con un chunk viejo se recarga una vez

**Fecha:** 2026-09-11
**Estado:** Accepted

**Contexto**
El Admin trae cada pantalla por `import()` dinámico. Una pestaña abierta desde
antes del último deploy tiene en memoria un `index.html` que pide los chunks con
el hash viejo, y Workers Assets ya no los sirve: al abrir la primera pantalla que
todavía no tenía cargada muere con «Failed to fetch dynamically imported module»
y se queda ahí.

La causa real no es el deploy. El mismo síntoma apareció cuando el edge se quedó
un rato sin certificado al atar `admin.sontres.shop`: lo que falla es que **el
índice que la pestaña tiene en memoria ya no describe lo que el servidor sirve**,
y eso incluye fallos transitorios que no son un deploy.

**Decisión**
`pantalla()` —el único punto por donde entran las pantallas, en
`apps/admin/src/lib/pantalla.ts`— envuelve el `import()` y, si falla, recarga la
pestaña: la recarga trae el `index.html` vigente y con él los nombres vigentes.

**Una sola vez por pantalla**, marcada en `sessionStorage`. Recargar sin límite
convierte un fallo de red —que da el mismo error— en un bucle de recargas donde
la persona no llega ni a leer el mensaje; a la segunda, el error llega al límite
de errores y se ve. Una carga buena limpia la marca, así que un fallo posterior
vuelve a tener su recarga.

Mientras la recarga llega, la promesa se deja pendiente a propósito: se ve el
fallback de Suspense y no el límite de errores, para no pintar un error que está
por desaparecer.

**Verificado**
`apps/admin/src/lib/pantalla.test.ts`: una recarga al primer fallo, el error
propagado al segundo, y la marca limpiada por una carga buena. Y en el navegador
sobre el Admin desplegado, cortando la primera petición del chunk de Analytics.

---

## ADR-117 — El espejo de Camelot no pisa lo que la tienda editó

**Fecha:** 2026-09-12
**Estado:** Accepted — completa ADR-111

**Contexto**
ADR-111 dejó el catálogo de Treeshop como un espejo del Supabase de Camelot que
entra por `scripts/camelot-importar.ts`. El importador declaraba
`field_sources: { price: 'ERP', stock: 'ERP' }` y lo desobedecía: reescribía
`title`, `description`, `brand`, `category_id` y `status` en **cada** corrida, y
las fotos no se upserteaban sino que se borraban por producto tocado y se
volvían a escribir.

El enriquecimiento de la Fase 11 escribe exactamente título, descripción, marca y
categoría (ADR-104), y v2 prevé fotografiar el tercio del catálogo que hoy no
tiene foto. La corrida siguiente revertía las dos cosas **en silencio**: sin
fallar, sin aparecer en el typecheck y sin que nadie se enterara hasta ver
títulos de origen en la vitrina. No es prolijidad de importador: es perder
trabajo ya hecho.

**Decisión**
Un producto nuevo se escribe entero, que es la única forma de crearlo. Uno que ya
existe conserva lo suyo y sólo acepta del origen los campos que su propio
`field_sources` le cede, campo por campo. Para que los títulos vuelvan a seguir a
Camelot se le agrega `title: 'ERP'` a ese producto y el importador los reescribe.
La declaración de un producto que ya existe tampoco se pisa: si la tienda le
cedió un campo más al origen, la decisión es suya.

Las fotos siguen siendo reemplazo y no upsert —si el origen ahora trae menos, un
upsert dejaría las viejas colgando—, pero el reemplazo se acota a las de este
importador: el `delete` filtra además por `url like '%/camelot/%'`, que es donde
viven todas las que sube. Un `delete` por `product_id` también borraba las que
subió el comercio, y nada las traía de vuelta.

Es la regla que el proyecto ya tenía escrita —cada campo sincronizable declara su
origen, y el origen conserva autoridad sólo sobre los suyos— aplicada al único
catálogo espejado que hay.

**Descartado**
Congelar el catálogo y no volver a importar: el espejo es espejo por diseño y en
Camelot se siguen cargando productos, así que dejar de reimportar lo convierte en
una foto vieja, que es peor que el problema. Y resolverlo con una convención en
el onboarding —«no reimportar después de enriquecer»—: una convención que si se
olvida borra datos no es una defensa, es una trampa.

**Verificado**
De punta a punta sobre un producto real: reimportar deja en pie lo que se editó y
sus fotos.

---

## ADR-118 — v2 se reordena: la identidad del comprador primero, la IA última

**Fecha:** 2026-09-12
**Estado:** Accepted

**Contexto**
Las seis fases escritas de v2 —Multi-location avanzado, Wholesale/B2B, AI Product
Studio, Search avanzado, Loyalty, Advanced Analytics— se listaron antes de que
existiera un catálogo real, y su orden no seguía ninguna dependencia técnica:
ponía Loyalty dos fases antes de que hubiera cualquier identidad de comprador, y
metía recomendaciones y vistos recientemente adentro de «Search avanzado», como
si fueran búsqueda y no consecuencias de tener cuenta.

**Decisión**
v2 se reordena en nueve fases: cerrar el significado de `authenticated`, la
identidad del comprador, lo que la identidad paga —wishlist, vistos
recientemente—, el buscador léxico, recomendaciones y portada por visitante,
devolver a la vitrina los productos sin foto, la IA que gasta por unidad de
catálogo, lo que quedaba del v2 escrito, y al final el programa de beneficios
que cruza comercios. El plan lo escribe [ROADMAP.md](ROADMAP.md); acá queda por
qué ese orden.

El cobro en línea no entra como fase de v2: sigue siendo P-001 y sigue en su
track paralelo, porque depende de credenciales que consigue el comercio y una
fase que espera a un tercero deja el roadmap rehén. Lo que sí entra, y primero
porque no espera a nadie, es endurecer la transferencia bancaria, que es con lo
que se cobra hoy.

**El orden sale de tres fronteras que se cruzan una sola vez**

**1. Hoy `authenticated` significa «alguien del equipo de un comercio».**
`app.current_tenants()` lee `memberships`
(`supabase/migrations/20260826004950_multitenancy.sql:163`) y las políticas de
las tablas de negocio dicen
`to authenticated using (tenant_id in (select app.current_tenants()))`. La cuenta
del comprador convierte ese rol en un rol público, y hay más de treinta
`grant execute … to authenticated` escritos bajo la premisa vieja.

El motivo para hacerlo primero no es el volumen de grants: es que el sistema **no
es fail-closed por RLS**. Nueve de las funciones alcanzables por `authenticated`
son `security definer`, o sea que la RLS está salteada por construcción. Dos son
la autorización misma —`app.current_tenants`, `app.has_permission`—; de las siete
restantes, seis cortan adentro —cinco con `app.has_permission` y
`admin_order_notifications` por tenant— y la séptima no cortaba nada:
`app.consume_promotion(uuid)` recibía un uuid arbitrario e incrementaba el
`usage_count` de la promoción que le nombraran
(`supabase/migrations/20260829170232_fase9_descuento_en_el_pedido.sql:275`).
La primera lectura fue que cruzar tenants ya estaba al alcance de un viewer de
cualquier comercio, y era más grave que el hecho: **no había camino desde
internet**, porque PostgREST expone únicamente el schema `public` —`POST
/rest/v1/rpc/consume_promotion` devuelve 404 PGRST202— y `anon` no tiene `usage`
sobre `app`. Lo que sí es cierto es que `authenticated` sí lo tiene, y que la
Fase 1 convierte ese rol en un rol público: la apuesta se paga entonces, así que
el permiso se revoca ahora. Su único llamador es `create_order`, revocada de
`public, anon, authenticated`
(`supabase/migrations/20260827015211_checkout.sql:363`), así que nunca hizo
falta. Fueron dos migraciones, porque quitarle el grant explícito a
`authenticated` deja intacto el `execute` que Postgres le da a `PUBLIC` al crear
la función: `supabase/migrations/20260912173244_revocar_consume_promotion.sql` y
`supabase/migrations/20260913182114_revocar_consume_promotion_de_public.sql`. Esa
reauditoría se hace con cero filas de comprador en la base, no con dos mil.

**2. La identidad es la frontera de confianza compartida.** Wishlist, vistos
recientemente, preferencias, recomendaciones y portada por visitante son la misma
fila vista de cinco maneras: piden el mismo identificador de cliente estable y la
misma política. Hoy no existe. `store_events` no tiene columna de cliente y su
propio comentario reserva el vínculo para «otra tabla»
(`supabase/migrations/20260830153950_fase10_eventos.sql:28`), y la sesión anónima
dura treinta minutos rodantes (`MINUTOS_DE_SESION`,
`apps/treeshop/src/lib/analytics.ts:31`): sin identidad, «según quién mira» es
«según esta media hora». Definirla una vez evita reabrir las políticas de tres
fases.

**3. Lo verificable offline va antes de lo que no.** `pg_trgm` está en el build
de PGlite que usa la suite de aislamiento, así que un buscador léxico se prueba
contra Postgres real en el CI; `vector` no está, así que los embeddings sólo se
verifican contra el proyecto remoto, que es la validación más débil que este repo
acepta. Y `catalog_search` se opera una sola vez: el ranking le cambia el
criterio de orden y las recomendaciones le agregan una lista de ids, y hacerlo en
ese orden convierte dos cirugías en una sobre la función que ya costó 2287 ms y
quedó en 233 (commit 3caa756).

**Lo que no ordena nada** es la preferencia. El buscador va tercero y no primero
porque lo que de verdad le falta —índice, acentos, tipeos, ranking— no se abarata
ni se encarece por esperar dos fases, y meterlo primero no desbloquea nada más.
La IA va última porque es lo único que gasta plata del comercio por unidad de
catálogo y lo único que la suite offline no puede verificar.

**Descartado**
Poner el cobro en línea primero, que era la lectura de negocio más fuerte: la
fuga está después de la decisión de compra, no antes. Se descartó por P-001 —sin
credenciales de sandbox de ningún proveedor paraguayo, la primera fase quedaría
rehén de un tercero—; lo que sobrevive de ese argumento entra igual, endurecer la
transferencia y medir la fuga.

También se descartó medir esa fuga con `begin_checkout` contra
`checkout_completed`: ningún evento guarda el método de pago, y con transferencia
`checkout_completed` se anota **después** de que `create_order` creó el pedido
(`apps/treeshop/src/pages/api/checkout.ts:117`), así que la fuga real ocurre
fuera de ese par. El dato que sí la mide es la antigüedad de
`orders.payment_status = 'pending'`, que existe desde la Fase 5.

---

## ADR-119 — Los documentos tienen dueño y tienen compuerta

**Fecha:** 2026-09-12
**Estado:** Accepted

**Contexto**
El harness pide desde el primer día que una unidad de trabajo no esté terminada
hasta que los documentos digan la verdad. No alcanzó: una auditoría del
2026-09-12 encontró setenta correcciones repartidas en nueve documentos, y cerca
de la mitad eran mecánicas —una ruta que ya no existe, un comando retirado, un
porcentaje escrito en dos lugares que dejaron de coincidir—.

Dos causas, y ninguna es falta de atención.

La primera: **el mismo hecho vivía en varios documentos.** La mecánica del deploy
estaba en cinco y el estado de las fases en tres, así que corregir un hecho
exigía acertar en cinco lugares y el que se olvidaba quedaba mintiendo. Se ve en
un solo commit: `fa9a996` corrigió en `CLAUDE.md` el párrafo de la Fase 12
—«tarifa plana **o por zona**»— y dejó cincuenta líneas más arriba, en el mismo
archivo, «faltan el envío por departamento». El mismo archivo, el mismo commit,
las dos frases sobre el mismo hecho.

La segunda: **no había nada que lo comprobara.** Todo lo demás de este repo tiene
compuerta —`lint`, `typecheck`, `test`, `e2e`—. Los documentos tenían una regla,
y una regla sin compuerta se cumple mientras la atención está alta y se cae
cuando no.

**Decisión, primera mitad: un hecho, una casa**
Cada hecho tiene un único documento que lo declara, y los demás enlazan en vez de
repetir. El avance de las fases y el estado de v1, v2 y v3 son del
[ROADMAP.md](ROADMAP.md); las decisiones de arquitectura y su motivo, de este
archivo; Workers, deploy, dominios, secretos, CI y diagnóstico, de
[INFRAESTRUCTURA.md](INFRAESTRUCTURA.md); qué **no** hace el sistema y qué lo
desbloquea, de [LIMITACIONES.md](LIMITACIONES.md); dar de alta un comercio, de
[ONBOARDING.md](ONBOARDING.md); cómo se trabaja con IA acá, de
[CLAUDE.md](CLAUDE.md); la visión y el scope del producto, de
[PROJECT.md](PROJECT.md); y los comandos que existen, de los `package.json`.

Enlazar es una frase corta y un enlace relativo, no un resumen que después haya
que mantener.

**Decisión, segunda mitad: la compuerta**
`pnpm docs:check` —`scripts/docs-check.mjs`, en el CI junto a `pnpm format:check`,
que existía desde la Fase 0 y nunca se invocaba— convierte en error las formas de
mentir que se pueden comprobar sin leer: un avance o el estado de una versión
declarados fuera del ROADMAP, un comando de pnpm que ningún `package.json` tiene,
una ruta bajo `apps/`, `packages/`, `scripts/`, `supabase/`, `e2e/` o `.github/`
que no está en el disco, un enlace relativo que no resuelve, un `ADR-NNN` que
este archivo no tiene, un rango de ADR que no termina en el último real, algo
retirado que se sigue prometiendo, y la existencia de un segundo documento de
instrucciones.

Los bloques de código y las citas quedan afuera: un bloque de ejemplo no afirma
que su comando exista. Y este archivo está exento de dos comprobaciones —la de
comandos y la de lo retirado— porque es historia por definición: un ADR que
registra algo que ya no existe no miente al nombrarlo.

**Lo que la compuerta no puede comprobar**
Que un documento diga la verdad. No sabe si un porcentaje es el real, si un
«Verificado» ocurrió, si una decisión sigue vigente, si un documento omite lo que
debería estar, ni si dos documentos cuentan el mismo hecho en prosa —de eso sólo
ataja el caso del avance—. Eso sigue siendo del harness y de quien revisa; la
compuerta garantiza nada más que lo mecánico no vuelva a pasar, que era la mitad.

**Consecuencia: no hay un segundo documento de instrucciones**
`AGENTS.md` era una copia byte a byte de `CLAUDE.md` con «Codex» en lugar de
«Claude», congelada mientras `CLAUDE.md` seguía cambiando. Se borró, y la
compuerta falla si reaparece —también con `GEMINI.md`, `CONVENTIONS.md` o
`.cursorrules`—. Tener dos documentos sobre lo mismo garantiza que uno de los dos
quede viejo, que es exactamente lo que pasó.

---

## ADR-120 — El catálogo no devuelve nada que el comprador no pueda ver

**Fecha:** 2026-09-13
**Estado:** Accepted

**Contexto**
`catalog_search` devolvía `cost` adentro de cada variante desde su primera
versión (Fase 2) y sobrevivió a diez reescrituras posteriores sin que nadie lo
mirara. El storefront le pasa las variantes enteras a una island —`variants={product.variants}`
en `productos/[handle].astro`— y Astro **serializa las props en el HTML** para
poder hidratarlas del otro lado.

Medido sobre `sontres.shop` antes del arreglo, en el código fuente de una PDP
cualquiera:

```text
"cost":{"amount":201300,"currency":"PYG"}
"price":{"amount":239547,"currency":"PYG"}
```

El costo unitario y, por diferencia, el margen de cada uno de los 2096 productos
del catálogo, sin credenciales, sin cuenta y sin nada más que «ver código
fuente». Con un scraper, el catálogo entero.

Nadie lo consumía. El costo que edita el Admin sale de `admin_products`; el
margen de los reportes sale de `order_items.cost`, que lo copia al vender
justamente para no depender del precio de hoy (ADR-101).

**Decisión**
`catalog_search` deja de emitir `cost`. La regla que queda, y que es lo que
importa para lo que viene: **una función que sirve al storefront no devuelve
campos que el comprador no pueda ver**, aunque el llamador de hoy no los use y
aunque la consulta pase por la secret key.

El arreglo va en la función y no en la página, y por eso: hay dos apps, varias
páginas por app y cada island decide qué props recibe. Recortar en el borde es
una lista que se mantiene sola mal —basta una página nueva que pase la variante
entera—; recortar en el origen lo cierra para todas de una vez.

**Consecuencias**
`ProductVariant.cost` sigue existiendo en los tipos porque el Admin lo edita: lo
que cambió es quién lo emite, no quién lo tiene. `catalog_search` es `security
invoker`, así que RLS ya la acotaba por tenant —un autenticado ajeno recibe el
catálogo vacío—; lo que no acotaba era **qué campos** de los propios salían, y
eso RLS no lo puede hacer.

Queda una comprobación en `supabase/tests/aislamiento-authenticated.test.ts`: el
dueño ve su catálogo y el costo no aparece. Si alguien lo repone, se entera ahí.

**Alternativas descartadas**
Recortar `cost` en el repositorio de `@pick/adapter-supabase`: más cerca del
consumidor, pero deja el dato viajando por la red y por el Worker, y no protege a
un llamador que no pase por ese repositorio. Recortarlo en cada island: la lista
de bordes que hay que acordarse de recortar.

---

## ADR-121 — La sesión del comprador vive en una cookie httpOnly del Worker

**Fecha:** 2026-09-13
**Estado:** Accepted — habilita la Fase 1 de v2

**Contexto**
La Fase 1 abre cuentas de comprador, y hasta hoy el storefront no tuvo ninguna
noción de usuario: todas sus consultas pasan por `clienteDeServidor`, que usa la
secret key y **saltea RLS**. Lo que acota los datos ahí no son las políticas sino
el SQL —todo entra por `catalog_search`, que filtra por tienda y por estado
(ADR-052)—. Poner cuentas encima de ese camino obliga a decidir dónde vive la
identidad del comprador, y la decisión hay que tomarla **antes** de escribir la
primera política: después son una docena de funciones y treinta y pico de
`grant` que ya asumieron una respuesta.

Tres caminos reales, y el orden importa porque el segundo es el que parece
natural:

1. **Supabase Auth en el navegador**, con la publishable key y RLS por
   `auth.uid()`. Es lo que documenta Supabase y lo más corto de escribir.
2. **Sesión propia** en cookie firmada por nosotros, con la autorización adentro
   de cada RPC y todo siguiendo por la secret key.
3. **Los tokens de Supabase Auth en una cookie httpOnly que administra el
   Worker**, y las lecturas con un cliente que lleva el JWT del comprador.

**Decisión**
El tercero.

El primero mete supabase-js en el bundle del storefront y deja el token al
alcance de cualquier script de la página. El storefront no manda el SDK al
navegador desde la Fase 2, y eso no cambia por una pantalla de login.

El segundo es el que hay que mirar dos veces, porque es el patrón que ya usa todo
el storefront y por eso se siente natural. Su costo es que RLS sigue sin proteger
nada: toda la defensa queda en SQL escrito a mano adentro de cada función, que es
**exactamente** la forma del agujero que la Fase 0 acaba de cerrar en
`app.consume_promotion` —`security definer`, uuid arbitrario, ninguna
comprobación— y la razón por la que `supabase/tests/aislamiento-authenticated.test.ts`
tuvo que existir. Repetir ese patrón multiplicado por las cuentas de comprador es
apostar a no olvidarse nunca.

**Consecuencias**

- **Es el primer camino del storefront donde RLS protege de verdad**, y conviven
  los dos: el catálogo sigue por la secret key, la cuenta va por el JWT. Un
  archivo del storefront pasa a tener dos clientes con alcances distintos, y eso
  hay que decirlo en su comentario o alguien va a elegir el equivocado.
- **La regla dura, de la que depende todo lo demás:** el Worker pasa a ser capa
  de autorización, así que **todo RPC de comprador toma el customer id de la
  sesión y nunca del cuerpo del pedido**. Un `p_customer_id` en la firma de una
  función de comprador es un bug, no un parámetro.
- **No hay función nueva ni dependencia nueva.** `clienteDeUsuario(conexion, accessToken)`
  ya existe en `@pick/adapter-supabase` —la escribió el Worker del Admin en la
  Fase 11— y hace justo esto: crea el cliente con la publishable key y el
  `Authorization: Bearer` de quien consulta. Viene con `persistSession: false` y
  `autoRefreshToken: false`, que acá es lo correcto: **el refresh lo hace el
  servidor**, no el SDK, porque en un Worker no hay nada que persista entre
  peticiones.
  **Corrección de la implementación:** este ADR decía «el middleware» y quedó en
  otro lado, a propósito. El middleware corre en cada página, así que ahí el
  refresco saldría a renovar la sesión también para quien está mirando el
  catálogo, que no la usa. Vive en `tokenDelComprador()` —`src/lib/sesion.ts`—,
  que lo pide quien necesita leer: `setSession` mira el `exp` del token **sin
  salir a la red** y sólo pide uno nuevo cuando venció, así que el costo de una
  visita a la cuenta con sesión vigente es cero. Y corre sobre un cliente de un
  solo uso, por lo mismo que `verifyOtp`: `setSession` deja la sesión puesta en
  el cliente sobre el que se llama, y el del storefront está memoizado por
  isolate.
- **`SUPABASE_PUBLISHABLE_KEY` es un secreto nuevo del Worker del storefront**,
  que hoy declara `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STOREFRONT_DOMAIN` y
  `PAYMENT_WEBHOOK_SECRET`. Va declarado `secret` y `optional` como los otros
  —Astro valida **todos** los secretos declarados al cargar `astro:env/server`
  aunque nadie los importe, y uno ausente es un 500 con el cuerpo vacío que no
  dice qué falta—. **No** se comprueba en `middleware.ts` junto a los otros, que
  es lo que este ADR había previsto: eso tumbaría la tienda entera por una
  credencial que sólo hace falta para entrar a una cuenta. Lo comprueba
  `faltaParaLasCuentas()`, y sin ella las rutas de `/api/cuenta/` responden 503
  nombrando lo que falta mientras el catálogo, el carrito y el checkout siguen
  vendiendo con la secret key.
- **Las políticas de comprador nunca usan `app.current_tenants()`.** Esa función
  lee `memberships` y significa «staff del comercio»; copiar el patrón del Admin
  le daría a un comprador la tienda entera. Va `app.current_customer(p_store)`,
  que resuelve `auth.uid()` contra `customer_accounts`.
- Las páginas de cuenta son todas on-demand. Con Workers Assets una
  prerenderizada se sirve del disco **sin ejecutar el Worker**, así que una
  página con sesión se vería bien en `astro dev` y saldría igual para todos al
  desplegar (ADR-099).

**Lo que esto no decide**
Cómo entra la persona —el código por email es de la Fase 1— ni por dónde sale ese
correo, que es ADR-122.

---

## ADR-122 — Los correos de Supabase Auth salen por SMTP propio, con un remitente para todo el proyecto

**Fecha:** 2026-09-13
**Estado:** Accepted — acotado por ADR-123

**Contexto**
El login de la Fase 1 es un código que llega por email, así que antes de
escribirlo hay que resolver quién manda ese correo. **No es el mismo canal que
`EMAIL_FROM`**, y confundirlos es el error que este ADR existe para evitar:
`EMAIL_FROM` es el remitente de los avisos de pedido, que manda este repo por la
API de Resend desde la Fase 7; esto lo manda **Supabase Auth**, por su cuenta, y
hoy no sale de ninguna parte porque nunca se usó.

Consultada la documentación antes de decidir. Los números son lo que cierra la
discusión:

| Camino                    | Límite                                                           | Remitente                        |
| ------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Mailer propio de Supabase | 2 correos/hora, y **sólo a direcciones del equipo del proyecto** | del proyecto                     |
| SMTP propio (Resend)      | 30/hora de arranque, ajustable en Rate Limits                    | `smtp_admin_email`, del proyecto |
| Send Email Hook           | el de quien mande                                                | el que decida nuestro código     |

**Decisión**
SMTP propio apuntando a Resend, con un remitente para todas las tiendas.

El mailer propio se descarta solo: dos por hora y sólo al dueño de la cuenta no
es un login, es una demo rota. Entre los otros dos, el hook es el único que da
remitente por tienda, y hoy eso no vale lo que cuesta: hay **un** comercio en
línea, y el SMTP es configuración en dos paneles contra una ruta HTTP con
verificación de firma.

**El disparador para cambiar a hook es el segundo comercio que pida su propio
remitente. No es una fecha.**

> **Acotado por ADR-123.** Esto se escribió dando por hecho que el código de
> acceso del comprador tendría que salir por acá, y no es así: `generateLink`
> devuelve el código sin mandar nada, así que ese correo lo manda la cola de la
> tienda con su propio remitente. El hook queda para el día que haga falta que
> _todo_ lo de Auth salga por tienda. Lo que sigue vale igual y por eso se
> conserva: es lo que costaría, averiguado.

**Lo que se averiguó del hook, para no volver a averiguarlo**
Es un POST a una ruta nuestra —o una función de Postgres—, firmado con un secreto
del panel de Auth que se valida con el esquema de Standard Webhooks; devolver 200
vacío alcanza. El payload trae el usuario con su metadata y los datos del correo:
tipo de acción, token, hash, redirect y site URL. O sea que la identidad de la
tienda se puede resolver, pero hay que **decidir de dónde sale** —metadata del
usuario puesta al pedir el código, o el host del `redirect_to`— y eso no es
gratis.

Dos cosas que parecían obvias y no lo son:

- **El Worker del Admin sería su casa natural** —es el único Worker
  multi-tenant— pero hoy **a propósito no tiene la secret key de Supabase**. Su
  propio comentario lo declara como invariante: acá no hay secret key, así que un
  agujero en ese código no da acceso a la base más allá de lo que ya tenía quien
  llamó. Resolver el nombre y el dominio de la tienda para armar el remitente la
  necesitaría, y romper ese invariante por un remitente es un mal cambio.
- **Tampoco sirve encolar en la tabla que ya existe.** `notification_outbox`
  tiene `order_id uuid not null` con clave foránea a `orders`, y un correo de
  Auth no tiene pedido: reusarla es cambiarle el esquema. Y se drena cada 30 s
  **y sólo si hay tráfico en el sitio**, o sea un código de acceso que puede
  tardar un minuto en salir.

**Consecuencias**

- **El remitente es el único dominio que hay, y no es neutro.** Se configuró
  `no-reply@sontres.shop` porque es el que se puede verificar en Resend; no
  existe un dominio de Pick Commerce. Hoy eso juega a favor —con una sola tienda,
  el comprador recibe el código de la tienda donde está comprando—, pero se da
  vuelta con la segunda: sus compradores van a recibir el código desde el dominio
  de **otro comercio**, que es peor que un remitente neutro y no es defendible.
  O sea que el disparador escrito arriba no es cómodo sino urgente, y tiene una
  salida intermedia más barata que el hook: verificar un dominio propio y mandar
  desde ahí. Escrito acá para que la segunda alta no lo descubra en caliente.
- **30 correos/hora de arranque es poco para un pico**, y se sube desde la página
  de Rate Limits del proyecto. Queda anotado acá porque el síntoma —códigos que
  no llegan, a algunos y no a todos— no se parece en nada a la causa.
- Supabase Auth tiene además su propio límite de pedidos de OTP por dirección y
  por hora, que es lo que impide usar el login como amplificador de correo. No se
  baja sin motivo.
- La configuración es del dueño del proyecto: el dominio verificado en Resend y
  las credenciales SMTP en el panel de Supabase. Va junto con lo demás que se
  hace en un panel.

---

## ADR-123 — Un correo lo decide quién lo recibe, no quién lo manda

**Fecha:** 2026-09-13
**Estado:** Accepted — acota ADR-122 y ordena la Fase 1 de v2

**Contexto**
ADR-122 eligió mandar los correos de Supabase Auth por SMTP propio, con un
remitente para todo el proyecto, y dejó escrito el disparador para cambiarlo: el
segundo comercio que pidiera el suyo. Ese disparador se leía como una cuestión de
marca, algo que se pospone.

No lo es, y el dueño del proyecto lo formuló mejor que el ADR:

> La comunicación **comercio ↔ Pick Commerce** puede salir con el remitente de
> Pick. La comunicación **comprador ↔ comercio** tiene que salir con el correo
> del comercio.

Con esa regla, el problema deja de ser estético. Un comprador que entra a su
cuenta en la tienda A y recibe el código desde el dominio de la tienda B no está
viendo una marca equivocada: está viendo que dos comercios que él cree
independientes comparten infraestructura, y le llega un correo con un código de
acceso desde un dominio que no reconoce. Eso es indefendible y además se parece
mucho a un intento de phishing.

**Decisión**
La regla se adopta como regla de producto, y de ahí sale la clasificación de cada
correo que el sistema manda:

| Correo                                            | Quién lo recibe | Remitente   |
| ------------------------------------------------- | --------------- | ----------- |
| Avisos de pedido (recibido, confirmado, enviado…) | el comprador    | el comercio |
| Código de acceso a la cuenta del comprador        | el comprador    | el comercio |
| Reset de contraseña del Admin                     | el comercio     | Pick        |
| Invitación a un equipo, avisos de la plataforma   | el comercio     | Pick        |

Los avisos de pedido ya cumplían: los manda el Worker del storefront, y
`EMAIL_FROM` es un secreto de ese Worker, así que cada tienda tiene el suyo. Lo
que no cumplía era el código de acceso, porque lo manda Supabase Auth y su
`smtp_admin_email` es del proyecto entero.

**Cómo se cumple sin el Send Email Hook**
Buscando el costo del hook apareció que no hace falta. `auth.admin.generateLink()`
**no manda ningún correo**: su documentación dice que existe «para enviarse por
un proveedor propio», y los tipos del SDK lo confirman —devuelve `email_otp`, el
código en crudo, junto con `hashed_token` y `action_link`—. Después
`verifyOtp({ email, token, type })` canjea ese código por una sesión.

Entonces el código lo genera Supabase y lo manda **la cola de correos que ya
existe**, que cada Worker drena con el `EMAIL_FROM` de su tienda. No hace falta
una ruta HTTP nueva, ni verificación de firma, ni `pg_net`, ni una clave de
Resend adentro de la base, ni romper el invariante del Worker del Admin —que a
propósito no tiene la secret key—.

La única cesión es de esquema: `notification_outbox.order_id` pasa a aceptar
nulos, porque un código de acceso no tiene pedido. La clave foránea es compuesta
y con un nulo no se comprueba, así que no hay que tocarla.

**Consecuencias**

- **Un comercio no puede habilitar cuentas de comprador sin su dominio
  verificado en Resend.** Antes eso degradaba —los avisos de pedido no salían y
  el pedido igual se creaba—; ahora rompe una función: sin correo no hay código,
  y sin código no hay login. Es una condición del interruptor, no una
  recomendación del onboarding, y el Admin la tiene que decir antes de dejar
  prenderlo.
  **Cómo quedó, y hasta dónde llega:** el interruptor vive en `store_settings`
  —apagado por defecto— y prenderlo desde el Admin exige tildar una confirmación
  aparte, con los dos requisitos escritos al lado. Es una **afirmación de quien
  lo prende, no una verificación**: la clave de Resend del proyecto es de sólo
  envío y su API contesta «This API key is restricted to only send emails» a
  cualquier consulta de dominios, así que el Admin no lo puede comprobar solo.
  Queda dicho así en LIMITACIONES.md en vez de fingir un control que no se hace.
  Apagado, la tienda no muestra «Mi cuenta» y `/cuenta` responde 404: un comercio
  que no las habilitó vende exactamente igual que antes.
- El drenador deja de asumir que toda fila de la cola tiene un pedido, **y no
  era el único**. `mark_notification_sent` marcaba la fila y además dejaba un
  `email_sent` en la timeline del pedido (ADR-102): con `order_id` nulo, ese
  insert violaba el `not null` de `order_events`. El modo de fallo era peor que
  un error, porque el correo ya había salido cuando fallaba el marcado: la fila
  quedaba pendiente y el siguiente drenaje mandaba el mismo código otra vez,
  hasta cinco veces. Apareció recién probando las rutas contra el proyecto real
  —ni el typecheck ni la suite de PGlite lo veían— y dejó su caso en
  `pagos-y-notificaciones.test.ts`. La lección se generaliza: **hacer nullable
  una columna no termina en la tabla**, termina cuando se leyó a cada uno de sus
  consumidores. Un código de acceso, a propósito, no deja entrada en ninguna
  timeline: no hay pedido donde ponerla y el Admin no tiene por qué ver cuándo
  entra cada comprador.
- **ADR-122 queda acotado**: el Send Email Hook ya no es el camino previsto para
  el código de acceso. Sigue siendo el camino si algún día hace falta que _todo_
  lo de Auth salga por tienda —un cambio de dirección de correo, un reset de
  contraseña de comprador si alguna vez hay contraseñas—, y su costo sigue
  escrito ahí.
- El SMTP del proyecto se queda con lo que le corresponde: lo que Pick Commerce
  le escribe a un comercio.

**Lo que esta decisión no resuelve**
Que el remitente de cada comercio siga siendo un secreto del despliegue en vez de
configuración del Admin. Está en `Backlog / Retroactividad` con sus dos
dependencias, y esta regla lo vuelve más urgente: ahora ese valor no decide sólo
la marca de un aviso, decide si el login de esa tienda funciona.

---

## ADR-124 — La visita y el dispositivo son dos identificadores, no uno

**Fecha:** 2026-09-14
**Estado:** Accepted — corrige el plan escrito de la v2 Fase 2

**Contexto**
La Fase 2 existe para levantar el techo de lo que el sitio puede recordar de un
visitante. Hoy ese techo son **treinta minutos**: lo único que ata una visita a
la siguiente es `pick_sid`, una cookie de sesión deslizante. Cada sesión que pasa
sin quedar atada a nada es una sesión de la que nunca se va a poder aprender, y
ese dato no se recupera después.

El plan de la fase decía, textualmente: «No se agrega ninguna cookie nueva. El
perfil se cuelga de `pick_sid`, que ya existe. Lo que cambia es cuánto dura.»

**Eso rompía la analítica**, y se vio antes de escribir una línea. `pick_sid` es
el id de _visita_ y es el **denominador de todo el embudo**: `admin_dashboard`
cuenta `count(distinct session_id)` para cada paso. Con esa cookie durando seis
meses, las veinte visitas de una persona pasan a ser una sola sesión; la
conversión sube unas veinte veces y **nada falla ni avisa**. Es el mismo modo de
fallo que ADR-099 trató de evitar cuando escribió que los eventos aportan el
denominador: el numerador sale de `orders` y sigue bien, así que las métricas
quedan creíbles y equivocadas.

**Decisión**
Dos identificadores, porque son dos preguntas distintas:

|            | qué responde                          | cuánto dura          |
| ---------- | ------------------------------------- | -------------------- |
| `pick_sid` | qué pasó en **esta visita**           | 30 min deslizantes   |
| `pick_did` | qué viene haciendo **este navegador** | 180 días deslizantes |

`store_events` gana una columna `device_id` **nullable**, y sigue sin tener
ninguna columna de cliente: el cruce entre lo que alguien mira y quién es vive en
`session_identities`, que es otra tabla y otra decisión (PROJECT.md §23).

Seis meses porque cubre una temporada completa de compra, se renueva con cada
visita —así que quien vuelve no lo pierde nunca— y caduca solo en quien no
volvió. Coincide con `DIAS_DE_RETENCION` a propósito: no tiene sentido recordar
quién es alguien más tiempo del que se guardan sus eventos.

**Un interruptor, no un aviso de cookies**
La personalización se apaga desde la página de privacidad, donde está la
explicación, y no desde una cinta que aparece encima de todo. Un banner lo
descarta todo el mundo sin leerlo: no da una elección, da un clic.

Apagar **borra** `pick_did` en vez de dejar de usarlo, y el middleware lo vuelve
a borrar en cada visita mientras la preferencia esté puesta. Sin eso, volver a
prender recuperaría un historial que la persona creyó haber cortado. La cookie de
la preferencia dura un año, más que el perfil que apaga: que la elección caduque
antes que su efecto sería volver a prenderla sola.

Con la personalización apagada **el evento se guarda igual**, sin `device_id`. La
medición del comercio no depende de que le den permiso a nada; lo que se pierde
es poder atar esa visita a las demás del mismo navegador.

**Una cosa que el plan daba por cierta y no lo era**
El plan decía que la frase «no usamos servicios de terceros» del texto de
privacidad «ya es falsa hoy, por el beacon de Cloudflare Web Analytics que la
zona inyecta en el HTML». Se comprobó contra producción antes de corregirla:
**el beacon no está**. La frase queda como estaba, y lo que se reescribió es sólo
lo que este cambio vuelve incompleto — que había un identificador y ahora hay
dos.

**Consecuencias**

- Toda página del storefront emite ahora dos `set-cookie` en vez de uno. Sobre
  HTML solamente, como el anterior: el sitemap sigue siendo la única respuesta
  cacheable y sigue sin cookies.
- El embudo no se toca y sigue significando lo mismo. Es el punto entero.
- «Vistos recientemente» y las recomendaciones de la Fase 4 tienen de dónde
  comer, y tienen un índice por dispositivo para hacerlo sin un scan.
- Queda **sin** resolver, y es decisión de producto: si lo que alguien mira se
  cruza con su cuenta. Hoy no se cruza y el texto de privacidad lo dice; el día
  que se cruce, ese texto cambia antes que la tienda.

## ADR-125 — El buscador tolera tipeos con trigramas sobre un documento materializado

**Fecha:** 2026-09-16
**Estado:** Accepted

**Contexto**
`catalog_search` buscaba por coincidencia literal de subcadena: armaba
`lower(title || brand || string_agg(skus))` **para cada producto en cada
petición** —hubiera término o no— y comparaba con `position()`. «zapatila» daba
cero resultados en Treeshop, «nino» no encontraba «Niños», y con término de
búsqueda `sort=relevance` ordenaba por orden de alta.

El plan de la fase dudaba entre un trigger sobre tres tablas y una tabla lateral,
porque daba por hecho que los SKU y la categoría iban al mismo documento.

**Decisión**

- **Una columna generada**, `products.search_doc`, con título y marca
  normalizados. Viven en la misma fila, así que Postgres la mantiene y nadie
  tiene que acordarse de nada. Índice GIN de trigramas encima.
- **Los SKU no entran al documento**: se buscan por **prefijo exacto** contra
  `product_variants`. Por trigramas, «A12» traería medio catálogo.
- **Acentos y mayúsculas con `translate()`**, en `app.normalizar_busqueda`, que es
  inmutable de verdad. `unaccent` es STABLE: usarla en una columna generada
  obligaba a envolverla en una función marcada IMMUTABLE a mano. Las mayúsculas
  acentuadas se traducen explícitamente, porque con intercalación C `lower('Á')`
  no las toca. La `ñ` se pliega a `n`.
- **`pg_trgm` en el schema `extensions`**, la convención de Supabase. La suite de
  aislamiento la carga en PGlite, así que el camino nuevo corre sobre Postgres real
  en CI.
- Un término coincide si aparece literal, si es prefijo de un SKU, o —**desde
  cuatro letras**— si `word_similarity(término, documento) >= 0.5`. Todos los
  términos tienen que coincidir, como antes. `word_similarity` y no `similarity`:
  compara el término contra el mejor tramo del documento, no contra el título
  entero, que con títulos largos diluye el puntaje hasta no encontrar nada.
- **Relevancia**: suma por término de 1,2 si es SKU, 1,0 si es literal, o el
  `word_similarity` si es parecido. Sin ranking, tolerar tipeos trae ruido sin
  ordenarlo.

**La firma no cambió**, así que fue `create or replace` y los grants se
conservaron. Verificado después de aplicar: `authenticated` y `service_role`, sin
`anon`.

**Medido contra Treeshop** (3752 productos), mediana de cinco corridas
intercaladas contra la definición anterior y un control de cuerpo idéntico:

| caso               | anterior | control | nueva  |
| ------------------ | -------- | ------- | ------ |
| listado, página 1  | 625 ms   | 613 ms  | 581 ms |
| listado, página 88 | 577 ms   | 571 ms  | 572 ms |
| `zapatilla`        | 566 ms   | 530 ms  | 576 ms |
| `zapatila`         | 474 ms   | 499 ms  | 614 ms |
| PDP por handle     | 357 ms   | 358 ms  | 355 ms |

El listado sin búsqueda quedó igual o mejor, que era la compuerta: quitar el
`string_agg` por producto compensa lo que agregan los CTE nuevos. `zapatila` cuesta
más porque antes no encontraba nada y ahora ordena 50 resultados.

**Lo que ya encontraba lo sigue encontrando.** Once búsquedas reales comparadas
contra la definición anterior, recorriendo todas las páginas: **cero productos
perdidos**. `zapatila`, `nino` y `remra` pasan de 0 a 50, 58 y 562.

**Lo que se pierde, a propósito**
Un SKU ya no se encuentra por un tramo del medio: «407307» no encuentra
«CH-407307-01». Lo que se busca por código se escribe desde el principio, y la
subcadena era la que hacía imposible separar los SKU del documento difuso.
Tampoco se busca en la descripción ni en el nombre de la categoría, que antes
tampoco (LIMITACIONES.md).

**Las sugerencias y el cero resultados**
`search_suggest` devuelve hasta ocho **títulos** —no productos: Treeshop repite
el mismo título en varias filas— con un umbral más bajo, 0,3: mientras se escribe
«zapat» tiene que proponer algo, y cuando la búsqueda no encontró nada es lo que
alimenta «¿Quisiste decir…?». Lo literal y lo que empieza por lo escrito van
primero. Aplica las mismas reglas de visibilidad que el catálogo —sugerir un
título que después da cero sería peor que no sugerir— y la llama sólo
`service_role`. Sobre Treeshop tarda entre 40 y 78 ms.

La ruta que la sirve **no anota eventos**: se pide en cada pausa al escribir, y
contarla como `search` inflaría las búsquedas con palabras a medio escribir.

Cero resultados muestra, además de la corrección, lo más vendido **si hubo
ventas**. Sin pedidos, «más vendidos» ordena por orden de alta —lo más viejo
primero— y titularlo así sería mentir: ahí van las novedades, con su nombre.

**Consecuencias**

- El costo general de `catalog_search` —600 ms el listado, 355 el PDP— sigue en
  el backlog: esta fase no lo empeoró, y no era suya.
- `app.normalizar_busqueda` queda alcanzable por `authenticated`, clasificada como
  pública en la suite: es pura sobre su argumento, y la columna generada la evalúa
  con el rol de quien escribe el producto: sin ese permiso el dueño no puede crear
  uno, medido.

## ADR-126 — La paridad con `queryCatalog` deja afuera el término de búsqueda

**Fecha:** 2026-09-16
**Estado:** Accepted — acota ADR-055

**Contexto**
ADR-055 fija `catalog_search(tienda, q) ≡ queryCatalog(activos(tienda), q)` y lo
verifica corriendo los mismos casos por los dos caminos. Con ADR-125 la búsqueda
tolera tipeos por trigramas y ordena por puntaje, y eso no tiene equivalente en
TypeScript.

**Decisión**
La paridad se acota a todo lo que **no** es el término de búsqueda: filtros,
facetas, órdenes, paginación, rango de precio y colecciones. De la tabla de
paridad salen los cinco casos con término; se queda el término hecho sólo de
espacios, que tiene que ser el listado de siempre.

**Por qué no portar la matemática al core**
Sería duplicar `word_similarity` en JavaScript, lógica difícil que nadie usa del
lado del cliente, sólo para que un test la compare consigo misma. La paridad es la
defensa del repo contra fallos silenciosos de facetas (ADR-050), y las facetas
siguen cubiertas.

**Cómo se cubre la búsqueda ahora**
Nueve tests con expectativas escritas a mano, en una tienda propia con stock:
literal, acentos en las dos direcciones y la eñe, tipeo, término corto sin
tolerancia, AND de términos, SKU por prefijo y no por subcadena, orden por
relevancia, búsqueda más faceta, y **aislamiento entre tiendas** por título,
parecido y SKU.

**Se comprobó que detectan**, rompiendo el SQL a propósito: quitar la tolerancia
a tipeos tumba 2 tests, quitar el ranking 1, quitar el filtro de tienda 23.

Y apareció algo de paso: el producto de la tienda ajena del fixture **no tenía
stock**, así que lo ocultaba el filtro de stock por su cuenta. Con el filtro de
tienda quitado, «la secret key tampoco cruza tiendas: ítems, facetas y precios»
seguía en verde. Se le cargó stock.

## ADR-127 — Las recomendaciones no entran por `p_ids`: una serialización compartida y dos tablas materializadas

**Fecha:** 2026-09-17
**Estado:** Accepted

**Contexto**
La v2 Fase 4 pide tiras de recomendados en el PDP y en el carrito, y un orden de
colección que se adapte a quien mira. El ROADMAP abría la fase con «`p_ids
uuid[]` en `catalog_search`, el cambio más chico que habilita las cuatro
pantallas»: sin él, cada lista recomendada tendría su propia serialización del
producto y divergiría en silencio del catálogo —otra promoción, otro tachado, otro
stock, otras reglas de publicación—.

**Decisión: `p_ids` se descarta**, y no por prudencia abstracta. Hay dos
mediciones en el repo:

- Un filtro análogo —`p_handles text[]`, una línea, constante con el parámetro en
  null— llevó el listado de Treeshop de 601/612/589 ms a 1205/1361/1151 ms,
  intercalado en la misma sesión, y se revirtió
  (`20260914165331_revertir_lista_de_handles.sql`). La causa diagnosticada fue una
  mala estimación de selectividad, que no depende de la forma del filtro.
- Aunque fuera gratis para el listado, **una llamada acotada cuesta ~355 ms**:
  `promos_producto`, `precios` y `pav` se calculan sobre la tienda entera aunque se
  pida un solo producto. Una tira en el PDP sería 355 + 355 en la página que vende.

**Lo que se hace en su lugar**
Se extrae a `app.catalog_items(p_store_id, p_ids uuid[])` lo único que no se puede
duplicar —el predicado de visibilidad y el documento del ítem— con sus CTE
acotados a los ids pedidos. Las tiras pagan por ocho productos, no por la tienda.
Devuelve los ítems **en el orden del arreglo** y **omite** lo que el catálogo
esconde, así que «ninguna lista recomendada muestra un producto escondido» es una
propiedad de la función y no una regla que cada llamador tenga que recordar.

Queda una segunda copia de la serialización, y eso es deuda. La defensa es un test
de equivalencia: para el mismo producto, `app.catalog_items` tiene que devolver el
mismo documento que el ítem de `catalog_search`. Es lo que ADR-050 pide cuando el
modo de fallo es silencioso.

**Lo que sí toca `catalog_search`, con compuerta**
El orden nuevo: un `left join` a `product_trending` y un parámetro `p_prefiere
jsonb` que **no filtra filas**, sólo pesa el `order by`. Por eso no repite el error
de septiembre, que era de selectividad. Antes de desplegar se mide intercalado
contra la definición anterior y un control, como en ADR-125; si el listado empeora
más de un 5 %, el orden se resuelve en el adapter sobre la página ya traída, con su
pérdida escrita.

**El perfil es el parámetro, no una tabla de órdenes**
El ROADMAP proponía precomputar un orden por bucket y entrarlo como `p_ids`. Con
`p_ids` descartado, el bucket —las dos marcas y categorías que alguien viene
mirando— viaja como `p_prefiere` y se resuelve en el `order by` sobre columnas que
la consulta ya tiene. Sin tabla de órdenes, sin job que la mantenga, y explicable
al comercio en una frase: «primero Nike, porque lo viene mirando».

**Dos tablas, no una**
`product_affinity` guarda pares —producto, relacionado, co-vistas, co-compras,
score— y `product_trending` un número por producto. Tendencia no es un par, y
meterla como un par consigo mismo es lo que alguien descifra a las 3 de la mañana.
Las dos con FK compuestas por `(id, tenant_id)`: el aislamiento entre comercios es
estructural (ADR-063), no un `where` bien escrito.

**El recálculo lo decide la base, no el isolate**
No hay scheduler en el repo y `pg_cron` no está en PGlite, así que el recálculo va
donde ya va la purga: oportunista, desde el middleware, con `waitUntil`. Pero
`ultimaPurga` es memoria del isolate, y con muchos isolates muchos creen que les
toca. El candado es un `insert … on conflict … where started_at < now() - p_cada`
sobre `affinity_runs`, que es un solo statement atómico y **se puede testear en
PGlite**, que es el punto.

**Consecuencias**

- Las tiras del PDP y del carrito funcionan **sin identidad**: dependen de qué se
  mira, no de quién mira. Andan con las cuentas apagadas y con la personalización
  apagada.
- La cascada del orden —preferencias → tendencia → orden del catálogo— es un solo
  `order by`, así que el arranque en frío no es un camino aparte que nadie prueba:
  es la misma consulta con el parámetro vacío.
- El costo de fondo de `catalog_search` sigue en el backlog. Esta fase no lo
  empeora y tampoco lo arregla.

## ADR-128 — El perfil sigue a la persona, y apagarlo borra lo que ya se había guardado

**Fecha:** 2026-09-19
**Estado:** Accepted

**Contexto**
La Fase 4 entregó la personalización por `pick_did`, la cookie de dispositivo:
cubre casi todo el tráfico, pero no pasa del teléfono al escritorio y no
sobrevive a la purga de `store_events`. El perfil por cuenta quedó diferido con
un motivo escrito: cruzar lo que alguien mira con quién es era exactamente la
línea que PROJECT.md §23 protegía, y el texto de privacidad prometía que ese
cruce no existía y que **cambiaría antes que la tienda**.

**Decisión**
`customer_preferences` materializa por persona el mismo bucket que ya existía
por navegador —dos marcas y dos categorías—, y el texto de privacidad se
reescribió en el mismo cambio, antes de encenderlo.

- **Lo escribe el recálculo que ya corría.** `recompute_affinity` gana un tercer
  paso: sin job nuevo, sin cron nuevo, con el mismo candado y las mismas ventanas.
- **Quién es quién lo dice `session_identities`**, que se escribe sólo al entrar
  a la cuenta. Sin login no hay fila y no hay perfil.
- **Se lee con el token del comprador**, por `my_preferences`, que es `definer`
  con el filtro de identidad adentro —la tabla no tiene política de comprador, y
  una función `invoker` habría devuelto vacío siempre, que es la trampa que
  CLAUDE.md ya tenía anotada—.
- El storefront prefiere el perfil de la cuenta, cae al del navegador, y de ahí a
  tendencia: es un escalón más de la misma cascada de ADR-127, no un camino nuevo.

**Lo que encontró un test, y cambió el diseño**
Borrar el resumen al apagar la personalización **no alcanzaba**: las visitas de
ese navegador siguen en `store_events` hasta 180 días, así que el recálculo
siguiente lo armaba de nuevo. El interruptor habría durado seis horas, sin que
nada fallara ni avisara.

Así que apagar hace tres cosas, y las tres son parte de la promesa:

1. borra la cookie del dispositivo, que corta la señal nueva (ADR-124);
2. borra el resumen de la cuenta (`forget_my_preferences`);
3. **le saca el `device_id` a lo ya guardado** (`forget_device`). El evento se
   queda —la medición del comercio no depende de que le den permiso a nada— pero
   deja de estar atado a ese navegador.

Y el recálculo sólo mira visitas **con** `device_id`, que es lo que hace que
apagar sostenga en vez de revertirse en la corrida siguiente.

**Consecuencias**

- El texto de privacidad dice ahora que, con la cuenta abierta, lo que se mira
  ordena la vitrina también desde otro dispositivo; que se guarda un resumen y no
  la lista; que sirve sólo para el orden; y que apagar borra las dos cosas.
- El comercio **no** ve el perfil de nadie: `customer_preferences` no tiene
  política para `authenticated`, así que el Admin no la alcanza. Lo que ve el
  comercio es qué se mira y qué se vende en su tienda, que es lo que ya veía.
- Un perfil sin señal no se guarda, y a quien deja de tener actividad se le borra
  en la corrida siguiente: un perfil viejo ordena la vitrina con lo que a alguien
  le interesaba hace un año.

## ADR-129 — Una sección de la portada dice si sirvió, atribuyendo por visita

**Fecha:** 2026-09-19
**Estado:** Accepted

**Contexto**
El ROADMAP pedía «una línea de resultado por sección —cuántos clics, cuánto
vendió—: sin eso el comercio no puede saber si la sección funciona y va a asumir
que no». La Fase 4 la difirió porque no existía el evento que la alimenta.

**Decisión**
El enlace de una sección lleva `?s=<sección>` y el PDP —que ya corre en el
Worker— anota `section_click` al verlo. **Cero JavaScript nuevo**, como el resto
de los eventos (ADR-099). Se deduplica por visita, sección y producto: volver
atrás y entrar otra vez no son dos clicks.

**La atribución no necesitó una columna nueva.** Un pedido ya está atado a su
visita por `checkout_completed`, así que la cadena es: alguien entró a un
producto desde una sección y **en esa misma visita** compró ese producto. La
alternativa era llevar la sección en el carrito y de ahí al pedido: dos campos
nuevos para responder una pregunta de tablero.

**Lo que esa decisión cuesta, dicho en el código y en el Admin:** no hay
atribución entre visitas. Quien ve algo el lunes desde un carrusel y lo compra el
jueves cuenta como click el lunes y como nada el jueves. Es el mismo criterio que
el embudo, que se cuenta por sesión, y es lo que hace que estos números y los de
Analytics signifiquen lo mismo.

**Cómo se verifica**
Nueve casos en PGlite sobre la atribución, que es donde un número equivocado no
rompe nada y se cree igual. Seis sabotajes; cinco ponen un caso en rojo y el
sexto —el filtro de tienda— es redundante por construcción y queda escrito como
tal. Dos huecos los encontró el sabotaje y no la revisión: contar dos veces la
misma línea, y atribuirle a la sección una compra **de otro producto** hecha en
la misma visita.

## ADR-130 — La IA propone el fondo limpio, una persona aprueba, y el lote lo orquesta el navegador

**Fecha:** 2026-09-19
**Estado:** Accepted — enmienda la regla de la v2 Fase 5 «sólo limpieza de fondo y recorte, nunca invención»

**Contexto**
Treeshop tiene 1258 productos con stock y sin foto: la tienda los oculta
(ADR-112), así que no se pueden vender. Las fotos del proveedor no existen. La
fase los recupera con fotos sacadas desde el teléfono y una limpieza de fondo con
IA.

El ROADMAP escribió una regla dura: **sólo limpieza de fondo y recorte, nunca
invención**, porque «una imagen generada de un SKU real es una foto falsa de un
producto que alguien va a recibir». La documentación de OpenAI confirma que su
edición de imágenes no puede prometer eso: «el enmascarado es enteramente por
prompt; el modelo usa la máscara como guía, pero puede no seguir su forma exacta»
([guía de generación de imágenes](https://developers.openai.com/api/docs/guides/image-generation)).
Una edición regenera la imagen, y puede cambiar un logo o un color.

**Decisión del dueño del producto, con el riesgo a la vista**
Se le presentaron tres caminos —una IA que sólo avisa sin tocar la foto, una
silueta de IA aplicada sobre los píxeles originales, o que la IA limpie y una
persona apruebe— y eligió el tercero. Se registra así, y no como si la regla
original siguiera vigente: la regla se enmienda, y lo que la reemplaza son estos
resguardos, que son parte de la decisión y no detalles de implementación:

- **La original no se borra nunca.** La versión de la IA es una _propuesta_
  aparte. Aprobarla reemplaza la foto publicada; la original queda guardada para
  volver atrás.
- **Nada se publica sin que una persona lo apruebe**, viendo la original y la
  propuesta lado a lado. Queda registrado quién y cuándo.
- **La procedencia se lee en la ruta**, como en ADR-082 y ADR-117: lo que editó
  la IA vive bajo `<tenant>/ia/`. Un importador que reemplaza lo suyo no lo toca,
  y cualquiera puede saber qué foto pasó por la IA.
- **El pedido a la IA está acotado**: quitar el fondo y no retocar el producto.
  Se planeaba además `input_fidelity: high`; la medición de más abajo lo descartó,
  porque el modelo lo rechaza.
- **La IA sólo trabaja sobre una foto real.** Generar la foto de un producto que
  nadie fotografió sigue fuera, sin excepción.

**Dónde corre el lote, que era lo que el ROADMAP marcaba como bloqueante**
La clave maestra vive sólo en el Worker del Admin (ADR-103, ADR-105), y ADR-085
mandó el trabajo por lotes a un script de Node, que no tiene camino a la clave.
El choque se resuelve sin mover la clave: **el lote lo orquesta el navegador,
una imagen por pedido.** Cada pedido es un request del Worker del Admin, y la
documentación de Cloudflare dice que «no hay límite de duración para un Worker
disparado por HTTP mientras el cliente siga conectado»
([límites de Workers](https://developers.cloudflare.com/workers/platform/limits/)):
esperar a OpenAI no consume CPU.

Y para no depender del plan de Cloudflare, **el Worker no decodifica la imagen**:
reenvía la respuesta de OpenAI tal cual y el navegador —que ya sube fotos con el
JWT de quien opera— la decodifica y la sube.

**Lo que se midió contra la API real, y por qué importa**
Dos cosas aparecieron al probarlo con una foto de verdad, y ninguna se podía
saber leyendo la documentación:

1. **`input_fidelity` no existe para este modelo.** La referencia lo documenta,
   pero `gpt-image-2.5-sunburst` responde 400: «the model does not support the
   'input_fidelity' parameter». Así que el único resguardo técnico que había
   contra el redibujado no está disponible.
2. **El modelo cambió un texto impreso del producto.** Sobre una foto real del
   piloto —unos guantes Puma—, la muñequera dice «2MM SUPERSOFT LATEX» y la
   versión de la IA devolvió ese primer carácter deformado, ilegible como «2».
   El resto de la foto salió muy parecido. Es exactamente el modo de fallo que
   la regla original quería evitar, y ahora está medido: **no es hipotético**.

Eso no cambia la decisión —es del dueño del producto— pero sí la consecuencia:
la revisión con la original al lado **no es una formalidad**, es lo único que
separa una foto limpia de una ficha que miente sobre el producto. Y va escrito
en LIMITACIONES, que es lo que se le entrega a un comercio.

**Consecuencias**

- La limpieza con IA la puede pedir quien tiene `settings.write` (owner y admin),
  igual que el enriquecimiento: no se amplía quién gasta la clave del comercio. La
  captura desde el teléfono sólo necesita `catalog.write`.
- El comercio paga cada imagen con su clave (BYOK): un lote pide confirmación con
  la cantidad y tiene tope de cien por tanda.
- El producto vuelve a la vitrina **apenas tiene una foto**, la original: la IA
  es una mejora opcional encima, no una condición para vender.

---

## ADR-131 — El alta con la cámara lee la etiqueta: leer lo impreso no es inventarlo

**Fecha:** 2026-09-19
**Estado:** Accepted — enmienda, sólo para el alta, la prohibición de ADR-104

**Contexto**
Cargar un producto nuevo son doce campos a mano. Un comercio que recibe veinte
vestidos no lo hace: los vende sin cargarlos, o los carga a medias. La Fase 5
dejó el camino de la cámara construido —achicar en el navegador, subir a
Storage, limpiar el fondo con IA— pero sólo para **recuperar** un producto que ya
existía sin foto. Lo que faltaba era lo inverso: que de la foto salga el
producto.

**El choque con ADR-104**
ADR-104 dejó una garantía estructural: el esquema del enriquecimiento **no
declara** `price`, `sku`, `barcode`, `stock` ni `cost`, así que la API no los
puede devolver. El motivo escrito sigue siendo cierto: «un precio inventado no se
nota al leerlo —es un número plausible— y se descubre cuando alguien compra algo
a un precio que no es».

Pero ese motivo habla de un modelo que **no puede saber** el dato. Cuando el
precio está impreso en la etiqueta que se acaba de fotografiar, el modelo no lo
deduce: lo transcribe. La regla se enmienda en ese punto exacto y en ningún otro.

**Decisión**

- **Dos esquemas, no uno ensanchado.** `ESQUEMA_DE_PROPUESTA` —el del
  enriquecimiento de un producto que ya existe— queda intacto, con
  `CAMPOS_PROHIBIDOS` y su test. Lo que lee la etiqueta es `ESQUEMA_DE_FICHA`, que
  sólo usa el alta. Así la garantía de ADR-104 sigue siendo estructural donde
  siempre valió, y la enmienda no se puede filtrar al otro camino por descuido.
- **Copiar, nunca deducir.** Las instrucciones lo dicen con todas las letras:
  el precio, el SKU y el código de barras se copian sólo si están impresos y se
  leen con claridad; ante la duda van null. Un precio estimado por lo que parece
  valer la prenda es justamente lo que ADR-104 prohíbe, y se ve igual que uno
  leído.
- **Se ofrece, no se escribe.** Lo leído aparece como sugerencia con el valor
  **tal como estaba impreso** —«Leído de la etiqueta: Gs. 250.000»— y hay que
  tocar «Usarlo» para que entre al campo. La evidencia al lado es lo que hace
  honesto aceptarlo de un toque.
- **El código de barras se verifica.** EAN-8, UPC-A, EAN-13 y GTIN-14 tienen
  dígito verificador: uno que no cierra **no se ofrece**. Un dígito mal leído no
  falla al guardarlo, falla meses después en la pistola del depósito o en el
  catálogo de un marketplace. Y con más de un talle el código leído no se aplica
  a ninguna variante: un GTIN identifica un artículo concreto, y copiarlo a los
  otros dos talles sería inventarlo.
- **La ficha se lee sobre las fotos originales**, nunca sobre la versión con el
  fondo limpio: esa está regenerada, y ADR-130 midió al modelo deformando un
  texto impreso. Leer una etiqueta redibujada sería leer una etiqueta inventada.

**Lo que no cambia**

- **Nada se guarda sin que una persona mire la pantalla.** El wizard termina en
  un formulario que hay que confirmar.
- **No se generan perspectivas.** Se preguntó y se descartó: una foto de un
  ángulo que nadie fotografió es una foto falsa de un producto que alguien va a
  recibir. Varias fotos **reales** sí, y mejoran la ficha.
- **La limpieza de fondo sigue siendo la de ADR-130**, con su comparación contra
  la original.

**Consecuencias**

- El alta pide `settings.write`, como el resto de lo que gasta la clave del
  comercio: la credencial la entrega `ai_credential_secret`, que ya exige ese
  permiso, y ensancharlo sería ampliar quién puede gastarle plata al comercio sin
  un techo que todavía no existe —llega con la búsqueda semántica—. Se evaluó
  darle `catalog.write` para que lo usara el personal del depósito; queda anotado
  para cuando haya un caso real y un presupuesto por tienda.
- **Sin credencial la pantalla sirve igual**, sin los pasos de IA: cámara y
  formulario corto. Una tienda sin clave no se queda sin la herramienta.
- **Ninguna tabla nueva.** El alta guarda por el mismo camino que el formulario
  completo, y la conversión a unidades mínimas se mudó a `productoParaGuardar`
  para que viva en un solo lugar: un precio convertido dos veces, o ninguna, es
  una tienda vendiendo a cien veces su precio.
- El SKU es obligatorio en el catálogo, así que cuando la etiqueta no lo trae se
  propone desde el handle y el talle, editable. Dejarlo vacío no es una opción:
  sin SKU no hay variante, y sin variante no hay nada que vender.

---

## ADR-132 — La búsqueda semántica no mueve la clave, y degrada por construcción

**Fecha:** 2026-09-20
**Estado:** Accepted

**Contexto**
El buscador de la Fase 3 encuentra lo que se escribe mal, pero sólo encuentra
palabras que están en el catálogo: `search_doc` es `title + brand`. «Algo para
correr en invierno» no devuelve nada porque ningún producto dice esas palabras, y
ésa es la forma en que alguien pide cuando no sabe el nombre exacto.

Convertir esa frase en un vector exige llamar a OpenAI con la clave del comercio.
La clave se descifra con `PICK_AI_MASTER_KEY`, que vive en el Worker del Admin
(ADR-103, ADR-105). **El buscador corre en el Worker del storefront, que no la
tiene.** Ése es el choque que ordena toda la fase, igual que en la Fase 5 lo fue
dónde corría el lote de imágenes.

**Decisión**

- **La clave no se mueve.** Ante una frase sin vector guardado, el Worker del
  storefront le **pide el vector al Worker del Admin**, que es el único con la
  clave maestra. Se evaluó darle la clave maestra al storefront y se descartó: la
  superficie de un secreto que abre las credenciales de todos los comercios no se
  duplica para ahorrar una llamada.
- **La frase se paga una vez.** El vector se guarda en `search_queries`, por
  tienda. La segunda vez que alguien escribe lo mismo no hay ninguna llamada a
  OpenAI: la búsqueda semántica queda sin latencia añadida y sin costo.
- **Por tienda y no global.** Dos comercios usan las mismas palabras para pedir
  cosas distintas, y sobre todo un vector se paga con la clave de **uno**:
  compartirlo entre tenants sería gastarle la clave a un comercio para servirle a
  otro.
- **El techo de gasto y el contador viven donde vive la clave**: en la ruta del
  Worker del Admin y en el script. Son los dos únicos lugares donde un
  presupuesto se puede hacer cumplir.

**La degradación es una propiedad del código, no una promesa**
`app.similitud_semantica` existe siempre y **devuelve cero filas** cuando no hay
extensión, no hay clave o no hay vectores. `catalog_search` la usa igual en los
tres casos, así que una tienda sin OpenAI corre exactamente el SQL de la Fase 3.
No hay un `if` que alguien pueda olvidar, y la suite lo comprueba.

**Cómo se parte la migración, y por qué**
`vector` no está en el build de PGlite que corre la suite de aislamiento. Un
`create table` que nombre el tipo **no parsea**, y eso no deja los tests en rojo:
los deja sin arrancar. Así que:

- Las tablas se crean **sin** la columna vectorial. En PGlite existen enteras, y
  la suite prueba de verdad los grants, el aislamiento entre tiendas y que el
  navegador no las pueda leer.
- La columna, y el cuerpo que usa `<=>`, van dentro de la guarda
  `do $$ ... execute $p$ ... $p$ ... $$` que ya usa el bucket de Storage.

**Lo que sólo se verificó contra el remoto**
La extensión, la columna, el operador de distancia y los tiempos. Medido el
2026-09-20 sobre el proyecto de desarrollo, dentro de una transacción con
`rollback`: dos vectores cargados, similitud 1.000 con el idéntico, el ortogonal
descartado por el piso de 0.35, y **cero filas al preguntar por otra tienda**.
`vector` es la 0.8.2.

**Sin índice ANN, a propósito**
Con 3753 productos el escaneo exacto son milisegundos y siempre devuelve lo
correcto. Un HNSW filtrado por tienda puede devolver menos filas de las pedidas
—lo documenta Supabase— y ese modo de falla es peor que unos milisegundos: es un
catálogo que muestra de menos sin que nadie se entere. El índice entra con
volumen y con su medición.

**Lo que esto enmienda de la escritura previa**
El ROADMAP daba por bloqueado que un script de Node hiciera el trabajo por lotes,
porque «no tiene camino a la clave». Es falso en la práctica: `PICK_AI_MASTER_KEY`
está también en el `.env` de la raíz —lo dice INFRAESTRUCTURA §6— y `descifrar()`
se exporta del core. El script descifra la credencial del comercio y embebe el
catálogo. La frase «la clave maestra vive sólo en el Worker del Admin» describe
producción, no la máquina de quien opera.

**Cómo viaja la credencial, que es lo que decidió el reparto**
El Worker del Admin tiene la clave maestra pero **no** la secret key de
Supabase: sólo la publishable. Así que no puede leer por su cuenta el ciphertext
de la tienda, y darle la secret key para esto sería darle acceso a toda la base
salteando RLS —exactamente lo que el encabezado de ese archivo promete que no
pasa—. La salida es al revés de la intuitiva: **el storefront manda el
ciphertext**, que ya puede leer con su propia secret key, y el Admin lo abre.
Nadie gana un permiso que no tuviera, y lo único que este Worker aporta sigue
siendo lo único que nadie más tiene: la clave maestra. Nunca la devuelve;
devuelve un vector.

`/api/ia/vector` es la única ruta sin JWT —quien busca es anónima— y por eso vive
fuera del router de las otras cuatro, para que eso sea visible y no se herede por
descuido. La autentica un secreto compartido comparado en tiempo constante.

**Lo que se midió en producción, el 2026-09-20**

    PLP sin término                857 ms
    frase con vector guardado     1074 ms   (+217 ms)
    frase nueva                   1650-2000 ms

El sobrecosto de una frase ya conocida es una llamada a la base; el de una frase
nueva es la llamada a OpenAI, y se paga **una sola vez por frase**. Una frase que
no llegó a tiempo —el corte es de 800 ms— quedó sin vector y la búsqueda salió
por el camino léxico, que es la degradación funcionando sola.

Durante la medición casi se registra una regresión falsa: una primera tanda daba
+1300 ms en frases nuevas, y era el camino de «sin resultados» —que dispara
sugerencias y una vitrina de rescate— y no el vector. Medir con frases que
devuelven productos es la diferencia.

**Consecuencias**

- `catalog_search` **no cambia de firma**: calcula el hash de la frase con
  `md5(app.normalizar_busqueda(p_search))` en vez de recibirlo. Así la
  redefinición es un `create or replace` y no repite el `drop`+`create` que ya
  reseteó los grants una vez dejando `PUBLIC` con execute.
- `registrar_busqueda` recibe el vector como **texto**: si la firma nombrara el
  tipo `vector`, la función no parsearía en PGlite. Vive en `public` y no en
  `app` por un motivo prosaico: PostgREST sólo expone `public`, y quien la llama
  es el storefront por RPC.
- Las dos tablas nuevas no tienen grants para `anon` ni `authenticated`. Lo que
  las lee es `security definer`, usado al revés de lo habitual: no para dar
  acceso, sino para no tener que abrirlas.
- El techo cuenta **sólo** las búsquedas, no todo el gasto de IA. Un lote de
  cien fotos son cientos de miles de tokens que alguien eligió y confirmó, con su
  propio tope (ADR-130); sumarlo acá haría que una tanda normal dejara el
  buscador sin IA hasta fin de mes. Lo que este techo cuida es el único camino
  que puede irse solo, porque lo dispara tráfico anónimo.
- `ai_usage` cierra de paso el agujero que dejó la Fase 11: los endpoints
  devuelven `usage` y se tiraba, así que «cuánto costó esto» no tenía respuesta.

**Lo que la escala del piloto deja a la vista**
Embeber los 3752 productos de Treeshop costó **USD 0,0031** —156.572 tokens
cobrados— y volver a correrlo no reembebe nada. El dinero nunca fue la
restricción; la latencia sí. Y la calidad depende de cuánto texto tenga el
catálogo: Treeshop tiene descripción en 78 de 3752 productos, así que el vector
se arma con título, marca, categoría y atributos. «Algo para correr en invierno»
devuelve campera, calzas y joggers; «ropa de abrigo para el frío» trae primero
ropa interior. Está en LIMITACIONES, porque es lo que un comercio tiene que
saber para decidir si le conviene escribir descripciones.

---

## ADR-133 — Sin clientes reales, se simulan: declarados, en su propia tienda y por los caminos de producción

**Fecha:** 2026-09-24
**Estado:** Accepted

**Contexto**
La Fase 8 del v2 quedó entera detrás de una regla: «ningún bloque se empieza sin
un cliente real que lo pida». Pick Commerce **no es un producto vendido**: no
hay comercios que paguen, y Treeshop, que va a operar, todavía no opera. La
regla no esperaba un cliente: bloqueaba la fase para siempre.

Los bloqueos eran de dos clases. Cohortes, RFM, envejecimiento de inventario y
entender la consulta necesitan **historia**, y había 4 clientes y 11
búsquedas. B2B, multi-location y los presets necesitan **alguien que los
pida**. Esta decisión resuelve la primera clase; los comercios simulados son la
segunda unidad de trabajo.

**Decisión**

- **La simulación reemplaza al cliente real como criterio de entrada**, y se
  declara como tal en los documentos y en los datos: el mismo principio que
  CLAUDE.md pide para un mock, que existe pero nunca se disfraza de
  implementación.
- **Vive en su propia organización**, «Tienda simulada» (`simulada`), con una
  copia del catálogo de Treeshop (`pnpm simular:catalogo`). Pick Demo tiene 6
  productos y la comparte el e2e; Treeshop va a operar y un pedido falso ahí
  aparecería en sus reportes el día de la apertura. Borrar la organización se
  lleva todo en cascada.
- **Los pedidos entran por `create_order` y cambian de estado por
  `admin_set_order_status`** (`pnpm simular:compradores`). Precio, envío,
  descuento y stock los calcula el mismo código que en producción; lo único que
  se hace por fuera es correr las fechas hacia atrás, que es lo que la historia
  necesita y ningún camino real hace.
- **El generador es puro y determinista** (`scripts/simulacion.ts`, con sus
  tests): la misma semilla y la misma fecha dan la misma tienda.

**Tres barandas, porque escribe pedidos**

1. Sólo corre sobre una tienda con `settings.demo = true` (ADR-108): el pedido
   no le escribe a nadie. Verificado: contra Treeshop se niega.
2. Se niega si hay un solo pedido cuyo correo no termine en
   `@simulacion.invalid`, un dominio que por RFC 2606 no puede existir.
3. Se niega si hay pedidos que no son parte del plan de esta corrida. Existe
   porque se necesitó: la primera corrida se cortó por un `fetch failed` con los
   898 pedidos creados, y al retomarla un día después **la semilla sorteaba otra
   tienda** —869 de 898 pedidos ajenos—, porque el peso del fin de semana
   depende de la fecha. `--hasta` fija la fecha de la corrida original; con ella
   el plan reproduce los 898.

Retomar exige además partir del **mismo stock**: se le devuelve al catálogo lo
que tienen tomado los pedidos ya creados, que es la misma cuenta que usa
`--limpiar` para devolverlo a la sucursal.

**Lo que la forma de los datos decide, y por qué**

- Popularidad con ley de Zipf: pocos productos venden mucho y la mayoría nunca,
  que es lo que el envejecimiento de inventario necesita ver.
- Cuatro arquetipos —una compra 65 %, ocasional 25 %, fiel 8 %, VIP 2 %—: sin
  recurrencia desigual, RFM y cohortes dan una tabla plana.
- El tráfico crece a lo largo del período y sube el fin de semana. Con 120
  visitas anónimas diarias la conversión queda cerca del 2,5 %; con 40 era 7,6 %,
  que ninguna tienda tiene.
- Las búsquedas salen del catálogo, con errores de tipeo, y **el número de
  resultados se mide contra `catalog_search`**: una búsqueda sin resultados lo es
  de verdad. Se miden de a una: de a tres ya se pisaban hasta el statement
  timeout, que quedó en el backlog porque es el costo que Treeshop paga igual.
- 170 días, por debajo de los 180 de retención de `store_events`: más atrás, la
  purga del storefront los borraría.

**Lo que salió, leído por `admin_analytics`**

    sesiones        33.823     carrito 11,3 %   checkout 5,6 %   compra 2,48 %
    pedidos            898     787 entregados, 58 cancelados (6,5 %), 53 en curso
    compradores        600     444 una vez, 17 con cuatro, 3 con ocho
    frases             704     113 sin resultados, 9956 búsquedas

La compra sale de `orders` sin cancelados, como en la tienda de verdad (ADR-099).
Lo que **no** es realista, y queda dicho: el ranking de las frases es de Zipf
sobre un orden al azar, así que lo más buscado es «predator» y «hyverse», palabras
del catálogo pero no las que más escribiría alguien.

**Consecuencias**

- La regla de la Fase 8 cambia de «un cliente real que lo pida» a «un cliente,
  real o simulado y declarado». Lo que **no** cambia: nada promete una capacidad
  que el proveedor de abajo no tiene. Una simulación no le da escritura al ERP de
  Estilo Sport, así que las reservas de multi-location siguen bloqueadas (ADR-086).
- Los eventos simulados llevan `data.simulado`, y los clientes el dominio
  `.invalid`: son lo que `--limpiar` borra, y lo que distingue una fila simulada
  a quien la encuentre en la base.
- `search_queries.last_seen` queda en la fecha de la corrida y no en la simulada:
  la llave de esa caché la arma `registrar_busqueda`, y duplicar su
  normalización para poder fechar sería la segunda copia que ADR-132 evita.
- No se copian los vectores: la búsqueda semántica de la tienda simulada necesita
  `pnpm embeddings --tienda simulada`.

---

## ADR-134 — Cohortes y RFM: se calculan en SQL, desde los pedidos, y la recencia es relativa a la tienda

**Fecha:** 2026-09-24
**Estado:** Accepted

**Contexto**
La Fase 8 tenía «cohortes y RFM» esperando identidad de cliente entre pedidos y
datos contra qué validarlas. La identidad existe desde la Fase 5 —`customers` es
único por tienda y correo, y cada pedido lleva su `customer_id`— y los datos los
puso la tienda simulada (ADR-133): 898 pedidos de 600 compradores en 170 días.

**Decisión**

- **Dos funciones `security invoker`** sobre `orders` y `customers`, como
  `admin_customers`: la defensa es RLS, que ya exige ser miembro.
  `admin_customer_cohorts` agrupa por mes de primera compra y cuenta cuántos
  volvieron cada mes siguiente; `admin_customer_segments` devuelve los siete
  segmentos y la lista paginada de uno.
- **Todo sale de los pedidos sin cancelados**, igual que el resto del dinero del
  Admin. Un cliente cuyo único pedido se canceló no está en ninguna cohorte ni
  en ningún segmento: en la tienda simulada son 31 de 600.
- **La regla del segmento vive sólo en SQL**, porque la lista se filtra y pagina
  en el servidor. El core tiene los nombres y las descripciones; si tuviera
  también la regla, serían dos copias de lo mismo.
- **El mes se corta en la zona de quien mira**, que manda el navegador: es la
  misma con que el Admin decide qué es «hoy». Un pedido de las 22 h del último
  día del mes en Asunción es de ese mes; en UTC sería del siguiente. Una zona
  desconocida cae en UTC en vez de fallar.

**Cómo se puntúa, y por qué no con quintiles en todo**

- **R** es `cume_dist` sobre la última compra, en cinco escalones. Con `ntile`,
  una tienda de tres clientes pondría al más reciente en el escalón 3 y no en el
  5; con `cume_dist` el más reciente es siempre 5 y los empates comparten
  escalón.
- **F va por bandas fijas** —1, 2, 3, 4 o más— y no por quintiles: en la tienda
  simulada el 74 % compró una vez, y repartir empates en quintiles manda a
  clientes idénticos a segmentos distintos.
- **M no decide el segmento.** Se muestra como parte de la facturación de cada
  uno, que es la pregunta que el comercio le hace.

Siete segmentos exhaustivos, evaluados en orden: los mejores (F ≥ 4, R ≥ 4),
fieles (F ≥ 3, R ≥ 3), en riesgo (F ≥ 2, R ≤ 2), volvieron una vez (F = 2),
nuevos (F = 1, R ≥ 4), enfriándose (F = 1, R = 3) y dormidos (el resto).

**Lo que salió sobre la tienda simulada**

    cohortes   abr 52 · may 88 · jun 97 · jul 105 · ago 115 · sep 112
               mes 1: 25 %, 22 %, 16 %, 22 %, 16 %
    segmentos  los mejores 20 · fieles 37 · volvieron una vez 54 · nuevos 148
               enfriándose 83 · en riesgo 34 · dormidos 193

Las cohortes suman 569, que es el total del RFM: las dos funciones cuentan a la
misma gente. Cada una tarda 0,8 a 1,3 s contra el remoto, red incluida.

**Consecuencias**

- La recencia relativa tiene su costo y está en LIMITACIONES: con pocos
  clientes, alguien que compró hace una semana puede ser «dormido» porque todos
  los demás compraron después. Con días fijos el problema es el inverso —una
  tienda de temporada tendría a todos dormidos en marzo— y no hay un umbral que
  sirva a todas.
- La pantalla lista a quién escribirle y no le escribe. Una campaña a un
  segmento es otra unidad de trabajo, y pasa por el mismo camino de correos que
  ya existe.
- De paso se arregló el sidebar: una entrada que coincide por prefijo ya no se
  marca activa si una hermana más específica también coincide. Productos y
  Descripciones se marcaban las dos desde la Fase 8.

---

## ADR-135 — La antigüedad del stock se mide desde la última venta, porque la base no sabe cuándo entró

**Fecha:** 2026-09-24
**Estado:** Accepted

**Contexto**
Lo último de Advanced Analytics era el envejecimiento de inventario: cuánta plata
hay parada en stock, y hace cuánto. La forma de libro mide desde que entró cada
unidad, y **la base no lo sabe**: `inventory_levels` guarda cuánto hay, no cuándo
llegó, y no existe un libro de movimientos de stock. El ERP y el importador
reescriben el número sin dejar rastro.

«Ventas por producto» ya tenía un modo «lo que no se movió», y se evaluó
extenderlo. No alcanzaba: lista las variantes sin ventas **en un período**,
ordenadas por título, y no dice cuánta plata representan ni hace cuánto que están
quietas. Es otra pregunta.

**Decisión**

- **La antigüedad es días desde la última venta** de la variante, en toda la
  historia y sin cancelados, o **desde el alta del producto** si nunca se vendió.
  Es lo que la base sí sabe, y la pantalla lo dice así.
- **Por variante**, porque el stock es por variante: un producto con el M agotado
  y el XXL quieto no está quieto a medias.
- **Cuatro tramos** —hasta 30 días, 31 a 90, 91 a 180, más de 180— decididos en
  SQL, porque la lista se filtra por ellos en el servidor. Lo más viejo primero y,
  a igual antigüedad, lo que más plata tiene parada.
- **El valor va a precio y a costo, y el de costo con su cobertura** (ADR-101):
  una variante sin costo cargado no vale cero, vale «no sé».
- Entra todo el stock menos lo archivado: una variante inactiva o en borrador
  también es plata en el depósito.

**Lo que salió sobre la tienda simulada**

    hasta 30 días       76 variantes     215 u
    31 a 90          1.362 variantes   2.864 u
    91 a 180         4.727 variantes   8.042 u
    más de 180         582 variantes   1.084 u

La cola de Zipf de la simulación (ADR-133) hace lo que se esperaba: la mayoría del
catálogo nunca se vendió y queda contada desde su alta. Tarda 1,1 s contra el
remoto sobre 6747 variantes con stock.

**Lo que hubo que arreglar para medirlo**
`simular:catalogo` descartaba `created_at`, así que en la tienda simulada todos
los productos nacían el día de la copia y lo que nunca se vendió tenía cero días.
Ahora conserva la fecha de alta del origen, y la tienda ya copiada se corrigió
por handle.

**Consecuencias**

- La medida es un piso, no la edad real: una unidad que entró ayer de un producto
  que se vendió hace un año aparece con un año. Está en LIMITACIONES.
- La edad real necesita un libro de movimientos de stock —entradas, ajustes,
  ventas, devoluciones— con fecha. Es también lo que multi-location va a pedir
  para transferencias, así que se decide ahí y no acá.

---

## ADR-136 — El stock lo escribe quien nombra la sucursal, y un número suelto sólo vale con una

**Fecha:** 2026-09-27
**Estado:** Accepted

**Contexto**
`inventory_levels` guarda el stock por sucursal desde la Fase 4, y el Admin nunca
lo supo. `admin_save_product` tomaba **la primera** sucursal de la tienda
—`order by created_at limit 1`— y el formulario mostraba la **suma** de todas.
Con una sucursal, que es lo que tiene toda tienda del proyecto hasta hoy, las dos
cosas coinciden y no se nota. Con dos, son tres defectos a la vez, los tres
anotados en el backlog y el más viejo del 2026-08-26:

- el ajuste va al depósito que no es;
- el formulario lee 50 —30 de un depósito y 20 del otro— y guarda 50 en el
  primero: cada guardado que no toca el campo suma, 30 → 50 → 70;
- un -2 en una sucursal y un 5 en otra son 3 en toda lectura, y el descuadre
  —que es justo lo que el espejo del ERP existe para mostrar (ADR-009)—
  desaparece.

Multi-location avanzado depende de esto y no al revés: construir allocation sobre
un stock que se escribe en la sucursal equivocada es construir sobre un bug.

**Decisión**

- **El payload nombra la sucursal.** `variant.stockPorSucursal` es un mapa
  `{ location_id: unidades }`, y **sólo las sucursales que aparecen se escriben**:
  la que no viene queda como está. De ahí sale que el formulario ya no pueda
  escribir una suma ni pisar un depósito que no estaba editando.
- **El número suelto `stock` sobrevive, y falla si hay más de una sucursal.** No
  se borró porque el import de CSV tiene una columna de stock y no puede tener
  más —el mismo esquema valida el formulario y el archivo—. Antes elegía una
  sucursal; ahora, con dos, levanta una excepción que nombra el problema. Un
  espejo que miente es peor que un espejo que se cae.
- **Las tres pantallas que cargan stock pasan la sucursal siempre**, incluso
  cuando hay una sola, así que el camino del número suelto no se usa desde el
  Admin: queda como compatibilidad para lo que entre por fuera.
- **Se edita una sucursal a la vez, con un desplegable**, y no una columna de
  stock por sucursal. Con tres depósitos y ocho variantes serían veinticuatro
  campos para editar uno, que es lo que se hace. Con una sola sucursal no hay
  desplegable y la pantalla es la de antes, byte por byte.
- **El export de CSV usa la misma sucursal elegida que el import.** Si el archivo
  sale con la suma y entra en un depósito, un ida y vuelta duplica el inventario.
- **Las sucursales se crean y se renombran en Configuración**, con el total y
  cuántas variantes están en negativo al lado de cada una. Ese contador es el
  tercer hallazgo puesto a la vista.

**Consecuencias**

- Una tienda con una sucursal no cambia en nada: ni pantalla, ni payload, ni SQL.
- `admin_locations` es la única lectura nueva, y es `security invoker`:
  `locations` e `inventory_levels` ya tienen política de lectura por membresía.
- El ERP sigue dejando todo en una sucursal, porque su payload no dice el depósito
  (ADR-086). Eso no cambia acá y está en LIMITACIONES.
- **Borrar una sucursal no existe**, y no es un olvido: `inventory_levels` cuelga
  de ella con `on delete cascade`, así que el borrado se llevaría su stock sin
  decirlo. La guarda no puede ir en un trigger porque el mismo cascade ocurre al
  borrar la tienda —lo usa el teardown del e2e— y ahí tiene que funcionar. Cuando
  haya que cerrar una sucursal, la pregunta es a dónde va su stock, y eso pide el
  libro de movimientos que ADR-135 también nombra.
- Lo que sigue faltando de multi-location es lo que el ERP bloquea: allocation,
  pickup por sucursal, routing y reservas por capability.

---

## ADR-137 — El precio se lee de la frase sin un LLM, y el resto de «entender la consulta» sigue esperando tráfico real

**Fecha:** 2026-09-27
**Estado:** Accepted

**Contexto**
`search query understanding` se difirió en la Fase 11 con dos motivos buenos —un
viaje a OpenAI en el camino crítico de la PLP, y que el storefront tendría que
poder descifrar la credencial— y con uno que PROJECT.md §21 declara: **no usar un
LLM completo para cada búsqueda**. La Fase 7 resolvió los dos primeros para los
embeddings: el storefront le pide el vector al Worker del Admin, se guarda por
hash y sólo se paga una vez por frase nueva (ADR-132). Con eso, la objeción
técnica ya no alcanza para diferirlo.

Lo que sí sigue faltando son **consultas reales**. El ROADMAP decía que los
compradores simulados desbloqueaban este ítem, y eso era optimista: las frases que
`pnpm simular:compradores` genera son marcas, categorías y palabras sueltas de los
títulos del catálogo (`scripts/simulacion.ts`), o sea un vocabulario que salió del
propio generador. Validar un intérprete de intención contra eso es circular. Las
consultas reales son las once de Treeshop, y no alcanzan para nada.

Pero hay un escalón de «entender la consulta» que **no necesita ni LLM ni datos
para validarse**, porque es determinista y se prueba con una tabla: el precio.
«campera hasta 200 mil» es un término más un filtro que el catálogo ya sabe
aplicar —`CatalogQuery` tiene `precioMin` y `precioMax` desde la Fase 2— y sin
esto «hasta», «200» y «mil» entraban como palabras a buscar, donde no coinciden
con nada y, al exigirse todos los términos, **vacían la página**.

**Decisión**

- `interpretarConsulta(frase, moneda)` en el core devuelve los términos sin lo que
  se convirtió en filtro, más el rango de precio. Es pura y tiene su tabla de
  casos: es donde vive la regla, así que es donde se prueba.
- Tres formas y sus variantes sin acento, que es como se escribe en un buscador:
  «hasta / menos de / máximo X», «desde / más de / mínimo X» y «entre X y Y».
  «200 mil», «200k» y «200.000» son lo mismo —el punto es separador de miles en
  es-PY y la coma es el decimal—.
- **Un número suelto no es un precio.** «campera 500» puede ser un modelo y
  `SKU-12345` es un código; adivinar ahí costaría más de lo que arregla.
- **El `precio` de la URL manda** sobre el que se dedujo de la frase: un filtro que
  alguien tocó gana sobre uno inferido, y así el control de precio no pelea con lo
  que quedó escrito en el buscador. Por lo mismo, el contador de «filtros activos»
  cuenta sólo el de la URL, que es el único que el botón de limpiar puede quitar.
- El precio se convierte a unidades mínimas con la moneda de la tienda: «hasta
  200» en una tienda en dólares son 20000 centavos, y sin eso el filtro buscaría
  productos de dos dólares.
- Al catálogo, al vector y a la sugerencia de «¿quisiste decir…?» les va **la
  frase sin el precio**. El evento de analytics guarda lo que la persona escribió.

**Lo que queda afuera, y qué lo desbloquea**

- Mapear palabras a valores de faceta —«negra» al atributo `color`— necesita el
  vocabulario real de la tienda en el pedido, y ahí sí entra un modelo. Se decide
  cuando haya consultas reales que muestren qué se escribe: hoy elegir entre
  «lo hago con el catálogo en el prompt» y «lo hago con una tabla de sinónimos»
  sería tirar una moneda.
- La parte semántica de §21 ya está cubierta por ADR-132, que entra como **fuente
  de filas**. Lo que falta de «query understanding» es la extracción de filtros, no
  la intención.

---

## ADR-138 — El resumen del negocio lo redacta el modelo, pero los números los calcula el Admin

**Fecha:** 2026-09-27
**Estado:** Accepted

**Contexto**
El «AI summary de analytics» quedó diferido entero en la Fase 11 porque el propio
ROADMAP lo marcaba opcional. Lo que lo vuelve útil ahora no es la IA: es que ya
hay qué resumir. El Resumen muestra ventas, pedidos, unidades, ticket y margen con
su cobertura; Analytics muestra sesiones, el embudo de tres escalones, la
conversión y los términos buscados sin resultados. Son diez números, y un comercio
que los mira no sabe por dónde empezar. Lo que falta no es el dato: es **cuál de
todos importa**.

El riesgo es obvio y es uno solo: un número inventado. Un párrafo que dice «las
ventas subieron un 20 %» al lado de una pantalla que no muestra ninguna
comparación es peor que no tener resumen, porque quien lo lee le cree.

**Decisión**

- **Los números viajan calculados.** El Admin arma `NegocioParaResumir` con lo que
  ya tiene en pantalla y el modelo sólo redacta: no suma, no divide, no estima.
  Así el párrafo no puede contradecir a la tabla que está debajo.
- Las instrucciones lo prohíben explícitamente —ningún número, porcentaje,
  tendencia ni comparación que no esté en la lista— y piden 3 a 5 oraciones, un
  párrafo, sin markdown, cerrando con **una** cosa concreta para hacer.
- **Lo que falta se declara faltante, no como cero.** Un margen sin costo cargado
  es «no sé» (ADR-101), y si la medición de sesiones empieza después del borde del
  período el pedido lo dice, porque comparar ventas de treinta días contra el
  embudo de tres es el error que ADR-099 documenta.
- Va en **Resumen** y no en Analytics, aunque cruce las dos fuentes que ADR-067
  separa a propósito. Se puede porque no inventa la relación: recibe la conversión
  ya calculada, con el numerador de `orders`. Y va ahí porque es la pantalla en la
  que se entra.
- `entradaDelNegocio()` es pura y está en el core con su tabla de casos: el
  formato del pedido es lo único que se puede probar sin gastar la clave de nadie,
  y es donde estaría el error si un número apareciera mal.
- Se pide a mano, botón por botón: gasta la clave del comercio, así que pide
  `settings.write` como todo lo que gasta, y el Worker lo resuelve con el mismo
  camino que las demás rutas de IA.
- Sin `json_schema`: la salida es un párrafo, no un objeto, y forzarle un esquema
  de un solo campo sería ceremonia.

**Consecuencias**

- El resumen no queda guardado: se pide cuando se quiere leer. Guardarlo obligaría
  a decidir qué pasa cuando los números cambian debajo, y un resumen viejo al lado
  de números nuevos es exactamente el problema que esto evita.
- Como las demás llamadas del Admin, **no entra en `ai_usage`**: ese contador sólo
  registra lo que pasa por el storefront, que es el único que tiene la clave de
  servicio (ADR-132). Está en LIMITACIONES.
- El costo es de centavos por pedido —el pedido son unos cientos de tokens de
  entrada—, así que no lleva confirmación previa como el lote de descripciones.

---

## ADR-139 — Los tres presets, y por qué «Blank» no redefine nada

**Fecha:** 2026-09-27
**Estado:** Accepted

**Contexto**
`Blank`, `Fashion` y `Sport` estaban en la Fase 12 de v1 y se difirieron con un
argumento que sigue siendo cierto: **el segundo cliente real es el que dice qué es
un preset y qué es un override**, y hasta que exista, un preset es una conjetura
con forma de código. Lo que cambió es que ya hubo un preset real. Treeshop
(ADR-110) necesitó exactamente cuatro cosas —familia tipográfica, acento, radio de
botón y cómo entra la foto en su caja— y **ninguna clase de componente**. Eso deja
de ser conjetura: es la lista de lo que un preset toca, medida contra una tienda en
producción.

**Decisión**

- Tres archivos en `packages/commerce-ui/src/styles/presets/`, importables por
  subpath. Un preset es CSS con **un solo bloque `@theme`** y nada más.
- **`blank.css` no redefine ninguna variable**, y eso es el punto. Los tokens base
  ya son la versión neutra —ADR-027 descarta la estética de template—, así que un
  «Blank» que redefiniera variables para dejarlas igual sería un archivo que existe
  para aparecer en una lista. Lo que aporta es el **inventario**: todo lo que se
  puede pisar, comentado y con su efecto al lado, para copiar y descomentar. Es la
  documentación en la forma en la que se usa.
- `fashion.css`: serif **sólo** en los títulos —con serif también en el cuerpo, una
  ficha con talles y medidas se vuelve difícil de leer—, acento casi negro porque en
  moda el color lo pone la ropa, cantos rectos, y retrato 2/3 con `cover`.
- `sport.css`: acento saturado y botón pastilla, que son las dos decisiones que
  Treeshop ya probó contra un catálogo real, más foto cuadrada con `contain`.
- **`--aspect-product` y `--fit-product` se cambian juntos o no se cambian.**
  `cover` con una proporción casi cuadrada deja medio cuerpo afuera, y 2/3 con
  `contain` dibuja dos franjas de fondo en cada foto. Y `cover` sólo es aceptable
  con fotografía propia y pareja: medido sobre el catálogo de Treeshop, las
  proporciones van de 0,32 a 2,89 y con `cover` se ve la franja del medio de cada
  producto. Por eso `fashion` recorta y `sport` no.
- Un test mecánico en `commerce-ui` comprueba que ningún preset tenga selectores,
  `@utility`, `@apply` ni nada fuera del `@theme`. Se mide sobre el **archivo** y no
  sobre el CSS compilado: lo que hay que impedir es que alguien escriba un selector.
  Comprobado al revés, agregándole una clase a un preset: el test se pone en rojo.
- Sin dependencias nuevas: las familias son Georgia y la del sistema. Una fuente de
  marca entra instalando su paquete de fontsource y cambiando una variable, como
  hizo Treeshop con Montserrat — nunca Google Fonts, que agrega un dominio al que
  conectarse antes de poder dibujar texto.

**Lo que esto no es**

- **No hay una tercera vitrina donde mostrarlos.** Existen `demo` y `treeshop`, y
  las dos tienen su propio look decidido; montarles un preset encima sería cambiarle
  la cara a una tienda en producción para probar un archivo. Lo que garantiza que
  funcionan es que el mecanismo es el mismo que corre en `sontres.shop` y que las
  variables que tocan son las que Treeshop ya pisa.
- **No hay selector de preset en el Admin**, y no debería haberlo: un preset es una
  decisión de build de la app de esa tienda, no un ajuste que se cambia en caliente.
  Lo que se ajusta por tienda vive en `store_settings`.

---

## ADR-140 — Una reseña la escribe quien compró y recibió, y no se edita nunca

**Fecha:** 2026-09-27
**Estado:** Accepted

**Contexto**
La fidelidad de la Fase 8 de v2 tiene dos formas de ganar puntos, y una es escribir
una reseña. Las reseñas **no existían**: ni tabla ni pantalla. Así que son una
dependencia de esa fase y no un detalle, como el propio ROADMAP anotó.

Pero valen por sí solas, y por un motivo que ya está medido: de los 3752 productos
activos del piloto, 3674 no tenían descripción (ADR-130). Una reseña es lo único del
catálogo que **el comercio no escribe** y que igual dice qué es el producto.

**Decisión**

- **Sólo reseña quien compró y recibió.** Se verifica contra `order_items` con el
  pedido en `delivered`. No es una regla de flujo: opinar de algo que no llegó es
  opinar de la espera, y es lo que hace que la estrella valga.
- **Una por persona y por producto**, con un `unique`. Sin él, diez reseñas de la
  misma cuenta suben un promedio sin que nadie mienta.
- **Nace pendiente.** Texto de un tercero en la vitrina de otro sin que nadie lo
  lea es un riesgo que no se le impone a un comercio. La contra es real y está
  aceptada: **sin moderación, las reseñas no aparecen**, y eso está en LIMITACIONES.
- **El texto y la estrella no se editan, y eso es estructural, no una omisión de la
  pantalla.** La tabla concede `select, insert` a `authenticated` y nada más; el
  Admin cambia el estado por `admin_moderate_reviews`, que es `definer` y sólo toca
  `status`. Poder corregir una reseña es poder escribirla. Comprobado en PGlite: con
  el grant de `update` puesto, el dueño podía reescribirla.
- **El pedido que la justifica lo elige la base**, no el cliente. `escribir_resena`
  busca el pedido entregado más reciente con ese producto. Si el id viajara en el
  payload habría que validar que sea suyo, que esté entregado y que tenga ese
  producto, y eso es la misma regla escrita dos veces.
- **La vitrina muestra la inicial, nunca el nombre.** Publicar el nombre completo de
  un comprador en una página pública no es algo que nadie haya aceptado al comprar.
  En el Admin sí aparece: ahí el comercio mira su propia ficha de cliente.
- El texto es **opcional**: una estrella sola es una reseña válida y exigir texto
  baja mucho cuántas se escriben. Con tope de 1000 caracteres, para que el campo no
  sea un blog.
- El formulario es un `<form method="post">` a una ruta del sitio, **sin
  JavaScript**. Una island sería peso en el PDP —que tiene presupuesto— para
  resolver lo que el navegador hace solo, y fallaría justo en el caso que importa.
- Dos funciones `definer` para el navegador, por la asimetría que ADR-121 y la
  corrección de la wishlist ya documentaron: `product_variants` no tiene política
  para `authenticated`, así que el cruce con `order_items` desde el cliente
  devolvería cero filas siempre y el formulario diría «no encontramos tu pedido»
  con el pedido entregado en la base.

**Consecuencias**

- El promedio **no cuenta las pendientes ni las rechazadas**, ni en el total ni en
  el número. Con su test.
- No hay respuesta del comercio a una reseña, ni fotos, ni «me sirvió». Cada una es
  otra decisión y ninguna tiene un pedido detrás todavía.
- **No se emite `aggregateRating` en el JSON-LD**, aunque el dato existe. Con dos
  reseñas, marcar el producto con estrellas en Google es cierto y engañoso a la vez;
  se decide con volumen real.
- La fidelidad ya tiene de dónde colgar su segunda forma de ganar puntos, y se
  pagará **sin mirar la estrella**: pagar por estrellas altas es cómo se arruina el
  activo que la reseña construye.

---

## ADR-141 — Los puntos son un libro append-only, y un canje es un cupón del motor que ya existe

**Fecha:** 2026-09-27
**Estado:** Accepted

**Contexto**
La fidelidad estaba escrita en el v2 original **dos fases antes de que existiera
cualquier identidad de comprador**, y ahí un ledger sin sesión es un ledger con clave
email: cualquiera que sepa el correo reclama los puntos. Con la cuenta de la Fase 1 y
las reseñas de ADR-140 ya están las dos piezas que necesitaba.

De todo el bloque, **una sola decisión no se puede cambiar después**, y es la forma del
libro. Con un saldo —una columna `points` en el cliente— la Fase 9, que hace que los
puntos crucen tiendas, sería reescribir esto. Con un libro donde cada movimiento lleva
la tienda que lo emitió, la Fase 9 es una consulta encima. Cuesta lo mismo hoy.

**Decisión**

- **`loyalty_ledger` es append-only y cada movimiento lleva su `store_id`.** Nunca un
  saldo guardado. Una cancelación **emite el movimiento inverso**, no borra el
  anterior: un libro que borra no puede explicar por qué bajó el saldo.
- **Dos formas de ganar y ninguna más**: una compra **cobrada** da 20 puntos y una
  reseña **publicada** da 10. Se descartaron las misiones por navegar —visitar, buscar,
  agregar al carrito, compartir— porque premian una acción sin valor económico y se
  farmean abriendo una pestaña: con treinta días de visitas valiendo más que una compra,
  se paga más por mirar que por comprar.
- **Al cobrar, no al crear.** El único pedido que existía en el piloto estaba
  `cancelled`: es exactamente el caso. Y va en un **disparador** y no en la pantalla de
  pedidos porque hay más de un camino a «pagado» —la pantalla hoy, una pasarela cuando
  exista, un script de conciliación si aparece—, y un programa que sólo funciona por la
  pantalla con la que se escribió se rompe con la siguiente.
- **La reseña se paga sin mirar la estrella** (ADR-140), y al publicarse, no al
  escribirse: pagar antes de la revisión convierte esto en una máquina de texto que
  nadie va a leer.
- **Los índices únicos parciales son los que hacen idempotentes a los disparadores**:
  uno por `(order_id, source)` y uno por `review_id`. Acreditar dos veces deja de ser
  posible, no deja de pasar por suerte. Por eso `reverso` es su propio origen y no un
  `compra` negativo.
- **El programa arranca apagado.** Una tienda que no lo pidió no empieza a emitir un
  pasivo porque se desplegó una migración. Las reglas viven en
  `store_settings.settings.loyalty` y **sólo ahí**: el disparador las lee para emitir y
  el Admin para mostrarlas, así que escribirlas también en TypeScript haría que el día
  que cambie una, el sistema pague una cosa y la pantalla diga otra.
- **El vencimiento se calcula al leer, y se escribe.** Sin vencimiento el pasivo crece
  para siempre y nadie canjea; con una tarea programada habría que montar y vigilar una
  tarea programada. `app.vencer_puntos` se llama al leer el saldo y al canjear, y la
  cuenta es FIFO en agregado: de lo ganado antes del corte vence lo que no consumieron
  los gastos anteriores. Eso evita el error clásico —restar dos veces unos puntos que ya
  se habían gastado— sin rastrear qué gasto consumió qué crédito. Con su test.
- **Un canje gasta puntos y emite un cupón del motor de promociones.** Tres de los
  cuatro tipos de canje ya son una promoción: `discount_type`, `discount_value`, alcance
  y tope de usos existen desde la Fase 9. Así **no hay un segundo lugar donde se decida
  un importe**, que es el bug que este repo ya conoce —el carrito mostrando un precio y
  el pedido cobrando otro—.
- **El cupón queda atado a quien canjeó porque sólo esa persona lo recibe**, y vale una
  sola vez. Atarlo por `customer_id` obligaría a que `cart_promotions` supiera quién
  está comprando —hoy no lo sabe, y el checkout de invitado no tiene a nadie—, o sea
  tocar el camino del dinero para algo que un código de un solo uso ya resuelve. Si
  alguien lo comparte, los puntos ya los pagó; el tope de un uso acota al comercio.
- **El tipo de cambio implícito se muestra al fijar el costo en puntos**, y es lo más
  valioso de esa pantalla: «una compra da 20 puntos: alcanza para 2 canjes de esto» es
  lo único que impide que un premio a diez puntos se convierta en un descuento
  permanente del 12 % sobre cada pedido sin que nadie lo note.
- **Un premio agotado se ve como agotado**, y el stock se toma en el canje con la
  condición en el `update`: así un canje agotado nunca termina en un error al pagar.
- Un premio se **archiva**, no se borra (ADR-060): el libro apunta a él y un canje viejo
  tiene que poder seguir explicando de dónde salió su cupón.

**Lo que queda afuera, con su motivo**

- **Envío gratis como premio.** El envío lo calcula `create_order` aparte y no es un
  descuento sobre el subtotal (ADR-107, ADR-114), así que sería un tipo nuevo en el
  camino del dinero. Se hace con su propio trabajo y sus propios tests, no de paso.
- **Un producto de regalo.** Necesita reservar stock, que es lo que evita que un canje
  agotado falle al pagar, y eso es multi-location: lo bloquea el ERP (ADR-086, ADR-136).
- **Ajustes manuales de puntos desde el Admin.** El enum ya contempla `ajuste`, pero
  darle a una pantalla la capacidad de emitir un pasivo pide su propia auditoría, y no
  hay un pedido detrás.
- **La racha diaria con multiplicador y las encuestas.** Cada una es emisión sin venta
  detrás; entran de a una y con tope, cuando el programa tenga historia.

**Lo que costó un ciclo**

`app.regla_de_puntos` leía `store_settings` con un `from`: una tienda **sin** fila de
ajustes no devolvía «apagado con los defaults», devolvía cero filas, o sea `null`. La
pantalla de Fidelidad se quedaba en el esqueleto para siempre, sin un error en ningún
lado. **Lo encontró el e2e del Admin**, no el typecheck ni PGlite, porque los tests
siembran `store_settings` para otras cosas y ahí la función nunca se quedaba sin fila.
Es la misma clase de falso verde que ADR-121 documentó con la wishlist.
