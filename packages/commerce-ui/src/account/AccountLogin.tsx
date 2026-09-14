import { useRef, useState } from 'preact/hooks';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from '../recipes/button.ts';

/**
 * Entrar a la cuenta con un código que llega por correo.
 *
 * Dos pasos: el correo y después el código. Es una island y no un formulario
 * plano porque el segundo paso depende del primero y los errores se muestran sin
 * recargar; el `<form>` de cada paso es real igual, así que Enter envía.
 *
 * **El mensaje es el mismo exista o no la cuenta.** Hay un solo `auth.users`
 * para todos los comercios: una respuesta distinta para un correo conocido
 * dejaría preguntarle a una tienda si una persona compró en otra. Por eso el
 * paso dos no dice «te mandamos un código» sino «si ese correo tiene cuenta».
 */

export interface AccountLoginProps {
  /** Cuántos minutos vale el código, para decirlo. */
  minutos: number;
  codigoHref?: string;
  entrarHref?: string;
  className?: string;
}

type Paso = 'correo' | 'codigo';

const ETIQUETA_INPUT = cn(
  'rounded-sm border border-border bg-surface px-3 py-2 text-sm',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
);

export function AccountLogin({
  minutos,
  codigoHref = '/api/cuenta/codigo',
  entrarHref = '/api/cuenta/entrar',
  className,
}: AccountLoginProps) {
  const [paso, setPaso] = useState<Paso>('correo');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campoDelCodigo = useRef<HTMLInputElement>(null);

  async function postear(href: string, cuerpo: unknown): Promise<Response | null> {
    try {
      return await fetch(href, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
    } catch {
      setError('No pudimos conectarnos. Revisá tu internet y probá de nuevo.');
      return null;
    }
  }

  /** El mensaje del servidor si lo hay, y si no uno que se pueda leer. */
  async function motivo(respuesta: Response, porDefecto: string): Promise<string> {
    try {
      const cuerpo = (await respuesta.json()) as { message?: unknown };
      return typeof cuerpo.message === 'string' ? cuerpo.message : porDefecto;
    } catch {
      return porDefecto;
    }
  }

  async function pedirCodigo(evento: Event) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);

    const respuesta = await postear(codigoHref, { email });
    setEnviando(false);
    if (!respuesta) return;

    if (!respuesta.ok) {
      setError(await motivo(respuesta, 'No pudimos mandar el código. Probá de nuevo.'));
      return;
    }

    setPaso('codigo');
    // El foco va al campo nuevo: sin esto, quien navega con teclado queda
    // parado en un botón que ya no hace lo mismo.
    requestAnimationFrame(() => campoDelCodigo.current?.focus());
  }

  async function entrar(evento: Event) {
    evento.preventDefault();
    if (enviando) return;
    const codigo = campoDelCodigo.current?.value.trim() ?? '';
    setEnviando(true);
    setError(null);

    const respuesta = await postear(entrarHref, { email, codigo });
    if (!respuesta) {
      setEnviando(false);
      return;
    }

    if (!respuesta.ok) {
      setEnviando(false);
      setError(await motivo(respuesta, 'Ese código no entró. Probá de nuevo.'));
      return;
    }

    /*
     * Se recarga en vez de pintar la cuenta acá. La sesión vive en una cookie
     * `httpOnly` que este código no puede leer, así que quien sabe qué mostrar
     * es el servidor. `location.reload()` y no un router del cliente: es una
     * página on-demand y la va a volver a armar el Worker.
     *
     * No se baja `enviando`: la página se está yendo, y habilitar el botón
     * mientras tanto invita a un segundo envío.
     */
    location.reload();
  }

  return (
    <div class={cn('flex flex-col gap-4', className)}>
      {error ? (
        <p role="alert" class="rounded-sm bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {paso === 'correo' ? (
        <form class="flex flex-col gap-3" onSubmit={pedirCodigo}>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm">Tu correo</span>
            <input
              type="email"
              name="email"
              autocomplete="email"
              required
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              class={ETIQUETA_INPUT}
            />
          </label>
          <p class="text-sm text-fg-muted">
            Te mandamos un código para entrar. No hace falta contraseña.
          </p>
          <button type="submit" disabled={enviando} class={buttonVariants()}>
            {enviando ? 'Mandando…' : 'Mandarme el código'}
          </button>
        </form>
      ) : (
        <form class="flex flex-col gap-3" onSubmit={entrar}>
          <p role="status" class="text-sm text-fg-muted">
            Si <strong class="text-fg">{email}</strong> tiene cuenta, le llegó un código. Vence en{' '}
            {minutos} minutos.
          </p>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm">El código</span>
            <input
              ref={campoDelCodigo}
              type="text"
              name="codigo"
              // `one-time-code` es lo que hace que el teléfono ofrezca el código
              // del SMS o del correo sin que la persona cambie de aplicación.
              autocomplete="one-time-code"
              inputMode="numeric"
              required
              class={cn(ETIQUETA_INPUT, 'text-lg tracking-[0.3em]')}
            />
          </label>
          <button type="submit" disabled={enviando} class={buttonVariants()}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => {
              setPaso('correo');
              setError(null);
            }}
            class={cn(buttonVariants({ variant: 'ghost' }), 'self-start')}
          >
            Usar otro correo
          </button>
        </form>
      )}
    </div>
  );
}
