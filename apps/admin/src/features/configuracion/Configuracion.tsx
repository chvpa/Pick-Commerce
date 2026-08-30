import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioConfiguracion, repositorioCredencialDeIA } from '@pick/adapter-supabase';
import {
  MODELOS,
  MODELO_POR_DEFECTO,
  actualizarTasa,
  configuracionDeEnvio,
  configuracionDeMoneda,
  configuracionDePagos,
  esTiendaDemo,
  money,
  toMajorUnits,
  type CurrencyConfig,
  type EntradaDeAuditoria,
} from '@pick/commerce-core';
import type { TiendaResumen } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import { SettingsIcon } from 'lucide-react';
import { EstadoDeError, PaginaAdmin, SELECT, Tarjeta } from '@/components/pagina';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSesion } from '@/features/auth/SesionContext';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { guardarCredencial, probarCredencial } from '@/lib/ia';

type Settings = Readonly<Record<string, unknown>>;

interface Guardado {
  guardar: (parcial: Record<string, unknown>, auditoria?: EntradaDeAuditoria) => void;
  guardando: boolean;
}

/**
 * Configuración de la tienda.
 *
 * Cada tarjeta guarda **sólo su sección** —`payments` o `currency`— y el RPC
 * mergea por clave de primer nivel. Es lo que permite que editar los medios de
 * pago no toque la moneda: un guardado único de todo el formulario reenviaría
 * también lo que no se miró, y bastaría un render con datos viejos para pisarlo.
 *
 * Los formularios viven en componentes aparte y se montan cuando la
 * configuración ya llegó, así que arrancan de ella sin ningún efecto que
 * re-siembre campos. Sembrar en un efecto es lo que hace que lo que alguien está
 * escribiendo desaparezca cuando vuelve una consulta de fondo.
 */
export function Configuracion() {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();

  const consulta = useQuery({
    queryKey: ['configuracion', tienda.id],
    queryFn: () => repositorioConfiguracion(db).leer(tienda.id),
  });

  const mutacion = useMutation({
    mutationFn: ({
      parcial,
      auditoria,
    }: {
      parcial: Record<string, unknown>;
      auditoria?: EntradaDeAuditoria;
    }) => repositorioConfiguracion(db).guardar(tienda.id, parcial, auditoria),
    onSuccess: (settings) => {
      cliente.setQueryData(['configuracion', tienda.id], settings);
    },
  });

  if (consulta.isPending) {
    return (
      <Envoltura tienda={tienda}>
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
      </Envoltura>
    );
  }

  if (consulta.isError) {
    return (
      <Envoltura tienda={tienda}>
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar la configuración"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      </Envoltura>
    );
  }

  const guardado: Guardado = {
    guardar: (parcial, auditoria) =>
      mutacion.mutate({ parcial, ...(auditoria ? { auditoria } : {}) }),
    guardando: mutacion.isPending,
  };

  return (
    <Envoltura tienda={tienda}>
      {mutacion.isError && (
        <p className="text-destructive text-sm" role="alert">
          {(mutacion.error as Error).message}
        </p>
      )}

      <Seccion
        titulo="Medios de pago"
        descripcion="Con qué puede pagar quien compra, y qué le decís para que lo haga."
      >
        <Pagos settings={consulta.data} guardado={guardado} />
      </Seccion>

      <Seccion
        titulo="Moneda"
        descripcion="En qué se cobra y con qué tipo de cambio se muestran los precios."
      >
        <Moneda settings={consulta.data} tienda={tienda} guardado={guardado} />
      </Seccion>

      <Seccion
        titulo="Envío"
        descripcion="Cuánto se cobra por despachar, y desde qué monto no se cobra."
      >
        <Envio settings={consulta.data} tienda={tienda} guardado={guardado} />
      </Seccion>

      <Seccion
        titulo="Modo demostración"
        descripcion="Para mostrarle la tienda a alguien sin mandarle correos a nadie."
      >
        <ModoDemo settings={consulta.data} guardado={guardado} />
      </Seccion>

      <Seccion
        titulo="Inteligencia artificial"
        descripcion="Tu clave de OpenAI, para que el Admin pueda proponer fichas de producto."
      >
        <InteligenciaArtificial tienda={tienda} />
      </Seccion>
    </Envoltura>
  );
}

/** El encabezado de la pantalla, que también se dibuja mientras carga y al fallar. */
function Envoltura({ tienda, children }: { tienda: TiendaResumen; children: ReactNode }) {
  return (
    <PaginaAdmin
      titulo="Configuración"
      icono={SettingsIcon}
      descripcion={`Cómo cobra, en qué moneda opera y con qué IA trabaja ${tienda.name}.`}
    >
      {children}
    </PaginaAdmin>
  );
}

/**
 * Un ajuste: a la izquierda de qué se trata, a la derecha los controles.
 *
 * Es la sección anotada de los ajustes de Shopify. Con las tarjetas sueltas hay
 * que leer los campos para saber qué hace cada una; con el rótulo al costado se
 * encuentra la que se vino a tocar sin abrirlas todas. En pantalla angosta el
 * rótulo se apila arriba, que es lo mismo pero sin columna.
 */
function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <section className="grid items-start gap-3 lg:grid-cols-[15rem_1fr] lg:gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{titulo}</h2>
        <p className="text-muted-foreground text-sm">{descripcion}</p>
      </div>
      <Tarjeta>{children}</Tarjeta>
    </section>
  );
}

function Pagos({ settings, guardado }: { settings: Settings; guardado: Guardado }) {
  const inicial = configuracionDePagos(settings);
  const [habilitada, setHabilitada] = useState(inicial.enabled.includes('bank_transfer'));
  const [simulada, setSimulada] = useState(inicial.enabled.includes('simulated_card'));
  const [instrucciones, setInstrucciones] = useState(inicial.bankTransfer?.instructions ?? '');
  const [listo, setListo] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setListo(false);
        const enabled = [
          ...(habilitada ? ['bank_transfer'] : []),
          ...(simulada ? ['simulated_card'] : []),
        ];
        guardado.guardar({
          payments: {
            enabled,
            // El primero habilitado, o transferencia: un default que no está
            // en la lista no es un default, y el core lo corregiría igual.
            default: enabled[0] ?? 'bank_transfer',
            ...(instrucciones.trim()
              ? { bankTransfer: { instructions: instrucciones.trim() } }
              : {}),
          },
        });
        setListo(true);
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id="transferencia"
          checked={habilitada}
          onCheckedChange={(v) => setHabilitada(v === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="transferencia" className="cursor-pointer">
            Transferencia bancaria
          </Label>
          <p className="text-muted-foreground text-xs">
            El pedido queda pendiente de pago hasta que confirmes el comprobante.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="simulada"
          checked={simulada}
          onCheckedChange={(v) => setSimulada(v === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="simulada" className="cursor-pointer">
            Tarjeta (pago de prueba)
          </Label>
          <p className="text-muted-foreground text-xs">
            Pasarela simulada para probar el flujo completo: no cobra nada y no es un proveedor
            real. Sirve para ver cómo queda el checkout con tarjeta antes de contratar uno.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="instrucciones">Instrucciones para el cliente</Label>
        <Textarea
          id="instrucciones"
          rows={4}
          value={instrucciones}
          disabled={!habilitada}
          onChange={(e) => setInstrucciones(e.currentTarget.value)}
          placeholder="Número de cuenta, banco, titular y a dónde enviar el comprobante."
        />
        <p className="text-muted-foreground text-xs">
          Se muestran en el checkout y en la confirmación del pedido.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={guardado.guardando}>
          {guardado.guardando ? 'Guardando…' : 'Guardar'}
        </Button>
        {listo && !guardado.guardando && (
          <span className="text-muted-foreground text-sm" role="status">
            Guardado.
          </span>
        )}
      </div>

      {!habilitada && !simulada && (
        <p className="text-muted-foreground text-xs">
          Sin ningún medio habilitado el checkout vuelve a transferencia bancaria: una tienda que no
          puede cobrar no puede vender.
        </p>
      )}
    </form>
  );
}

function Moneda({
  settings,
  tienda,
  guardado,
}: {
  settings: Settings;
  tienda: TiendaResumen;
  guardado: Guardado;
}) {
  const { sesion } = useSesion();
  const config: CurrencyConfig = configuracionDeMoneda(settings, tienda.currency as 'PYG');
  const [tasa, setTasa] = useState(config.exchangeRate?.value?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const actual = config.exchangeRate;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setListo(false);
        setError(null);
        try {
          // `actualizarTasa` devuelve la configuración y su auditoría juntas:
          // con esta firma no se puede guardar la tasa sin registrar quién la
          // cambió, que es lo que pide PROJECT.md §33. Validar acá con un
          // esquema propio daría dos reglas capaces de divergir.
          const r = actualizarTasa(
            config,
            Number(tasa.replace(',', '.')),
            sesion?.userId ?? '',
            new Date().toISOString(),
          );
          guardado.guardar({ currency: r.config }, r.auditoria);
          setListo(true);
        } catch (fallo) {
          setError((fallo as Error).message);
        }
      }}
    >
      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-xs">Moneda base</dt>
          <dd className="text-sm">{config.base}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-xs">Se cobra en</dt>
          <dd className="text-sm">{config.checkoutCurrency}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tasa">Tipo de cambio manual</Label>
        <Input
          id="tasa"
          inputMode="decimal"
          value={tasa}
          onChange={(e) => setTasa(e.currentTarget.value)}
          placeholder="7300"
          aria-describedby="tasa-nota"
          aria-invalid={error ? true : undefined}
        />
        <p id="tasa-nota" className="text-muted-foreground text-xs">
          Cuántos {config.base} equivalen a una unidad de la moneda mostrada. Mostrar otra moneda no
          cambia en cuál se cobra.
        </p>
      </div>

      {actual ? (
        <p className="text-muted-foreground text-xs">
          Última actualización: {new Date(actual.updatedAt).toLocaleString(tienda.locale)}
          {actual.updatedBy === sesion?.userId ? ' · por vos' : ''}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">Todavía no se cargó ningún cambio.</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={guardado.guardando}>
          {guardado.guardando ? 'Guardando…' : 'Guardar'}
        </Button>
        {listo && !guardado.guardando && (
          <span className="text-muted-foreground text-sm" role="status">
            Guardado y auditado.
          </span>
        )}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * La credencial de OpenAI de la tienda (BYOK).
 *
 * La key **es del comercio**: la carga acá, se cifra del lado del servidor y no
 * vuelve nunca. De ella sólo se vuelven a ver los últimos cuatro caracteres, que
 * alcanzan para reconocer cuál está puesta.
 *
 * Tres botones y tres caminos distintos a propósito:
 *
 * - **Guardar** pasa por el Worker, que es el único que tiene la clave maestra.
 *   Prueba la credencial antes de guardarla: una que no sirve guardada sería una
 *   pantalla que dice «configurada» y un botón que falla siempre.
 * - **Probar** vuelve a preguntarle a OpenAI por la que ya está. Una key se
 *   revoca del otro lado sin avisar.
 * - **Quitar** va directo por RPC: borrar no necesita descifrar nada, y una ruta
 *   de servidor que no toca el secreto sería una capa de más.
 */
function InteligenciaArtificial({ tienda }: { tienda: TiendaResumen }) {
  const cliente = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [modelo, setModelo] = useState<string>(MODELO_POR_DEFECTO);
  const [aviso, setAviso] = useState('');

  const clave = ['credencial-ia', tienda.id];

  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => repositorioCredencialDeIA(db).estado(tienda.id),
  });

  // El modelo guardado manda sobre el estado local, pero sólo hasta que alguien
  // toca el select: sembrarlo en un efecto haría que la elección se revirtiera
  // sola cuando vuelve una consulta de fondo.
  const [tocado, setTocado] = useState(false);
  const modeloActual = tocado ? modelo : (consulta.data?.model ?? MODELO_POR_DEFECTO);

  function alTerminar(mensaje: string) {
    return () => {
      setAviso(mensaje);
      setApiKey('');
      void cliente.invalidateQueries({ queryKey: clave });
    };
  }

  const guardar = useMutation({
    mutationFn: () => guardarCredencial(tienda.id, apiKey, modeloActual),
    onSuccess: alTerminar('Credencial guardada y verificada.'),
  });

  const probar = useMutation({
    mutationFn: () => probarCredencial(tienda.id),
    onSuccess: () => setAviso('La credencial funciona.'),
  });

  const quitar = useMutation({
    mutationFn: () => repositorioCredencialDeIA(db).quitar(tienda.id),
    onSuccess: alTerminar('Credencial quitada.'),
  });

  const trabajando = guardar.isPending || probar.isPending || quitar.isPending;
  const fallo = (guardar.error ?? probar.error ?? quitar.error) as Error | null;

  if (consulta.isError) {
    return (
      <EstadoDeError
        titulo="No se pudo leer la configuración de IA"
        error={consulta.error as Error}
        onReintentar={() => void consulta.refetch()}
      />
    );
  }

  const estado = consulta.data;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setAviso('');
        guardar.mutate();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="openai-key">Clave de OpenAI</Label>
        <Input
          id="openai-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          disabled={trabajando}
          onChange={(e) => setApiKey(e.currentTarget.value)}
          placeholder={
            estado?.configured ? `Guardada, termina en ····${estado.last4}` : 'sk-proj-…'
          }
        />
        <p className="text-muted-foreground text-xs">
          {estado?.configured
            ? 'Escribí una nueva para reemplazarla. La que está guardada no se puede volver a ver.'
            : 'Se guarda cifrada en el servidor y nunca llega al navegador. La cuenta y el consumo son tuyos.'}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="openai-modelo">Modelo</Label>
        <select
          id="openai-modelo"
          className={SELECT}
          value={modeloActual}
          disabled={trabajando}
          onChange={(e) => {
            setTocado(true);
            setModelo(e.currentTarget.value);
          }}
        >
          {MODELOS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre} — {m.nota}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Cambiar de modelo sólo tiene efecto si guardás de nuevo la credencial.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={trabajando || apiKey.trim() === ''}>
          {guardar.isPending ? 'Verificando…' : 'Guardar'}
        </Button>

        {estado?.configured && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={trabajando}
              onClick={() => {
                setAviso('');
                probar.mutate();
              }}
            >
              {probar.isPending ? 'Probando…' : 'Probar conexión'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={trabajando}
              onClick={() => {
                setAviso('');
                quitar.mutate();
              }}
            >
              {quitar.isPending ? 'Quitando…' : 'Quitar'}
            </Button>
          </>
        )}

        {aviso && !trabajando && (
          <span className="text-muted-foreground text-sm" role="status">
            {aviso}
          </span>
        )}
      </div>

      {fallo && (
        <p className="text-destructive text-sm" role="alert">
          {fallo.message}
        </p>
      )}
    </form>
  );
}

/**
 * El costo de envío.
 *
 * Una tarifa plana y un umbral opcional de envío gratis. Zonas, transportistas y
 * retiro en sucursal quedan fuera de v1: «pickup por sucursal» está en v2 y no
 * se adelanta.
 *
 * Los importes se escriben en la unidad que el operador ve y se guardan en la
 * mínima, como todo importe del sistema. **El número que se cobra lo calcula el
 * servidor**: acá sólo se configura.
 */
function Envio({
  settings,
  tienda,
  guardado,
}: {
  settings: Settings;
  tienda: TiendaResumen;
  guardado: Guardado;
}) {
  const inicial = configuracionDeEnvio(settings);
  const moneda = tienda.currency as 'PYG';

  const [cobra, setCobra] = useState(inicial.mode === 'flat');
  const [tarifa, setTarifa] = useState(
    inicial.mode === 'flat' ? String(toMajorUnits({ amount: inicial.amount, currency: moneda })) : '',
  );
  const [desde, setDesde] = useState(
    inicial.freeFrom === undefined
      ? ''
      : String(toMajorUnits({ amount: inicial.freeFrom, currency: moneda })),
  );
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  function numero(texto: string): number | null {
    const v = Number(texto.trim().replace(/\./g, ''));
    return texto.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null;
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setListo(false);
        setError('');

        if (!cobra) {
          guardado.guardar({ shipping: { mode: 'none' } });
          setListo(true);
          return;
        }

        const importe = numero(tarifa);
        if (importe === null) {
          setError('La tarifa tiene que ser un número.');
          return;
        }
        const umbral = desde.trim() === '' ? null : numero(desde);
        if (desde.trim() !== '' && umbral === null) {
          setError('El monto de envío gratis tiene que ser un número.');
          return;
        }

        guardado.guardar({
          shipping: {
            mode: 'flat',
            amount: money(importe, moneda).amount,
            ...(umbral !== null && umbral > 0 ? { freeFrom: money(umbral, moneda).amount } : {}),
          },
        });
        setListo(true);
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox id="cobra-envio" checked={cobra} onCheckedChange={(v) => setCobra(v === true)} />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="cobra-envio" className="cursor-pointer">
            Cobrar envío
          </Label>
          <p className="text-muted-foreground text-xs">
            Sin esto el envío es cero: el comercio retira, o lo arregla aparte.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tarifa">Tarifa ({moneda})</Label>
          <Input
            id="tarifa"
            inputMode="numeric"
            value={tarifa}
            disabled={!cobra}
            onChange={(e) => setTarifa(e.currentTarget.value)}
            placeholder="35000"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="envio-gratis">Gratis desde ({moneda})</Label>
          <Input
            id="envio-gratis"
            inputMode="numeric"
            value={desde}
            disabled={!cobra}
            onChange={(e) => setDesde(e.currentTarget.value)}
            placeholder="Opcional"
          />
          <p className="text-muted-foreground text-xs">
            Se compara con el total ya descontado. Si lo cargás, la tienda lo anuncia sola.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={guardado.guardando}>
          {guardado.guardando ? 'Guardando…' : 'Guardar'}
        </Button>
        {listo && !guardado.guardando && (
          <span className="text-muted-foreground text-sm" role="status">
            Guardado.
          </span>
        )}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Modo demostración.
 *
 * Un pedido de una tienda demo se crea igual —el prospecto tiene que verlo
 * entrar acá, que es la mitad de lo que se le está mostrando— pero queda marcado
 * y **no dispara correos**. Sin esto, cada prueba deja un pedido indistinguible
 * de uno real y le manda un aviso a quien haya escrito su dirección.
 */
function ModoDemo({ settings, guardado }: { settings: Settings; guardado: Guardado }) {
  const [demo, setDemo] = useState(esTiendaDemo(settings));
  const [listo, setListo] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setListo(false);
        guardado.guardar({ demo });
        setListo(true);
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox id="modo-demo" checked={demo} onCheckedChange={(v) => setDemo(v === true)} />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="modo-demo" className="cursor-pointer">
            Esta tienda es una demostración
          </Label>
          <p className="text-muted-foreground text-xs">
            Los pedidos se crean y se ven acá, marcados como demo, pero no se le manda ningún correo
            a quien compra. El checkout lo avisa antes de confirmar.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={guardado.guardando}>
          {guardado.guardando ? 'Guardando…' : 'Guardar'}
        </Button>
        {listo && !guardado.guardando && (
          <span className="text-muted-foreground text-sm" role="status">
            Guardado.
          </span>
        )}
      </div>
    </form>
  );
}
