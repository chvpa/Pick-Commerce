# Pick Commerce — ENGINEERING_HARNESS.md

> Loop obligatorio de ingeniería para trabajo asistido por IA.
>
> Objetivo: avanzar rápido sin perder calidad, sin sobre-testear y sin olvidar contexto.

---

# 1. Principio

Cada unidad de trabajo sigue:

```text
PLAN
  ↓
DEVELOP
  ↓
TEST
  ↓
REVIEW
  ↓
OK / FIX
  ↓
UPDATE DOCS
```

No convertir cada tarea en un ciclo de QA de horas.

---

# 2. Antes de empezar

La IA debe leer, en este orden:

1. `CLAUDE.md`
2. `PROJECT.md`
3. `ROADMAP.md`
4. `DECISIONS.md`
5. este archivo

Luego debe identificar:

- fase activa
- objetivo
- dependencias
- archivos afectados
- riesgos
- Definition of Done
- qué NO forma parte del scope

---

# 3. PLAN

Máximo recomendado: 5–10 minutos para una tarea normal.

La planificación debe producir:

```text
Goal
Files/modules
Data/contracts
Expected behavior
Tests
Known risks
Out of scope
```

No escribir un documento de arquitectura nuevo para cada botón.

### Antes de modificar arquitectura

Buscar en `DECISIONS.md`.

Si la decisión ya existe:

- respetarla;
- o registrar por qué debe cambiar.

---

# 4. DEVELOP

Reglas:

- implementar la mínima solución completa;
- respetar el Domain Layer;
- evitar lógica duplicada;
- no hardcodear cliente/vertical;
- usar feature flags/capabilities/adapters cuando corresponda;
- no exponer secrets;
- no saltar RLS/autorización;
- no introducir un nuevo framework sin decisión explícita;
- no agregar dependencia pesada si la plataforma ya resuelve el caso;
- mantener backwards compatibility cuando el paquete ya sea consumido por storefronts.

---

# 5. TEST — estrategia por niveles

La meta es detectar errores relevantes rápido.

## T0 — durante desarrollo

Ejecutar sólo lo necesario:

- TypeScript del package/app afectado.
- Lint del package/app afectado.
- tests unitarios cercanos si existen.

No correr todo el monorepo en cada cambio pequeño.

---

## T1 — al cerrar una tarea

Normalmente:

```text
lint
typecheck
relevant unit/integration tests
```

Si afecta UI crítica:

- smoke visual/manual rápido.

Si afecta build:

- build del app/package afectado.

---

## T2 — al cerrar una fase

Ejecutar:

```text
pnpm lint
pnpm typecheck
pnpm build
```

más tests relevantes.

Playwright sólo para critical paths modificados.

Ejemplos:

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

## T3 — pre-release / pilot

Ejecutar suite crítica completa:

- lint
- typecheck
- build
- unit/integration tests importantes
- Playwright critical paths
- security/RLS checks
- webhook/idempotency checks
- migration check
- smoke en staging/preview

No ejecutar T3 para cada componente visual.

---

# 6. Test budget

Objetivo:

- T0/T1: pocos minutos.
- T2: razonablemente corto.
- T3: sólo release/piloto.

Regla:

> Si una tarea simple lleva más tiempo testeándose que desarrollándose, revisar el enfoque de testing.

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

Usarlo como smoke/critical-path framework, no como reemplazo de todo test.

Suites iniciales sugeridas:

```text
storefront.spec
checkout.spec
admin-products.spec
tenant-isolation.spec
```

Evitar tests UI frágiles para detalles visuales que cambian frecuentemente.

Usar data-testid sólo cuando semántica/roles no alcancen.

---

# 8. REVIEW

Antes de marcar OK:

### Correctness

- ¿Cumple el behavior esperado?
- ¿Rompe una decisión previa?
- ¿Maneja error/loading/empty si aplica?

### Architecture

- ¿El código está en la capa correcta?
- ¿Está acoplado a un cliente?
- ¿Debía ser adapter/capability/feature flag?

### Security

- ¿Hay secretos en cliente/log?
- ¿Respeta tenant?
- ¿Respeta permisos?
- ¿Hay inputs externos sin validar?

### Commerce risk

- ¿Puede crear doble order?
- ¿Puede vender sin stock?
- ¿Puede aplicar dos veces un descuento?
- ¿Puede duplicar webhook?
- ¿Puede divergir del ERP?

---

# 9. OK

Una tarea puede marcarse DONE cuando:

1. behavior implementado;
2. tests apropiados pasan;
3. no existe error conocido que invalide el objetivo;
4. documentación se actualizó;
5. roadmap refleja el avance.

No esperar perfección estética o cobertura total si la fase no la exige.

---

# 10. FIX LOOP

Si test/review falla:

```text
FAIL
 ↓
identify root cause
 ↓
smallest safe fix
 ↓
rerun relevant test
```

No reiniciar toda la fase.

No hacer refactor masivo salvo que la causa raíz lo exija.

---

# 11. Update Docs

Al terminar una sesión significativa:

### `ROADMAP.md`

- marcar tareas;
- actualizar porcentaje;
- actualizar changelog;
- mover discoveries a Backlog/Retroactividad.

### `DECISIONS.md`

Actualizar cuando:

- cambie arquitectura;
- se elija una dependencia;
- aparezca un tradeoff;
- se descarte una solución;
- se modifique scope;
- se descubra una limitación externa.

### `PROJECT.md`

Actualizar sólo cuando cambie la fuente de verdad del producto.

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

Esto evita falsa precisión.

---

# 13. Trabajo en paralelo

Permitido:

```text
Fase 2 Storefront
Fase 3 Multitenancy
Track ERP Camelot
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

Ejemplo:

```text
ERPAdapter
  getProducts()
  getInventory()
```

puede tener:

```text
MockERPAdapter
CamelotERPAdapter
```

El mock no debe cambiar el contrato esperado del provider real.

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
- docs actualizadas.

Para funcionalidades críticas:

- idempotency;
- auth;
- tenant;
- error handling;
- auditability.

---

# 17. Regla anti-overengineering

Antes de crear abstracción, preguntar:

> ¿Tenemos al menos dos implementaciones reales o una necesidad clara de reemplazo?

Excepciones donde sí abstraer desde v1 porque ya sabemos que habrá múltiples providers:

- ERP
- Payments
- Notifications
- AI provider interface, aunque inicialmente sólo OpenAI
- Analytics destination
- Storage/media cuando sea necesario

---

# 18. Regla de rollback

Toda modificación de:

- schema
- payments
- orders
- inventory
- auth/RLS

debe tener una estrategia clara de reversión o migración segura.

---

# 19. Informe de cierre de tarea

Formato corto recomendado para la IA:

```text
Implemented
- ...

Validated
- lint
- typecheck
- ...

Pending
- ...

Docs
- ROADMAP updated
- DECISIONS updated if needed
```

No generar reportes largos salvo que exista un problema.

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

La velocidad es importante, pero nunca a costa de inconsistencias de stock, pagos, pedidos o tenants.

---

# 21. UX acceptance checklist

Para cualquier feature interactiva:

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

Si alguna respuesta crítica es "no", la feature no está DONE.

---

# 22. Performance/Data checklist

Antes de cerrar una lista o tabla:

- ¿Está paginada?
- ¿Filtros/sort ocurren server-side cuando el dataset puede crecer?
- ¿Existe límite explícito?
- ¿Se evita traer datos invisibles?
- ¿Las imágenes usan tamaños/formato adecuados?
- ¿Una librería premium se carga sólo donde se usa?
