import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioConfiguracion, repositorioCredencialDeIA } from '@pick/adapter-supabase';
import {
  MODELOS,
  MODELO_POR_DEFECTO,
  actualizarTasa,
  configuracionDeCatalogo,
  configuracionDeEnvio,
  configuracionDeMoneda,
  configuracionDePagos,
  cuentasHabilitadas,
  esTiendaDemo,
  money,
  TOPE_MENSUAL_DE_BUSQUEDA,
  toMajorUnits,
  type CurrencyConfig,
  type EntradaDeAuditoria,
} from '@pick/commerce-core';
import type { TiendaResumen } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import { SettingsIcon } from '@/components/iconos';
import { EstadoDeError, PaginaAdmin, Selector, Tarjeta } from '@/components/pagina';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSesion } from '@/features/auth/SesionContext';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { guardarCredencial, probarCredencial } from '@/lib/ia';
import { SelectItem } from '@/components/ui/select';

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

      <Seccion titulo="Catálogo" descripcion="Qué se lista en la tienda.">
        <Catalogo settings={consulta.data} guardado={guardado} />
      </Seccion>

      <Seccion
        titulo="Modo demostración"
        descripcion="Para mostrarle la tienda a alguien sin mandarle correos a nadie."
      >
        <ModoDemo settings={consulta.data} guardado={guardado} />
      </Seccion>

      <Seccion
        titulo="Cuentas de comprador"
        descripcion="Si quien compra puede entrar y ver sus pedidos anteriores."
      >
        <CuentasDeComprador settings={consulta.data} guardado={guardado} />
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
/**
 * El interruptor de las cuentas de comprador.
 *
 * **Prenderlo rompe la tienda si el correo de este comercio no sale**, y por eso
 * pide una confirmación explícita en vez de sólo avisar. El resto de la
 * configuración degrada —un aviso de pedido que no se manda deja el pedido igual
 * creado—; acá no: el código para entrar sale por ese mismo canal, así que sin
 * dominio verificado el login no degrada, no existe (ADR-123).
 *
 * El Admin **no puede comprobarlo solo**: la clave de Resend del proyecto es de
 * sólo envío y su propia API contesta «This API key is restricted to only send
 * emails» a cualquier consulta de dominios. Así que lo que se puede hacer es
 * decir qué hace falta y pedir que alguien afirme que está. Fingir una
 * comprobación que no se hace sería peor que no tenerla.
 */
function CuentasDeComprador({ settings, guardado }: { settings: Settings; guardado: Guardado }) {
  const inicial = cuentasHabilitadas(settings);
  const [cuentas, setCuentas] = useState(inicial);
  const [confirmado, setConfirmado] = useState(false);
  const [listo, setListo] = useState(false);

  // Prender algo que no estaba prendido es lo que pide confirmación. Apagarlo no
  // rompe nada, y volver a guardar algo que ya estaba tampoco.
  const prendiendo = cuentas && !inicial;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (prendiendo && !confirmado) return;
        setListo(false);
        guardado.guardar(
          { accounts: cuentas },
          {
            action: cuentas ? 'customer_accounts.enable' : 'customer_accounts.disable',
            entity: 'store_settings',
            metadata: { accounts: cuentas },
          },
        );
        setListo(true);
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id="cuentas"
          checked={cuentas}
          onCheckedChange={(v) => {
            setCuentas(v === true);
            setConfirmado(false);
          }}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="cuentas" className="cursor-pointer">
            Quien compra puede crear una cuenta
          </Label>
          <p className="text-muted-foreground text-xs">
            Entra con un código que le llega por correo, sin contraseña, y ve sus pedidos anteriores
            —incluidos los que hizo sin cuenta con ese mismo correo— y sus direcciones guardadas.
            Apagado, la tienda vende exactamente igual que ahora.
          </p>
        </div>
      </div>

      {prendiendo && (
        <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
          <p className="text-sm font-medium">Antes de prenderlo</p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
            <li>
              El dominio de esta tienda tiene que estar <strong>verificado en Resend</strong> y
              <code className="mx-1">EMAIL_FROM</code> apuntando a una dirección de ese dominio. El
              código para entrar sale con el remitente de este comercio, no con uno de Pick: sin
              dominio verificado no llega, y sin código no hay forma de entrar.
            </li>
            <li>
              El Worker de la tienda necesita el secreto
              <code className="mx-1">SUPABASE_PUBLISHABLE_KEY</code>. Sin él, las páginas de cuenta
              contestan que el servicio no está disponible; el resto del sitio sigue vendiendo.
            </li>
          </ul>
          <div className="flex items-start gap-3">
            <Checkbox
              id="cuentas-confirmar"
              checked={confirmado}
              onCheckedChange={(v) => setConfirmado(v === true)}
            />
            <Label htmlFor="cuentas-confirmar" className="cursor-pointer text-xs font-normal">
              Ya está el dominio verificado y el correo sale de este comercio.
            </Label>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={guardado.guardando || (prendiendo && !confirmado)}
        >
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
        <Selector
          id="openai-modelo"
          value={modeloActual}
          disabled={trabajando}
          onValueChange={(valor) => {
            setTocado(true);
            setModelo(valor);
          }}
        >
          {MODELOS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.nombre} — {m.nota}
            </SelectItem>
          ))}
        </Selector>
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

      <GastoDeIA tiendaId={tienda.id} />
    </form>
  );
}

/**
 * Lo que la tienda gastó en IA este mes (ADR-132).
 *
 * Existe porque la primera pregunta después de usar la IA fue «cuánto costó», y
 * no había forma de responderla: los dos endpoints devuelven `usage` y se
 * tiraba. Ahora se registra, y acá se ve.
 *
 * El costo es **estimado y lo dice**: cada tipo de llamada tiene su precio por
 * millón de tokens y los modelos de imagen cobran distinto la entrada que la
 * salida, así que este número orienta, no factura. La factura es la de OpenAI.
 */
function GastoDeIA({ tiendaId }: { tiendaId: string }) {
  const consulta = useQuery({
    queryKey: ['gasto-ia', tiendaId],
    queryFn: async () => {
      const mes = new Date();
      mes.setUTCDate(1);
      const { data, error } = await db
        .from('ai_usage')
        .select('tipo, tokens, llamadas')
        .eq('store_id', tiendaId)
        .gte('mes', mes.toISOString().slice(0, 10));
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (consulta.isPending || consulta.isError || consulta.data.length === 0) return null;

  const total = consulta.data.reduce((t, f) => t + Number(f.tokens), 0);

  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border p-4">
      <span className="text-sm font-medium">Este mes</span>
      <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
        {consulta.data
          .slice()
          .sort((a, b) => Number(b.tokens) - Number(a.tokens))
          .map((f) => (
            <li key={f.tipo}>
              {ETIQUETA_DE_GASTO[f.tipo] ?? f.tipo}: {Number(f.tokens).toLocaleString('es')} tokens
              en {f.llamadas} {f.llamadas === 1 ? 'llamada' : 'llamadas'}
            </li>
          ))}
      </ul>
      <span className="text-muted-foreground text-xs">
        {total.toLocaleString('es')} tokens en total. El costo depende del modelo de cada llamada;
        el número exacto está en tu panel de OpenAI.
      </span>
      <span className="text-muted-foreground text-xs">
        La búsqueda tiene un techo propio de {TOPE_MENSUAL_DE_BUSQUEDA.toLocaleString('es')} tokens
        por mes: al llegar, el buscador sigue andando con el camino de siempre.
      </span>
    </div>
  );
}

const ETIQUETA_DE_GASTO: Record<string, string> = {
  ficha: 'Fichas de producto',
  fondo: 'Fondos de fotos',
  embeddings: 'Catálogo para la búsqueda',
  busqueda: 'Búsquedas de visitantes',
};

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
type ModoDeEnvio = 'none' | 'flat' | 'zones';

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
  const mayor = (n: number) => String(toMajorUnits({ amount: n, currency: moneda }));

  const [modo, setModo] = useState<ModoDeEnvio>(inicial.mode);
  const [tarifa, setTarifa] = useState(inicial.mode === 'none' ? '' : mayor(inicial.amount));
  const [desde, setDesde] = useState(inicial.freeFrom === undefined ? '' : mayor(inicial.freeFrom));
  const [zonas, setZonas] = useState<{ name: string; amount: string }[]>(
    (inicial.zones ?? []).map((z) => ({ name: z.name, amount: mayor(z.amount) })),
  );
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  function numero(texto: string): number | null {
    const v = Number(texto.trim().replace(/\./g, ''));
    return texto.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null;
  }

  function cambiarZona(i: number, campo: 'name' | 'amount', valor: string) {
    setZonas((zs) => zs.map((z, j) => (j === i ? { ...z, [campo]: valor } : z)));
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setListo(false);
        setError('');

        if (modo === 'none') {
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
        const base = {
          amount: money(importe, moneda).amount,
          ...(umbral !== null && umbral > 0 ? { freeFrom: money(umbral, moneda).amount } : {}),
        };

        if (modo === 'flat') {
          guardado.guardar({ shipping: { mode: 'flat', ...base } });
          setListo(true);
          return;
        }

        const filas = zonas.map((z) => ({ name: z.name.trim(), amount: numero(z.amount) }));
        if (filas.length === 0) {
          setError('Agregá al menos una zona.');
          return;
        }
        if (filas.some((z) => z.name === '' || z.amount === null)) {
          setError('Cada zona necesita un nombre y una tarifa numérica.');
          return;
        }
        guardado.guardar({
          shipping: {
            mode: 'zones',
            ...base,
            zones: filas.map((z) => ({ name: z.name, amount: money(z.amount!, moneda).amount })),
          },
        });
        setListo(true);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="modo-envio">Cómo se cobra</Label>
        <Selector
          id="modo-envio"
          value={modo}
          onValueChange={(v) => setModo(v as ModoDeEnvio)}
          className="sm:max-w-xs"
        >
          <SelectItem value="none">No se cobra envío</SelectItem>
          <SelectItem value="flat">Tarifa única</SelectItem>
          <SelectItem value="zones">Por zona</SelectItem>
        </Selector>
        <p className="text-muted-foreground text-xs">
          Sin cobrar, el envío es cero: el comercio retira, o lo arregla aparte. Por zona, el
          comprador elige la suya en el checkout y paga la tarifa de esa zona.
        </p>
      </div>

      {modo !== 'none' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tarifa">
              {modo === 'zones' ? `Tarifa para otras zonas (${moneda})` : `Tarifa (${moneda})`}
            </Label>
            <Input
              id="tarifa"
              inputMode="numeric"
              value={tarifa}
              onChange={(e) => setTarifa(e.currentTarget.value)}
              placeholder="35000"
            />
            {modo === 'zones' && (
              <p className="text-muted-foreground text-xs">
                Lo que paga un destino que no está en la tabla. Nunca es gratis por omisión.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="envio-gratis">Gratis desde ({moneda})</Label>
            <Input
              id="envio-gratis"
              inputMode="numeric"
              value={desde}
              onChange={(e) => setDesde(e.currentTarget.value)}
              placeholder="Opcional"
            />
            <p className="text-muted-foreground text-xs">
              Se compara con el total ya descontado. Si lo cargás, la tienda lo anuncia sola.
            </p>
          </div>
        </div>
      )}

      {modo === 'zones' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Zonas</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setZonas((zs) => [...zs, { name: '', amount: tarifa }])}
            >
              Agregar zona
            </Button>
          </div>
          {zonas.length === 0 && (
            <p className="text-muted-foreground text-xs">
              Sin zonas todavía. Cada una lleva su tarifa; la general de arriba cubre las que no
              estén acá.
            </p>
          )}
          {zonas.map((z, i) => (
            <div key={i} className="grid grid-cols-[1fr_9rem_auto] items-center gap-2">
              <Input
                aria-label={`Zona ${i + 1}`}
                value={z.name}
                placeholder="Central"
                onChange={(e) => cambiarZona(i, 'name', e.currentTarget.value)}
              />
              <Input
                aria-label={`Tarifa de la zona ${i + 1}`}
                inputMode="numeric"
                value={z.amount}
                onChange={(e) => cambiarZona(i, 'amount', e.currentTarget.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setZonas((zs) => zs.filter((_, j) => j !== i))}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
      )}

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
function Catalogo({ settings, guardado }: { settings: Settings; guardado: Guardado }) {
  const inicial = configuracionDeCatalogo(settings);
  const [mostrar, setMostrar] = useState(inicial.showOutOfStock);
  const [sinFoto, setSinFoto] = useState(inicial.hideWithoutImage);
  const [listo, setListo] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setListo(false);
        guardado.guardar({ catalog: { showOutOfStock: mostrar, hideWithoutImage: sinFoto } });
        setListo(true);
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id="mostrar-sin-stock"
          checked={mostrar}
          onCheckedChange={(v) => setMostrar(v === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="mostrar-sin-stock" className="cursor-pointer">
            Mostrar los productos sin stock
          </Label>
          <p className="text-muted-foreground text-xs">
            Apagado, un producto con todas sus variantes en cero no aparece en el catálogo, la
            búsqueda ni la portada. Su página sigue existiendo, con «Sin stock» a la vista.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="ocultar-sin-foto"
          checked={sinFoto}
          onCheckedChange={(v) => setSinFoto(v === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="ocultar-sin-foto" className="cursor-pointer">
            Ocultar los productos sin foto
          </Label>
          <p className="text-muted-foreground text-xs">
            Un producto sin ninguna imagen no aparece en el catálogo, la búsqueda ni la portada
            hasta que se le cargue una. Su página sigue existiendo.
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
