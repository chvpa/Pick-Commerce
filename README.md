# Pick Commerce

Infraestructura de ecommerce headless, modular y multitenant para retailers de
Paraguay y LATAM. Un solo Commerce Core; las diferencias entre comercios se
resuelven con presets, feature flags, atributos y adapters.

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

## Ramas

`main` es la rama estable y debe quedar siempre desplegable. El trabajo va en
ramas cortas (`feat/`, `fix/`, `chore/`) que se integran por PR con CI en verde.

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
pnpm build         # build de apps y paquetes
pnpm format        # Prettier
```

Base de datos (requiere Docker para el stack local):

```bash
pnpm db:start                  # Postgres + Supabase local
pnpm db:new <nombre>           # nueva migración
pnpm db:reset                  # reaplica migraciones desde cero
pnpm db:types                  # regenera tipos desde el schema local
```

## Estructura

```text
packages/
  commerce-types/   contratos compartidos, sólo tipos
  commerce-core/    lógica de dominio agnóstica de framework
apps/
  admin/            Admin multitenant (SPA)
  demo/             storefront demo
supabase/           config y migraciones del schema
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

Ambas apps corren sobre Cloudflare Workers, cada una con su propio Worker. El
monorepo tiene dos apps, así que **hacen falta dos proyectos de Workers Builds**,
y cada uno debe apuntar sólo a su app: el comando de deploy no puede correr en la
raíz, donde no hay `wrangler.jsonc` ni el binario de wrangler.

Configuración de cada proyecto en el dashboard de Cloudflare:

| Ajuste         | `pick-demo`                       | `pick-admin`                       |
| -------------- | --------------------------------- | ---------------------------------- |
| Root directory | `/`                               | `/`                                |
| Build command  | `pnpm --filter @pick/demo build`  | `pnpm --filter @pick/admin build`  |
| Deploy command | `pnpm --filter @pick/demo deploy` | `pnpm --filter @pick/admin deploy` |

Desde local, con `wrangler login` hecho:

```bash
pnpm deploy:demo     # construye y despliega el storefront
pnpm deploy:admin    # construye y despliega el Admin
```

Para validar la configuración sin publicar nada:

```bash
pnpm --filter @pick/demo exec wrangler deploy -c dist/client/wrangler.json --dry-run
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
