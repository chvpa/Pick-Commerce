import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowLeftIcon } from '@/components/iconos';

/**
 * Las migas de pan del Admin.
 *
 * Existen por un problema concreto: entrar a editar una colección, una sección o
 * una promoción dejaba sin forma de volver a la lista. El botón del navegador
 * funciona, pero una pantalla que sólo se puede abandonar con el botón del
 * navegador está pidiendo que la persona se pierda —y en mobile ese botón
 * directamente no está a la vista.
 *
 * Se derivan de la ruta y no de un prop por pantalla: una miga que hay que
 * acordarse de pasar es una miga que va a faltar en la próxima pantalla.
 *
 * Se dibujan como el handoff (ADR-143): sólo el nivel de arriba, con una flecha,
 * encima del título —«← Pedidos»—. El nivel actual ya lo dice el título de la
 * página, y repetirlo al lado era decir lo mismo dos veces.
 */

interface Miga {
  readonly label: string;
  /** Ausente en el último: la página actual no se enlaza a sí misma. */
  readonly to?: string;
}

/**
 * De un pathname a sus migas.
 *
 * Se resuelve por prefijos declarados y no partiendo la URL en segmentos: no
 * todo segmento es un nivel navegable, y unas migas que llevan a un 404 son
 * peores que no tenerlas.
 *
 * Las de contenido arrancan en la subpantalla —«Colecciones», no «Contenido →
 * Colecciones»— porque `/contenido` dejó de ser una pantalla: es el grupo del
 * sidebar y redirige a la primera. Enlazarlo daría dos migas seguidas al mismo
 * lugar (ADR-098).
 */
export function migasDe(ruta: string): readonly Miga[] {
  const REGLAS: readonly {
    readonly patron: RegExp;
    readonly migas: readonly Miga[];
  }[] = [
    {
      patron: /^\/productos\/nuevo$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Nuevo producto' }],
    },
    {
      patron: /^\/productos\/fotos$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Fotos con fondo limpio' }],
    },
    {
      patron: /^\/productos\/stock-quieto$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Stock quieto' }],
    },
    {
      patron: /^\/productos\/resenas$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Reseñas' }],
    },
    {
      patron: /^\/productos\/sin-foto$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Sin foto' }],
    },
    {
      patron: /^\/productos\/camara$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Cargar con la cámara' }],
    },
    {
      patron: /^\/productos\/descripciones$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Descripciones' }],
    },
    {
      patron: /^\/productos\/caracteristicas$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Características' }],
    },
    {
      patron: /^\/productos\/importar$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Importar' }],
    },
    {
      patron: /^\/productos\/[^/]+$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Editar producto' }],
    },
    { patron: /^\/pedidos\/[^/]+$/, migas: [ruta1('Pedidos', '/pedidos'), { label: 'Pedido' }] },
    {
      patron: /^\/clientes\/recurrencia$/,
      migas: [ruta1('Clientes', '/clientes'), { label: 'Recurrencia' }],
    },
    {
      patron: /^\/clientes\/fidelidad$/,
      migas: [ruta1('Clientes', '/clientes'), { label: 'Fidelidad' }],
    },
    {
      patron: /^\/clientes\/[^/]+$/,
      migas: [ruta1('Clientes', '/clientes'), { label: 'Cliente' }],
    },
    {
      patron: /^\/promociones\/nueva$/,
      migas: [ruta1('Promociones', '/promociones'), { label: 'Nueva promoción' }],
    },
    {
      patron: /^\/promociones\/[^/]+$/,
      migas: [ruta1('Promociones', '/promociones'), { label: 'Editar promoción' }],
    },
    {
      patron: /^\/contenido\/secciones\/nueva$/,
      migas: [ruta1('Secciones', '/contenido/secciones'), { label: 'Nueva sección' }],
    },
    {
      patron: /^\/contenido\/secciones\/[^/]+$/,
      migas: [ruta1('Secciones', '/contenido/secciones'), { label: 'Editar sección' }],
    },
    {
      patron: /^\/contenido\/colecciones\/nueva$/,
      migas: [ruta1('Colecciones', '/contenido/colecciones'), { label: 'Nueva colección' }],
    },
    {
      patron: /^\/contenido\/colecciones\/[^/]+$/,
      migas: [ruta1('Colecciones', '/contenido/colecciones'), { label: 'Editar colección' }],
    },
  ];

  return REGLAS.find((r) => r.patron.test(ruta))?.migas ?? [];
}

function ruta1(label: string, to: string): Miga {
  return { label, to };
}

export function Migas() {
  const ruta = useRouterState({ select: (s) => s.location.pathname });

  // En una pantalla de primer nivel no hay a dónde volver: el sidebar ya dice
  // dónde estás.
  const arriba = [...migasDe(ruta)].reverse().find((m) => m.to);
  if (!arriba?.to) return null;

  return (
    <nav aria-label="Migas de pan" className="mb-5 print:hidden">
      <Link
        to={arriba.to}
        className="text-ink-3 hover:text-foreground focus-visible:ring-focus-tint inline-flex items-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-3"
      >
        <ArrowLeftIcon className="size-4" />
        {arriba.label}
      </Link>
    </nav>
  );
}
