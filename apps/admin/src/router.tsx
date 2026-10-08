import { Suspense, useEffect, useState, type ReactNode } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import {
  BANDEJAS_DE_PEDIDOS,
  PESTANAS_DE_PRODUCTOS,
  SEGMENTOS_RFM,
  type BandejaDePedidos,
  type PestanaDeProductos,
  type SegmentoRfm,
} from '@pick/commerce-core';
import type { Permission } from '@pick/commerce-types';
import { Button, buttonVariants } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/features/navegacion/AppSidebar';
import { BarraSuperior } from '@/features/navegacion/BarraSuperior';
import { Comandos } from '@/features/navegacion/Comandos';
import { Migas } from '@/features/navegacion/Migas';
import { useSesion } from '@/features/auth/SesionContext';
import { usePuede } from '@/features/auth/usePuede';
import { ProveedorTienda, useTienda } from '@/features/tienda/TiendaContext';
import { pantalla } from '@/lib/pantalla';

/**
 * Rutas del Admin, declaradas en código.
 *
 * Sin generación de archivos: son once rutas y el router por archivos añade un
 * paso de build y un archivo generado al repo.
 *
 * Cada pantalla se carga con `React.lazy`, así que Vite le da su propio chunk y
 * la cáscara —esto, la sesión y el contexto de tienda— es lo único del bundle
 * inicial. Se usa `lazy` y no `lazyRouteComponent` del router porque dos de las
 * pantallas reciben props del parámetro de la ruta, y el componente de ruta no
 * las recibe. Un solo mecanismo para todas es más fácil de seguir que dos, y
 * `pantalla` es además donde se recarga la pestaña cuando un chunk quedó viejo.
 */

const Inicio = pantalla(() => import('@/features/dashboard/Inicio'), 'Inicio');
const Analytics = pantalla(() => import('@/features/analytics/Analytics'), 'Analytics');
const ListaProductos = pantalla(
  () => import('@/features/productos/ListaProductos'),
  'ListaProductos',
);

const SinFoto = pantalla(() => import('@/features/productos/SinFoto'), 'SinFoto');
const StockQuieto = pantalla(() => import('@/features/productos/StockQuieto'), 'StockQuieto');
const Resenas = pantalla(() => import('@/features/productos/Resenas'), 'Resenas');
const CargarConCamara = pantalla(
  () => import('@/features/productos/CargarConCamara'),
  'CargarConCamara',
);

const RevisarFotos = pantalla(() => import('@/features/productos/RevisarFotos'), 'RevisarFotos');
const Descripciones = pantalla(() => import('@/features/productos/Descripciones'), 'Descripciones');
const FormularioProducto = pantalla<{ id?: string }>(
  () => import('@/features/productos/FormularioProducto'),
  'FormularioProducto',
);
const ImportarProductos = pantalla(
  () => import('@/features/productos/ImportarProductos'),
  'ImportarProductos',
);
const ListaPedidos = pantalla(() => import('@/features/pedidos/ListaPedidos'), 'ListaPedidos');
const DetallePedido = pantalla<{ id: string }>(
  () => import('@/features/pedidos/DetallePedido'),
  'DetallePedido',
);
const ListaPromociones = pantalla(
  () => import('@/features/promociones/ListaPromociones'),
  'ListaPromociones',
);
const FormularioPromocion = pantalla<{ id?: string }>(
  () => import('@/features/promociones/FormularioPromocion'),
  'FormularioPromocion',
);
const Secciones = pantalla(() => import('@/features/contenido/Secciones'), 'Secciones');
const Colecciones = pantalla(() => import('@/features/contenido/Colecciones'), 'Colecciones');
const Categorias = pantalla(() => import('@/features/contenido/Categorias'), 'Categorias');
const FormularioSeccion = pantalla<{ id?: string }>(
  () => import('@/features/contenido/FormularioSeccion'),
  'FormularioSeccion',
);
const FormularioColeccion = pantalla<{ id?: string }>(
  () => import('@/features/contenido/FormularioColeccion'),
  'FormularioColeccion',
);
const ListaClientes = pantalla(() => import('@/features/clientes/ListaClientes'), 'ListaClientes');
const Recurrencia = pantalla(() => import('@/features/clientes/Recurrencia'), 'Recurrencia');
const Fidelidad = pantalla(() => import('@/features/clientes/Fidelidad'), 'Fidelidad');
const DetalleCliente = pantalla<{ id: string }>(
  () => import('@/features/clientes/DetalleCliente'),
  'DetalleCliente',
);
const Equipo = pantalla(() => import('@/features/equipo/Equipo'), 'Equipo');
const Configuracion = pantalla(
  () => import('@/features/configuracion/Configuracion'),
  'Configuracion',
);

/**
 * Lo que la persona no puede hacer, no se le ofrece.
 *
 * No es la autorización: quien fuerce la URL igual recibe el rechazo de la base
 * (ADR-052). Por eso es un panel y no un redirect — decir "no tenés acceso" es
 * más honesto que mandarla a otra pantalla sin explicar por qué.
 */
function Gate({ permiso, children }: { permiso: Permission; children: ReactNode }) {
  const puede = usePuede();
  if (puede(permiso)) return <>{children}</>;

  return (
    <div className="flex flex-col items-start gap-2">
      <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em]">
        No tenés acceso a esta sección
      </h1>
      <p className="text-ink-3 text-sm">
        Tu rol no incluye este permiso. Pedíselo a un propietario.
      </p>
      <Link to="/" className={buttonVariants({ variant: 'outline', className: 'mt-3' })}>
        Volver al inicio
      </Link>
    </div>
  );
}

/** Lo que se muestra cuando todavía no hay sobre qué trabajar. */
function Aviso({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
      <h1 className="text-lg font-semibold">{titulo}</h1>
      {children}
    </main>
  );
}

function Cascara() {
  const { salir } = useSesion();
  const { tienda, cargando, error } = useTienda();
  const [buscando, setBuscando] = useState(false);

  /*
   * ⌘K o Ctrl+K abre el buscador desde cualquier pantalla, también con el foco
   * en un campo: es la tecla que se aprende una vez y se usa en todos lados.
   */
  useEffect(() => {
    const alApretar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscando((v) => !v);
      }
    };
    window.addEventListener('keydown', alApretar);
    return () => window.removeEventListener('keydown', alApretar);
  }, []);

  if (cargando) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm" role="status">
          Cargando tiendas…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <Aviso titulo="No se pudieron cargar las tiendas">
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </Aviso>
    );
  }

  if (!tienda) {
    // RLS es lo que hace que esta lista esté vacía; el mensaje sólo lo explica.
    return (
      <Aviso titulo="Todavía no hay ninguna tienda">
        <p className="text-muted-foreground text-sm">
          Tu cuenta no pertenece a ninguna organización con tiendas configuradas.
        </p>
        <div>
          <Button variant="outline" onClick={() => void salir()}>
            Salir
          </Button>
        </div>
      </Aviso>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/*
          La barra de arriba es del buscador y de la cuenta. El título de cada
          pantalla vive en el contenido, con sus acciones, y el «← volver» de las
          pantallas de detalle va encima del título (ADR-143).
        */}
        <BarraSuperior onBuscar={() => setBuscando(true)} />

        <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 pt-6 pb-[120px] min-[900px]:px-10 min-[900px]:pt-8">
          <Migas />
          {/*
            Un solo límite para todas las pantallas: el chunk tarda lo que tarde
            la red la primera vez, y sin esto el click no da ninguna señal hasta
            que llega.
          */}
          <Suspense
            fallback={
              <p className="text-muted-foreground text-sm" role="status">
                Cargando…
              </p>
            }
          >
            {/*
              La pantalla se **remonta** al cambiar de tienda.

              Sin la `key`, todo lo que una pantalla guarda en estado local
              sobrevive al cambio: un formulario de banner abierto seguía
              mostrando el registro de la tienda anterior, y guardarlo lo habría
              escrito en la nueva. Las consultas sí se rehacían —llevan el id de
              la tienda en su clave— así que la lista de abajo decía una cosa y
              el formulario de arriba otra.

              Va acá y no en cada pantalla porque el riesgo es de todas: cualquier
              borrador, filtro o selección abierta pertenece a una tienda, y
              acordarse de resetearlo pantalla por pantalla es la clase de cosa
              que se olvida en la próxima.
            */}
            <Outlet key={tienda.id} />
          </Suspense>
        </div>
      </SidebarInset>

      <Comandos abierto={buscando} onAbierto={setBuscando} />
    </SidebarProvider>
  );
}

const rootRoute = createRootRoute({
  component: () => (
    <ProveedorTienda>
      <Cascara />
    </ProveedorTienda>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Inicio,
});

// La pestaña en la URL, como en Pedidos: el Inicio lleva a «Sin foto».
const productosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos',
  validateSearch: (busqueda: Record<string, unknown>): { tab?: PestanaDeProductos } =>
    PESTANAS_DE_PRODUCTOS.includes(busqueda.tab as PestanaDeProductos)
      ? { tab: busqueda.tab as PestanaDeProductos }
      : {},
  component: ListaProductos,
});

const nuevoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/nuevo',
  component: () => <FormularioProducto />,
});

/*
 * Estático y declarado: TanStack Router prefiere el segmento fijo sobre
 * `/productos/$id`, así que «sin-foto» nunca se lee como el id de un producto.
 */
const fotosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/fotos',
  component: RevisarFotos,
});

const sinFotoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/sin-foto',
  component: SinFoto,
});

// Sólo lectura, como Recurrencia: se ve con pertenecer a la organización.
const stockQuietoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/stock-quieto',
  component: StockQuieto,
});

// Se ve con pertenecer a la organización; moderar pide `catalog.write`, y eso lo
// decide la pantalla.
const resenasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/resenas',
  component: Resenas,
});

const camaraRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/camara',
  component: CargarConCamara,
});

const descripcionesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/descripciones',
  component: Descripciones,
});

const importarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/importar',
  component: ImportarProductos,
});

const editarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/$id',
  component: function Editar() {
    const { id } = editarRoute.useParams();
    return <FormularioProducto id={id} />;
  },
});

/*
 * La pestaña va en la URL —`?tab=cobrar`— para que el Inicio y la paleta
 * puedan llevar directo a «Por cobrar», y para que se pueda recargar. Un valor
 * que no es una pestaña se descarta en vez de romper la pantalla.
 */
const pedidosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos',
  validateSearch: (busqueda: Record<string, unknown>): { tab?: BandejaDePedidos } =>
    BANDEJAS_DE_PEDIDOS.includes(busqueda.tab as BandejaDePedidos)
      ? { tab: busqueda.tab as BandejaDePedidos }
      : {},
  component: ListaPedidos,
});

const pedidoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos/$id',
  component: function Pedido() {
    const { id } = pedidoRoute.useParams();
    // Remontar al pasar al pedido siguiente: una nota a medio escribir o un
    // diálogo abierto eran del pedido anterior.
    return <DetallePedido key={id} id={id} />;
  },
});

/*
 * La lista se ve con sólo pertenecer a la organización —saber qué campañas hay
 * corriendo es información operativa—; crear y editar exigen `promotion.write`.
 */
const promocionesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/promociones',
  component: ListaPromociones,
});

const promocionNuevaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/promociones/nueva',
  component: () => (
    <Gate permiso="promotion.write">
      <FormularioPromocion />
    </Gate>
  ),
});

const promocionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/promociones/$id',
  component: function Promocion() {
    const { id } = promocionRoute.useParams();
    return (
      <Gate permiso="promotion.write">
        <FormularioPromocion id={id} />
      </Gate>
    );
  },
});

/*
 * El contenido se ve con sólo pertenecer a la organización; editarlo exige
 * `catalog.write`, igual que los productos. No lleva permiso propio: quien cura
 * el catálogo cura la vidriera, y ADR-056 dice no inventar permisos cuando
 * ningún rol distingue.
 */
/*
 * `/contenido` no es una pantalla: es el grupo del sidebar.
 *
 * Se conserva como ruta que redirige y no se borra, porque quedan enlaces vivos
 * a ella —marcadores, la barra del navegador de quien ya la usaba— y un 404 sería
 * peor que una redirección. Antes era una pantalla con pestañas cuyo estado vivía
 * en `?tab=`, y ese parámetro había que arrastrarlo a mano en cada navegación de
 * vuelta: doce lugares, ninguno tipado, y equivocarse no fallaba —caía en la
 * primera pestaña sin decir nada— (ADR-098).
 */
const contenidoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido',
  /*
   * El `?tab=` viejo se sigue leyendo, sólo para mandar a la pantalla correcta.
   *
   * Si esta ruta se conserva por los marcadores vivos, mandarlos a todos a
   * Secciones rompería justamente a los únicos que apuntaban a otra cosa: la
   * pantalla vieja ponía la pestaña en la URL **a propósito**, para poder
   * compartirla. `search: true` no sirve — arrastraría el parámetro muerto al
   * destino.
   */
  validateSearch: (busqueda: Record<string, unknown>): { tab?: string } =>
    typeof busqueda.tab === 'string' ? { tab: busqueda.tab } : {},
  beforeLoad: ({ search }) => {
    const viejas = {
      colecciones: '/contenido/colecciones',
      categorias: '/contenido/categorias',
    } as const;
    throw redirect({ to: viejas[search.tab as keyof typeof viejas] ?? '/contenido/secciones' });
  },
});

const seccionesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido/secciones',
  component: Secciones,
});

const coleccionesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido/colecciones',
  component: Colecciones,
});

const categoriasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido/categorias',
  component: Categorias,
});

const seccionNuevaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido/secciones/nueva',
  component: () => (
    <Gate permiso="catalog.write">
      <FormularioSeccion />
    </Gate>
  ),
});

const seccionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido/secciones/$id',
  component: function Seccion() {
    const { id } = seccionRoute.useParams();
    return (
      <Gate permiso="catalog.write">
        <FormularioSeccion id={id} />
      </Gate>
    );
  },
});

const coleccionNuevaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido/colecciones/nueva',
  component: () => (
    <Gate permiso="catalog.write">
      <FormularioColeccion />
    </Gate>
  ),
});

const coleccionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido/colecciones/$id',
  component: function Coleccion() {
    const { id } = coleccionRoute.useParams();
    return (
      <Gate permiso="catalog.write">
        <FormularioColeccion id={id} />
      </Gate>
    );
  },
});

/*
 * Analytics se ve con sólo pertenecer a la organización, igual que Promociones:
 * saber cuánta gente entró es información operativa, y no hay ningún permiso que
 * distinga quién puede mirarla. ADR-056 dice no inventar permisos cuando ningún
 * rol los distingue.
 */
const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  component: Analytics,
});

const clientesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clientes',
  // El segmento en la URL, como las pestañas de Pedidos y Productos.
  validateSearch: (busqueda: Record<string, unknown>): { tab?: SegmentoRfm } =>
    SEGMENTOS_RFM.includes(busqueda.tab as SegmentoRfm) ? { tab: busqueda.tab as SegmentoRfm } : {},
  component: ListaClientes,
});

/*
 * Como Analytics: se ve con sólo pertenecer a la organización. Son los mismos
 * clientes que la lista, agrupados; ningún rol los distingue (ADR-056).
 */
const recurrenciaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clientes/recurrencia',
  component: Recurrencia,
});

// Se ve con pertenecer a la organización; encender el programa y publicar premios
// pide `promotion.write`, y eso lo decide la pantalla.
const fidelidadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clientes/fidelidad',
  component: Fidelidad,
});

const clienteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clientes/$id',
  component: function Cliente() {
    const { id } = clienteRoute.useParams();
    return <DetalleCliente id={id} />;
  },
});

const equipoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/equipo',
  component: () => (
    <Gate permiso="member.manage">
      <Equipo />
    </Gate>
  ),
});

const configuracionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/configuracion',
  component: () => (
    <Gate permiso="settings.write">
      <Configuracion />
    </Gate>
  ),
});

const arbol = rootRoute.addChildren([
  indexRoute,
  productosRoute,
  camaraRoute,
  descripcionesRoute,
  nuevoRoute,
  importarRoute,
  sinFotoRoute,
  stockQuietoRoute,
  resenasRoute,
  fotosRoute,
  editarRoute,
  pedidosRoute,
  pedidoRoute,
  promocionesRoute,
  promocionNuevaRoute,
  promocionRoute,
  contenidoRoute,
  seccionesRoute,
  coleccionesRoute,
  categoriasRoute,
  seccionNuevaRoute,
  seccionRoute,
  coleccionNuevaRoute,
  coleccionRoute,
  analyticsRoute,
  clientesRoute,
  recurrenciaRoute,
  fidelidadRoute,
  clienteRoute,
  equipoRoute,
  configuracionRoute,
]);

export const router = createRouter({ routeTree: arbol });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

/*
 * Lo que viaja en el estado del historial. `pedidos`: la página de la lista desde
 * la que se abrió un pedido, para ir al anterior y al siguiente sin volver.
 *
 * Se aumenta por `@tanstack/react-router`, que reexporta la interfaz, y no por
 * `@tanstack/history`, donde vive: con pnpm ese paquete no es dependencia del
 * Admin y TypeScript no lo encuentra (TS2664).
 */
declare module '@tanstack/react-router' {
  interface HistoryState {
    pedidos?: string[];
  }
}
