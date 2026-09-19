# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Este repo usa IA como parte activa del desarrollo. La continuidad arquitectónica entre sesiones la sostienen los documentos, no la conversación: **no asumir que el mensaje actual trae todo el contexto**. Ante una duda de arquitectura, la respuesta está en `DECISIONS.md` antes que en la intuición.

## Estado actual

Las fases, sus porcentajes y el estado de v1 los declara
[ROADMAP.md](ROADMAP.md), y sólo ese documento. Acá va la orientación de
arranque: de qué está hecho el sistema, no cuánto falta.

El primer cliente es **Treeshop** (ADR-110): `apps/treeshop/`, en línea desde el
2026-09-11 en https://sontres.shop —el apex y `www` al Worker `treeshop`, el
Admin en `admin.sontres.shop`—, con el catálogo importado del Supabase de
Camelot, la portada administrable y el envío por zona entregado (ADR-114). Queda
el arte del hero y de las marcas, que es del cliente. Es la tienda personal del
dueño del proyecto tratada como cliente para validar el producto de punta a
punta: todavía no hay ningún comercio que pague, y lo que falta —el remitente
propio del correo, una pasarela real— está diferido a propósito y registrado en
[LIMITACIONES.md](LIMITACIONES.md).

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
- **Fase 8** — ERP: puerto `ERPAdapter` con matriz de capacidades, adapter del
  Oracle ORDS de **Estilo Sport** —el piloto pasó de Camelot, que sigue apagado—
  e importador acotado. Sólo la Etapa A: el ERP entra y **nada sale**. La B quedó
  descartada para este cliente, que no da escritura ni contra un entorno de
  prueba (ADR-086), así que el adapter está validado en una sola dirección.
- **Fase 9** — merchandising. Promociones con el descuento calculado **siempre**
  en el servidor —`cart_promotions`, que usan por igual el carrito y
  `create_order`—, visible en el catálogo y con cupones en el checkout. Y el
  CMS: la portada se compone por **secciones** ordenadas con su tipo —banner
  principal con slides, avisos, carruseles de productos, categorías— y cada
  carrusel es una colección, manual o dinámica (ADR-094, que corrige ADR-093).
- **Fase 10, Etapa A** — analytics. Los ocho eventos del storefront se registran
  **del lado del servidor**, sin una línea de JavaScript nueva: cada uno tiene un
  momento en que el Worker ya está trabajando. Van a `store_events` detrás del
  puerto `AnalyticsDestination`, que cierra P-003 en Postgres. La regla que
  ordena todo: **los eventos aportan el denominador y `orders` aporta el
  dinero**, así que la conversión coincide con la facturación por construcción
  (ADR-099).
- **Fase 10, Etapa B** — lo que sale de los pedidos. `order_items` guarda el
  costo, que es lo que hacía imposible el margen; el margen **nunca se muestra
  sin su cobertura**, porque uno calculado sobre medio catálogo da el doble y
  parece excelente (ADR-101). «Lo más vendido» pasó a ser «Ventas por producto»:
  tabla paginada, dos modos —lo que se vendió y lo que no se movió— y export CSV.
  Y un aviso que no salió deja de perderse: se ve en el pedido (ADR-102).
- **Fase 11** — OpenAI. BYOK: la clave es del comercio, se guarda cifrada con
  AES-GCM y **nunca vuelve al navegador**. Para eso el Admin dejó de ser sólo
  assets y tiene un Worker propio en `/api/*` —el que ADR-068 había diferido—,
  que existe **sólo donde hace falta la clave maestra**: lo que no la necesita
  sigue yendo por RPC. El enriquecimiento de producto **no escribe nada**:
  propone título, descripción, marca, categoría y atributos mirando también las
  fotos, y cada campo se aplica a mano (ADR-104). Lo que no puede saber —precio,
  stock, SKU, costo— no está en el esquema de la respuesta, así que la API no lo
  puede devolver. Quedan afuera la búsqueda con LLM y el resumen de analytics.
- **Fase 12** — endurecimiento del piloto. El storefront **dice el nombre de la
  tienda que sirve**, que estaba fijo en «Pick Demo» desde la Fase 1 y bloqueaba
  el piloto; el título lo compone el layout, así que la próxima página no puede
  olvidarse. Existe el **costo de envío** —tarifa plana o por zona, con umbral de
  gratis, calculado en el servidor como el descuento (ADR-107, ADR-114)— y el **modo
  demostración**, donde el pedido se crea y se ve pero no le escribe a nadie
  (ADR-108). Las funciones paginadas tienen techo. `pnpm budget` se retiró: al
  volverse on-demand las últimas páginas prerenderizadas dejó de haber HTML que
  medir, y el presupuesto se mudó al e2e, que mide más páginas y sobre la red
  (ADR-106). Se entregan `LIMITACIONES.md` y `ONBOARDING.md`.

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
  adapter-openai/    Responses API por fetch, sin SDK; el puerto vive en el core
apps/
  admin/             React 19 + Vite 8 + Tailwind v4 + shadcn sobre Base UI
                     + `worker/`: las rutas /api/* que necesitan un secreto
  demo/              Astro 7 + Preact islands + Tailwind v4 + adapter Cloudflare
  treeshop/          el primer cliente real, misma anatomía que demo; header, pie y
                     preset propios (ADR-110). Corre en 4322 en local
supabase/            migraciones y pruebas de aislamiento entre tenants
e2e/                 Playwright: el storefront de la demo (4321), el Admin y el
                     presupuesto de performance. `e2e/treeshop/` prueba la app
                     del cliente en el 4323, servida contra los datos de la
                     demo: no le crea pedidos a la tienda real
```

Los paquetes se consumen como fuente (`exports` → `src/`), sin build propio. Ver ADR-029.

## Comandos

```bash
pnpm dev            # admin (5273) + demo (4321) + treeshop (4322)
pnpm lint           # ESLint en todo el workspace
pnpm typecheck      # tsc / astro check por paquete
pnpm format:check   # Prettier sobre todo el repo; `pnpm format` escribe
pnpm docs:check     # la compuerta de los documentos; scripts/docs-check.mjs
pnpm test           # unitarios + aislamiento de tenants; node:test, sin runner externo
pnpm e2e            # Playwright, desktop y mobile, contra el build de producción;
                    # incluye el presupuesto de peso por página, en gzip
pnpm build
pnpm db:new <n>     # nueva migración; ver supabase/migrations/README.md
pnpm db:apply <sql> # aplica una migración al proyecto remoto
pnpm db:types       # regenera los tipos desde el schema remoto
pnpm seed           # siembra el catálogo de demostración; idempotente
pnpm seed:dummy [n] # catálogo de prueba desde dummyjson (--limpiar para quitarlo)
pnpm erp:importar --tienda <slug> [--limite 100] [--dry-run] [--desde captura.json]   # catálogo desde el ERP
pnpm erp:imagenes --tienda <slug> [--limite N]   # fotos, desde el proyecto actual del cliente
pnpm camelot:importar --tienda <slug> [--limite N] [--dry-run] [--imagenes]   # catálogo desde el Supabase de Camelot (ADR-111)
pnpm treeshop:home  # siembra las secciones de la portada de Treeshop; después se administran
pnpm tienda:crear <slug> <nombre> [dominio] [moneda] [locale]   # provisiona organización, tienda, sucursal y settings;
                    # el dominio no es cosmético: es la llave con la que el Worker encuentra la tienda
pnpm admin:crear <email> <password> [rol] [org]   # usuario del Admin; sin org, la demo
pnpm rls:verificar  # aislamiento entre comercios con sesiones reales; contra el proyecto remoto
```

**El 4322 está pedido dos veces**: es el `astro dev` de Treeshop y, durante el
e2e, el Worker del Admin —que además le hace `kill-port`—. No correr `pnpm e2e`
con `pnpm dev` abierto; el propio error de `e2e/global-setup.ts` ya lo nombra.
Durante el e2e, Treeshop se sirve en el **4323**.

**La suite de Treeshop corre contra los datos de la demo, no contra la tienda
del cliente**: se le apunta `STOREFRONT_DOMAIN` a la tienda de demostración. Las
dos viven en el mismo proyecto de Supabase y el fallback de `dominioDeLaTienda()`
es `sontres.shop`, así que un `.dev.vars` que no se escribió no rompe nada: haría
que la suite le creara pedidos al comercio. Por eso `global-setup` comprueba qué
tienda está sirviendo el 4323 **antes** de dejar correr un test, y aborta si no
es la de la demo. Medido quitando la variable: sirve Treeshop.

Deploy: `pnpm --filter <app> run deploy`. El `run` **no es opcional** — `deploy` es un comando built-in de pnpm y sin `run` nunca llega al script del paquete.

El Worker del Admin necesita tres secretos de runtime —`SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` y `PICK_AI_MASTER_KEY`—; sin alguno, sus rutas `/api/*`
responden 503 nombrando cuál falta y el resto del Admin funciona igual, sin IA.
Ver INFRAESTRUCTURA §7.

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

Dos compuertas más corren en el CI junto con `lint` y `typecheck`, y van en T1,
no al final: `pnpm format:check`, que falla por un archivo sin formatear, y
`pnpm docs:check`, que falla por un documento que cita un comando, una ruta, un
enlace o un ADR que no existe —o que declara un avance, que es del ROADMAP—.

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

### Buscar el hecho antes de escribirlo

«Actualizar los documentos» no alcanzó, y se sabe por qué falló: lleva a
corregir el párrafo que se está mirando y a dejar mintiendo al otro párrafo que
habla del mismo hecho. El commit `fa9a996` tocó **este** archivo, corrigió que
el envío se cobra por zona y dejó intacta la frase de arranque, que seguía
diciendo «faltan el envío por departamento»: el mismo archivo, el mismo commit,
las dos frases sobre el mismo hecho.

La regla que sí funciona: **antes de escribir un hecho, buscarlo con grep en los
diez documentos**, y después corregirlo en todos los lugares donde aparezca — o
mejor, borrarlo de todos menos uno.

```bash
git grep -ni "envío por zona" -- '*.md'
```

Para que ese grep tenga una sola respuesta, **cada hecho tiene un dueño y los
demás documentos enlazan en vez de repetir**: una frase corta y un enlace
relativo, nunca un resumen que después haya que mantener.

| El hecho                                                 | Su única casa                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Avance de las fases, porcentajes, estado de v1           | [ROADMAP.md](ROADMAP.md)                                                         |
| Decisiones de arquitectura y su motivo                   | [DECISIONS.md](DECISIONS.md), citadas como `ADR-NNN`                             |
| Workers, deploy, dominios, secretos, CI, diagnóstico     | [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md)                                         |
| Qué **no** hace el sistema y qué lo desbloquea           | [LIMITACIONES.md](LIMITACIONES.md)                                               |
| Dar de alta un comercio, paso por paso                   | [ONBOARDING.md](ONBOARDING.md)                                                   |
| Visión, principios, scope y stack aprobado del producto  | [PROJECT.md](PROJECT.md)                                                         |
| Cómo trabaja la IA acá: harness, restricciones, arranque | [CLAUDE.md](CLAUDE.md)                                                           |
| El harness en extenso                                    | [ENGINEERING_HARNESS.md](ENGINEERING_HARNESS.md)                                 |
| La puerta de entrada para quien llega al repo            | [README.md](README.md)                                                           |
| Cómo se escribe y se aplica una migración                | [supabase/migrations/README.md](supabase/migrations/README.md)                   |
| Los comandos que existen                                 | `package.json` — `CLAUDE.md` los lista y `pnpm docs:check` comprueba que existan |

### Qué tocar al cerrar una implementación

- `ROADMAP.md` — marcar el checkbox, actualizar el porcentaje de la fase **y el de los bloques transversales que la tarea tocó**, agregar la fila al changelog.
- `DECISIONS.md` (ADR-XXX) — cuando cambia arquitectura, se adopta o descarta una dependencia, aparece un tradeoff, cambia el scope o una integración obliga a modificar un contrato.
- `CLAUDE.md` — cuando aparece un paquete o un comando nuevo, cambia el árbol, o se descubre una restricción que condiciona el diseño.
- `PROJECT.md` — cuando cambia el producto: el scope, un principio, una regla de negocio o el stack aprobado. No hay puerta de escape: la que había —«sólo si cambia la fuente de verdad del producto»— lo dejó dieciocho días sin tocar mientras el producto cambiaba.
- `README.md`, `INFRAESTRUCTURA.md`, `LIMITACIONES.md`, `ONBOARDING.md`, `ENGINEERING_HARNESS.md` y `supabase/migrations/README.md` — cuando la tarea tocó lo que cada uno posee en la tabla de arriba. Los cinco primeros son los que más se desactualizaron, y el motivo es que no estaban en esta lista.

Al terminar, correr `pnpm docs:check`. Corta las formas mecánicas de mentir —un comando retirado, una ruta que ya no existe, un enlace roto, un ADR que nadie escribió, un avance declarado fuera del ROADMAP—, y ninguna de las otras: que un párrafo diga la verdad no se puede automatizar.

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

**El Admin no se despliega solo.** El storefront sale a producción con cada push; el Admin **no tiene Workers Builds** y necesita `pnpm --filter @pick/admin run deploy` a mano (INFRAESTRUCTURA §10). Una pantalla nueva del Admin dada por terminada sin desplegarla no existe para quien la va a usar, aunque el build, el typecheck y el Playwright estén en verde: todos corren contra el local. Ya pasó con la sección de promociones.

**No afirmar "validado" sin la evidencia a la vista.** Si se reporta que algo pasa, mostrar la salida. Si un paso se salteó, decirlo.

**En un ADR, registrar la razón real, no la primera hipótesis.** ADR-032 afirmó que Preact era imposible cuando en realidad era posible vía named slots y sólo era peor. Un ADR con la justificación equivocada envenena decisiones futuras.

---

# Documentación de terceros

El conocimiento previo del modelo está desactualizado respecto de este repo: cuando se creó, el ecosistema ya iba en Astro 7, Vite 8 y TypeScript 6. **No decidir sobre comportamiento de terceros desde memoria.**

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
- Un **SVG** no gana nada con `<Image />` y en desarrollo llegaba roto por el endpoint `/_image`: se importa y se usa como componente (`import Logo from './logo.svg'` → `<Logo />`), que lo deja inline. De paso, un trazo con `fill="currentColor"` sigue al color del texto, que es lo que hace que un logo sirva sobre fondo claro y oscuro.
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
- Con Workers Assets, una página **prerenderizada se sirve desde el disco sin ejecutar el Worker**: no corre el middleware. En `astro dev` y `astro preview` todo es SSR, así que lo que dependa del middleware se ve en desarrollo y desaparece al desplegar. Por eso `/carrito` es on-demand aunque no lea la base (ADR-099).
- Un Worker con `assets` sirve el archivo antes que el código: para que una ruta llegue al Worker hay que declararla en `run_worker_first`. **`wrangler dev` no lo respeta** —ejecuta el Worker para cualquier ruta sin asset, esté declarada o no— así que un `run_worker_first` faltante pasa el e2e en verde y falla recién al desplegar. Medido quitándolo (ADR-103).
- Una **subconsulta correlacionada contra un CTE** no tiene índice que usar:
  Postgres recorre el CTE entero una vez por fila. Es lo que hacía que el
  catálogo tardara 2,3 s con 5000 productos, en una sola línea. Contra una tabla
  el mismo patrón usa el índice y no se nota, así que el error aparece recién con
  volumen. Si el valor se necesita por fila, agregarlo una vez en su propio CTE y
  entrar por join.
- Postgres 17 empuja el tope de un `row_number()` adentro de la ventana
  —`Run Condition` en el plan—, pero **sólo el límite superior**. Una paginación
  `rn > a and rn <= b` corta bien en la página 1 y en la 100 serializa `b` filas
  para descartar `b - a`. Por eso el corte de página va antes de armar el
  documento, y por eso medir sólo la primera página no prueba nada.
- El `ClientRouter` **precarga todos los enlaces** al pasar el mouse por encima, y no hay que declarar nada para que pase: cada precarga es un GET real al Worker. Lo que cuente peticiones tiene que descartarlas por `Sec-Purpose` y `X-moz`.
- **PostgREST corta en 1000 filas y no avisa que hay más**, y paginar sin
  `order` no garantiza que dos páginas sean disjuntas: la segunda corrida de un
  importador da por nuevos productos que ya estaban, y con las variantes falla
  una de cada dos veces. El daño lo evitaron los índices únicos de `handle` y
  `sku`, no el script (ADR-111).
- Con un cliente de Supabase todavía abierto, `process.exit()` dispara una
  aserción de libuv en Windows y tumba el proceso que lo invocó. Salir por
  `process.exitCode`, como hacen todos los scripts de `scripts/`.
- Una suscripción a un store **no distingue la escritura propia de la ajena**:
  un suscriptor que escribe se llama a sí mismo en bucle —el checkout hacía una
  revalidación por respuesta desde la Fase 5, 20 en cinco segundos, medido en
  producción—. La guarda va en el llamador (ADR-115, que corrige la lectura de
  ADR-100).
- Una pestaña del Admin abierta desde antes de un deploy **pierde sus chunks** y
  muere con «Failed to fetch dynamically imported module» al abrir la primera
  pantalla que no tenía cargada. No falla al compilar ni en local: aparece
  recién con un despliegue encima de una sesión abierta (ADR-116).
- **`response.headers.get('set-cookie')` devuelve las cookies pegadas en un solo
  string**, separadas por coma, y una cookie cuyo valor es JSON también lleva
  comas: partir por `;` toma la cookie equivocada y partir por `,` parte el
  valor. Para leer varias, `getSetCookie()`. Y al **escribir** una cookie con
  JSON adentro hay que codificarla —`cookies.set` de Astro lo hace solo, un
  script no—, porque una coma cruda en el valor es un separador para el servidor.
- **`supabase.auth.signOut()` revoca las sesiones del usuario del lado del
  servidor**, no sólo las del cliente que lo llama: un token capturado antes deja
  de valer. Un `signOut` «por prolijidad» después de pedir tokens los invalida, y
  se ve como «no hay sesión» en un lugar que no tiene nada que ver.
- **`verifyOtp` y `setSession` le dejan la sesión puesta al cliente sobre el que
  corren**, y `persistSession: false` no lo evita: eso sólo habla del disco. Con
  un cliente memoizado por isolate —como el del storefront— la identidad de quien
  entra se le pega al catálogo de todos. Van sobre un cliente de un solo uso
  (`clienteDeAuth`).
- Un usuario de `auth.users` leído de un token guardado en una cookie **no se
  puede dar por bueno**: lo dice el propio SDK. Si el valor decide algo —de qué
  ficha de cliente cuelga un pedido, por ejemplo— se pide con `getUser`, que lo
  verifica contra el servidor de Auth.
- **`astro dev` corre como daemon**: si ya hay uno del mismo proyecto, un
  `astro dev` nuevo —aun con otro puerto— **no arranca** y devuelve «Dev server
  already running». El que queda sirviendo es el viejo, con el código de antes,
  y lo único que se ve es que el cambio «no aparece». Antes de probar algo a
  mano, `astro dev stop`. Costó dos ciclos: uno con un servidor de cuatro días.
- **Una función `security invoker` sólo sirve si _todas_ las tablas que toca
  tienen política para quien la llama.** `customer_orders` funciona así porque
  `orders` y `order_items` tienen política de comprador; `wishlist_products`
  entraba además a `products`, que **no la tiene** —el catálogo lo lee el
  storefront con la secret key—, así que la unión devolvía cero filas siempre y
  la pantalla decía «no guardaste nada» con filas en la base. Sin un error en
  ningún lado: lo encontró mirar la página, no el tipo ni el test. Cuando hace
  falta cruzar una tabla del comprador con una del catálogo, va `definer` con el
  filtro de identidad escrito en una línea.
- **Una función usada por una columna generada la evalúa el rol que escribe la
  fila**, no el dueño de la tabla. `app.normalizar_busqueda` arma
  `products.search_doc`: sin el `execute` de `authenticated`, el dueño no puede
  crear un producto y Postgres responde «permission denied for function», medido
  en PGlite. Por eso figura como pública en la suite de aislamiento. Y `pg_trgm`
  vive en el schema `extensions`, así que una función que lo use lo necesita en
  su `search_path`; la suite lo carga en PGlite (ADR-125).
- **Una tabla nueva que entre a `catalog_search` necesita permiso para
  `authenticated`**, porque esa función es `security invoker` y el Admin la llama
  con la publishable key para traer las facetas. `product_trending` nació sin
  política y dejó dos pantallas del Admin con «permission denied»; lo encontró la
  suite de aislamiento, no el typecheck ni el e2e, que corren con la secret key.
- Un importador que reimporta **pisa lo que la tienda editó** si no mira el
  dueño de cada campo: `field_sources` declara el origen y sólo los campos
  marcados como del ERP se sobreescriben. Y el borrado de medios se acota a los
  propios —los de Camelot viven bajo `<tenant>/camelot/`—, porque «borrar y
  volver a subir» se lleva también las fotos que subió la tienda (ADR-117).

---

# Documentos como fuente de verdad

Este proyecto trata los docs como autoridad, no como notas. Leer en orden antes de trabajar:

1. [PROJECT.md](PROJECT.md) — qué es Pick Commerce, stack aprobado, arquitectura, scope de v1.
2. [ROADMAP.md](ROADMAP.md) — fases, checkboxes, avance, backlog.
3. [DECISIONS.md](DECISIONS.md) — ADR-001..129 y dos decisiones pendientes:
   P-001 (primer gateway real) y P-005 (CLI/provisioner). P-002, P-003 y P-004
   están resueltas.
4. [ENGINEERING_HARNESS.md](ENGINEERING_HARNESS.md) — versión extendida del harness de arriba.
5. [LIMITACIONES.md](LIMITACIONES.md) — qué **no** hace el sistema, con el motivo
   y qué lo desbloquea. Es lo que se le entrega a un piloto.
6. [ONBOARDING.md](ONBOARDING.md) — dar de alta un comercio de punta a punta.
7. [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md) — cómo corre el proyecto: CI, Workers,
   entornos, credenciales y diagnóstico.
8. [README.md](README.md) — la puerta de entrada del repo, para quien llega sin
   contexto.
9. [supabase/migrations/README.md](supabase/migrations/README.md) — cómo se
   escribe y se aplica una migración.

Son los diez documentos versionados del repo, contando a este: son los que
`pnpm docs:check` recorre y los que hay que grepear antes de escribir un hecho.

El protocolo de trabajo con IA, las reglas Core vs cliente y las de UX viven en
**este** archivo. Hubo un `AGENTS.md` con esa parte —una copia byte a byte con
«Codex» en lugar de «Claude», congelada en ADR-109 mientras este archivo seguía
cambiando— y se borró: tener dos documentos sobre lo mismo garantizaba que uno
de los dos quedara viejo, y ahora `docs:check` falla si reaparece.

Si el código contradice un documento, no asumir que el código gana: identificar si es bug, deuda o decisión nueva, y registrarlo.

---

# Restricciones que no se negocian

Rompen la arquitectura si se violan, y no son obvias desde el código:

- **Un solo Commerce Core.** Nada de forks por industria o cliente (`Pick Fashion`, etc.). Las diferencias van en presets, feature flags, attributes y adapters. No hardcodear nombres de clientes en el Core.
  - De esas cuatro patas, **feature flags no está construida**: `feature_flags` es una tabla con RLS y cero lectores. Lo que existe hoy como interruptor por tienda es `store_settings.settings`, que además se memoiza una vez por request. Un interruptor nuevo va ahí, no a un lector de `feature_flags` escrito desde cero.
- **Stack cerrado.** Storefront: Astro + Preact islands + Tailwind v4 + Cloudflare. Admin: React + Vite + TanStack (Router/Query/Table) + shadcn/Base UI + Hugeicons + RHF + Zod. Backend: Supabase/Postgres/Auth/RLS. AI: **sólo OpenAI**, BYOK por tenant, key cifrada server-side y nunca en el browser. Email: Resend. No introducir otro framework/provider sin ADR.
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
