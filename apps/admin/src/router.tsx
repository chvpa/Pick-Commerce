import { Suspense, lazy, type FunctionComponent, type ReactNode } from 'react';
import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';
import type { Permission } from '@pick/commerce-types';
import { Button, buttonVariants } from '@/components/ui/button';
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

function Enlace({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="text-muted-foreground text-sm hover:underline data-[status=active]:text-foreground"
    >
      {children}
    </Link>
  );
}

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

function Cascara() {
  const { sesion, salir } = useSesion();
  const { tiendas, tienda, elegir, cargando, error } = useTienda();
  const puede = usePuede();

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
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="text-lg font-semibold">No se pudieron cargar las tiendas</h1>
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </main>
    );
  }

  if (!tienda) {
    // RLS es lo que hace que esta lista esté vacía; el mensaje sólo lo explica.
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="text-lg font-semibold">Todavía no hay ninguna tienda</h1>
        <p className="text-muted-foreground text-sm">
          Tu cuenta no pertenece a ninguna organización con tiendas configuradas.
        </p>
        <div>
          <Button variant="outline" onClick={() => void salir()}>
            Salir
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/" className="font-semibold">
              Pick Admin
            </Link>
            <nav className="flex flex-wrap items-center gap-4">
              <Enlace to="/">Resumen</Enlace>
              <Enlace to="/productos">Productos</Enlace>
              <Enlace to="/pedidos">Pedidos</Enlace>
              <Enlace to="/clientes">Clientes</Enlace>
              {puede('member.manage') && <Enlace to="/equipo">Equipo</Enlace>}
              {puede('settings.write') && <Enlace to="/configuracion">Configuración</Enlace>}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {tiendas.length > 1 && (
              <>
                <label htmlFor="tienda" className="sr-only">
                  Tienda
                </label>
                <select
                  id="tienda"
                  value={tienda.id}
                  onChange={(e) => elegir(e.currentTarget.value)}
                  className="border-border bg-background h-8 cursor-pointer rounded-lg border px-2.5 text-sm outline-none"
                >
                  {tiendas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <span className="text-muted-foreground hidden text-sm sm:inline">{sesion?.email}</span>
            <Button variant="outline" size="sm" onClick={() => void salir()}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/*
          Un solo límite para todas las pantallas: el chunk tarda lo que tarde la
          red la primera vez, y sin esto el click no da ninguna señal hasta que
          llega.
        */}
        <Suspense
          fallback={
            <p className="text-muted-foreground text-sm" role="status">
              Cargando…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
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
