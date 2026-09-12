# Pick Commerce

Infraestructura de ecommerce headless, modular y multitenant para retailers de
Paraguay y LATAM. Un solo Commerce Core; las diferencias entre comercios se
resuelven con presets, feature flags, atributos y adapters.

## Estado

En construcción, y todavía sin ningún comercio que pague. El Core ya cubre el
recorrido completo —catálogo, carrito, checkout, pedidos, promociones, costo de
envío, analytics y un Admin multitenant— y se está validando contra una tienda
real: **Treeshop** (`apps/treeshop`), la tienda del dueño del proyecto, tratada
como si fuera un cliente para recorrer el alta de punta a punta. Está en línea
en https://sontres.shop desde el 2026-09-11, con su catálogo importado y el
Admin en `admin.sontres.shop` (ADR-110).

Qué fase está cerrada, qué falta y qué apareció en el camino lo declara
[ROADMAP.md](ROADMAP.md), y sólo ese documento. Lo que el sistema **no** hace,
con el motivo y qué lo desbloquea, está en [LIMITACIONES.md](LIMITACIONES.md).

## Documentación

La documentación es fuente de verdad, no notas. Leer en este orden antes de
tocar código:

| Archivo                                          | Qué responde                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [PROJECT.md](PROJECT.md)                         | Qué es Pick Commerce, stack aprobado, arquitectura, scope de v1                    |
| [ROADMAP.md](ROADMAP.md)                         | Qué está hecho, qué falta, en qué fase estamos                                     |
| [DECISIONS.md](DECISIONS.md)                     | Por qué se decidió cada cosa (ADRs)                                                |
| [ENGINEERING_HARNESS.md](ENGINEERING_HARNESS.md) | Cómo desarrollar, testear y cerrar una tarea                                       |
| [CLAUDE.md](CLAUDE.md)                           | Protocolo de trabajo con IA, restricciones no negociables y reglas Core vs cliente |
| [LIMITACIONES.md](LIMITACIONES.md)               | Qué **no** hace el sistema, por qué, y qué lo desbloquea                           |
| [ONBOARDING.md](ONBOARDING.md)                   | Dar de alta un comercio de punta a punta                                           |
| [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md)         | Cómo corre esto: CI, Workers, entornos y credenciales                              |

## Ramas

Hay una sola rama, `main`, y el trabajo va directo ahí: no hay ramas de feature
ni PRs. Tampoco hay staging, así que lo que entra a `main` es producción y el CI
no lo frena —corre en paralelo al deploy—. Los límites de este modelo están en
[LIMITACIONES.md](LIMITACIONES.md).

## Trabajar en otra máquina

`git clone` (o `pull`) más `pnpm install` deja el repo compilando y testeando.
Dos cosas no viajan por git:

1. **`.env`** — está en `.gitignore` a propósito: contiene la secret key de
   Supabase, que saltea RLS. Copiarlo por un canal privado, o regenerarlo desde
   [.env.example](.env.example) con las credenciales del proyecto Supabase.
2. **Los navegadores de Playwright** — se instalan a nivel de usuario, no del
   repo:

   ```bash
   pnpm exec playwright install chromium
   ```

Sin el `.env`, `pnpm lint`, `pnpm typecheck` y `pnpm test` funcionan igual: los
tests de base corren sobre Postgres en proceso. Lo que no anda es todo lo que
consulta el catálogo real —`pnpm dev`, `pnpm seed`, `pnpm e2e` y los comandos de
base—. Sin los navegadores de Playwright falla `pnpm e2e`, no el resto.

Para desplegar desde local hace falta además `wrangler login`.

## Requisitos

- Node >= 22 (el repo se desarrolla sobre 24)
- pnpm 11
- Docker, sólo si se levanta Supabase local

## Empezar

```bash
pnpm install
pnpm dev            # las tres apps en paralelo
```

| App              | URL local             | Stack                                  |
| ---------------- | --------------------- | -------------------------------------- |
| `@pick/demo`     | http://localhost:4321 | Astro + Preact islands + Tailwind v4   |
| `@pick/treeshop` | http://localhost:4322 | ídem, con header, pie y preset propios |
| `@pick/admin`    | http://localhost:5273 | React + Vite + Tailwind v4             |

También `pnpm dev:demo` / `pnpm dev:admin` por separado, y
`pnpm --filter @pick/treeshop dev` para la tienda del cliente.

## Comandos

```bash
pnpm lint          # ESLint en todo el workspace
pnpm typecheck     # tsc / astro check por paquete
pnpm test          # node:test (sin runner externo)
pnpm e2e           # Playwright: navegación en desktop y mobile
pnpm build         # build de apps y paquetes
pnpm format        # Prettier
```

`pnpm e2e` construye el storefront y lo sirve con workerd antes de correr: prueba
el artefacto que se despliega, no el dev server. Falla ante cualquier error de
consola o respuesta HTTP >= 400 durante la navegación.

Un clon recién instalado no tiene catálogo ni usuario, así que no hay con qué
entrar al Admin: el mock in-memory no existe más y todo sale de la base.

```bash
pnpm seed                          # siembra el catálogo de la demo; idempotente
pnpm admin:crear <email> <pass>    # usuario del Admin
pnpm tienda:crear <slug> <nombre>  # organización, tienda, sucursal y settings
pnpm camelot:importar --tienda <slug>   # catálogo real desde el Supabase de Camelot
```

El alta completa de un comercio, con el orden y lo que hay que cargar en cada
paso, está en [ONBOARDING.md](ONBOARDING.md).

`pnpm test` incluye las pruebas de aislamiento entre tenants, que corren sobre
Postgres en proceso (PGlite) aplicando las migraciones reales. No necesitan
Docker ni un Supabase remoto.

```bash
pnpm test:rls      # sólo el aislamiento entre tenants
```

Base de datos (requiere Docker para el stack local):

```bash
pnpm db:new <nombre>           # nueva migración
pnpm db:types                  # regenera los tipos desde el schema remoto
pnpm db:start                  # Supabase local; requiere Docker
pnpm db:reset                  # reaplica migraciones desde cero, en local
```

`db:types` y la aplicación de migraciones van por la API de Management y sólo
necesitan `SUPABASE_ACCESS_TOKEN`; no hacen falta Docker ni la password de la
base. Ver [supabase/migrations/README.md](supabase/migrations/README.md).

## Estructura

```text
packages/
  commerce-types/    contratos compartidos + tipos generados de la base
  commerce-core/     dominio sin framework: dinero, catálogo, variantes, SEO, autorización
  commerce-ui/       tokens de diseño, recetas de clases e islands Preact
  commerce-astro/    componentes .astro de presentación estática
  adapter-supabase/  clientes, repositorios y sesión
  adapter-resend/    correos transaccionales
  adapter-payment-simulated/  pasarela de prueba; el contrato vive en el core
  adapter-erp-estilosport/    Oracle ORDS; corre en Node, no en el Worker
  adapter-openai/    Responses API por fetch, sin SDK
apps/
  admin/             Admin multitenant (SPA) + el Worker de sus rutas /api/*
  demo/              storefront demo
  treeshop/          el storefront del primer cliente; misma anatomía que demo
supabase/            migraciones y pruebas de aislamiento entre tenants
e2e/                 Playwright: navegación y presupuesto de performance
```

Los paquetes se consumen como fuente (`exports` apunta a `src/`): no tienen paso
de build propio, los bundlers de cada app los compilan. Cuando se publiquen como
`@pick/*` versionados para storefronts externos habrá que agregar build.

## Tests

Se usa el runner nativo de Node (`node --test`), que ejecuta TypeScript sin
transpilar. No hay Vitest ni Jest en el árbol de dependencias.

Prioridad de cobertura: orders, stock, payments, tenants, permisos, ERP,
promociones y migraciones. Ver ENGINEERING_HARNESS.md §5–6.

## Deploy

Tres Workers en Cloudflare, uno por app: `pick-commerce` sirve el storefront de
la demo, `treeshop` el del cliente y `pick-admin` el Admin. **Sólo
`pick-commerce` tiene Workers Builds** y sale con cada push a `main`; Treeshop y
el Admin se despliegan a mano.

Los comandos, la configuración de cada proyecto en Cloudflare, los dominios y
las variables de runtime están en [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md) —§4
el deploy, §5 las variables—, que es su única casa.
