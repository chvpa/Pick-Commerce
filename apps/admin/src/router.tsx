import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useSesion } from '@/features/auth/SesionContext';
import { ListaProductos } from '@/features/productos/ListaProductos';
import { FormularioProducto } from '@/features/productos/FormularioProducto';
import { ProveedorTienda, useTienda } from '@/features/tienda/TiendaContext';

/**
 * Rutas del Admin, declaradas en código.
 *
 * Sin generación de archivos: son cuatro rutas y el router por archivos añade un
 * paso de build y un archivo generado al repo. Se revisa cuando el Admin tenga
 * suficientes pantallas como para que la lista pese.
 */
function Cascara() {
  const { sesion, salir } = useSesion();
  const { tiendas, tienda, elegir, cargando, error } = useTienda();

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
          <div className="flex items-center gap-4">
            <Link to="/productos" className="font-semibold">
              Pick Admin
            </Link>
            <nav>
              <Link
                to="/productos"
                className="text-muted-foreground text-sm hover:underline data-[status=active]:text-foreground"
              >
                Productos
              </Link>
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
        <Outlet />
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
  // El Admin abre en productos: es lo único que hay, y una home vacía sería un
  // click de más en cada sesión.
  beforeLoad: () => {
    throw redirect({ to: '/productos' });
  },
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

const editarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/productos/$id',
  component: function Editar() {
    const { id } = editarRoute.useParams();
    return <FormularioProducto id={id} />;
  },
});

const arbol = rootRoute.addChildren([indexRoute, productosRoute, nuevoRoute, editarRoute]);

export const router = createRouter({ routeTree: arbol });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
