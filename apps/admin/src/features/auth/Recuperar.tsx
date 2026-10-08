import { useState, type FormEvent } from 'react';
import { ArrowLeftIcon, CheckCircleIcon, MailIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Acceso } from './Acceso';
import { REGLAS_DE_CONTRASENA, contrasenaValida } from './contrasena';
import { useSesion } from './SesionContext';

function Volver({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-3 hover:text-foreground flex cursor-pointer items-center gap-1.5 self-center text-[13.5px] font-medium"
    >
      <ArrowLeftIcon className="size-4" />
      Volver a ingresar
    </button>
  );
}

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

  return (
    <Acceso titulo="Recuperar contraseña" subtitulo="Te mandamos un enlace para elegir una nueva.">
      {enviado ? (
        <div className="flex flex-col gap-5">
          <p
            role="status"
            className="text-ink-2 flex items-start gap-3 rounded-xl bg-[#f4f6fb] px-4 py-3.5 text-[13.5px]"
          >
            <MailIcon className="mt-0.5 size-[18px] shrink-0 text-[#3b5bdb]" />
            <span>
              Si <strong className="text-foreground font-semibold">{email}</strong> tiene una
              cuenta, te llega un enlace en unos minutos. Revisá también el correo no deseado.
            </span>
          </p>
          <Volver onClick={alVolver} />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email-recuperar" className="text-[13.5px] font-medium">
              Correo
            </label>
            <Input
              id="email-recuperar"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={enviando}
              className="h-10"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={enviando || email.trim() === ''}
            aria-busy={enviando}
          >
            {enviando ? 'Enviando…' : 'Enviar enlace'}
          </Button>

          <Volver onClick={alVolver} />
        </form>
      )}
    </Acceso>
  );
}

/**
 * Elegir la contraseña nueva.
 *
 * Se llega acá con una sesión ya abierta: el enlace del correo la abrió, y esa
 * es la prueba de identidad. Por eso no se pide la contraseña anterior — quien
 * la olvidó no la tiene. Lo que se pide se ve mientras se escribe, en vez de
 * aparecer como un error al final.
 */
export function NuevaPassword() {
  const { cambiarPassword, salir } = useSesion();
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noCoinciden = repetida !== '' && password !== repetida;
  const lista = contrasenaValida(password) && password === repetida;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (enviando || !lista) return;
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
    <Acceso
      titulo="Elegí una contraseña nueva"
      subtitulo="Después de guardarla entrás directo al Admin."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password-nueva" className="text-[13.5px] font-medium">
            Contraseña nueva
          </label>
          <Input
            id="password-nueva"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={enviando}
            className="h-10"
          />
          <ul aria-label="Lo que tiene que tener" className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {REGLAS_DE_CONTRASENA.map((r) => {
              const ok = r.cumple(password);
              return (
                <li
                  key={r.etiqueta}
                  className={cn(
                    'flex items-center gap-1.5 text-[12.5px]',
                    ok ? 'text-[#13774a]' : 'text-ink-faint',
                  )}
                >
                  <CheckCircleIcon className="size-3.5" aria-hidden="true" />
                  {r.etiqueta}
                  <span className="sr-only">{ok ? ': listo' : ': falta'}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password-repetir" className="text-[13.5px] font-medium">
            Repetila
          </label>
          <Input
            id="password-repetir"
            type="password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            autoComplete="new-password"
            required
            disabled={enviando}
            aria-invalid={noCoinciden || undefined}
            className="h-10"
          />
          {noCoinciden && <span className="text-destructive text-[12.5px]">No coinciden</span>}
        </div>

        <p role="alert" aria-live="polite" className="text-destructive min-h-5 text-[13px]">
          {error}
        </p>

        <Button type="submit" size="lg" disabled={enviando || !lista} aria-busy={enviando}>
          {enviando ? 'Guardando…' : 'Guardar y entrar'}
        </Button>

        <Button type="button" variant="ghost" onClick={() => void salir()}>
          Cancelar
        </Button>
      </form>
    </Acceso>
  );
}
