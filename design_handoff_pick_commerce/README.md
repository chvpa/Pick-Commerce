# Handoff: Pick Commerce — Admin, Tienda, Checkout y Cuenta Pick

## Resumen
Pick Commerce es una plataforma de e-commerce **multi-tenant** (pensada para cientos de tiendas de cualquier rubro). Este paquete contiene el diseño de las 5 superficies del producto:

| Superficie | Quién la usa | Alcance | Estilo |
| --- | --- | --- | --- |
| **Admin** (`Admin Pick v3.dc.html`) | Dueño y personal de cada tienda | Por tienda (selector de tienda arriba) | Pick UI |
| **Tienda** (`Tienda Treeshop.dc.html`) | Comprador | Storefront de un tenant (ejemplo: Treeshop) | Tema de la tienda |
| **Checkout** (`Checkout.dc.html`) | Comprador | **Único para todas las tiendas** (tipo Shopify), con logo y color del tenant | Pick UI + marca del tenant |
| **Mi cuenta** (`Mi cuenta.dc.html`) | Comprador | **Cuenta Pick** que agrupa compras de todas las tiendas | Pick UI |
| **Login comprador** (`Login comprador.dc.html`) | Comprador | Acceso a la cuenta Pick desde una tienda | Tema de la tienda |

Repositorio de destino (ver `github.md`): `chvpa/Pick-Commerce`, rama `main`. El Admin vive en `apps/admin`, el storefront de ejemplo en `apps/treeshop`, y la UI compartida de comprador en `packages/commerce-ui`.

## Sobre los archivos de diseño
Los archivos `.dc.html` son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y el comportamiento esperados. **No son código de producción para copiar.** La tarea es **recrearlos en el entorno del repo** (React + TypeScript, router, componentes `components/ui`, estilos existentes), siguiendo sus patrones y librerías.

Para verlos: abrir cualquier `.dc.html` en el navegador con `support.js` en la misma carpeta (ya incluido). Cada archivo trae el markup con estilos inline y, al final, una clase `Component` con toda la lógica y los datos de ejemplo. Es la mejor fuente para medidas exactas, copys y reglas.

Los "Tweaks" (props del archivo) permiten ver estados: en el Admin, `rol` (Propietario / Personal), `datos` (Con datos / Tienda nueva) y `pantalla`; en la Tienda, `asistente` y `buscarPorFoto`; en el Checkout, `tienda` (Treeshop / Bambú Deco) y `botonMarca`.

## Fidelidad
**Alta fidelidad.** Colores, tipografía, espaciados, copys e interacciones son finales. Hay que recrearlos con precisión usando los componentes del repo. Los datos (pedidos, productos, personas, montos) son de ejemplo. Las imágenes de producto son placeholders rayados.

Principio de diseño que atraviesa todo: **baja carga cognitiva**. Una acción principal por pantalla, la información secundaria colapsada, copys cortos en español rioplatense/paraguayo ("vos"), sin datos decorativos.

---

## Design tokens

### Pick UI (Admin, Checkout, Mi cuenta)
- **Tipografía:** Geist 400/500/600/700 y Geist Mono 400/500 (Google Fonts). Números con `font-variant-numeric: tabular-nums`.
  - H1 de página: 26px / 32px, peso 600, letter-spacing -0.02em
  - Título de card o sección: 15px, peso 600
  - Cuerpo: 14px / 20px
  - Label de input: 13px, peso 500, color #353d50
  - Meta y ayuda: 12.5–13px, color #6f7789
  - Eyebrow de grupo: 11.5–12.5px
- **Tinta:** #0e1525 (texto principal y botón primario), #353d50, #535b6e, #6f7789 (secundario), #8a91a2 (placeholder), #a3aab8 (íconos tenues)
- **Acento:** #3b5bdb (links, foco, toggles encendidos); hover #2b47bd; tinte #e4e9fc (fondo de badge y ring de foco)
- **Superficies:**
  - Sidebar: #f7f8fa con borde #eceef2
  - Cards: borde #e9ebf0
  - Divisor de filas: #f0f1f4
  - Hover de fila: #fafbfc
  - Hover de nav: #eef0f4
- **Inputs:** alto 38px (Admin, Mi cuenta) o 44px (Checkout); borde #e1e4ea / #d8dce4; radio 9–10px. Foco: borde #3b5bdb y `box-shadow: 0 0 0 3px #e4e9fc`. Error: borde #d92d20 y texto #b42318.
- **Botones:**
  - Primario: fondo #0e1525, hover #252d3f, texto blanco 13.5px/500, alto 36px, radio 9px
  - Secundario: fondo #fff con borde #e1e4ea
  - Peligro: #b42318
  - CTA del Checkout: alto 52px, radio 10px, color de la tienda (Treeshop #d42a30, hover #b8232a)
- **Toggle:** 38×22, fondo #3b5bdb encendido o #d8dce4 apagado; perilla de 18px que se desplaza 16px; transición 0.15s
- **Pills de estado** (alto 22px, radio 999px, punto de 6px):
  - amber: fg #9a5b0b, bg #fdf4e3, dot #e8930c
  - blue: fg #2b47bd, bg #edf1fe, dot #3b5bdb
  - green: fg #13774a, bg #e8f6ee, dot #22a565
  - red: fg #bf3324, bg #fdeceb, dot #e5484d
  - gray: fg #535b6e, bg #f1f2f5, dot #a3aab8
  - violet (IA): fg #5f37cf, bg #f2eefe, dot #7c5cf0
- **Radios de borde:**
  - Ítem de nav: 8px
  - Botón: 9–10px
  - Card: 14px
  - Modal: 16px
  - Pill: 999px
- **Sombras:**
  - Ítem de nav activo: `0 1px 2px rgba(16,24,40,0.06), 0 0 0 1px #e6e8ee`
  - Menú: `0 12px 32px rgba(16,24,40,0.12), 0 2px 6px rgba(16,24,40,0.06)`
  - Modal: `0 24px 60px rgba(16,24,40,0.24)`, con overlay `rgba(14,21,37,0.32)`
- **Toast:** fondo #0e1525, radio 10px, abajo al centro, ícono check #7ee2b0, se va a los 2.6–2.8 s.

### Tema Treeshop (Tienda y Login comprador)
- **Tipografía:** Montserrat 400/500/600/700
  - Cuerpo: 14px / 20px
  - Títulos de sección: 24px / 30px, peso 700
  - Título del asistente: 34px / 40px, peso 700, letter-spacing -0.03em
- **Colores:**
  - Tinta: #23262f
  - Marca: #d42a30 (hover #b8232a), con tinte #fdeeee y texto sobre tinte #a81f25
  - Secundario: #6b7080; tenue: #9a9ea8
  - Bordes: #ececf0 / #e3e4e9 / #d5d7de
  - Fondos suaves: #f4f4f6 / #fafafb
  - Éxito: #13774a
- **Formas:** botones e inputs en pill (999px); cards de producto con radio 16px; galería de PDP con radio 22px.
- **Swatches:** Negro #1d1f24, Blanco #f4f4f2, Azul marino #26324f, Gris #9aa0a8, Verde oliva #6b7046, Rojo #c0362c.

En producción, el tema de cada tienda (logo, color de marca, tipografía) debe venir de la configuración del tenant. El Checkout solo toma **logo y color de marca**; el resto es Pick UI.

---

## Pantallas

### 1. Admin (`Admin Pick v3.dc.html`)
**Shell**
- Sidebar de 244px (`#f7f8fa`), con el selector de tienda arriba (multi-tenant: Treeshop / Pick Demo).
- Grupos de navegación:
  - Inicio
  - **Vender:** Pedidos (con badge de pendientes), Promociones, Analytics
  - **Catálogo:** Productos, Reseñas
  - **Crear:** Asistente IA
  - **Clientes:** Clientes, Fidelidad
  - **Tienda:** Secciones, Configuración
- Ítem activo: fondo blanco con la sombra de nav activo y peso 600.
- Debajo de 900px, la sidebar pasa a drawer.
- Contenido con `max-width` de unos 1080px.

**Roles:** con `Personal` se ocultan Asistente IA, Studio y Configuración, salvo "Mi cuenta".

**Pantallas** (cada una es un `data-screen-label` en el archivo):
- **Inicio de sesión** del Admin.
- **Inicio · tienda nueva:** checklist de onboarding (crear tienda, cargar productos, medios de pago, envío…).
- **Inicio:** resumen simplificado: ventas, lo que necesita atención y la próxima acción.
- **Pedidos:** tabs por estado, buscador y lista con pills de estado y de pago.
- **Detalle de pedido:**
  - **Una sola "próxima acción"** según el estado.
  - Una card de cliente.
  - Productos y totales.
  - Generar e imprimir guía **AEX**.
  - Historial colapsado.
  - Franja de auditoría (ver más abajo).
- **Productos:** lista y acciones (Importar, Cargar con la cámara).
- **Editar producto:**
  - **SKU por producto**; **código interno + código de barras por variante**; **número de serie por unidad, opcional**.
  - Variantes editables en un popup, con toggles on/off.
  - Vínculo a **Modelo**.
  - Franja de auditoría.
- **Modelos:** agrupa productos distintos por color, material o talle. En la PDP se muestran como swatches.
- **Características de productos:** atributos propios para filtrar y para variantes.
- **Importar productos** y **Cargar con la cámara** (alta asistida por IA).
- **Reseñas:** moderación.
- **Promociones** (lista) y **Promoción** (formulario). Tipos:
  - descuento
  - NxM (2x1)
  - 2da unidad
  - por cantidad
  - monto escalonado
  - regalo
  - bundle desde colecciones
  - envío gratis

  Las reglas de bundle están validadas: sin condiciones redundantes.
- **Analytics:** pocas métricas, con período.
- **Asistente IA** (Agente + Studio unificados):
  - Un solo chat; botón **+** para adjuntar productos o colecciones.
  - Menciones con **@**.
  - Tarjetas de ideas.
  - Guardar como **Campaña**, que tiene su propia pantalla.
- **Clientes / Cliente:** ficha con historial. Incluye **recuperación de carritos abandonados**: mensaje propio y código de descuento, por email o WhatsApp.
- **Fidelidad:** puntos por compra y premios.
- **Secciones:** bloques de la home de la tienda. Cada sección tiene portada, layout (grilla, carrusel o destacado), destino y visibilidad. Se eliminan con confirmación.
- **Configuración** (sub-nav propia):
  - **Tu cuenta:** Mi cuenta.
  - **Tienda:** Medios de pago, Envío, Sucursales, Moneda.
  - **Catálogo y clientes:** Visibilidad del catálogo, Cuentas de comprador.
  - **Avanzado:** Inteligencia artificial, Conexiones.
  - **Organización:** Equipo, **Registro de actividad**, Uso y facturación.
- **Medios de pago:** filas para **uPay, Pagopar y Bancard**, cada una con un botón "Conectar". Al conectar, el botón pasa a "Desconectar". Sin "modo de prueba".
- **Conexiones:** Meta Ads, Google Ads, Google Analytics, WhatsApp, Google Sheets y servidores **MCP** propios. Cada conexión tiene un nivel de permiso para la IA: solo lectura, pausar o publicar.

**Auditoría antifraude interno** (pedido explícito del cliente):
- **Franja bajo el título** de Detalle de pedido y Editar producto:
  - Texto: "Creado por **X** · fecha", "Modificado por **X, Y**" y "Última modificación por **X** · fecha".
  - Link "Ver cambios (n)" que abre un popover de 460px: lista con avatar de iniciales, "**Quién** acción", chips antes → después (rojo tachado #fef0ee/#9b2a1d → verde #e9f7ef/#13774a) y la hora.
  - Pie del popover: "Nadie puede editar ni borrar este registro"; si el usuario es dueño, link "Ver toda la actividad".
- **Configuración › Registro de actividad** (solo propietario):
  - Todos los cambios del Admin en orden cronológico.
  - Filtros: Todos, por persona, Asistente IA, Sólo sensibles.
  - Botón "Exportar".
  - Cada fila lleva al pedido o producto afectado.
  - Badge "Sensible" (#fef6e6/#a35a00) para: descuento manual, pedido anulado, cupón borrado y cambio de cuenta de cobro.
  - Toggle "Avisarme de los cambios sensibles" (correo y notificaciones).
  - Texto: "Nadie puede editar ni borrar este registro, ni siquiera el propietario. Se guarda por 2 años."
- **Backend obligatorio:** log **append-only** (sin UPDATE ni DELETE), con autor, rol, IP o dispositivo, entidad, campo, valor anterior, valor nuevo y timestamp del servidor. Las acciones de la IA se registran como "Asistente IA" junto con quién la aprobó.

### 2. Tienda (`Tienda Treeshop.dc.html`)
**Header sticky** (fondo blanco al 96 % con blur; ancho máximo de contenido 1240px):
- **Fila 1:** grid `minmax(110px,1fr) minmax(0,680px) minmax(110px,1fr)`, padding 14px 24px.
  - Logo a la izquierda, 26px de alto.
  - **Buscador centrado grande:** alto 52px, pill, borde 1.5px, ícono de 20px, input de 15px.
  - A la derecha, íconos de 42px: Asistente (`hugeicons:ai-chat-02`), Mi cuenta y Carrito con badge.
- **Fila 2:** navegación centrada (alto 46px, borde superior #f0f0f3) con **desplegables**: Prendas, Calzados, Accesorios, Actividades, Marcas y Ofertas (en rojo).
  - Se abren al pasar el mouse; al salir del área se cierran.
  - Primer click abre, segundo click navega.
  - El ítem activo lleva una barra inferior de 2px y la flecha rotada 180°.
- **Panel del desplegable:** ancho completo bajo el header, con sombra `0 24px 48px rgba(20,22,30,0.10)`.
  - Columnas: TIPO (por subcategoría), PARA (Hombre/Mujer, solo si hay más de uno), MARCAS, cada opción con su cantidad.
  - Card destacada con el producto mejor calificado.
  - Link "Ver todo en {categoría} →".
  - Ofertas lista las promociones activas con su descripción.

**Búsqueda inteligente**
- Entiende lenguaje natural, por ejemplo "campera para lluvia hasta 1,5 millones".
- Corrige errores comunes: zapatiya → zapatilla, buso → buzo…
- Muestra chips de "Entendimos", sugerencias de producto y "Ver los N resultados".
- Si no hay resultados, ofrece buscar con una foto o preguntarle al asistente.

**Búsqueda por foto**
- Se despliega **debajo del buscador**, no como modal.
- Permite subir archivo, **pegar con Ctrl+V** (en el input o en cualquier parte de la página fuera de campos de texto) o elegir una muestra.
- Después del paso "Mirando la foto…" va **directo a los resultados**, sin pantalla de confirmación, con la foto como referencia.

**Home:** hero en carrusel (cambia cada 6.5 s), categorías, más vendidos, promociones y marcas.

**Catálogo (PLP)**
- Filtros: categoría, subtipo, marca, color, silueta, talle (solo con stock), género (unisex siempre entra), uso, precio máximo y solo con stock.
- Los filtros activos se muestran como chips removibles.
- Orden configurable.

**Producto (PDP)**
- Galería, swatches del modelo, talles con stock y "quedan pocos" cuando hay 2 o menos.
- Cantidad y botón agregar; si falta elegir talle, avisa.
- Entrega: "Llega mañana" o retiro en el día.
- Características, reseñas y relacionados.

**Carrito (drawer)** con promociones automáticas:
- Trail running −10 %
- Medias 3x2
- Medias de regalo con Speedcross 6
- Envío gratis desde Gs. 500.000 (si no, Gs. 30.000), con barra de "te faltan"

Código de prueba `VOLVE10` (10 %). El botón "Pagar" lleva al Checkout.

**Asistente** (pantalla completa, ruta `#asistente`):
- **Barra superior:** "← Tienda", título "Asistente", Nueva conversación y carrito con badge.
- **Estado vacío:** ícono de 52px, "¿Qué vas a hacer?", caja de texto grande (radio 28px, sombra suave) y 4 sugerencias con ícono.
- **Desde una PDP:**
  - El saludo cambia a "¿Tenés dudas con la {producto}?" y las sugerencias pasan a talle, lluvia, envío y frío.
  - Arriba del input aparece el chip "Sobre {producto}", que se puede quitar.
- **Conversación** (columna de 720px):
  - Mensajes del usuario en burbuja #f2f2f5 alineada a la derecha.
  - Respuestas del bot como texto plano de 15.5px / 25px, con avatar de 30px.
  - Tarjetas de producto en grilla de 150px mínimo; botón agregar que pasa a ✓ al tocarlo.
  - Barra "Agregar todo" con el total.
  - Seguimiento de pedido con stepper de 5 pasos.
  - En la última respuesta: copiar, útil / no útil y preguntas sugeridas.
- **Indicador de escritura contextual:** "Buscando en el catálogo", "Revisando cómo calza" o "Buscando tu pedido".
- El chat baja solo hasta el último mensaje.

### 3. Checkout (`Checkout.dc.html`) — único, multi-tenant
**Estructura**
- Header con el logo de la tienda (o su nombre en el color de marca si no tiene logo) y "Pago seguro".
- Dos columnas:
  - Formulario: ancho máximo 540px, alineado a la derecha.
  - Resumen: fondo #f7f8fa, borde izquierdo, ancho máximo 420px, sticky.
- **Debajo de 900px:** el resumen pasa arriba, plegable, con el total visible.

**Paso 1 · Tus datos**
- Banner "¿Tenés cuenta Pick? Entrar", que autocompleta datos y direcciones. Con sesión: "Entraste con tu cuenta Pick" y "No soy yo".
- Campos: Correo, Nombre y apellido, Celular, CI o RUC para la factura.
- Si el documento termina en "-dígito" se trata como RUC y aparece "Razón social".
- Checkbox "Avisarme por WhatsApp", activo por defecto.

**Paso 2 · Entrega**
- Selector: Envío a domicilio / Retiro en la tienda (solo si la tienda tiene retiro).
- Con sesión: direcciones guardadas más "Otra dirección". Sin sesión: Calle y número (obligatorio), Ciudad y Referencia.
- Métodos de envío del tenant:
  - AEX, gratis desde Gs. 500.000.
  - AEX Express, solo para Asunción.

**Paso 3 · Pago (pago ocasional; nunca se guardan tarjetas)**
- **Tarjeta:** el Checkout **no tiene campos de tarjeta**. El botón "**Pago seguro y confiable**" (con candado) abre la **pantalla segura del proveedor (iframe de Bancard, Pagopar o uPay)**, donde se cargan la tarjeta y las cuotas. El prototipo simula el resultado aprobado o rechazado.
- **Transferencia bancaria:** al confirmar se muestran los datos de la cuenta y el pedido queda pendiente.
- Solo se muestran los métodos que el tenant tiene conectados en Admin › Medios de pago.

**Comportamiento general**
- **Pasos progresivos:** cada paso valida antes de avanzar; los pasos terminados se colapsan en una línea de resumen con "Cambiar".
- **Resumen:**
  - Miniaturas de 60px con badge de cantidad; regalos en verde.
  - Código de descuento.
  - Subtotal, promociones, código, envío ("Se calcula en la entrega" hasta el paso 2) y total de 20px.
  - "Incluye Gs. X de IVA", calculado como total ÷ 11.
- **Rechazo:** alerta #fef3f2/#b42318 con el texto "Tu banco rechazó la tarjeta. Probá con otra o elegí otro medio de pago."
- **Confirmación:**
  - "Listo, {nombre}. Tu pedido está confirmado." o, si falta pagar, "Falta pagar…" con los datos de la transferencia.
  - Cards de Entrega, Pago y Factura, y el total.
  - Si compró como invitado: "Crear mi cuenta".
  - Botones "Seguir comprando" y "Ver mis pedidos".
- **Contrato con la tienda:** el prototipo pasa el carrito por `localStorage['pick-checkout']` con la forma `{ tienda, lines: [[título, variante, cantidad, precio, tinte]], regalos, desc: [[label, monto]], code }`. En producción debe ser una **sesión de checkout creada en el servidor**, con precios y promociones recalculados del lado servidor.

### 4. Mi cuenta (`Mi cuenta.dc.html`) — cuenta Pick del comprador
- **Shell:** sidebar de 248px estilo Admin con "← Volver a {tienda}", avatar con nombre y correo, y la navegación. Pie: "Tu cuenta sirve en todas las tiendas que usan Pick…" y "Cerrar sesión". Debajo de 860px pasa a pestañas pill en la parte de arriba.
- **Rutas:** `#pedidos`, `#pedido/{id}`, `#direcciones`, `#puntos`, `#favoritos`, `#preferencias`, `#perfil`.
- **Inicio:** card del pedido en curso (llegada estimada, stepper de 5 segmentos de 4px y "Ver el pedido"), Pedidos recientes y card de puntos.
- **Pedidos:** segmentado En curso / Entregados / Todos, más un selector de tienda. Cada fila muestra miniaturas superpuestas, chip de la tienda, pill de estado y total.
- **Detalle de pedido:**
  - Una sola acción según el estado:
    - en camino: "Seguir el envío";
    - entregado dentro de los 30 días: "Pedir un cambio", con un modal para elegir producto y motivo;
    - fuera de plazo: "Volver a comprar";
    - cancelado: aviso de reintegro.
  - Productos con totales; cards de Entrega, Pago y Factura (con "Descargar factura").
  - Link "Escribile a {tienda}" por WhatsApp.
- **Direcciones:** cards con "Principal", editar, usar como principal y eliminar (con confirmación). Modal con nombre, calle, referencia, teléfono y ciudad.
- **Puntos:** separados **por tienda** (1 punto cada Gs. 10.000), con barra de avance y "Canjear" cuando se llega a la meta, más la lista de movimientos.
- **Favoritos:** grilla con chip de la tienda; quitar con el corazón.
- **Preferencias:**
  - **Nada se elige a mano.** Muestra lo que Pick aprendió de compras y navegación, agrupado en Lo que te interesa, Talles y medidas, Marcas y Cómo comprás.
  - Cada dato dice de dónde sale y tiene "Quitar". Debe servir para cualquier rubro, no solo moda.
  - Toggle maestro "Usar mis preferencias" y "Borrar todas mis preferencias".
  - Regla de privacidad: cada tienda ve los intereses del comprador, **no lo que compró en otras tiendas**.
- **Perfil y seguridad:**
  - Tus datos: editar nombre, teléfono y documento; el correo se muestra como "Verificado".
  - Cómo entrás: código por correo y Google.
  - Sesiones abiertas, con "Cerrar" y "Cerrar las demás".
  - Avisos: toggles de WhatsApp, correo y ofertas.
  - Eliminar mi cuenta.
- **No hay "Medios de pago":** solo se usa pago ocasional.

### 5. Login comprador (`Login comprador.dc.html`)
- Sin contraseña: **código de 6 dígitos por correo** (vence en 10 min; reenviar con espera de 30 s) o **Continuar con Google**.
- El estado "listo" fusiona los favoritos guardados sin sesión y ofrece accesos directos a Mi cuenta.
- En el prototipo, el código `000000` simula un error.

---

## Interacciones y estados clave
- **Transiciones:** 0.15 s en toggles, bordes y rotación de flechas.
- **Spinner:** `@keyframes spin`, 1 s lineal.
- **Puntos de "escribiendo":** `@keyframes blink`, 1.2 s, desfasados 0.15 s.
- **Confirmaciones destructivas:** siempre por modal (eliminar dirección, sesión, cuenta, preferencias, sección).
- **Toasts:** para confirmar acciones rápidas.
- **Validaciones del Checkout:**
  - Correo con formato válido.
  - Celular con 9 dígitos o más.
  - Documento obligatorio.
  - Razón social obligatoria si es RUC.
  - Calle obligatoria.
- **Navegación por hash:**
  - Tienda: `#p/{id}`, `#c/{categoría o marca}`, `#buscar/{q}`, `#foto`, `#asistente`.
  - Mi cuenta: las rutas listadas arriba.

## Estado y datos (modelo sugerido)
- **Tenant:**
  - Tema (logo, color, tipografía) y dominio.
  - Métodos de pago conectados (proveedor y credenciales) y métodos de envío.
  - Sucursales para retiro.
  - Reglas de puntos.
- **Producto:** SKU, modelo, atributos y características.
- **Variante:** código interno, código de barras y stock por sucursal.
- **Unidad:** número de serie, opcional.
- **Promoción:** tipo, condiciones, vigencia y alcance (productos o colecciones).
- **Pedido:** estados recibido → confirmado → en preparación → listo → enviado → en tránsito → entregado, o cancelado. Estados de pago: pendiente, pagado, rechazado. Guía AEX.
- **AuditLog:** inmutable, ver Admin.
- **Cuenta Pick:** global, entre tenants. Incluye direcciones, favoritos por tienda, puntos por tienda, preferencias inferidas (con su origen), sesiones y avisos.
- **CheckoutSession:** del lado servidor, por tenant.
- **PaymentIntent:** redirección o iframe del proveedor y webhook de confirmación.
- **Conexiones de IA:** proveedor, nivel de permiso y servidores MCP.

## Simulado en el prototipo (requiere backend)
- Respuestas del asistente de la tienda y del Asistente IA del Admin (hoy son reglas fijas).
- Búsqueda por foto: no analiza la imagen.
- Pagos con Bancard, Pagopar o uPay (iframe y webhooks).
- Guías de AEX, envío de correos y WhatsApp.
- Cálculo real de preferencias.
- Registro de auditoría.
- Subida de archivos (la tienda ya usa `FileReader` / `createObjectURL` como preview).

## Assets
- `apps/treeshop/src/assets/logotipo.svg`: logo de Treeshop.
- **Íconos:** Hugeicons vía Iconify (`<iconify-icon icon="hugeicons:…">`). `hg-icon.js` mapea nombres antiguos a Hugeicons. En el repo conviene usar el paquete de Hugeicons para React o el set de íconos que ya usa el proyecto.
- **Fotos de producto, campaña y QR:** son placeholders rayados que se reemplazan por imágenes reales.

## Archivos
- `Admin Pick v3.dc.html`: Admin completo, con todas las pantallas.
- `Tienda Treeshop.dc.html`: storefront de ejemplo.
- `Checkout.dc.html`: checkout único multi-tenant.
- `Mi cuenta.dc.html`: cuenta Pick del comprador.
- `Login comprador.dc.html`: acceso del comprador.
- `support.js`: runtime para abrir los `.dc.html` en el navegador (no forma parte del producto).
- `hg-icon.js`: helper de íconos del prototipo.
- `apps/treeshop/src/assets/logotipo.svg`: logo de Treeshop.
- `github.md`: repositorio de destino y mapa de cada pantalla a sus archivos en el repo.
