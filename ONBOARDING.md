# Dar de alta un comercio

De cero a vendiendo, con casillas para tachar. Los comandos existen todos; lo que
no está automatizado dice por qué.

`INFRAESTRUCTURA.md §6` explica cada pieza; esto es el orden en que se hacen y
qué comprobar en cada paso. Si algo falla, la respuesta está allá.

> Toma unas dos horas la primera vez, y la mayor parte es esperar a que un
> dominio propague.

---

## 1. La base

- [ ] **Crear la organización, la tienda y la sucursal.**

  ```bash
  pnpm tienda:crear <slug> '<Nombre del comercio>' [dominio] [moneda] [locale]
  # ej: pnpm tienda:crear estilosport 'Estilo Sport' estilosport.com.py PYG es-PY
  ```

  Idempotente por slug: repetirlo corrige el nombre o el dominio.

  **El dominio tiene que ser el mismo que después va en `STOREFRONT_DOMAIN`.** No
  es la URL desde la que se sirve el sitio: es la llave con la que el Worker
  busca la tienda. Si no coinciden, el storefront responde 503 diciendo qué falta.

- [ ] **Crear al propietario.**

  ```bash
  pnpm admin:crear <email> '<contraseña larga>' [rol] [org-slug]
  # ej: pnpm admin:crear duenio@estilosport.com.py 'una-clave-larga' owner estilosport
  ```

  Sin el slug al final, el usuario entra a la **demo**. Es el error más fácil de
  cometer acá.

- [ ] **Comprobar que puede entrar** a `pick-admin.chvpa-contacto.workers.dev` y
      que el selector de tiendas muestra la suya.

---

## 2. El storefront en Cloudflare

Hay dos caminos, y el primero que hay que decidir es cuál:

- **La demo con otro dominio**, si el comercio acepta el diseño de la demo:
  el mismo `apps/demo` desplegado como otro Worker con otro `STOREFRONT_DOMAIN`.
- **Una app propia**, si el comercio tiene diseño: `apps/<cliente>/` copiada de
  `apps/demo`, con sus cinco valores de identidad —dirección pública, puerto,
  nombre del Worker, dominio con el que resuelve su tienda y `SITE_URL`— y su
  header, pie y preset. Es lo que hizo Treeshop (ADR-110). Comparte la base,
  el Admin y los paquetes; lo que mejore en el Core le llega solo.

- [ ] **Crear el Worker.** Con `pnpm --filter @pick/<cliente> run deploy`, que
      además crea solo el KV de sesiones en el primer deploy. Workers Builds hoy
      lo tiene sólo la demo, así que una app propia se despliega **a mano con
      cada cambio**, y con `SITE_URL` en la misma línea porque el `.env` trae el
      de la demo (INFRAESTRUCTURA §4). El Admin **no** se despliega por cliente:
      es uno solo para todos (ADR-062, ADR-072).

- [ ] **Cargar las variables.** De build, `SITE_URL` con la dirección pública —de
      ahí salen el canonical, el `og:url` y el sitemap—. De runtime:

  | Variable                   | Qué es                                           |
  | -------------------------- | ------------------------------------------------ |
  | `SUPABASE_URL`             | El proyecto                                      |
  | `SUPABASE_SECRET_KEY`      | Saltea RLS. **Sólo servidor**                    |
  | `STOREFRONT_DOMAIN`        | Qué tienda sirve este deploy                     |
  | `RESEND_API_KEY`           | Sin ella no sale ningún correo, y la cola espera |
  | `EMAIL_FROM`               | De qué dirección salen                           |
  | `PAYMENT_WEBHOOK_SECRET`   | Sólo si se habilita la pasarela simulada         |
  | `SUPABASE_PUBLISHABLE_KEY` | Sólo si se habilitan cuentas de comprador        |

- [ ] **Conectar el dominio.** La zona tiene que vivir en Cloudflare: agregar
      el sitio, apuntar los nameservers del registrador a los que Cloudflare
      asigna, y **esperar a que la zona pase de `pending` a activa** —atar
      antes deja una entrada que no sirve—. Recién entonces atar `dominio`,
      `www.dominio` al Worker del storefront y `admin.dominio` a `pick-admin`
      (panel o API; ver INFRAESTRUCTURA §4), una sola vez, y esperar el
      certificado. La zona queda **sin rutas de Workers**: una ruta le gana al
      dominio propio.

- [ ] **Agregar `https://admin.<dominio>/**` a las Redirect URLs de Supabase
      Auth**, o el enlace de recuperación de contraseña del Admin no vuelve.

- [ ] **Verificar el dominio en Resend** y poner `EMAIL_FROM` en esa dirección.
      Sin dominio verificado los correos a compradores reales devuelven 403.

- [ ] **Comprobar el primer deploy:** que la home cargue, que el encabezado diga
      **el nombre del comercio** —no «Pick Demo»— y que `/robots.txt` apunte al
      sitemap del dominio correcto.

---

## 3. El catálogo

- [ ] **Cargarlo.** Cuatro caminos, por orden de preferencia:

  - **Desde el ERP**, si lo tiene: `pnpm erp:importar --tienda <slug> --dry-run`
    primero, siempre. Después sin `--dry-run`, y `pnpm erp:imagenes --tienda <slug>`.
  - **Desde el Supabase de su ecommerce anterior**, si es el de Camelot:
    `pnpm camelot:importar --tienda <slug> --dry-run` primero, después sin él, y
    una tercera corrida con `--imagenes`, que es la larga. Necesita
    `CAMELOT_SUPABASE_URL` y `CAMELOT_SUPABASE_SERVICE_ROLE_KEY` en el `.env`.
    Es el camino con el que se cargó Treeshop; el script lee **ese** esquema, así
    que otro sistema necesita el suyo (ADR-111).
  - **Por CSV**, desde Productos → Importar en el Admin.
  - **A mano**, para un catálogo chico.

- [ ] **Revisar lo importado**: que las categorías tengan sentido, que los
      precios estén en la unidad correcta y que las fotos se vean.

- [ ] **Marcar los atributos filtrables** para que la PLP tenga facetas.

> El catálogo está medido hasta 5006 productos con tiempos planos de la primera
> página a la última; el detalle está en [LIMITACIONES.md](LIMITACIONES.md). El
> más grande que hay en producción es el de Treeshop —3752 productos importados,
> 2096 listables—, o sea por debajo de lo medido.
> Dos ajustes en Configuración → Catálogo deciden qué se lista: los productos
> sin stock se ocultan por defecto, y los sin foto se ocultan si se pide.

---

## 4. Configuración comercial

En el Admin, en Configuración:

- [ ] **Medios de pago.** Transferencia viene habilitada; cargar las
      instrucciones —cuenta, banco, titular, a dónde mandar el comprobante—
      porque son las que ve el comprador en el checkout y en el correo.
- [ ] **Moneda**, si opera con más de una.
- [ ] **Envío**: tres modos. **Apagado** —el pedido queda con envío cero y la
      tienda no anuncia nada—, **tarifa única**, o **por zona**, con una tabla
      de zonas editable donde cada una lleva la suya y la tarifa general pasa a
      ser lo que paga un destino que no esté en la tabla: nunca cero (ADR-114).
      El umbral de «gratis desde» vale en los dos modos que cobran y se compara
      con el total ya descontado. Por zona es el modo que corre Treeshop, con
      los dieciocho departamentos.
- [ ] **Inteligencia artificial**, opcional: la clave de OpenAI del comercio. Sin
      ella todo funciona igual, sin sugerencias.
- [ ] **Portada**: secciones, banner y colecciones destacadas, en Contenido.

---

## 5. Correos

- [ ] **Verificar el dominio** en `resend.com/domains` y cargar `EMAIL_FROM` con
      una dirección de ese dominio. **Sin esto los correos sólo llegan a la
      casilla del dueño de la cuenta de Resend.** El pedido se crea igual y el
      aviso queda en la cola contando intentos; el comprador no recibe nada.

- [ ] **Comprobarlo de punta a punta**: hacer un pedido de prueba con un correo
      propio y ver que llega.

- [ ] Si se van a habilitar **cuentas de comprador**, el dominio verificado deja
      de ser una recomendación y pasa a ser **requisito**: el código para entrar
      sale por este mismo canal, con el remitente de este comercio (ADR-123).
      Sin dominio verificado no llega el código, y sin código no hay login. Los
      avisos de pedido degradan —el pedido se crea igual—; el login no degrada,
      se rompe. Y va también `SUPABASE_PUBLISHABLE_KEY` como secreto del Worker:
      es la clave con la que se canjea el código, y es el único camino del
      storefront donde manda RLS. Sin ella las dos rutas de `/api/cuenta/`
      responden 503 y el resto del sitio sigue vendiendo.

- [ ] **Prenderlas**, si corresponde: Configuración → Cuentas de comprador en el
      Admin. Viene apagado, y prenderlo pide confirmar que el dominio está
      verificado —el Admin no lo puede comprobar solo, y por qué está en
      [LIMITACIONES.md](LIMITACIONES.md)—. Con el interruptor apagado la tienda
      vende igual que antes: no aparece «Mi cuenta» en el encabezado y `/cuenta`
      responde 404. El cambio tarda hasta un minuto en verse, como el resto de la
      configuración: el storefront memoiza los ajustes por ese tiempo.

Lo que **no** sale del correo de este comercio: el reset de contraseña del
Admin. Ése va de Pick Commerce al comercio, no del comercio a un comprador, y
sale por el SMTP del proyecto.

---

## 6. Antes de abrir al público

- [ ] **Una compra completa de verdad**, con el dominio final: agregar, comprar,
      ver el pedido en el Admin, marcarlo como pagado, confirmar que salió el
      aviso.
- [ ] **Verificar el aislamiento** si hay más de un comercio en el proyecto:

  ```bash
  pnpm rls:verificar
  ```

- [ ] **Revisar el equipo**: que cada persona tenga el rol que le corresponde y
      no más. `staff` no toca configuración ni promociones.
- [ ] **Agregar el dominio al latido**, en `.github/workflows/latido.yml`: la
      home, el catálogo y el Admin del dominio nuevo. Es lo único que avisa si
      el sitio se cayó, y no vigila un dominio que nadie le cargó
      ([INFRAESTRUCTURA.md](INFRAESTRUCTURA.md)).
- [ ] **Entregar [LIMITACIONES.md](LIMITACIONES.md)** al comercio. Lo que está
      ahí escrito no sorprende a nadie; lo que no, sí.

---

## Mientras sea una demostración

Para mostrarle la tienda a un prospecto sin ensuciar nada:

- [ ] Activar **Modo demostración** en Configuración.

Los pedidos se crean y se ven en el Admin —que es la mitad de lo que se está
mostrando— marcados como demo y **sin mandarle correos a nadie**. Al pasar a
producción se apaga; los pedidos de antes siguen marcados, así que nadie los
despacha por error.
