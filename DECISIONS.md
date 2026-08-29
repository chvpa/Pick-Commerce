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

---

# Decisiones pendientes

| ID    | Tema                                   | Motivo                                                                                                                                   |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| P-001 | Primer gateway real                    | Sigue abierta: el contrato y un proveedor simulado ya existen (ADR-080); falta el adapter real y sus credenciales                        |
| P-002 | ~~Storage media definitivo~~           | **Resuelta:** Supabase Storage, por estar ya en el stack (ADR-082). R2 queda como salida si el egress pesa                               |
| P-003 | Analytics store inicial                | Postgres/Analytics Engine/otro según volumen                                                                                             |
| P-004 | ~~Primera estrategia de reservations~~ | **Resuelta:** el ORDS de Estilo Sport no las tiene, así que validar → cobrar → empujar, sin prometer cero overselling (ADR-084, ADR-085) |
| P-005 | CLI/provisioner exacto                 | Puede empezar manual y automatizarse luego                                                                                               |

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
`tw-animate-css`, `@fontsource-variable/geist`, y — la menos obvia — `shadcn`
como dependencia de **runtime**, porque `styles.css` hace
`@import "shadcn/tailwind.css"`.

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

**Limitación conocida**
El stock se escribe en la primera sucursal de la tienda. El Admin todavía no
tiene selector de sucursal, y elegir una a ciegas escondería que falta
configurarla. Registrado en el backlog.

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
