# Limitaciones conocidas

Qué **no** hace Pick Commerce hoy, con el motivo y qué lo desbloquea.

Existe para que un prospecto o un piloto se entere acá y no al chocarse. Una
limitación escrita es una decisión; la misma limitación sin escribir es una
sorpresa, y cuesta la confianza de quien la descubre.

Se actualiza al cerrar cada fase. Si algo de esta lista se resuelve, se saca —
una lista que envejece deja de leerse.

> Última revisión: 2026-09-12.

---

## Lo que bloquea, y hay que saber antes de vender

### No hay pasarela de pago real

Existe el contrato `PaymentProvider` y una pasarela **simulada, declarada como
tal**. Se cobra por transferencia bancaria, que es una persona mirando un
comprobante y marcando el pedido como pagado en el Admin.

No hay cobro en línea, y el texto de «Preguntas frecuentes» de las apps todavía
nombra tarjetas: hay que corregirlo antes de abrirle la tienda a desconocidos.

**Qué lo desbloquea:** elegir proveedor —Bancard, uPay, Pagopar, Dinelco— y
conseguir credenciales. La decisión está pendiente como P-001.

### Los correos sólo llegan a la casilla del dueño de la cuenta

Sin `EMAIL_FROM` configurado el remitente cae a `Pick Commerce
<onboarding@resend.dev>`, y desde ese remitente Resend entrega **sólo a la
casilla del dueño de la cuenta**: un pedido con el correo de un comprador real
devuelve 403. El pipeline funciona igual —la fila queda en la cola, el intento se
cuenta y el fallo se ve en el pedido (ADR-102)—, así que lo que falta es el
dominio, no código. Está diferido a propósito mientras el piloto sea la tienda
del propio dueño.

**Qué lo desbloquea:** verificar un dominio en `resend.com/domains` y cargar
`EMAIL_FROM` como secreto del Worker
([INFRAESTRUCTURA.md](INFRAESTRUCTURA.md)). Es media hora y no depende de código.

### El Admin no puede comprobar que el dominio esté verificado

Habilitar las cuentas de comprador exige que el correo de ese comercio salga de
su propio dominio: el código para entrar se manda por ahí, así que sin dominio
verificado en Resend el login no degrada, no existe (ADR-123). El Admin **no
puede comprobarlo solo**: la clave de Resend es de sólo envío y su API contesta
«This API key is restricted to only send emails» a cualquier consulta de
dominios.

Lo que hace el Admin es decir qué hace falta y pedir una confirmación explícita
antes de dejar prender el interruptor. Es una afirmación de quien lo prende, no
una verificación, y está dicho así a propósito: fingir un control que no se hace
sería peor que no tenerlo.

**Qué lo desbloquea:** una clave de Resend con permiso de lectura de dominios,
guardada aparte de la de envío. Es configuración, no código, y no tiene fase
asignada en el [ROADMAP](ROADMAP.md).

### Un comprador sin cuenta no puede volver a ver su pedido

Con las cuentas prendidas, quien entra ve sus pedidos —incluidos los que hizo
como invitada con ese mismo correo—. Lo que sigue sin existir es la consulta
**sin** cuenta, y no es un olvido: la numeración es secuencial por tienda, así
que un número cualquiera abriría los pedidos del comercio. Para quien compra de
invitada, la confirmación se guarda en el `sessionStorage` de esa pestaña, así
que entrar directo, o volver al día siguiente, muestra el estado vacío. El
pedido existe igual: esa pantalla es el acuse, no el registro.

**Qué lo desbloquea:** crear la cuenta con ese mismo correo, que engancha los
pedidos viejos sin migrar nada. Para quien no quiera cuenta, un enlace de acuse
con un token propio del pedido; no tiene fase asignada en el
[ROADMAP](ROADMAP.md).

### El stock que carga el Admin cae en la primera sucursal

El formulario de producto tiene un solo campo `Stock` por variante y
`admin_save_product` lo escribe en la primera sucursal de la tienda, porque no
hay selector. Con una sucursal —lo normal hoy— no se nota; un comercio con dos
carga creyendo que reparte y está apilando todo en una.

**Qué lo desbloquea:** un selector de sucursal en el formulario, que es lo que la
función está esperando. Es independiente del ERP, que tiene el mismo síntoma por
otro motivo (más abajo).

---

## Lo que el sistema no hace, a propósito

### Facturación

Fuera del core, y va a seguir estando: facturación, notas de crédito,
devoluciones y contabilidad. Pick Commerce vende y orquesta pedidos; la factura
la emite otro sistema.

### Envíos: una tarifa, o una por zona, y nada más

Una tarifa plana con umbral de gratis, o una tabla de zonas —departamentos,
ciudades— con su tarifa y una general para las que no estén (ADR-107, ADR-114).
El comprador elige la zona en el checkout y el servidor cobra. No hay tarifas
por peso, transportistas ni retiro en sucursal: pickup está en v2.

### El ERP entra, y nada sale

El adapter de Estilo Sport lee catálogo, precios y stock del Oracle ORDS. **No
escribe**: el cliente no da acceso de escritura ni contra un entorno de prueba
(ADR-086), así que está validado en una sola dirección.

Y el ERP **no dice en qué depósito está el stock**: manda una fila por lote sin
identificar la sucursal, así que todo el stock cae en una sola.

### El catálogo oculta productos, y el default es ocultar

Un producto cuyas variantes están todas en cero no se lista, ni en la búsqueda,
ni en las facetas, ni en las colecciones, salvo que la tienda pida lo contrario
con `catalog.showOutOfStock`. Y uno sin foto tampoco, si la tienda enciende
`catalog.hideWithoutImage` —en Treeshop está encendido, así que de 3752 productos
importados el listado sirve 2096—. Las dos opciones se administran desde
Configuración → Catálogo (ADR-112).

Su PDP sigue existiendo y sigue siendo enlazable: con `p_handle` la función no
filtra, a propósito, porque un enlace que ayer funcionaba no puede dar 404 porque
se vendió la última unidad. Quien cargue un producto y no lo vea en su tienda,
mire primero el stock y la foto.

### El stock del storefront es un espejo

La navegación usa un espejo cacheado. Add to Cart y el checkout revalidan contra
la base, y `create_order` descuenta en la misma transacción que crea el pedido:
**no se puede vender sin stock**. Lo que sí puede pasar es que la PLP muestre
como disponible algo que se agotó hace segundos.

### Sin reservas de stock

`supportsReservations` existe en la matriz de capacidades y ningún adapter lo
declara. Nadie promete cero overselling contra un ERP que no lo soporta.

### Presets: hay dos, y ninguno de los tres previstos

Los tokens de diseño están construidos para recibir presets —un preset redefine
variables, no clases—. Existen la estética base, diseñada a propósito y no una
plantilla genérica (ADR-027), y el preset de Treeshop
(`apps/treeshop/src/styles/global.css`, ADR-110), que redefine `--font-sans`,
`--color-accent`, `--color-sale`, `--radius-button`, `--aspect-product` y
`--color-media`. Los tres previstos —Blank, Fashion, Sport— siguen sin hacer.

Lo que el preset de Treeshop sí pisa con CSS propio son los controles nativos de
la PLP: el `<select>` de orden y las casillas de los filtros, cuya forma no es un
token. Está acotado y anotado en el archivo; al segundo cliente que lo pida, sube
al paquete.

### El contenido de las páginas legales es el de la demo

`Políticas` y `Preguntas frecuentes` salen de un módulo del storefront, no del
CMS. Un comercio real necesita las suyas, y hoy eso es editar código.

**Qué lo desbloquea:** una sección de páginas en el CMS, que ya administra la
portada por secciones.

### La home no tiene lema administrable

El `<title>` de la portada es el nombre de la tienda, que sale de la base. La
descripción está escrita en el código de la app —la de Treeshop, en
`apps/treeshop/src/pages/index.astro`—: no hay dónde guardarla por tienda, así
que una tienda nueva la trae de su archivo o no la trae.

---

## Operación

### El Admin se despliega a mano

El storefront sale a producción con cada push. El Admin **no** tiene Workers
Builds: cada cambio necesita `pnpm --filter @pick/admin run deploy`. Una pantalla
nueva dada por terminada sin desplegarla no existe para quien la va a usar.

Y un deploy deja sin servir los archivos que pide una pestaña abierta desde
antes: la primera pantalla que esa pestaña abra después se recarga sola —una
sola vez, para que un fallo de red no recargue en bucle— en vez de quedar
muerta (`apps/admin/src/lib/pantalla.ts`). Es un parpadeo, pero lo que se esté
escribiendo en un formulario sin guardar se va con la recarga.

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

### Un dominio propio exige mover el DNS a Cloudflare

El modelo de ADR-062 está ejecutado con Treeshop: `sontres.shop` y `www` van al
Worker del storefront, `admin.sontres.shop` al Admin único. Lo que no se puede
evitar es la condición: la zona DNS del dominio tiene que vivir en Cloudflare,
o sea cambiar los nameservers en el registrador. Un comercio que no quiera o no
pueda hacerlo se sirve desde su URL de `workers.dev`.

---

## Medición

### El catálogo está medido hasta 5006 productos

Hasta el 1 de septiembre de 2026 esto era un bloqueo: el listado tardaba 2,3
segundos con 5000 productos y casi 4 en la página 100. Ahora es plano. Medido con
`explain analyze` en el proyecto de desarrollo, con 5006 productos, 5010
variantes y 12175 imágenes:

| Consulta                                   |   Antes |       Ahora |
| ------------------------------------------ | ------: | ----------: |
| Listado del catálogo (PLP), primera página | 2287 ms |  **233 ms** |
| Listado del catálogo, página 100           | 3886 ms |  **229 ms** |
| Listado del catálogo, última página (209)  |       — |  **223 ms** |
| Catálogo con búsqueda                      | 2191 ms |  **194 ms** |
| Catálogo ordenado por precio               |       — |  **254 ms** |
| Producto por handle (PDP)                  |   31 ms |   **37 ms** |
| Admin: productos                           |  135 ms | sin cambios |
| Admin: resumen                             |   91 ms | sin cambios |
| Admin: ventas por producto                 |  122 ms | sin cambios |

Sobre la red, la página del catálogo entera sale en 0,4 s con ese catálogo.

Eran dos costos y no uno. El precio más bajo de cada producto se calculaba con
una subconsulta correlacionada contra un CTE —y un CTE no tiene índices, así que
se recorría entero una vez por producto—; y el documento JSON de cada ítem se
armaba antes del corte de página, lo que en la página 100 significaba armar 2400
y descartar 2376.

**Lo que queda:** el catálogo del piloto está **por debajo** de lo medido —3752
productos importados, 2096 listables— así que el techo conocido alcanza. Las 9032
filas que se citaban acá no son de ningún catálogo cargado: son las que manda el
ORDS de Estilo Sport, que nunca se importó entero. Importar ese volumen sigue sin
medirse, y no estar medido es distinto de estar mal.

### La búsqueda no mira la descripción ni la categoría, y el SKU va por prefijo

La búsqueda tolera tipeos y acentos y ordena por relevancia (ADR-125), pero sólo
sobre el **título y la marca**. La descripción no entra porque un texto largo
diluye el parecido hasta no encontrar nada, y el nombre de la categoría tampoco
entraba antes. Un término de menos de cuatro letras sólo encuentra coincidencias
literales: con tres, el parecido es ruido.

El SKU se encuentra si se escribe **desde el principio**: «ZAP-TR» encuentra
«ZAP-TR-41», pero «TR-41» no. Tampoco hay sinónimos ni plurales: «buzo» no
encuentra «canguro».

**Qué lo desbloquea:** ya está, y con un límite propio. Desde la v2 Fase 7 el
buscador **también** entiende descripciones: «algo para correr en invierno»
devuelve campera, calzas y joggers aunque ninguna de esas palabras figure. Se
suma al score léxico en vez de reemplazarlo, y una coincidencia exacta nunca
queda debajo de un parecido (ADR-132).

Lo que lo limita ahora no es el buscador: es **cuánto texto tiene el catálogo**.
El vector se arma con el título, la marca, la categoría y los atributos, y en
Treeshop sólo 78 de 3752 productos tienen descripción. Por eso «ropa de abrigo
para el frío» trae primero ropa interior: sin una línea que diga que un pullover
abriga, el modelo no lo puede saber. Escribir descripciones mejora esto más que
cualquier ajuste de pesos.

Y hay dos cosas que apagan lo semántico a propósito: una consulta que **parece un
código** —un solo token con dígitos— se resuelve sólo por el camino léxico, y una
tienda sin clave de OpenAI usa exactamente el buscador de la Fase 3, sin
diferencia ninguna.

### Las recomendaciones cuentan, no aprenden

«Quien vio esto, vio» y los órdenes automáticos salen de dos conteos con dos
pesos explícitos —una co-compra vale cinco co-vistas (ADR-127)—, no de un modelo.
Con el volumen de un comercio chico eso es una ventaja: se puede explicar por qué
aparece algo. Pero no hay similitud por contenido, así que **un producto recién
cargado no se recomienda hasta que alguien lo mire junto a otro**, y una tienda
sin tráfico no tiene recomendaciones: la tira del PDP no se dibuja y los órdenes
automáticos caen al orden del catálogo.

El recálculo **viaja con el tráfico**, como la purga: corre como mucho cada seis
horas, disparado por una visita. Una tienda sin visitas no recalcula —tampoco
tendría con qué—, y lo que se compró hace un minuto puede tardar hasta seis horas
en aparecer.

**El perfil sigue a la persona sólo si entró a su cuenta** (ADR-128). Sin cuenta
va por `pick_did`, así que no pasa del teléfono al escritorio; y con la
personalización apagada no existe de ninguna de las dos formas: se ve lo que se
está moviendo, igual que alguien que llega por primera vez.

**Lo que una sección de la portada informa es por visita** (ADR-129): quien ve
algo el lunes desde un carrusel y lo compra el jueves cuenta como entrada el
lunes y como nada el jueves. Es el mismo criterio que el embudo, y es lo que hace
que esos números y los de Analytics signifiquen lo mismo.

### La IA limpia el fondo, pero redibuja la foto

Quitar el fondo con IA **regenera la imagen entera**: la documentación de OpenAI
dice que su enmascarado es por prompt y puede no respetar la forma exacta. Medido
sobre una foto real del piloto: en unos guantes, el texto impreso «2MM SUPERSOFT
LATEX» volvió con el primer carácter deformado. El resto salió casi idéntico.

Por eso **nada se publica sin que una persona compare las dos fotos** (ADR-130),
la original nunca se borra y siempre se puede volver a ella. Mirar cien fotos en
una tanda es trabajo real: conviene hacerlo con la tanda chica cuando el producto
tiene textos, códigos o etiquetas legibles.

Y lo que la IA **no** hace, sin excepción: inventar la foto de un producto que
nadie fotografió. Trabaja sobre una foto real o no trabaja. Tampoco genera otros
ángulos: es la misma regla, y es una decisión tomada, no algo que falte.

### Lo que la IA lee de una etiqueta hay que mirarlo

En el alta con la cámara, la IA copia el precio, el SKU y el código de barras
**si están impresos y se leen** en alguna de las fotos (ADR-131). Puede leer mal
un dígito: por eso el valor se muestra junto a lo que estaba impreso —«Leído de
la etiqueta: Gs. 250.000»— y no entra a ningún campo hasta que alguien toca
«Usarlo».

Lo que no se puede leer mal sin que se note es el código de barras: si su dígito
verificador no cierra, no se ofrece. Y con más de un talle no se carga en
ninguna variante, porque el código que se fotografió es el de **una** de ellas.

El precio no tiene esa red. Es un número plausible mire quien lo mire, así que
al cargar una tanda conviene revisarlo contra la prenda que se tiene en la mano,
que es donde está la persona igual. Si la etiqueta no se ve, no se ofrece nada y
se escribe a mano, como siempre.

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
