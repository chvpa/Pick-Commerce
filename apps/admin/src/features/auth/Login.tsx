import { useState, type FormEvent } from 'react';
import { AlertCircleIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Acceso } from './Acceso';
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

  return (
    <Acceso titulo="Ingresá al Admin" subtitulo="Administrá tu tienda desde un solo lugar.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13.5px] font-medium">
            Correo
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={enviando}
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-[13.5px] font-medium">
              Contraseña
            </label>
            <button
              type="button"
              onClick={alRecuperar}
              className="text-link hover:text-link-hover cursor-pointer text-[13px] font-medium"
            >
              ¿La olvidaste?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={enviando}
            className="h-10"
          />
        </div>

        {/*
          Región viva siempre presente: si apareciera recién con el mensaje,
          varios lectores de pantalla no anunciarían el error.
        */}
        <p
          role="alert"
          aria-live="polite"
          className="text-destructive flex min-h-5 items-center gap-1.5 text-[13px]"
        >
          {error && <AlertCircleIcon className="size-4 shrink-0" />}
          {error}
        </p>

        <Button type="submit" size="lg" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
    </Acceso>
  );
}
