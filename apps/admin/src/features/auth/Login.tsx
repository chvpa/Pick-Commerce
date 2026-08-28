import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useSesion } from './SesionContext';

export function Login({ alRecuperar }: { alRecuperar: () => void }) {
  const { entrar } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (enviando) return; // Prevención de doble submit (ADR-022).
    setEnviando(true);
    setError(null);
    try {
      await entrar(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  }

  const campo =
    'h-10 w-full rounded-md border border-input bg-background px-3 text-sm ' +
    'focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-ring';

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">Pick Commerce</p>
        <h1 className="text-2xl font-semibold tracking-tight">Ingresar al Admin</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Correo
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={enviando}
            className={campo}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={enviando}
            className={campo}
          />
        </div>

        {/*
          Región viva siempre presente: si apareciera recién con el mensaje,
          varios lectores de pantalla no anunciarían el error.
        */}
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
          {error}
        </p>

        <Button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </Button>

        <Button type="button" variant="ghost" onClick={alRecuperar}>
          ¿Olvidaste tu contraseña?
        </Button>
      </form>
    </main>
  );
}
