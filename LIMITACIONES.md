# Limitaciones conocidas

Qué **no** hace Pick Commerce hoy, con el motivo y qué lo desbloquea.

Existe para que un prospecto o un piloto se entere acá y no al chocarse. Una
limitación escrita es una decisión; la misma limitación sin escribir es una
sorpresa, y cuesta la confianza de quien la descubre.

Se actualiza al cerrar cada fase. Si algo de esta lista se resuelve, se saca —
una lista que envejece deja de leerse.

> Última revisión: cierre de la Fase 12 (v1).

---

## Lo que bloquea, y hay que saber antes de vender

### No hay pasarela de pago real

Existe el contrato `PaymentProvider` y una pasarela **simulada, declarada como
tal**. Se cobra por transferencia bancaria, que es una persona mirando un
comprobante y marcando el pedido como pagado en el Admin.

**Qué lo desbloquea:** elegir proveedor —Bancard, uPay, Pagopar, Dinelco— y
conseguir credenciales. La decisión está pendiente como P-001.

### Los correos sólo llegan a la casilla del dueño de la cuenta

Sin un dominio verificado en Resend, un pedido con el correo de un comprador real
devuelve 403. El pipeline funciona: la fila queda en la cola y cuenta el intento.

**Qué lo desbloquea:** verificar un dominio en `resend.com/domains` y cargar
`EMAIL_FROM`. Es media hora y no depende de código.

---

## Lo que el sistema no hace, a propósito

### Facturación

Fuera del core, y va a seguir estando: facturación, notas de crédito,
devoluciones y contabilidad. Pick Commerce vende y orquesta pedidos; la factura
la emite otro sistema.

### Envíos: una tarifa y nada más

Hay una tarifa plana por tienda y un umbral de envío gratis. **No** hay zonas,
transportistas, cálculo por peso ni retiro en sucursal. El pedido guarda lo que
se cobró, que es lo que faltaba.

**Qué lo desbloquea:** el retiro por sucursal está en la Fase 0 de v2, junto con
el resto de multi-sucursal.

### El ERP entra, y nada sale

El adapter de Estilo Sport lee catálogo, precios y stock del Oracle ORDS. **No
escribe**: el cliente no da acceso de escritura ni contra un entorno de prueba
(ADR-086), así que está validado en una sola dirección.

Y el ERP **no dice en qué depósito está el stock**: manda una fila por lote sin
identificar la sucursal, así que todo el stock cae en una sola.

### El stock del storefront es un espejo

La navegación usa un espejo cacheado. Add to Cart y el checkout revalidan contra
la base, y `create_order` descuenta en la misma transacción que crea el pedido:
**no se puede vender sin stock**. Lo que sí puede pasar es que la PLP muestre
como disponible algo que se agotó hace segundos.

### Sin reservas de stock

`supportsReservations` existe en la matriz de capacidades y ningún adapter lo
declara. Nadie promete cero overselling contra un ERP que no lo soporta.

### Presets: hay uno solo

Los tokens de diseño están construidos para recibir presets —un preset redefine
variables, no clases— pero los tres previstos (Blank, Fashion, Sport) no están
hechos. Toda tienda arranca con la estética base, que está diseñada a propósito
y no es una plantilla genérica (ADR-027).

### El contenido de las páginas legales es el de la demo

`Políticas` y `Preguntas frecuentes` salen de un módulo del storefront, no del
CMS. Un comercio real necesita las suyas, y hoy eso es editar código.

**Qué lo desbloquea:** una sección de páginas en el CMS, que ya administra la
portada por secciones.

### La home no tiene lema

El `<title>` de la portada es el nombre de la tienda. No hay dónde guardar una
descripción propia, así que no se inventa una.

---

## Operación

### El Admin se despliega a mano

El storefront sale a producción con cada push. El Admin **no** tiene Workers
Builds: cada cambio necesita `pnpm --filter @pick/admin run deploy`. Una pantalla
nueva dada por terminada sin desplegarla no existe para quien la va a usar.

### Un solo entorno

No hay staging: lo que se pushea a `main` es producción. El CI **no bloquea el
deploy** — corren en paralelo, así que un push que rompe el build igual despliega.

### La alerta de caída tiene quince minutos de resolución

Un workflow pide el storefront y el Admin cada quince minutos y abre un issue si
alguno no responde. No mide latencia, no avisa fuera de GitHub y no distingue
«lento» de «caído».

### Los backups son los de Supabase

Los automáticos del proyecto, con la retención del plan contratado. **No hay un
procedimiento de restore probado**: no se ejerció nunca una restauración
completa, así que el tiempo de recuperación es desconocido.

**Qué lo desbloquea:** ejercitar un restore sobre un proyecto nuevo y cronometrarlo.

### Los dominios propios no están montados

El modelo está decidido (ADR-062) y sin ejecutar. Hoy cada storefront se sirve
desde su URL de `workers.dev`.

---

## Medición

### El catálogo se midió hasta 5006 productos, no hasta 9032

Hasta el 1 de septiembre de 2026 esto era un bloqueo: el listado tardaba 2,3
segundos con 5000 productos y casi 4 en la página 100. Ahora es plano. Medido con
`explain analyze` en el proyecto de desarrollo, con 5006 productos, 5010
variantes y 12175 imágenes:

| Consulta | Antes | Ahora |
| --- | ---: | ---: |
| Listado del catálogo (PLP), primera página | 2287 ms | **233 ms** |
| Listado del catálogo, página 100 | 3886 ms | **229 ms** |
| Listado del catálogo, última página (209) | — | **223 ms** |
| Catálogo con búsqueda | 2191 ms | **194 ms** |
| Catálogo ordenado por precio | — | **254 ms** |
| Producto por handle (PDP) | 31 ms | **37 ms** |
| Admin: productos | 135 ms | sin cambios |
| Admin: resumen | 91 ms | sin cambios |
| Admin: ventas por producto | 122 ms | sin cambios |

Sobre la red, la página del catálogo entera sale en 0,4 s con ese catálogo.

Eran dos costos y no uno. El precio más bajo de cada producto se calculaba con
una subconsulta correlacionada contra un CTE —y un CTE no tiene índices, así que
se recorría entero una vez por producto—; y el documento JSON de cada ítem se
armaba antes del corte de página, lo que en la página 100 significaba armar 2400
y descartar 2376.

**Lo que queda:** el catálogo del piloto tiene **9032 productos** y esta medición
llega a 5006. Los tiempos son planos de la primera página a la última, así que no
hay motivo para esperar un salto — pero no está medido, y eso es distinto de
estar bien.

### Analytics no cuenta las precargas de Safari

Chrome manda `Sec-Purpose: prefetch` y Firefox `X-moz`, y las dos se descartan.
El fallback de Safari usa un `fetch()` sin ninguna cabecera que lo distinga de
una navegación, así que **infla las vistas** en la proporción de Safari desktop.
No afecta el embudo, que se cuenta por sesión.

### El margen se informa con su cobertura, y puede no haber ninguna

Sólo las líneas con costo cargado entran en el margen, y siempre se muestra qué
fracción de los ingresos cubren. Los pedidos anteriores a la Fase 10 no tienen
costo y nunca lo van a tener.

### «Ventas» incluye el envío

Es lo facturado, que es contra lo que un comercio concilia el banco. El margen y
su cobertura se calculan **sólo sobre las líneas de producto**, así que el envío
no los diluye.

---

## Inteligencia artificial

### Es opcional, y sin clave el Admin funciona igual

La credencial de OpenAI es del comercio (BYOK) y se guarda cifrada. El cifrado
protege contra **una filtración de la base**; no contra el propio dueño del
comercio, que es quien la cargó (ADR-105).

### Rotar la clave maestra invalida lo guardado

No hay versión de clave: si se rota, las credenciales cifradas con la anterior
dejan de abrirse y hay que volver a cargarlas desde Configuración.

### La IA no propone precio, stock, SKU ni costo

Y no puede: el esquema de la respuesta no los declara. Es deliberado — un número
plausible inventado se descubre cuando alguien compra.
