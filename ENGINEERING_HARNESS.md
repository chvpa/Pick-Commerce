# Pick Commerce — ENGINEERING_HARNESS.md

> El detalle largo del harness. [CLAUDE.md](CLAUDE.md) tiene las reglas que se
> aplican en cada turno —el ciclo, los tiers de test, la verificación, qué
> documento actualizar al cerrar—; acá están los procedimientos que se
> consultan cuando hacen falta.
>
> Ninguna regla se repite en los dos lugares: si una cambia de comportamiento,
> cambia en `CLAUDE.md` y acá se enlaza. Esa duplicación fue la que envejeció
> estos documentos, y es por lo que se disolvió un `AGENTS.md`.

---

# 1. Principio

El ciclo `PLAN → DEVELOP → TEST → REVIEW → OK/FIX → UPDATE DOCS` es obligatorio
para toda unidad de trabajo y vive en [CLAUDE.md](CLAUDE.md). Lo que sigue es lo
que cada paso no alcanza a decir en una línea.

No convertir cada tarea en un ciclo de QA de horas.

---

# 2. Antes de empezar

El orden de lectura de los documentos lo fija [CLAUDE.md](CLAUDE.md). Con eso
leído, identificar:

- fase activa —la declara [ROADMAP.md](ROADMAP.md) y sólo ese documento;
- objetivo;
- dependencias;
- archivos afectados;
- riesgos;
- Definition of Done (§16);
- qué NO forma parte del scope.

---

# 3. PLAN

Lo que la planificación produce, y la obligación de buscar en `DECISIONS.md`
antes de tocar arquitectura, están en [CLAUDE.md](CLAUDE.md). Antes de
empezar, comprobar contra §15 que la tarea esté lista para desarrollarse.

---

# 4. DEVELOP

Las reglas de siempre —mínima solución completa, nada de lógica duplicada, nada
de hardcodear cliente ni vertical, secrets afuera, RLS y autorización sin
saltar, framework nuevo sólo con ADR— están en [CLAUDE.md](CLAUDE.md). Lo que
se agrega acá:

- respetar el Domain Layer: el dominio no importa framework ni adapter;
- no agregar una dependencia pesada si la plataforma ya resuelve el caso;
- mantener compatibilidad hacia atrás cuando el paquete ya lo consume un
  storefront: los paquetes `@pick/*` se consumen como fuente (ADR-029), así que
  un cambio de firma rompe en el build del consumidor, no en el propio.

---

# 5. TEST — estrategia por niveles

Qué tier corresponde a qué momento está en la tabla de [CLAUDE.md](CLAUDE.md).
Acá, qué entra en cada uno.

## T0 — durante desarrollo

- TypeScript del package/app afectado.
- Lint del package/app afectado.
- Tests unitarios cercanos si existen.

No correr todo el monorepo en cada cambio pequeño.

---

## T1 — al cerrar una tarea

```text
lint
typecheck
relevant unit/integration tests
```

Si afecta UI crítica: smoke visual/manual rápido.

Si afecta build: build del app/package afectado.

---

## T2 — al cerrar una fase

```text
pnpm lint
pnpm typecheck
pnpm build
```

más los tests relevantes, y Playwright sólo para los critical paths
modificados:

### Storefront

```text
Home → PLP → PDP
```

### Commerce

```text
PDP → Add to Cart → Checkout → Order
```

### Admin

```text
Login → Product edit → Save
```

### Tenant security

```text
Tenant A cannot read Tenant B
```

---

## T3 — pre-release / piloto

Suite crítica completa:

- lint;
- typecheck;
- build;
- unit/integration tests importantes;
- Playwright critical paths;
- `pnpm rls:verificar`, con sesiones reales contra el proyecto remoto;
- webhook/idempotency checks;
- las migraciones pendientes aplicadas, con su estrategia de reversión (§18);
- smoke sobre el dominio real **después de desplegar**.

Ese último paso decía «smoke en staging/preview» y era inejecutable: no hay
staging —lo que se pushea a `main` es producción, y el CI no bloquea el deploy
([LIMITACIONES.md](LIMITACIONES.md))—, así que el equivalente que sí se puede
correr es pedir las páginas del dominio real una vez desplegado. Y el Admin no
se despliega solo ([INFRAESTRUCTURA.md](INFRAESTRUCTURA.md)): un smoke que no
lo incluye no cubrió el Admin. Si el paso se saltea, se dice en el informe.

No ejecutar T3 para cada componente visual.

---

# 6. Test budget

Objetivo:

- T0/T1: pocos minutos.
- T2: razonablemente corto.
- T3: sólo release/piloto.

No perseguir cobertura arbitraria.

Priorizar tests sobre:

- dinero
- stock
- orders
- payments
- auth/RLS
- tenant isolation
- migrations
- webhooks
- adapters
- promotions

Menor prioridad:

- componentes visuales triviales
- copy
- spacing
- variantes puramente cosméticas

---

# 7. Playwright

Usarlo como smoke/critical-path framework, no como reemplazo de todo test. La
configuración está en `playwright.config.ts`: corre contra el build de
producción, en desktop y mobile.

Las suites que existen:

```text
e2e/navegacion.spec.ts     Home → PLP → PDP → carrito, sin errores de consola
e2e/checkout.spec.ts       el flujo completo, el reintento y la revalidación de stock
e2e/pago-simulado.spec.ts  la pasarela de prueba y el webhook repetido
e2e/admin.spec.ts          sesión, cambio de tienda, navegación, promociones, contenido
e2e/analytics.spec.ts      los eventos del storefront hasta el panel del Admin
e2e/ia.spec.ts             qué ve el Admin de una tienda sin credencial de OpenAI
e2e/performance.spec.ts    el presupuesto de peso por página, en gzip
```

El aislamiento entre tenants **no** está acá: son tests de base, en
`supabase/tests/`, y corren con `pnpm test:rls`.

Evitar tests UI frágiles para detalles visuales que cambian frecuentemente.

Usar `data-testid` sólo cuando semántica/roles no alcancen.

---

# 8. REVIEW

Las cuatro preguntas —correctness, arquitectura, seguridad, riesgo comercial—
están en [CLAUDE.md](CLAUDE.md). Las listas de comprobación largas que las
acompañan son §21 (UX) y §22 (performance y datos).

---

# 9. OK

Una tarea puede marcarse DONE cuando:

1. behavior implementado;
2. tests apropiados pasan;
3. no existe error conocido que invalide el objetivo;
4. la documentación se actualizó;
5. el ROADMAP refleja el avance.

No esperar perfección estética o cobertura total si la fase no la exige.

---

# 10. FIX LOOP

`FAIL → causa raíz → mínimo arreglo seguro → volver a correr el test relevante`,
en [CLAUDE.md](CLAUDE.md). Antes del arreglo, reproducir el fallo y confirmar la
hipótesis: la regla y el caso que la originó están ahí mismo.

---

# 11. Update Docs

Qué documento se actualiza al cerrar una implementación, con qué, y los dos
errores que ya se cometieron, están en [CLAUDE.md](CLAUDE.md). Lo que se agrega
acá es cómo no volver a desactualizarlos:

- **Un hecho, una casa.** Cada hecho tiene un documento dueño y los demás
  enlazan en vez de repetir. La tabla de dueños está en
  [CLAUDE.md](CLAUDE.md).
- Antes de escribir un hecho, buscarlo: si ya está en otro documento, el que se
  escribe es un enlace.
- Al terminar, `pnpm docs:check`. Corta las formas mecánicas de mentir —un
  comando que no existe, una ruta que se borró, un enlace roto, un ADR
  inventado, un avance escrito fuera del ROADMAP— y está en el CI.

---

# 12. Cómo calcular avance de fase

No necesita precisión matemática perfecta.

Método recomendado:

```text
0%   no iniciado
10%  setup inicial
25%  primera parte funcional
50%  happy path completo
75%  integración principal funcionando
90%  tests/edge cases importantes
100% Definition of Done cumplida
```

Esto evita falsa precisión. El número resultante se escribe **sólo** en
[ROADMAP.md](ROADMAP.md), incluido el de los bloques transversales que la tarea
haya tocado.

---

# 13. Trabajo en paralelo

Permitido:

```text
Fase 2 Storefront
Fase 3 Multitenancy
Track ERP Estilo Sport
```

simultáneamente.

Antes de hacerlo, documentar las interfaces entre trabajos.

Ejemplo:

```text
Storefront consumes CatalogService contract
ERP produces normalized Product contract
```

Así cada track puede avanzar con mocks.

---

# 14. Stubs y mocks

Se permite avanzar con mocks cuando una integración no existe todavía.

El puerto `ERPAdapter` vive en `packages/commerce-core/src/erp.ts` y su
implementación real es `proveedorEstiloSport`, en
`packages/adapter-erp-estilosport`. Un mock del mismo puerto puede sostener el
desarrollo mientras el proveedor no contesta, con dos condiciones:

- **no cambia el contrato** que espera el provider real —ni los tipos ni las
  `capabilities` que declara—;
- **se declara como mock**. Un adapter que asume una capacidad que el proveedor
  no tiene produce overselling o pedidos rechazados, y el error aparece en
  producción. Estilo Sport no da escritura ni contra un entorno de prueba, así
  que su adapter está validado en una sola dirección (ADR-086): eso se dice, no
  se simula.

---

# 15. Definition of Ready

Una tarea está lista para desarrollo si existe:

- objetivo claro;
- behavior esperado;
- contrato o input/output mínimo;
- scope;
- dependencia conocida.

No requiere documentación exhaustiva.

---

# 16. Definition of Done

Base:

- implementación completa;
- no TypeScript errors;
- no lint errors relevantes;
- build cuando corresponda;
- tests apropiados;
- docs actualizadas y `pnpm docs:check` en verde.

Para funcionalidades críticas:

- idempotency;
- auth;
- tenant;
- error handling;
- auditability.

---

# 17. Regla anti-overengineering

La regla y la lista de excepciones —dónde sí se abstrae desde v1 porque ya se
sabe que habrá múltiples providers— están en [CLAUDE.md](CLAUDE.md), junto con
la clasificación de una feature nueva antes de meterla al Core.

---

# 18. Regla de rollback

Toda modificación de schema, payments, orders, inventory o auth/RLS necesita su
estrategia de reversión escrita **antes** de aplicarla, y el PR la declara
(`supabase/migrations/README.md` remite acá por eso).

No hay «down migration»: el CLI de Supabase no las tiene y una migración ya
aplicada en remoto es append-only. Revertir es **otra migración hacia
adelante** —`supabase/migrations/20260913182114_revocar_consume_promotion_de_public.sql`
es exactamente eso: revierte el alcance que dejó abierto la migración anterior—,
y no hay staging donde ensayarla
([LIMITACIONES.md](LIMITACIONES.md)), así que el ensayo es local: `pnpm db:reset`
reaplica todas las migraciones desde cero.

De ahí tres reglas prácticas:

- **Aditivo primero.** Columna nueva anulable o con default, backfill, el código
  empieza a leerla, y el `drop` de la vieja en una migración posterior. Las dos
  mitades juntas dejan una ventana en la que el Worker ya desplegado lee una
  columna que ya no está.
- **Un cambio, una migración.** El catálogo se corrigió en cuatro migraciones
  seguidas sobre el mismo objeto —`catalogo_paginar_antes_de_serializar`,
  `catalogo_minimo_por_producto`, `..._final`,
  `catalogo_corte_de_pagina_temprano`—, y así cada paso se revierte solo. Una
  migración grande, no.
- **Qué se pierde al revertir.** Si deshacer el cambio implica borrar datos que
  ya se escribieron, decirlo en el PR: eso no se revierte.

---

# 19. Informe de cierre de tarea

El formato —`Implemented` / `Validated` / `Pending` / `Docs`— está en
[CLAUDE.md](CLAUDE.md). `Pending` no es opcional, y `Validated` va con la
evidencia a la vista: si un paso se salteó, se dice.

---

# 20. Regla final

Prioridad:

```text
Correctness de comercio
> seguridad
> mantenibilidad
> performance
> velocidad de desarrollo
> perfección de tests
```

La velocidad es importante, pero nunca a costa de inconsistencias de stock,
pagos, pedidos o tenants.

---

# 21. UX acceptance checklist

La regla —UX es Definition of Done, no polish— está en [CLAUDE.md](CLAUDE.md).
Esta es la lista con la que se comprueba, para cualquier feature interactiva:

- ¿El usuario recibe feedback inmediato?
- ¿Existe pending/loading?
- ¿Se previene doble acción cuando corresponde?
- ¿Existe error recuperable?
- ¿La UI mantiene contexto?
- ¿Mobile funciona igual de bien que desktop?
- ¿Keyboard/focus son correctos?
- ¿El control comunica visualmente que es accionable?
- ¿Se evitó una recarga completa innecesaria?
- ¿Se cargó sólo la data necesaria?

Si alguna respuesta crítica es «no», la feature no está DONE.

---

# 22. Performance/Data checklist

Antes de cerrar una lista o tabla:

- ¿Está paginada?
- ¿Filtros/sort ocurren server-side cuando el dataset puede crecer?
- ¿Existe límite explícito?
- ¿Se evita traer datos invisibles?
- ¿Las imágenes usan tamaños/formato adecuados?
- ¿Una librería premium se carga sólo donde se usa?
