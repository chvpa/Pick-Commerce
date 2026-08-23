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
