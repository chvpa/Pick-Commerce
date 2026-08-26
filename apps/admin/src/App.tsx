import { Button } from '@/components/ui/button';
import { Login } from '@/features/auth/Login';
import { ProveedorSesion, useSesion } from '@/features/auth/SesionContext';
import { configuracionFaltante } from '@/lib/supabase';

function Contenido() {
  const { estado, sesion, salir } = useSesion();

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">{sesion?.email}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Organizaciones</h2>
        {sesion?.membresias.length === 0 ? (
          // Un usuario sin membresías no ve nada, y RLS se encarga de que así
          // sea: el mensaje sólo lo explica.
          <p className="text-muted-foreground text-sm">
            Tu cuenta todavía no pertenece a ninguna organización.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {sesion?.membresias.map((m) => (
              <li key={m.tenantId} className="flex gap-2">
                <span className="font-mono text-xs">{m.tenantId.slice(0, 8)}</span>
                <span className="text-muted-foreground">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <Button variant="outline" onClick={() => void salir()}>
          Salir
        </Button>
      </div>
    </main>
  );
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
    <ProveedorSesion>
      <Contenido />
    </ProveedorSesion>
  );
}
