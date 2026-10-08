import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { repositorioAnalytics, repositorioDashboard } from '@pick/adapter-supabase';
import {
  ETIQUETA_PERIODO,
  diasDelRango,
  problemaDelRango,
  rangoDePeriodo,
  rangoPropio,
  type PasoDelEmbudo,
  type Periodo,
} from '@pick/commerce-core';
import { ChevronDownIcon } from '@/components/iconos';
import {
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { ResumenConIA } from './ResumenConIA';
import { VentasPorProducto } from './VentasPorProducto';

const PERIODOS: readonly Periodo[] = ['hoy', '7d', '30d'];

const CORTO: Readonly<Record<Periodo, string>> = { hoy: 'Hoy', '7d': '7 días', '30d': '30 días' };

/**
 * El margen para no avisar por nada.
 *
 * El primer evento del período nunca cae exactamente en su borde: con tráfico
 * continuo hay unos segundos de diferencia, y sin margen la advertencia saldría
 * siempre.
 */
const UN_MINUTO = 60_000;

/** `YYYY-MM-DD` en la hora local: lo que entiende un `<input type="date">`. */
function diaLocal(fecha: Date): string {
  const d = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${d(fecha.getMonth() + 1)}-${d(fecha.getDate())}`;
}

function fechaCorta(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

/** Una tasa en tanto por uno, como porcentaje legible. */
function porcentaje(tasa: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(tasa);
}

/**
 * Cuánta gente miró, como lo dibuja el handoff (ADR-143, ADR-153).
 *
 * Aparte del Inicio a propósito, y la línea que las separa es la de ADR-067:
 * **el Inicio responde «cuánto vendí» y sale de los pedidos; esto responde
 * «cuánta gente miró» y sale de los eventos**. Son dos fuentes con confiabilidad
 * distinta, y mezclarlas en una pantalla invita a leer una tasa como si fuera
 * facturación.
 *
 * La conversión es la excepción y por eso está acá: su numerador son los pedidos
 * —los mismos que informa el Inicio, sin los cancelados— y su denominador las
 * sesiones. Coincide con la facturación por construcción.
 */
export function Analytics() {
  const tienda = useTiendaActiva();
  const [periodo, setPeriodo] = useState<Periodo | 'propio'>('30d');
  const [propio, setPropio] = useState<{ desde: string; hasta: string } | null>(null);
  const [eligiendo, setEligiendo] = useState(false);

  /*
   * El rango y la clave de caché. Sin memoizar, cada render daría un rango
   * distinto —el extremo de arriba es «ahora»— y la consulta no pararía de
   * repetirse. La clave de un rango propio son sus dos fechas.
   */
  const { rango, clave } = useMemo(() => {
    if (periodo === 'propio' && propio) {
      return {
        rango: rangoPropio(propio.desde, propio.hasta),
        clave: `${propio.desde}_${propio.hasta}`,
      };
    }
    const p = periodo === 'propio' ? '30d' : periodo;
    return { rango: rangoDePeriodo(p, new Date()), clave: p };
  }, [periodo, propio]);

  const consulta = useQuery({
    queryKey: ['analytics', tienda.id, clave],
    queryFn: () => repositorioAnalytics(db).resumen(tienda.id, rango.from, rango.to),
    placeholderData: keepPreviousData,
  });

  const datos = consulta.data;

  /*
   * Lo que se vendió en el mismo período, con la misma clave que el Inicio: si
   * ya se abrió, esto no pide nada. Lo usan el resumen en palabras y las ventas
   * por producto, que llegaron acá desde el viejo Resumen (ADR-145).
   */
  const ventas = useQuery({
    queryKey: ['dashboard', tienda.id, clave],
    queryFn: () => repositorioDashboard(db).resumen(tienda.id, rango.from, rango.to),
    placeholderData: keepPreviousData,
  });

  /*
   * Si el período empezó antes de que hubiera medición.
   *
   * Pasa siempre los primeros treinta días: `orders` viene de la Fase 5 y está
   * lleno, `store_events` empieza el día que se activa esto. Sin decirlo, el
   * panel mostraría seis pedidos sobre una sesión y llamaría a eso 600 % de
   * conversión.
   */
  const parcial =
    datos?.medidoDesde != null &&
    new Date(datos.medidoDesde).getTime() > new Date(rango.from).getTime() + UN_MINUTO;

  const etiquetaPropia =
    propio &&
    `${new Date(`${propio.desde}T12:00`).toLocaleDateString(tienda.locale, { day: 'numeric', month: 'short' })} – ${new Date(`${propio.hasta}T12:00`).toLocaleDateString(tienda.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <PaginaAdmin
      titulo="Analytics"
      descripcion="Cuánta gente miró, qué buscó y dónde se fue."
      acciones={
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Período"
            className="flex gap-0.5 rounded-[9px] bg-[#f1f2f5] p-[3px]"
          >
            {PERIODOS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={periodo === p}
                title={ETIQUETA_PERIODO[p]}
                onClick={() => setPeriodo(p)}
                className={cn(
                  'h-[30px] cursor-pointer rounded-[7px] px-3 text-[13px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-[#e4e9fc]',
                  periodo === p
                    ? 'text-foreground bg-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                    : 'text-ink-3 hover:text-foreground',
                )}
              >
                {CORTO[p]}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            aria-pressed={periodo === 'propio'}
            onClick={() => setEligiendo(true)}
            className={cn(periodo === 'propio' && 'border-[#3b5bdb] text-[#2b47bd]')}
          >
            {periodo === 'propio' && etiquetaPropia ? etiquetaPropia : 'Elegir fechas'}
            <ChevronDownIcon />
          </Button>
        </div>
      }
    >
      <ElegirFechas
        abierto={eligiendo}
        inicial={propio}
        onCerrar={() => setEligiendo(false)}
        onAplicar={(r) => {
          setPropio(r);
          setPeriodo('propio');
          setEligiendo(false);
        }}
      />

      {consulta.isError ? (
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar el resumen de navegación"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      ) : consulta.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-muted h-28 animate-pulse rounded-[14px]" />
          ))}
        </div>
      ) : datos && datos.sesiones === 0 ? (
        <Tarjeta sinRelleno>
          <EstadoVacio titulo="Todavía no hay visitas en este período">
            Los eventos se registran desde el propio servidor de la tienda, así que aparecen solos
            en cuanto alguien entre. Si acabás de desplegar, probá con un período más largo.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        datos && (
          <>
            <div
              className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
              aria-busy={consulta.isFetching ? 'true' : undefined}
            >
              <Metrica
                titulo="Sesiones"
                valor={datos.sesiones.toLocaleString(tienda.locale)}
                nota="Media hora de inactividad cierra una"
              />
              <Metrica
                titulo="Páginas vistas"
                valor={datos.vistas.toLocaleString(tienda.locale)}
                nota={`${(datos.vistas / Math.max(1, datos.sesiones)).toLocaleString(tienda.locale, { maximumFractionDigits: 1 })} por sesión`}
              />
              <Metrica
                titulo="Productos vistos"
                valor={datos.vistasDeProducto.toLocaleString(tienda.locale)}
              />
              <Tarjeta className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Anillo tasa={datos.convirtieron.tasa} locale={tienda.locale} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-ink-3 text-[13px] font-medium">Conversión</span>
                  <span className="text-ink-3 text-[12.5px]">
                    Sesiones que terminaron en un pedido
                  </span>
                </div>
              </Tarjeta>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <Tarjeta sinRelleno>
                <TituloDeTarjeta>El embudo</TituloDeTarjeta>
                <p className="text-ink-3 -mt-2 px-5 pb-2 text-[12.5px]">
                  Sobre el total de sesiones
                </p>
                <ol className="flex flex-col gap-4 px-5 pb-5">
                  <Escalon
                    etiqueta="Agregaron al carrito"
                    paso={datos.agregaronAlCarrito}
                    locale={tienda.locale}
                  />
                  <Escalon
                    etiqueta="Empezaron el checkout"
                    paso={datos.empezaronElCheckout}
                    anterior={datos.agregaronAlCarrito}
                    locale={tienda.locale}
                  />
                  <Escalon
                    etiqueta="Compraron"
                    paso={datos.convirtieron}
                    anterior={datos.empezaronElCheckout}
                    locale={tienda.locale}
                  />
                </ol>
                <p className="text-ink-3 border-t border-[#f0f1f4] px-5 py-3 text-[12.5px]">
                  {parcial
                    ? `Se mide desde el ${fechaCorta(datos.medidoDesde!, tienda.locale)}: antes de eso no había registro de visitas, y comparar pedidos viejos contra sesiones nuevas daría una tasa imposible.`
                    : '«Compraron» sale de los pedidos sin los cancelados: es el mismo número que el Inicio.'}
                </p>
              </Tarjeta>

              <Tarjeta className="flex flex-col gap-2">
                <span className="text-ink-3 text-[13px] font-medium">Abandonaron el checkout</span>
                <span className="text-[26px] leading-8 font-semibold tabular-nums">
                  {datos.abandonaron.toLocaleString(tienda.locale)}
                </span>
                <span className="text-ink-3 text-[13px]">
                  Llegaron a confirmar el pedido y no lo terminaron.
                </span>
                {/*
                  El handoff ofrece recuperarlos. Para eso hace falta el contacto,
                  y hoy el checkout lo guarda recién al confirmar: llega con el
                  checkout por pasos de la Fase 6.
                */}
                <span className="text-ink-faint text-[12.5px]">
                  Recuperarlos por correo o WhatsApp llega con el checkout nuevo.
                </span>
              </Tarjeta>
            </div>

            <Tarjeta sinRelleno>
              <TituloDeTarjeta>Qué buscaron</TituloDeTarjeta>
              <p className="text-ink-3 -mt-2 px-5 pb-3 text-[12.5px]">
                En rojo: lo que la gente pide y la tienda no tiene.
              </p>
              {datos.terminos.length === 0 ? (
                <p className="text-ink-3 px-5 pb-6 text-sm">
                  Nadie usó el buscador en este período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Término</TableHead>
                        <TableHead className="text-right">Búsquedas</TableHead>
                        <TableHead className="text-right">Sin resultados</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datos.terminos.map((t) => (
                        <TableRow key={t.termino}>
                          <TableCell className="font-medium">{t.termino}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.busquedas}</TableCell>
                          {/*
                            Un término buscado y sin resultados es un producto que
                            la gente pide y la tienda no tiene. Es el hallazgo que
                            justifica medir las búsquedas, así que se marca.
                          */}
                          <TableCell className="text-right">
                            {t.sinResultados > 0 ? (
                              <span className="inline-flex h-5 items-center rounded-full bg-[#fdeceb] px-2 text-[12px] font-semibold text-[#bf3324] tabular-nums">
                                {t.sinResultados}
                              </span>
                            ) : (
                              <span className="text-ink-faint tabular-nums">0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Tarjeta>

            {/*
              Qué NO mide, dicho acá y no en un comentario del código.
              Un panel que no declara sus huecos invita a cuadrar contra otra
              herramienta y no entender por qué no da.
            */}
            <p className="text-ink-3 text-xs">
              No se cuentan los robots, las precargas del navegador ni las páginas que no existen:
              un escáner que pide <code>/wp-admin</code> recibe un error, no una página, y ya no
              aparece acá. Lo que todavía no se puede separar es un bot que pide la portada con
              nombre de navegador y recibe una página de verdad: se ve igual que alguien que entra y
              se va.
            </p>
          </>
        )
      )}

      {/*
        Lo que se vendió va aparte de la navegación y aunque no haya visitas
        medidas: sale de los pedidos, que existen desde la Fase 5 (ADR-067).
      */}
      <section className="flex flex-col gap-4" aria-labelledby="lo-que-se-vendio">
        <h2 id="lo-que-se-vendio" className="text-[17px] font-semibold">
          Lo que se vendió
        </h2>
        {ventas.data && <ResumenConIA rango={rango} clave={clave} ventas={ventas.data} />}
        <VentasPorProducto rango={rango} clave={clave} />
      </section>
    </PaginaAdmin>
  );
}

function Metrica({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <Tarjeta className="flex flex-col gap-1">
      <p className="text-ink-3 text-[13px] font-medium">{titulo}</p>
      <p className="text-[26px] leading-8 font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-ink-3 text-[12.5px]">{nota}</p>}
    </Tarjeta>
  );
}

/** La conversión en un anillo: un gradiente cónico alcanza, sin librería. */
function Anillo({ tasa, locale }: { tasa: number; locale: string }) {
  // Hasta 5 %, que es mucho para una tienda: más allá el anillo queda lleno.
  const grados = Math.round(Math.min(1, tasa / 0.05) * 360);
  return (
    <span
      className="relative flex size-[72px] shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(#3b5bdb ${grados}deg, #eceef2 0deg)` }}
    >
      <span className="bg-card absolute inset-[7px] rounded-full" />
      <span className="relative text-[15px] font-semibold tabular-nums">
        {porcentaje(tasa, locale)}
      </span>
    </span>
  );
}

/**
 * Un escalón del embudo, con su barra y lo que se perdió desde el anterior.
 *
 * La barra no es decoración: el embudo se lee por la **forma**, y tres números
 * en columna obligan a dividirlos mentalmente para ver dónde se cae la gente.
 */
function Escalon({
  etiqueta,
  paso,
  anterior,
  locale,
}: {
  etiqueta: string;
  paso: PasoDelEmbudo;
  anterior?: PasoDelEmbudo;
  locale: string;
}) {
  const caida =
    anterior && anterior.sesiones > 0 ? 1 - paso.sesiones / anterior.sesiones : undefined;
  return (
    <li className="flex items-center gap-4">
      <span className="flex h-11 w-20 shrink-0 items-center justify-center rounded-[10px] bg-[#edf1fe] text-[17px] font-semibold text-[#2b47bd] tabular-nums">
        {paso.sesiones.toLocaleString(locale)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-medium">{etiqueta}</span>
          <span className="text-ink-3 text-[12.5px] tabular-nums">
            {porcentaje(paso.tasa, locale)} de las sesiones
            {caida !== undefined && caida > 0 && (
              <span className="text-[#bf3324]"> · se fue el {porcentaje(caida, locale)}</span>
            )}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#eceef2]">
          <div
            className="h-full rounded-full bg-[#3b5bdb]"
            style={{ width: `${Math.min(paso.tasa * 100, 100)}%` }}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * Un rango de fechas propio. Las fechas se escriben con el selector del sistema
 * —el del teléfono incluido— y se validan antes de aplicar: un rango al revés o
 * de tres años no llega a la base.
 */
function ElegirFechas({
  abierto,
  inicial,
  onCerrar,
  onAplicar,
}: {
  abierto: boolean;
  inicial: { desde: string; hasta: string } | null;
  onCerrar: () => void;
  onAplicar: (r: { desde: string; hasta: string }) => void;
}) {
  /*
   * El contenido se desmonta al cerrar, y con él lo que se tipeó: cada vez que
   * se abre arranca del rango aplicado, no de lo que se escribió y se canceló.
   */
  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Elegir fechas</DialogTitle>
        </DialogHeader>
        <FechasDelRango inicial={inicial} onCerrar={onCerrar} onAplicar={onAplicar} />
      </DialogContent>
    </Dialog>
  );
}

function FechasDelRango({
  inicial,
  onCerrar,
  onAplicar,
}: {
  inicial: { desde: string; hasta: string } | null;
  onCerrar: () => void;
  onAplicar: (r: { desde: string; hasta: string }) => void;
}) {
  const ahora = new Date();
  const hoy = diaLocal(ahora);
  const [desde, setDesde] = useState(inicial?.desde ?? '');
  const [hasta, setHasta] = useState(inicial?.hasta ?? hoy);
  const problema = problemaDelRango(desde, hasta, hoy);
  const dias = problema ? 0 : diasDelRango(desde, hasta);

  const atajos: readonly { etiqueta: string; desde: string; hasta: string }[] = [
    {
      etiqueta: 'Este mes',
      desde: diaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 1)),
      hasta: hoy,
    },
    {
      etiqueta: 'El mes pasado',
      desde: diaLocal(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)),
      hasta: diaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 0)),
    },
    {
      etiqueta: 'Últimos 90 días',
      desde: diaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 89)),
      hasta: hoy,
    },
    {
      etiqueta: 'Este año',
      desde: diaLocal(new Date(ahora.getFullYear(), 0, 1)),
      hasta: hoy,
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {atajos.map((a) => (
            <Button
              key={a.etiqueta}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDesde(a.desde);
                setHasta(a.hasta);
              }}
            >
              {a.etiqueta}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-medium">Desde</span>
            <Input
              type="date"
              value={desde}
              max={hoy}
              onChange={(e) => setDesde(e.currentTarget.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-medium">Hasta</span>
            <Input
              type="date"
              value={hasta}
              max={hoy}
              onChange={(e) => setHasta(e.currentTarget.value)}
            />
          </label>
        </div>
        <p
          aria-live="polite"
          className={cn(
            'text-[13px]',
            problema && desde && hasta ? 'text-destructive' : 'text-ink-3',
          )}
        >
          {problema ?? `${dias} ${dias === 1 ? 'día' : 'días'}`}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button
          type="button"
          className="ml-auto"
          disabled={problema !== null}
          onClick={() => onAplicar({ desde, hasta })}
        >
          Aplicar
        </Button>
      </DialogFooter>
    </>
  );
}
