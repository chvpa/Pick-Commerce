# Pick Commerce

Infraestructura de ecommerce headless, modular y multitenant para retailers de
Paraguay y LATAM. Un solo Commerce Core; las diferencias entre comercios se
resuelven con presets, feature flags, atributos y adapters.

## Estado

Fases 0 a 5 cerradas: monorepo y CI, design system, storefront con PLP facetada
server-side y SEO, multitenancy con RLS aplicado a Supabase, catálogo en Postgres
con CRUD e import/export en el Admin, y pedidos con checkout guest e idempotencia.
**Fase 6 (Admin v1) es la siguiente.**

El avance detallado está en [ROADMAP.md](ROADMAP.md), que es la fuente de verdad.

## Documentación

La documentación es fuente de verdad, no notas. Leer en este orden antes de
tocar código:

| Archivo                                          | Qué responde                                                    |
| ------------------------------------------------ | --------------------------------------------------------------- |
| [PROJECT.md](PROJECT.md)                         | Qué es Pick Commerce, stack aprobado, arquitectura, scope de v1 |
| [ROADMAP.md](ROADMAP.md)                         | Qué está hecho, qué falta, en qué fase estamos                  |
| [DECISIONS.md](DECISIONS.md)                     | Por qué se decidió cada cosa (ADRs)                             |
| [ENGINEERING_HARNESS.md](ENGINEERING_HARNESS.md) | Cómo desarrollar, testear y cerrar una tarea                    |
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md)  | Protocolo de trabajo asistido por IA                            |
| [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md)         | Cómo corre esto: CI, Workers, entornos y credenciales           |

## Ramas

`main` es la rama estable y debe quedar siempre desplegable. El trabajo va en
ramas cortas (`feat/`, `fix/`, `chore/`) que se integran por PR con CI en verde.

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

Para desplegar desde local hace falta además `wrangler login`. No es necesario
para el deploy automático, que corre en Workers Builds al hacer push.

## Requisitos

- Node >= 22 (el repo se desarrolla sobre 24)
- pnpm 11
- Docker, sólo si se levanta Supabase local

## Empezar

```bash
pnpm install
pnpm dev            # admin + storefront demo en paralelo
```

| App           | URL local             | Stack                                |
| ------------- | --------------------- | ------------------------------------ |
| `@pick/demo`  | http://localhost:4321 | Astro + Preact islands + Tailwind v4 |
| `@pick/admin` | http://localhost:5273 | React + Vite + Tailwind v4           |

También `pnpm dev:demo` / `pnpm dev:admin` por separado.

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

`pnpm test` incluye las pruebas de aislamiento entre tenants, que corren sobre
Postgres en proceso (PGlite) aplicando las migraciones reales. No necesitan
Docker ni un Supabase remoto.

```bash
pnpm budget        # peso por página; falla si excede el presupuesto
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
apps/
  admin/             Admin multitenant (SPA)
  demo/              storefront demo
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

Lo que sigue es la referencia mínima; el recorrido completo —qué hace el CI, qué
despliega Cloudflare, y por qué son independientes— está en
[INFRAESTRUCTURA.md](INFRAESTRUCTURA.md).

Ambas apps corren sobre Cloudflare Workers, cada una con su propio Worker. El
monorepo tiene dos apps, así que **hacen falta dos proyectos de Workers Builds**,
y cada uno debe apuntar sólo a su app: el comando de deploy no puede correr en la
raíz, donde no hay `wrangler.jsonc` ni el binario de wrangler.

Configuración de cada proyecto en el dashboard de Cloudflare:

| Ajuste         | `pick-commerce` (storefront)          | `pick-admin`                           |
| -------------- | ------------------------------------- | -------------------------------------- |
| Root directory | `/`                                   | `/`                                    |
| Build command  | `pnpm --filter @pick/demo run build`  | `pnpm --filter @pick/admin run build`  |
| Deploy command | `pnpm --filter @pick/demo run deploy` | `pnpm --filter @pick/admin run deploy` |

El storefront se despliega en el Worker **`pick-commerce`**, que es el nombre que
declara `apps/demo/wrangler.jsonc`. El nombre del archivo y el del Worker tienen
que coincidir: si no, un deploy desde local crea un Worker nuevo en vez de
actualizar el que sirve el sitio. Hoy el Admin todavía no está desplegado.

El `run` no es opcional: `deploy` es un comando built-in de pnpm, así que
`pnpm --filter <app> deploy` falla con `ERR_PNPM_INVALID_DEPLOY_TARGET` sin
llegar nunca al script del paquete.

Desde local, con `wrangler login` hecho:

```bash
pnpm deploy:demo     # construye y despliega el storefront
pnpm deploy:admin    # construye y despliega el Admin
```

Para validar la configuración sin publicar nada:

```bash
pnpm --filter @pick/demo run deploy --dry-run
```

### KV de sesiones

`@astrojs/cloudflare` declara siempre un binding `SESSION` sobre KV. El
storefront todavía no usa sesiones, pero el binding viaja en la config, así que
el primer deploy necesita que el namespace exista:

```bash
pnpm --filter @pick/demo exec wrangler kv namespace create SESSION
```

Ese comando devuelve un id. Agregarlo a `apps/demo/wrangler.jsonc`:

```jsonc
"kv_namespaces": [{ "binding": "SESSION", "id": "<id devuelto>" }]
```
