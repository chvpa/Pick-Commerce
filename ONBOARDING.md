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

- [ ] **Crear el proyecto de Workers Builds** apuntando al repositorio.
      El Admin **no** se despliega por cliente: es uno solo para todos
      (ADR-062, ADR-072).

- [ ] **Cargar las variables.** De build, `SITE_URL` con la dirección pública —de
      ahí salen el canonical, el `og:url` y el sitemap—. De runtime:

  | Variable | Qué es |
  | --- | --- |
  | `SUPABASE_URL` | El proyecto |
  | `SUPABASE_SECRET_KEY` | Saltea RLS. **Sólo servidor** |
  | `STOREFRONT_DOMAIN` | Qué tienda sirve este deploy |
  | `RESEND_API_KEY` | Sin ella no sale ningún correo, y la cola espera |
  | `EMAIL_FROM` | De qué dirección salen |
  | `PAYMENT_WEBHOOK_SECRET` | Sólo si se habilita la pasarela simulada |

- [ ] **Conectar el dominio** al Worker desde el panel.

- [ ] **Comprobar el primer deploy:** que la home cargue, que el encabezado diga
      **el nombre del comercio** —no «Pick Demo»— y que `/robots.txt` apunte al
      sitemap del dominio correcto.

---

## 3. El catálogo

- [ ] **Cargarlo.** Tres caminos, por orden de preferencia:

  - **Desde el ERP**, si lo tiene: `pnpm erp:importar --tienda <slug> --dry-run`
    primero, siempre. Después sin `--dry-run`, y `pnpm erp:imagenes --tienda <slug>`.
  - **Por CSV**, desde Productos → Importar en el Admin.
  - **A mano**, para un catálogo chico.

- [ ] **Revisar lo importado**: que las categorías tengan sentido, que los
      precios estén en la unidad correcta y que las fotos se vean.

- [ ] **Marcar los atributos filtrables** para que la PLP tenga facetas.

> Con más de mil productos, leer la primera sección de
> [LIMITACIONES.md](LIMITACIONES.md): el listado del catálogo se pone lento y hay
> que resolverlo antes de abrir al público.

---

## 4. Configuración comercial

En el Admin, en Configuración:

- [ ] **Medios de pago.** Transferencia viene habilitada; cargar las
      instrucciones —cuenta, banco, titular, a dónde mandar el comprobante—
      porque son las que ve el comprador en el checkout y en el correo.
- [ ] **Moneda**, si opera con más de una.
- [ ] **Envío**: la tarifa y, si corresponde, desde qué monto es gratis. Si no
      cobra envío, dejarlo apagado — el pedido queda con envío cero y la tienda
      no anuncia nada.
- [ ] **Inteligencia artificial**, opcional: la clave de OpenAI del comercio. Sin
      ella todo funciona igual, sin sugerencias.
- [ ] **Portada**: secciones, banner y colecciones destacadas, en Contenido.

---

## 5. Correos

- [ ] **Verificar el dominio** en `resend.com/domains` y cargar `EMAIL_FROM` con
      una dirección de ese dominio.

      **Sin esto los correos sólo llegan a la casilla del dueño de la cuenta de
      Resend.** El pedido se crea igual y el aviso queda en la cola contando
      intentos; el comprador no recibe nada.

- [ ] **Comprobarlo de punta a punta**: hacer un pedido de prueba con un correo
      propio y ver que llega.

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
