import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Login } from '@/features/auth/Login';
import { ProveedorSesion, useSesion } from '@/features/auth/SesionContext';
import { router } from '@/router';
import { configuracionFaltante } from '@/lib/supabase';

/**
 * Una sola instancia para toda la app: creada dentro del componente se
 * recrearía en cada render y tiraría la caché entera.
 */
const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // El catálogo lo edita gente, no un feed: revalidar al volver a la pestaña
      // es ruido, y las mutaciones ya invalidan lo que corresponde.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function Contenido() {
  const { estado } = useSesion();

  if (estado === 'cargando') {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-muted-foreground text-sm" role="status">
          Cargando sesión…
        </p>
      </main>
    );
  }

  if (estado === 'anonimo') return <Login />;

  return <RouterProvider router={router} />;
}

export function App() {
  if (configuracionFaltante.length > 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="text-lg font-semibold">Falta configuración</h1>
        <p className="text-muted-foreground text-sm">
          El Admin no puede conectarse a Supabase. Faltan estas variables de entorno:
        </p>
        <ul className="text-sm">
          {configuracionFaltante.map((v) => (
            <li key={v} className="font-mono">
              {v}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">Ver .env.example en la raíz del repo.</p>
      </main>
    );
  }

  return (
    <QueryClientProvider client={cliente}>
      <ProveedorSesion>
        <Contenido />
      </ProveedorSesion>
    </QueryClientProvider>
  );
}
