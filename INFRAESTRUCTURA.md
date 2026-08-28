# Infraestructura

Cómo corre este proyecto fuera de tu editor: qué máquinas intervienen, qué hace
cada una, de dónde saca sus credenciales y qué mirar cuando algo falla.

No es un ADR: no decide nada. Los ADR-055 a 062 de [DECISIONS.md](DECISIONS.md)
tienen el _por qué_ de cada decisión; esto es el _cómo funciona hoy_, junto.

---

## 1. Las cuatro piezas

| Pieza          | Qué es                                    | Qué guarda                                    | Quién la paga            |
| -------------- | ----------------------------------------- | --------------------------------------------- | ------------------------ |
| **Tu máquina** | Donde escribís código y corrés `pnpm dev` | El `.env` con las credenciales reales         | —                        |
| **GitHub**     | Guarda el código y corre el **CI**        | Nada secreto. El repo no tiene una sola clave | Gratis en repos públicos |
| **Cloudflare** | Ejecuta el sitio: los **Workers**         | Los secretos de runtime del Worker            | Plan de Workers          |
| **Supabase**   | La base Postgres con el catálogo          | **Todos los datos**                           | Plan de Supabase         |

Ninguna sabe de las otras salvo por las credenciales que vos les cargaste.
Cloudflare no mira el CI; el CI no mira Cloudflare; los dos hablan con Supabase
sólo si tienen la URL y la clave.

```mermaid
flowchart LR
  Vos[Tu máquina] -- git push --> GH[GitHub]
  GH -- dispara --> CI[GitHub Actions: CI]
  GH -- dispara --> CFB[Cloudflare Workers Builds]
  CFB -- publica --> W[Worker pick-commerce]
  W -- lee catálogo --> SB[(Supabase Postgres)]
  CI -- levanta su propia base --> PG[(Supabase local en el runner)]
  Vos -- migraciones y seed --> SB
```

Fijate en la asimetría del dibujo: **el CI nunca toca Supabase de verdad**, se
levanta uno propio y descartable. Y **el deploy no pasa por el CI**: son dos
ramas independientes que salen del mismo push. Volvemos a esto en §4.

---

## 2. El mismo código corriendo en tres lugares

Esto es lo que más confunde, porque el artefacto es el mismo y lo único que
cambia es de dónde salen las credenciales.

|                        | Tu máquina                    | El runner del CI                                      | Producción                                    |
| ---------------------- | ----------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Quién ejecuta          | `astro dev` o `astro preview` | Ubuntu efímero de GitHub                              | Worker de Cloudflare                          |
| Base de datos          | El proyecto Supabase remoto   | Un Supabase local en Docker, que muere con la corrida | El proyecto Supabase remoto                   |
| Credenciales           | `.env` en la raíz del repo    | Las imprime `supabase status` al arrancar             | Secretos del Worker en el panel de Cloudflare |
| Vida útil de los datos | Permanente                    | ~15 minutos                                           | Permanente                                    |

Un detalle que parece trivial y no lo es: `astro preview` **no** es Node, es
**workerd** —el mismo motor que Cloudflare— corriendo en tu máquina. Por eso no
ve `process.env` y necesita el archivo `.dev.vars`. Cuando corrés `pnpm e2e`
estás probando el binario que se despliega, no una imitación.

---

## 3. El CI: qué hace y qué no

Vive en [.github/workflows/ci.yml](.github/workflows/ci.yml). Se dispara con cada
push a `main` y con cada pull request.

### Los pasos, en orden y con su razón

| #   | Paso                                          | Para qué                                                                                       | Si falla, es porque…                                   |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `checkout` + `pnpm install --frozen-lockfile` | Clon limpio con las versiones exactas del lockfile                                             | El `pnpm-lock.yaml` no coincide con los `package.json` |
| 2   | `pnpm lint`                                   | ESLint en todo el workspace                                                                    | Código que no cumple las reglas                        |
| 3   | `pnpm typecheck`                              | `tsc` y `astro check`                                                                          | Tipos rotos                                            |
| 4   | `pnpm test`                                   | Unitarios + aislamiento entre tenants sobre **PGlite** (Postgres compilado a WASM, sin Docker) | Un test detectó una regresión                          |
| 5   | `supabase start`                              | Levanta Postgres, Auth y API de verdad en el runner y aplica las migraciones                   | Una migración no aplica desde cero                     |
| 6   | Exportar credenciales                         | Toma la URL y las claves del stack recién levantado y las mete en el entorno                   | Cambió el nombre de las claves en el CLI               |
| 7   | `pnpm build`                                  | Construye admin y storefront                                                                   | El build se rompió                                     |
| 8   | `pnpm budget`                                 | Mide el peso real por página y falla si excede 25 KB de JS o 20 KB de CSS                      | Alguien engordó el bundle                              |
| 9   | `playwright install chromium`                 | Baja el navegador                                                                              | Red                                                    |
| 10  | `pnpm e2e`                                    | Navegación real, desktop y mobile, contra el build servido por workerd                         | Un critical path se rompió                             |

Los pasos 1 a 4 no necesitan base. Recién del 5 en adelante hace falta, porque
desde la Fase 4 el storefront lee el catálogo de Postgres en cada petición.

### Lo importante: no hay ningún secreto en el CI

Ni en el repo ni en la configuración de GitHub. El paso 5 **fabrica** una base
desde cero con las migraciones del repo, y el 6 lee las credenciales que esa base
acaba de imprimir. Consecuencias:

- Nadie puede filtrar una clave desde el CI, porque no hay ninguna.
- Una corrida no puede ensuciar ni romper el proyecto Supabase real.
- El CI prueba que **las migraciones aplican desde cero**, que es distinto de que
  el proyecto remoto funcione: el remoto podría estar funcionando por algo que
  alguien tocó a mano y no quedó en una migración.

Esto es ADR-058.

**Cuánto tarda, medido en una corrida completa en verde** (`a30f795`,
26/08/2026): **3m 37s de punta a punta**. El reparto:

| Paso                                      | Tiempo               |
| ----------------------------------------- | -------------------- |
| `supabase start`                          | 1m 45s               |
| `playwright install`                      | 26s                  |
| `pnpm typecheck`                          | 16s                  |
| `pnpm install`                            | 11s                  |
| `pnpm test` + `lint` + `build` + `budget` | 16s entre los cuatro |
| `pnpm e2e`                                | 29s                  |

Casi todo el tiempo es levantar Postgres y bajar Chromium; lo que el repo tiene
que verificar de verdad se hace en menos de un minuto. Una corrida sana no pasa
de cuatro minutos: **si ves una de cuarenta, no está lenta, está colgada**.

### `cancelled` no es `failure`

El workflow declara:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Si hacés tres pushes seguidos, las dos primeras corridas se **cancelan solas**.
No fallaron: se abandonaron a propósito, porque validar un commit que ya no es la
punta de la rama es tiempo tirado.

**Ojo con el badge**: GitHub pinta las corridas canceladas igual que las
fallidas. Hoy el badge dice `CI - failing` y en el repo no hay ningún fallo: las
tres últimas corridas terminadas fueron `cancelled` por esa regla. Para saber la
verdad hay que abrir la corrida y mirar su conclusión, no el badge.

### Dónde mirar

`https://github.com/chvpa/Pick-Commerce/actions` → la corrida → el job `verify`.
Cada paso se despliega y muestra su salida. Si el e2e falla, el workflow sube el
`playwright-report` como artifact descargable, con capturas y trazas.

---

## 4. Cloudflare: los Workers y el deploy

### Qué es un Worker

Una función que Cloudflare ejecuta en su red cada vez que llega una petición. No
hay servidor encendido esperando: arranca, responde y desaparece. Por eso no
tiene disco, ni `process.env`, ni Node completo —de ahí el
`compatibility_flags: ["nodejs_compat"]` en la config—.

### Los dos Workers de este proyecto

| Worker          | App          | Qué sirve                                                                       | Estado                                                     |
| --------------- | ------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pick-commerce` | `apps/demo`  | El storefront. Mezcla páginas estáticas y páginas que se arman en cada petición | En línea: https://pick-commerce.chvpa-contacto.workers.dev |
| `pick-admin`    | `apps/admin` | El Admin, que es una SPA: sólo archivos estáticos, sin código de servidor       | **Todavía no desplegado**                                  |

El nombre lo declara `wrangler.jsonc` de cada app y **tiene que coincidir con el
Worker que ya existe** en Cloudflare. Con otro nombre, un deploy no actualiza el
sitio: crea un Worker nuevo al lado, y el viejo sigue sirviendo la versión
anterior. Ya pasó acá.

### Qué se resuelve estático y qué en cada petición

Astro genera las dos cosas en el mismo build:

- **Estáticas** (HTML ya escrito en disco): 404, políticas, FAQ, carrito, robots.
- **On-demand** (`export const prerender = false`): home, catálogo y ficha de
  producto, más el sitemap y el `llms.txt`.

La regla es simple: si el contenido sale de la base, va on-demand. Si fuera
estático, cada producto que cargás en el Admin exigiría un redeploy para
aparecer. Ese es el motivo de que el Worker necesite credenciales de Supabase en
runtime, y no sólo al construir.

### Los dos caminos para desplegar

**Automático — Workers Builds.** Cloudflare está conectado al repo de GitHub y
en cada push a `main` clona, construye y publica. Son dos proyectos, uno por app,
porque cada uno corre su propio comando:

| Ajuste         | `pick-commerce`                       | `pick-admin`                           |
| -------------- | ------------------------------------- | -------------------------------------- |
| Build command  | `pnpm --filter @pick/demo run build`  | `pnpm --filter @pick/admin run build`  |
| Deploy command | `pnpm --filter @pick/demo run deploy` | `pnpm --filter @pick/admin run deploy` |

**Manual — desde tu máquina**, con `wrangler login` hecho una vez:

```bash
pnpm deploy:demo     # construye y publica el storefront
pnpm deploy:admin    # ídem el Admin
```

El `run` no es opcional: `deploy` es un comando propio de pnpm, y sin `run`
falla con `ERR_PNPM_INVALID_DEPLOY_TARGET` sin llegar nunca al script del
paquete.

### ⚠ El CI no bloquea el deploy

Los dos salen del mismo push, pero **son independientes**: Cloudflare no espera
a GitHub Actions ni le pregunta nada. Un commit que rompe los tests se despliega
igual, y llega a producción antes de que el CI termine —hoy mismo el sitio quedó
actualizado a los ~20 segundos de un push mientras la corrida seguía, y sigue
corriendo casi una hora después—.

Hoy no muerde porque trabajás directo sobre `main` y sos el único. Cuando importe,
se arregla desplegando desde el propio CI —con el deploy como último paso,
después del e2e— y desconectando Workers Builds. Está anotado en el backlog del
[ROADMAP](ROADMAP.md).

### Variables de build ≠ secretos de runtime

Este es el punto que costó tres intentos y vale entenderlo bien.

|                        | Variables de build                              | Secretos de runtime                   |
| ---------------------- | ----------------------------------------------- | ------------------------------------- |
| Cuándo se leen         | Mientras Cloudflare construye                   | En cada petición al sitio             |
| Quedan en el bundle    | Sí, incrustadas                                 | No, viven en el entorno del Worker    |
| Dónde se cargan        | _Settings › Build › Variables_                  | _Settings › Variables and Secrets_    |
| Qué pone este proyecto | `SITE_URL` si querés fijar la dirección pública | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` |

Poner la clave de Supabase como variable de build no sólo no funciona: la
**incrustaría en el artefacto**. Y ponerla sólo ahí deja al Worker sin nada que
leer cuando llega una petición.

### Por qué faltar una variable daba un 500 vacío

`astro:env` valida **todos** los secretos declarados al cargar el módulo, aunque
la página no use ninguno. El código generado hace, en su cuerpo:

```js
var SUPABASE_URL = _internalGetSecret('SUPABASE_URL');
```

Si falta, eso explota antes del middleware y antes de la ruta: el Worker
devuelve **500 con el cuerpo vacío**, sin decir qué falta ni que el problema sea
de configuración.

Por eso los dos secretos se declaran `optional: true` —no porque puedan faltar,
sino para que Astro no valide— y quien controla es
[src/middleware.ts](apps/demo/src/middleware.ts), que responde **503 con una
página que nombra las variables ausentes**. 503 y no 500 porque la aplicación
está sana, es el entorno el que no está listo, y un buscador que recibe 503
reintenta en vez de desindexar.

Si alguna vez ves esa pantalla: no es un bug, es el Worker diciéndote qué
cargarle.

---

## 5. Las variables, una por una

| Variable                                              | Qué es                                                              | Secreta                                               | Tu máquina       | CI                        | Worker                |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- | ---------------- | ------------------------- | --------------------- |
| `SUPABASE_URL`                                        | Dirección del proyecto                                              | No, pero viaja como secreto                           | `.env`           | La imprime el stack local | Runtime               |
| `SUPABASE_SECRET_KEY`                                 | **Saltea RLS por completo**                                         | **Sí**                                                | `.env`           | Ídem                      | Runtime               |
| `SUPABASE_PUBLISHABLE_KEY`                            | Clave para el browser; la protege RLS                               | No                                                    | `.env`           | Ídem                      | No la usa             |
| `SUPABASE_ACCESS_TOKEN`                               | Token de tu **cuenta** Supabase, para el CLI y la API de Management | **Sí, y es la más peligrosa: ve todos tus proyectos** | `.env`           | No se usa                 | No se usa             |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Lo que el Admin expone al browser                                   | No                                                    | `.env`           | Ídem                      | —                     |
| `SITE_URL`                                            | Dirección pública del storefront                                    | No                                                    | `.env`, opcional | —                         | Variable de **build** |
| `STOREFRONT_DOMAIN`                                   | **Qué tienda sirve este deploy**                                    | No                                                    | Default          | Default                   | Variable pública      |

Dos que se confunden todo el tiempo y no son lo mismo:

- **`SITE_URL`** es la dirección desde la que se sirve el sitio. De ahí salen el
  canonical, el `og:url`, el JSON-LD y el sitemap. Si está mal, el sitio funciona
  perfecto y el SEO se anula en silencio —pasó: anunciaba un dominio inexistente
  durante un deploy entero—.
- **`STOREFRONT_DOMAIN`** es la **llave de búsqueda**: el Worker consulta
  `stores.domain` con ese valor para saber qué tienda mostrar. Tiene que coincidir
  con lo que dice la base, no con el dominio desde el que se sirve.

Hoy son distintas y está bien. Cuando la demo tenga dominio propio se cambian las
dos.

### La secret key, en una línea

Saltea RLS: con ella se ven los datos de **todos** los comercios. Por eso vive
sólo del lado del servidor, nunca lleva prefijo `VITE_` ni `PUBLIC_` —esos
prefijos son justamente los que inyectan el valor en el bundle del browser— y el
`.env` está en `.gitignore`. El Admin no la usa: entra con el token del usuario y
lo filtra RLS.

---

## 6. Supabase: la base

### Migraciones

Cada cambio de schema es un archivo en `supabase/migrations/`, y se aplica con:

```bash
pnpm db:apply supabase/migrations/<archivo>.sql
pnpm db:types      # regenera los tipos TypeScript desde el schema real
```

Va por la **API de Management**, que sólo necesita `SUPABASE_ACCESS_TOKEN`: no
hace falta Docker ni la password de la base. Los archivos son **append-only** —un
bug en una función SQL se arregla con un `create or replace` en una migración
nueva, nunca editando la vieja—, porque el CI las aplica desde cero y tienen que
poder correr en orden sobre una base vacía.

El script renombra el archivo local para que su versión coincida con la que
asignó el servidor. Si no, local y remoto divergen y el CLI empieza a mentir.

### Datos de demostración

```bash
pnpm seed                              # siembra el catálogo; idempotente
pnpm admin:crear <email> <password>    # usuario del Admin
```

`pnpm seed` es idempotente: se puede correr mil veces. Lo corre también el setup
del e2e, para restituir los datos que los tests dan por ciertos.

### Aislamiento entre comercios

Dos capas, y la del frontend no cuenta:

1. **RLS en Postgres.** Cada consulta filtra por las organizaciones donde el
   usuario tiene membresía. Es la que protege al Admin.
2. **Autorización en el servicio de dominio** (`assertCan`), para el camino que
   usa la secret key —el storefront—, donde RLS no aplica porque esa clave la
   saltea.

Lo verifican 12 tests que levantan Postgres en proceso con PGlite, aplican las
migraciones reales y comprueban que un miembro de A no ve nada de B. Se comprobó
que **fallan** al romper las políticas a propósito, que es la única forma de
saber que un test sirve.

Que cada comercio tenga su dominio no aporta nada al aislamiento: el aislamiento
lo da la base, no la URL. Eso es ADR-062.

### Dar de alta un comercio nuevo

Los cuatro primeros pasos de PROJECT.md §6 —los que viven en la base— los hace un
comando. El resto es infraestructura y sigue siendo manual, porque hoy son cuatro
clicks por cliente y automatizarlo entero es P-005.

```bash
# 1. Organización, tienda, sucursal «Casa matriz» y configuración por defecto.
#    Idempotente por slug: repetirlo corrige el nombre o el dominio.
pnpm tienda:crear estilosport 'Estilo Sport' estilosport.com.py PYG es-PY

# 2. El propietario. Sin el slug de la organización, el usuario entra a la demo.
pnpm admin:crear duenio@estilosport.com.py 'una-contraseña-larga' owner estilosport
```

La tienda nace pudiendo vender: transferencia bancaria habilitada y sin
conversión de moneda. Lo que le falta es catálogo, que se carga desde el Admin o
por CSV.

Después, en Cloudflare: un proyecto de Workers Builds para el storefront de ese
comercio, con `SUPABASE_URL` y `SUPABASE_SECRET_KEY` como **secretos de runtime**
y `STOREFRONT_DOMAIN` con el dominio que se acaba de registrar —esa variable
también se lee en runtime desde que ADR-052 se corrigió—. El dominio se conecta
al Worker desde el panel. El Admin **no** se despliega por cliente: es uno solo
para todos (ADR-062, ADR-072).

Tres cosas que conviene saber antes de necesitarlas:

- El dominio de `stores.domain` tiene que coincidir exactamente con el
  `STOREFRONT_DOMAIN` del Worker. Si no coinciden, el storefront no resuelve el
  tenant y responde 503 nombrando lo que falta.
- Una organización no puede quedarse sin propietario: un trigger lo impide por
  todos los caminos, incluida la secret key. Bajarle el rol al único owner con
  `pnpm admin:crear ... staff` falla, y el mensaje dice por qué.
- Dar de baja la organización sí borra todo en cascada, y eso el trigger no lo
  frena (ADR-068).

### Secretos del Worker que trajo la Fase 7

Van como **secretos de runtime** del Worker del storefront, junto a los que ya
estaban. Ninguno es obligatorio, y esa es la idea: su ausencia degrada en vez de
romper, así que un despliegue sin ellos sigue vendiendo.

| Variable                 | Si falta                                                         |
| ------------------------ | ---------------------------------------------------------------- |
| `RESEND_API_KEY`         | No sale ningún correo. La cola crece y se vacía cuando aparezca. |
| `PAYMENT_WEBHOOK_SECRET` | El método de tarjeta no se ofrece y el webhook responde 503.     |
| `EMAIL_FROM`             | Se usa `Pick Commerce <onboarding@resend.dev>`.                  |

Cargar `PAYMENT_WEBHOOK_SECRET` con un valor largo y aleatorio: es lo que firma
los avisos de pago, y quien lo tenga puede marcar pedidos como pagados.

### Correos: el techo del sandbox

Sin un dominio verificado, **Resend sólo entrega a la casilla del dueño de la
cuenta**. Comprobado: un pedido con el correo de otro comprador devuelve un 403
que lo dice con todas las letras. El pipeline funciona igual —la fila queda en la
cola y cuenta el intento— pero el comprador no recibe nada.

Antes del piloto: verificar un dominio en `resend.com/domains`, y cargar
`EMAIL_FROM` con una dirección de ese dominio.

### Que el correo de recuperación salga por Resend

El enlace para restablecer la contraseña lo manda **Supabase Auth con su propio
SMTP**, no la API de Resend: el token lo acuña Supabase. Por defecto usa su
servidor compartido, que admite pocos correos por hora y sólo escribe a miembros
del proyecto — alcanza para probar, no para un comercio.

Para apuntarlo a Resend, en el panel de Supabase (_Authentication › Emails ›
SMTP Settings_): servidor `smtp.resend.com`, puerto `465`, usuario `resend`,
contraseña la misma `RESEND_API_KEY`, y un remitente del dominio verificado. Se
puede hacer también con la API de Management y el `SUPABASE_ACCESS_TOKEN` que ya
está en `.env`, pero es una operación única: no vale automatizarla.

### Comprobar que los avisos están saliendo

La cola vive en `notification_outbox`. Una fila con `sent_at` en nulo y
`attempts` en 5 es un aviso abandonado.

```sql
select event, recipient, attempts, sent_at
from notification_outbox
where sent_at is null
order by created_at;
```

Se vacía sola con el tráfico del sitio —el middleware la drena como mucho cada
treinta segundos— y el Admin la empuja al cambiar el estado de un pedido. A mano:
`GET /api/notificaciones/drenar` sobre el dominio de la tienda.

---

## 7. El recorrido de un cambio

1. Escribís código y corrés `pnpm lint`, `pnpm typecheck` y los tests del paquete.
2. `git push`.
3. **En paralelo** salen dos cosas del mismo push:
   - GitHub Actions corre el CI completo (~4 min).
   - Cloudflare construye y publica el storefront (~1-2 min).
4. El sitio ya está actualizado. El CI te avisa después si algo se rompió.

Si el cambio tocó el schema, va antes: `pnpm db:apply` y `pnpm db:types`, que
pegan directo contra la base real y no esperan a ningún push.

---

## 8. Diagnóstico rápido

| Síntoma                                 | Causa más probable                                            | Dónde mirar                                                      |
| --------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| El sitio dice **«Falta configuración»** | Un secreto de runtime no llegó al Worker                      | La propia página los nombra. _Settings › Variables and Secrets_  |
| **500 con pantalla en blanco**          | Algo revienta antes del middleware                            | Logs del Worker: `observability` está activo en `wrangler.jsonc` |
| El deploy no actualiza nada             | El `name` del `wrangler.jsonc` no coincide con el Worker real | Dashboard: ¿apareció un Worker nuevo al lado?                    |
| El badge dice `failing` pero nada falla | Corridas canceladas por `cancel-in-progress`                  | Abrir la corrida y leer su conclusión                            |
| El e2e falla sólo en CI                 | Datos distintos, o timing                                     | Descargar el `playwright-report` de la corrida                   |
| El canonical apunta a un dominio raro   | `SITE_URL`                                                    | Variables de **build** del proyecto de Cloudflare                |
| El storefront no encuentra la tienda    | `STOREFRONT_DOMAIN` no coincide con `stores.domain`           | Comparar el valor con la fila de la base                         |

---

## 9. Glosario

- **Worker** — función que Cloudflare ejecuta en su red por petición. Sin
  servidor encendido, sin disco.
- **workerd** — el motor de los Workers. `astro preview` lo usa, así que probás
  el artefacto real y no una imitación en Node.
- **Workers Builds** — el servicio de Cloudflare que construye y publica en cada
  push. Es el «deploy automático».
- **Runner** — la máquina virtual efímera de GitHub donde corre el CI.
- **Prerender / on-demand** — HTML escrito al construir vs. armado en cada
  petición.
- **RLS** (_Row Level Security_) — reglas dentro de Postgres que deciden qué
  filas ve cada usuario. Es la capa que garantiza que un comercio no vea otro.
- **PGlite** — Postgres compilado a WASM. Corre dentro del proceso de Node, sin
  Docker: por eso los tests de aislamiento corren en cualquier máquina.
- **Idempotente** — que se puede repetir sin cambiar el resultado. `pnpm seed`
  lo es.

---

## 10. Lo que hoy no está resuelto

- **El Admin se despliega a mano.** Está en línea en
  `pick-admin.chvpa-contacto.workers.dev`, pero no tiene proyecto de Workers
  Builds: cada cambio necesita `pnpm --filter @pick/admin run deploy`. Para
  automatizarlo hace falta un segundo proyecto con `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_PUBLISHABLE_KEY` como variables de **build**, porque el Admin
  las hornea al construir.
- **El CI no bloquea el deploy** (§4).
- **No hay gateway de pago real.** El contrato existe y hay una pasarela simulada
  declarada como tal; falta elegir proveedor y conseguir credenciales (P-001).
- **Los correos sólo llegan a la casilla del dueño de la cuenta de Resend**
  mientras no haya un dominio verificado.
- **Nadie mira si el sitio se cayó.** No hay alerta: si el Worker empieza a
  responder 503, te enterás entrando.
- **Un solo entorno.** No hay staging: lo que se pushea a `main` es producción.
- **Los dominios propios de cada cliente** todavía no están montados. El modelo
  está decidido en ADR-062; falta ejecutarlo.
