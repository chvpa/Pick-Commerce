import type { Pregunta } from '@pick/commerce-core';

/**
 * Contenido editorial del storefront.
 *
 * Vive en el repo del cliente, no en el Core: son políticas de un comercio
 * concreto. En Fase 9 esto pasa al CMS. Los textos son de demostración y no
 * prometen capacidades que Pick Commerce todavía no tiene.
 */
export const PREGUNTAS: readonly Pregunta[] = [
  {
    pregunta: '¿Hacen envíos a todo el país?',
    respuesta:
      'Sí. Enviamos a todo Paraguay. El costo y el plazo se calculan en el checkout según la ciudad de destino.',
  },
  {
    pregunta: '¿Cuánto tarda en llegar mi pedido?',
    respuesta:
      'En Asunción y Gran Asunción, entre 24 y 48 horas hábiles. Al interior, entre 3 y 5 días hábiles.',
  },
  {
    pregunta: '¿Qué medios de pago aceptan?',
    respuesta:
      'Tarjetas de crédito y débito, y transferencia bancaria. Los medios disponibles se muestran en el checkout.',
  },
  {
    pregunta: '¿Puedo cambiar un producto?',
    respuesta:
      'Sí, dentro de los 30 días de recibido, sin uso y con su etiqueta. Escribinos y coordinamos el cambio.',
  },
  {
    pregunta: '¿Los precios incluyen IVA?',
    respuesta: 'Sí. Todos los precios se muestran en guaraníes con IVA incluido.',
  },
  {
    pregunta: '¿Cómo sé si un talle está disponible?',
    respuesta:
      'La disponibilidad se muestra en cada producto al elegir color y talle. Un talle agotado aparece tachado.',
  },
];

export const POLITICAS = [
  {
    titulo: 'Envíos',
    parrafos: [
      'Enviamos a todo Paraguay. El costo y el plazo se calculan en el checkout según la ciudad de destino.',
      'Los pedidos confirmados antes de las 14:00 se despachan el mismo día hábil.',
    ],
  },
  {
    titulo: 'Cambios y devoluciones',
    parrafos: [
      'Aceptamos cambios dentro de los 30 días de recibido el pedido, siempre que el producto esté sin uso y conserve su etiqueta.',
      'El cambio se coordina por los canales de contacto de la tienda.',
    ],
  },
  {
    titulo: 'Privacidad',
    parrafos: [
      'Usamos tus datos para procesar el pedido y comunicarnos sobre su estado. No los compartimos con terceros ajenos a la entrega y el cobro.',
      'Podés pedir la baja de tus datos escribiéndonos.',
    ],
  },
  /*
   * Existe desde que existen las cuentas. La regla que ordena el texto es la
   * misma de siempre: decir lo que el sistema hace, no lo que sería cómodo que
   * hiciera. Se nombra que no hay contraseña porque cambia lo que una persona
   * tiene que cuidar, y se nombra qué guarda la cuenta porque es corto: sus
   * pedidos y sus direcciones, nada más.
   */
  {
    titulo: 'Tu cuenta',
    parrafos: [
      'Si creás una cuenta, entrás con un código que te mandamos por correo. No guardamos ninguna contraseña.',
      'La cuenta guarda tus pedidos —incluidos los que hiciste antes sin cuenta con ese mismo correo— y las direcciones que elijas guardar para no volver a escribirlas. Nada más.',
      'Podés salir cuando quieras, y pedir que borremos la cuenta escribiéndonos.',
    ],
  },
  /*
   * Existe porque medimos, y decirlo es la contrapartida de no pedir permiso con
   * un banner: la medición es de primera parte, anónima y no sale del sitio, y eso
   * sólo vale si está escrito en algún lado.
   */
  {
    titulo: 'Qué medimos',
    parrafos: [
      'Contamos visitas, búsquedas y pasos de la compra para saber qué funciona de la tienda. Lo hacemos desde nuestro propio servidor: no usamos servicios de terceros, no hay publicidad y nada de esto sale de acá.',
      'Guardamos dos identificadores al azar, y hacen cosas distintas: uno distingue una visita de otra y se borra solo a la media hora de inactividad; el otro reconoce a este navegador durante seis meses, para poder ordenar mejor lo que te mostramos. Ninguno de los dos lleva tu nombre, tu correo ni tu dirección IP.',
      'El segundo lo podés apagar cuando quieras, acá abajo en «Personalización». Al apagarlo lo borramos: las visitas se siguen contando de forma anónima, como las de cualquiera.',
      'Ese identificador no está atado a tu cuenta, ni siquiera cuando entrás: lo que mirás y lo que comprás se guardan por separado y nada los cruza. El día que eso cambie —para ordenar lo que te mostramos según lo que viste— vas a poder decidirlo, y este texto va a cambiar antes que la tienda, no después.',
    ],
  },
] as const;
