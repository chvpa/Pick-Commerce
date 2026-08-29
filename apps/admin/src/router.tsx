import { Suspense, lazy, type FunctionComponent, type ReactNode } from 'react';
import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';
import type { Permission } from '@pick/commerce-types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar, useTituloDeSeccion } from '@/features/navegacion/AppSidebar';
import { useSesion } from '@/features/auth/SesionContext';
import { usePuede } from '@/features/auth/usePuede';
import { ProveedorTienda, useTienda } from '@/features/tienda/TiendaContext';

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
 * las recibe. Un solo mecanismo para todas es más fácil de seguir que dos.
 */

/** `React.lazy` para un módulo que exporta su componente con nombre. */
function pantalla<P extends object>(
  carga: () => Promise<Record<string, unknown>>,
  nombre: string,
): FunctionComponent<P> {
  return lazy(async () => ({ default: (await carga())[nombre] as FunctionComponent<P> }));
}

const Dashboard = pantalla(() => import('@/features/dashboard/Dashboard'), 'Dashboard');
const ListaProductos = pantalla(
  () => import('@/features/productos/ListaProductos'),
  'ListaProductos',
);
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
const Contenido = pantalla(() => import('@/features/contenido/Contenido'), 'Contenido');
const FormularioSeccion = pantalla<{ id?: string }>(
  () => import('@/features/contenido/FormularioSeccion'),
  'FormularioSeccion',
);
const FormularioColeccion = pantalla<{ id?: string }>(
  () => import('@/features/contenido/FormularioColeccion'),
  'FormularioColeccion',
);
const ListaClientes = pantalla(() => import('@/features/clientes/ListaClientes'), 'ListaClientes');
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
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-lg font-semibold">No tenés acceso a esta sección</h1>
      <p className="text-muted-foreground text-sm">
        Tu rol en esta organización no incluye este permiso. Pedíselo a un propietario.
      </p>
      <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Volver al resumen
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
  const titulo = useTituloDeSeccion();

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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {/*
            El título de la sección, no una miga de pan: la navegación del Admin
            es plana —seis secciones, sin jerarquía— y una miga de un solo nivel
            es una miga que miente.
          */}
          <h1 className="text-sm font-medium">{titulo}</h1>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
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
  component: Dashboard,
});

const productosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos',
  component: ListaProductos,
});

const nuevoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/nuevo',
  component: () => <FormularioProducto />,
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

const pedidosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos',
  component: ListaPedidos,
});

const pedidoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos/$id',
  component: function Pedido() {
    const { id } = pedidoRoute.useParams();
    return <DetallePedido id={id} />;
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
const contenidoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contenido',
  /*
   * La pestaña va en la URL y no en estado local. Sin esto, guardar una
   * colección devolvía a `/contenido`, que abre en Banners: la persona no veía
   * lo que acababa de crear. De paso la pestaña se puede compartir y sobrevive a
   * un refresh.
   */
  validateSearch: (busqueda: Record<string, unknown>): { tab?: string } => {
    const tab = busqueda.tab;
    return typeof tab === 'string' ? { tab } : {};
  },
  component: Contenido,
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

const clientesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clientes',
  component: ListaClientes,
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
  nuevoRoute,
  importarRoute,
  editarRoute,
  pedidosRoute,
  pedidoRoute,
  promocionesRoute,
  promocionNuevaRoute,
  promocionRoute,
  contenidoRoute,
  seccionNuevaRoute,
  seccionRoute,
  coleccionNuevaRoute,
  coleccionRoute,
  clientesRoute,
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
