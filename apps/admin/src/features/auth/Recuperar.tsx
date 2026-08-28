import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useSesion } from './SesionContext';

/**
 * Estilo compartido con el login: son la misma pantalla en dos estados.
 */
const CAMPO =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-ring';

/**
 * Pedir el correo de recuperación.
 *
 * Siempre dice lo mismo, exista o no la cuenta. No es vaguedad: un mensaje
 * distinto para cada caso convierte este formulario en una forma de averiguar
 * qué correos tienen acceso al Admin — el mismo motivo por el que el login no
 * distingue usuario inexistente de contraseña incorrecta.
 */
export function Recuperar({ alVolver }: { alVolver: () => void }) {
  const { recuperar } = useSesion();
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      await recuperar(email);
    } catch {
      // Tampoco se distingue un fallo: decir «ese correo no existe» sería lo
      // mismo que responder la pregunta que no queremos responder.
    } finally {
      setEnviando(false);
      setEnviado(true);
    }
  }

  if (enviado) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Revisá tu correo</h1>
          <p className="text-muted-foreground text-sm">
            Si <strong className="text-foreground font-medium">{email}</strong> tiene acceso al
            Admin, le mandamos un enlace para elegir una contraseña nueva. Puede tardar unos
            minutos.
          </p>
        </div>
        <Button variant="outline" onClick={alVolver}>
          Volver a ingresar
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">Pick Commerce</p>
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar el acceso</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email-recuperar" className="text-sm font-medium">
            Correo
          </label>
          <input
            id="email-recuperar"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={enviando}
            className={CAMPO}
          />
        </div>

        <Button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Enviando…' : 'Enviarme el enlace'}
        </Button>

        <Button type="button" variant="ghost" onClick={alVolver}>
          Volver
        </Button>
      </form>
    </main>
  );
}

/**
 * Elegir la contraseña nueva.
 *
 * Se llega acá con una sesión ya abierta: el enlace del correo la abrió, y esa
 * es la prueba de identidad. Por eso no se pide la contraseña anterior — quien
 * la olvidó no la tiene.
 */
export function NuevaPassword() {
  const { cambiarPassword, salir } = useSesion();
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;

    if (password.length < 8) {
      setError('Usá al menos 8 caracteres.');
      return;
    }
    if (password !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      await cambiarPassword(password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">Pick Commerce</p>
        <h1 className="text-2xl font-semibold tracking-tight">Elegí una contraseña nueva</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password-nueva" className="text-sm font-medium">
            Contraseña nueva
          </label>
          <input
            id="password-nueva"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={enviando}
            className={CAMPO}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password-repetir" className="text-sm font-medium">
            Repetila
          </label>
          <input
            id="password-repetir"
            type="password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            autoComplete="new-password"
            required
            disabled={enviando}
            className={CAMPO}
          />
        </div>

        <p role="alert" aria-live="polite" className="text-destructive min-h-5 text-sm">
          {error}
        </p>

        <Button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Guardando…' : 'Guardar y entrar'}
        </Button>

        <Button type="button" variant="ghost" onClick={() => void salir()}>
          Cancelar
        </Button>
      </form>
    </main>
  );
}
