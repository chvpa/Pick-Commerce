import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { repositorioAnalytics } from '@pick/adapter-supabase';
import {
  ETIQUETA_PERIODO,
  rangoDePeriodo,
  type PasoDelEmbudo,
  type Periodo,
} from '@pick/commerce-core';
import { ChartNoAxesColumnIcon } from 'lucide-react';
import {
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  SELECT,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
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

const PERIODOS: readonly Periodo[] = ['hoy', '7d', '30d'];

/**
 * El margen para no avisar por nada.
 *
 * El primer evento del período nunca cae exactamente en su borde: con tráfico
 * continuo hay unos segundos de diferencia, y sin margen la advertencia saldría
 * siempre.
 */
const UN_MINUTO = 60_000;

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

function Metrica({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <Tarjeta>
      <p className="text-muted-foreground text-sm">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-muted-foreground mt-1 text-xs">{nota}</p>}
    </Tarjeta>
  );
}

/**
 * Un escalón del embudo, con su barra.
 *
 * La barra no es decoración: el embudo se lee por la **forma**, y tres números
 * en columna obligan a dividirlos mentalmente para ver dónde se cae la gente.
 */
function Escalon({
  etiqueta,
  paso,
  locale,
  nota,
}: {
  etiqueta: string;
  paso: PasoDelEmbudo;
  locale: string;
  nota?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{etiqueta}</span>
        <span className="text-sm tabular-nums">
          {paso.sesiones}
          <span className="text-muted-foreground"> · {porcentaje(paso.tasa, locale)}</span>
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${Math.min(paso.tasa * 100, 100)}%` }}
        />
      </div>
      {nota && <p className="text-muted-foreground text-xs">{nota}</p>}
    </div>
  );
}

/**
 * Cuánta gente miró.
 *
 * Aparte del Resumen a propósito, y la línea que las separa es la de ADR-067:
 * **Resumen responde «cuánto vendí» y sale de los pedidos; esto responde «cuánta
 * gente miró» y sale de los eventos**. Son dos fuentes con confiabilidad
 * distinta, y mezclarlas en una pantalla invita a leer una tasa como si fuera
 * facturación.
 *
 * La conversión es la excepción y por eso está acá: su numerador son los pedidos
 * —los mismos que informa el Resumen, sin los cancelados— y su denominador las
 * sesiones. Coincide con la facturación por construcción.
 */
export function Analytics() {
  const tienda = useTiendaActiva();
  const [periodo, setPeriodo] = useState<Periodo>('30d');

  // Igual que el Resumen: sin memoizar, cada render daría una clave distinta y la
  // consulta no pararía de repetirse.
  const rango = useMemo(() => rangoDePeriodo(periodo, new Date()), [periodo]);

  const consulta = useQuery({
    queryKey: ['analytics', tienda.id, periodo],
    queryFn: () => repositorioAnalytics(db).resumen(tienda.id, rango.from, rango.to),
    placeholderData: keepPreviousData,
  });

  const datos = consulta.data;

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

  return (
    <PaginaAdmin
      titulo="Analytics"
      icono={ChartNoAxesColumnIcon}
      descripcion="Cuánta gente miró, qué buscó y dónde se fue. Sale de la navegación, no de los pedidos."
      acciones={
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.currentTarget.value as Periodo)}
          className={SELECT}
          aria-label="Período"
        >
          {PERIODOS.map((p) => (
            <option key={p} value={p}>
              {ETIQUETA_PERIODO[p]}
            </option>
          ))}
        </select>
      }
    >
      {consulta.isError ? (
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar el resumen de navegación"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      ) : consulta.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
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
              className="grid gap-4 sm:grid-cols-3"
              aria-busy={consulta.isFetching ? 'true' : undefined}
            >
              <Metrica
                titulo="Sesiones"
                valor={String(datos.sesiones)}
                nota="Media hora de inactividad cierra una"
              />
              <Metrica titulo="Páginas vistas" valor={String(datos.vistas)} />
              <Metrica titulo="Productos vistos" valor={String(datos.vistasDeProducto)} />
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
              <Tarjeta sinRelleno>
                <TituloDeTarjeta>El embudo</TituloDeTarjeta>
                <div className="flex flex-col gap-4 p-4">
                  <Escalon
                    etiqueta="Agregaron al carrito"
                    paso={datos.agregaronAlCarrito}
                    locale={tienda.locale}
                  />
                  <Escalon
                    etiqueta="Empezaron el checkout"
                    paso={datos.empezaronElCheckout}
                    locale={tienda.locale}
                  />
                  <Escalon
                    etiqueta="Compraron"
                    paso={datos.convirtieron}
                    locale={tienda.locale}
                    nota={
                      parcial
                        ? `Se mide desde el ${fechaCorta(datos.medidoDesde!, tienda.locale)}: antes de eso no había registro de visitas, y comparar pedidos viejos contra sesiones nuevas daría una tasa imposible.`
                        : 'Sale de los pedidos, sin los cancelados: es el mismo número que el Resumen.'
                    }
                  />
                </div>
              </Tarjeta>

              <Tarjeta>
                <p className="text-muted-foreground text-sm">Abandonaron el checkout</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{datos.abandonaron}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Llegaron a confirmar el pedido y no lo terminaron.
                </p>
              </Tarjeta>
            </div>

            <Tarjeta sinRelleno>
              <TituloDeTarjeta>Qué buscaron</TituloDeTarjeta>
              {datos.terminos.length === 0 ? (
                <p className="text-muted-foreground px-4 py-6 text-sm">
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
                            Un término muy buscado y siempre sin resultados es un
                            producto que la gente pide y la tienda no tiene. Es el
                            hallazgo que justifica medir las búsquedas, así que se
                            marca en vez de dejarlo en una columna más.
                          */}
                          <TableCell
                            className={`text-right tabular-nums ${
                              t.sinResultados > 0 ? 'text-destructive font-medium' : ''
                            }`}
                          >
                            {t.sinResultados}
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
            <p className="text-muted-foreground text-xs">
              No se cuentan los robots ni las precargas del navegador. Las páginas de Políticas y
              Preguntas frecuentes se sirven sin pasar por el servidor, así que sus vistas tampoco
              entran.
            </p>
          </>
        )
      )}
    </PaginaAdmin>
  );
}
