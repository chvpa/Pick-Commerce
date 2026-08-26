# Migraciones

El schema se versiona con el CLI de Supabase. No editar la base de datos a mano
en ningún entorno compartido: un cambio que no está en este directorio no existe.

## Convención

Los archivos los genera el CLI y quedan como `<timestamp>_<descripcion>.sql`:

```bash
pnpm db:new agregar_organizations   # crea la migración vacía
pnpm db:start                       # levanta Postgres local
pnpm db:reset                       # reaplica todas las migraciones desde cero
pnpm db:push                        # aplica al proyecto remoto enlazado
```

## Reglas

- Una migración es **append-only**: nunca editar una ya aplicada en remoto, crear otra.
- Toda tabla de negocio lleva `tenant_id` y su política RLS en la misma migración
  que la crea. Una tabla sin RLS no se mergea. Ver PROJECT.md §7.
- Cambios sobre schema, payments, orders, inventory o auth necesitan estrategia de
  reversión explícita en el PR. Ver ENGINEERING_HARNESS.md §18.
- El schema real (organizations, stores, locations, memberships, roles) llega en
  Fase 3; este directorio queda listo desde Fase 0 para que nada se aplique fuera
  de control de versiones.

## Aplicar a un proyecto remoto

El proyecto de desarrollo está en `snnbkqesjiooejaccqhg`.

```bash
pnpm db:apply supabase/migrations/<archivo>.sql
pnpm db:types    # regenera los tipos desde el schema ya aplicado
```

Va por la API de Management, que sólo necesita `SUPABASE_ACCESS_TOKEN` — no la
password de la base, que es lo que pide `supabase db push`.

Tres cosas que hacen perder tiempo si no se saben:

- La API está detrás de Cloudflare y **rechaza el user-agent de `urllib` de
  Python** con un 403 y `error code: 1010`. Con `curl` funciona.
- El access token tiene los privilegios de la cuenta entera, no de un proyecto.
  Antes de escribir, confirmar el `ref` de destino.
- **El servidor asigna la versión**, y no es el timestamp del archivo. Si las dos
  no coinciden, un `supabase db push` futuro daría la migración por pendiente y
  la reaplicaría entera. Por eso `db:apply` renombra el archivo a la versión que
  asignó el servidor; los nombres de este directorio son la verdad del remoto.
