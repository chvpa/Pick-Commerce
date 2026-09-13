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
   * Existe porque medimos, y decirlo es la contrapartida de no pedir permiso con
   * un banner: la medición es de primera parte, anónima y no sale del sitio, y eso
   * sólo vale si está escrito en algún lado.
   */
  {
    titulo: 'Qué medimos',
    parrafos: [
      'Contamos visitas, búsquedas y pasos de la compra para saber qué funciona de la tienda. Lo hacemos desde nuestro propio servidor: no usamos servicios de terceros, no hay publicidad y nada de esto sale de acá.',
      'Para distinguir una visita de otra guardamos un identificador al azar en una cookie que se borra sola a la media hora de inactividad. No guardamos tu dirección IP ni nada que permita identificarte.',
      'Hoy ese identificador no está atado a ninguna cuenta, porque todavía no hay cuentas en la tienda. Cuando las haya vas a poder decidir si lo que mirás se usa para ordenar lo que te mostramos, y este texto va a cambiar antes que la tienda, no después.',
    ],
  },
] as const;
