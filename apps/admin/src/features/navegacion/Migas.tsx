import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';

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
 * **El último nivel no es un enlace.** Es dónde estás parado, y ofrecerlo como
 * enlace a sí mismo es ruido para el teclado y para un lector de pantalla.
 */

interface Miga {
  readonly label: string;
  /** Ausente en el último: la página actual no se enlaza a sí misma. */
  readonly to?: string;
  readonly search?: Record<string, string>;
}

/**
 * De un pathname a sus migas.
 *
 * Se resuelve por prefijos declarados y no partiendo la URL en segmentos: los
 * segmentos de `/contenido/colecciones/$id` no son tres niveles navegables
 * —`/contenido/colecciones` no existe como pantalla— y unas migas que llevan a
 * un 404 son peores que no tenerlas.
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
      patron: /^\/productos\/importar$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Importar' }],
    },
    {
      patron: /^\/productos\/[^/]+$/,
      migas: [ruta1('Productos', '/productos'), { label: 'Editar producto' }],
    },
    { patron: /^\/pedidos\/[^/]+$/, migas: [ruta1('Pedidos', '/pedidos'), { label: 'Pedido' }] },
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
      migas: [
        ruta1('Contenido', '/contenido'),
        { label: 'Secciones', to: '/contenido', search: { tab: 'secciones' } },
        { label: 'Nueva sección' },
      ],
    },
    {
      patron: /^\/contenido\/secciones\/[^/]+$/,
      migas: [
        ruta1('Contenido', '/contenido'),
        { label: 'Secciones', to: '/contenido', search: { tab: 'secciones' } },
        { label: 'Editar sección' },
      ],
    },
    {
      patron: /^\/contenido\/colecciones\/nueva$/,
      migas: [
        ruta1('Contenido', '/contenido'),
        { label: 'Colecciones', to: '/contenido', search: { tab: 'colecciones' } },
        { label: 'Nueva colección' },
      ],
    },
    {
      patron: /^\/contenido\/colecciones\/[^/]+$/,
      migas: [
        ruta1('Contenido', '/contenido'),
        { label: 'Colecciones', to: '/contenido', search: { tab: 'colecciones' } },
        { label: 'Editar colección' },
      ],
    },
  ];

  return REGLAS.find((r) => r.patron.test(ruta))?.migas ?? [];
}

function ruta1(label: string, to: string): Miga {
  return { label, to };
}

export function Migas() {
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  const migas = migasDe(ruta);

  // En una pantalla de primer nivel el encabezado ya dice dónde estás: unas
  // migas de un solo elemento serían una miga que miente sobre la jerarquía.
  if (migas.length === 0) return null;

  return (
    <nav aria-label="Migas de pan" className="min-w-0">
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
        {migas.map((miga, i) => (
          <li key={`${miga.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />}
            {miga.to ? (
              <Link
                to={miga.to}
                search={miga.search}
                className="hover:text-foreground truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {miga.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground truncate font-medium">
                {miga.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
