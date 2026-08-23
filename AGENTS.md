# AGENTS.md — Pick Commerce

## Propósito

Este repositorio usa IA como parte activa del desarrollo.

La IA debe mantener continuidad arquitectónica entre sesiones y no asumir que el prompt actual contiene todo el contexto.

---

## Lectura obligatoria antes de trabajar

Leer en este orden:

1. `PROJECT.md`
2. `ROADMAP.md`
3. `DECISIONS.md`
4. `ENGINEERING_HARNESS.md`

Luego revisar el código relevante.

No comenzar una modificación arquitectónica sin leer `DECISIONS.md`.

---

## Fuente de verdad

- `PROJECT.md`: qué es Pick Commerce y cómo debe funcionar.
- `ROADMAP.md`: qué estamos construyendo y el avance.
- `DECISIONS.md`: por qué tomamos decisiones.
- `ENGINEERING_HARNESS.md`: cómo desarrollar y validar.

Si el código contradice los documentos:

- no asumir que el código gana;
- identificar la contradicción;
- determinar si es bug, deuda o decisión nueva;
- registrar el cambio cuando corresponda.

---

## Reglas de arquitectura

- no crear forks por industria o cliente;
- usar presets, feature flags, attributes y adapters;
- storefront Astro + Preact islands;
- Admin React + Vite;
- Supabase/Postgres/Auth/RLS;
- Cloudflare;
- OpenAI solamente;
- Resend para email;
- ERP sigue siendo source of truth cuando aplique;
- Pick Commerce no factura ni maneja notas de crédito;
- no refunds/returns engine en v1;
- validar stock en Add to Cart cuando sea viable y siempre en checkout;
- no exponer secrets;
- MCP respeta RBAC y no ejecuta acciones fiscales.

---

## Protocolo de trabajo

Seguir `ENGINEERING_HARNESS.md`.

Para cada tarea:

```text
PLAN
→ DEVELOP
→ TEST
→ REVIEW
→ OK/FIX
→ UPDATE DOCS
```

---

## Documentación al cerrar trabajo

Actualizar `ROADMAP.md` cuando:

- una tarea cambia de estado;
- una fase avanza;
- aparece un bloqueo;
- aparece una tarea retroactiva.

Actualizar `DECISIONS.md` cuando:

- se adopta/cambia una librería;
- cambia arquitectura;
- aparece un tradeoff importante;
- se descarta una solución;
- cambia scope;
- una integración obliga a modificar un contrato.

Actualizar `PROJECT.md` sólo cuando cambie la fuente de verdad del producto.

---

## No overtesting

No correr suites completas por cada cambio pequeño.

Usar test tiers definidos en `ENGINEERING_HARNESS.md`.

Priorizar correctness de:

- orders
- stock
- payments
- tenants
- permissions
- ERP
- promotions
- migrations

---

## No overengineering

No introducir abstracciones sin motivo, excepto áreas que sabemos que tendrán providers múltiples:

- ERP
- Payment
- Notifications
- AI interface
- Analytics destination

---

## Cuando falte información

Preferir:

1. revisar estos documentos;
2. revisar código;
3. revisar tests;
4. revisar integrations/docs del provider;
5. usar mocks explícitos si el contrato está definido.

No inventar comportamiento de ERP, payment providers ni APIs.

---

## Formato de cierre recomendado

```text
Implemented
- ...

Validated
- ...

Pending
- ...

Docs
- ROADMAP updated
- DECISIONS updated if needed
```

## Reglas UX adicionales

Una feature asincrónica no está terminada si no comunica su estado.

Siempre contemplar:

- loading/pending;
- success;
- error;
- disabled cuando corresponda;
- prevención de doble submit;
- skeleton/progress para listas/grids;
- focus visible;
- pointer/cursor en elementos accionables;
- mobile y desktop.

PLP:

- filtros facetados;
- actualización sin full page reload;
- paginación/incremental loading;
- no filtrar miles de productos sólo en browser.

Admin:

- paginar tablas grandes;
- no cargar todos los productos/pedidos/clientes/promociones.

Motion:

- GSAP/Motion sólo opt-in;
- lazy load;
- respetar reduced motion;
- no degradar performance.

## Regla Core vs cliente

Antes de implementar una necesidad específica:

1. determinar si es reusable;
2. si lo es → Core + feature/config/capability;
3. si es puramente específica → storefront override;
4. si no está claro → incubar desacoplada y reevaluar al segundo caso.

No hardcodear nombres de clientes dentro del Core.
