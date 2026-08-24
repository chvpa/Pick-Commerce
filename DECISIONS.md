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
**Estado:** Accepted

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

| ID    | Tema                               | Motivo                                       |
| ----- | ---------------------------------- | -------------------------------------------- |
| P-001 | Primer gateway real                | Elegir el que mejor sirva al primer piloto   |
| P-002 | Storage media definitivo           | Supabase Storage vs R2 por caso de uso/costo |
| P-003 | Analytics store inicial            | Postgres/Analytics Engine/otro según volumen |
| P-004 | Primera estrategia de reservations | Depende de capabilities del ERP piloto       |
| P-005 | CLI/provisioner exacto             | Puede empezar manual y automatizarse luego   |

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
