import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioAnalytics } from '@pick/adapter-supabase';
import type { NegocioParaResumir, Periodo, ResumenDelPeriodo } from '@pick/commerce-core';
import { SparklesIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import { Tarjeta, TituloDeTarjeta } from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { ErrorDeIA, resumirNegocio } from '@/lib/ia';
import { db } from '@/lib/supabase';

/** Cuántos productos y cuántas búsquedas fallidas se le cuentan al modelo. */
const CUANTOS = 5;

/**
 * El período contado en palabras (ADR-138).
 *
 * Lo que aporta sobre las tarjetas de al lado no es el dato, que ya está: es
 * **cuál de todos importa**. Un comercio mira diez números y no sabe por dónde
 * empezar; esto dice «vendiste X, el embudo se cae en el checkout, y hay una
 * búsqueda sin resultados que se repite».
 *
 * Tres cosas que lo hacen confiable, y sin las cuales no valdría tenerlo:
 *
 * - **Los números los calcula el Admin y viajan hechos.** El modelo redacta, no
 *   suma. Así el párrafo no puede contradecir a la tabla que está debajo.
 * - Cruza las dos fuentes —pedidos y eventos— a propósito, que es lo que ADR-067
 *   separa en dos pantallas. Se puede porque **no inventa la relación**: recibe la
 *   conversión ya calculada, con el numerador de `orders`, como la calcula ADR-099.
 * - Se pide a mano y cada pedido gasta la clave del comercio, así que pide
 *   `settings.write` como todo lo que gasta.
 */
export function ResumenConIA({
  rango,
  periodo,
  ventas,
}: {
  rango: { from: string; to: string };
  periodo: Periodo;
  ventas: ResumenDelPeriodo;
}) {
  const tienda = useTiendaActiva();
  const puede = usePuede();

  /*
   * La navegación del mismo período. Es la consulta de la pantalla de Analytics,
   * con la misma clave: si ya se abrió, esto no pide nada.
   */
  const navegacion = useQuery({
    queryKey: ['analytics', tienda.id, periodo],
    queryFn: () => repositorioAnalytics(db).resumen(tienda.id, rango.from, rango.to),
  });

  const resumen = useMutation({
    mutationFn: () => {
      const nav = navegacion.data;
      if (!nav) throw new Error('Todavía no se leyeron las visitas del período.');

      const negocio: NegocioParaResumir = {
        tienda: tienda.name,
        desde: rango.from,
        hasta: rango.to,
        moneda: tienda.currency,
        ventas: ventas.sales.amount,
        pedidos: ventas.orderCount,
        ticket: ventas.aov.amount,
        unidades: ventas.units,
        // Ausente y no cero: un margen sin costo cargado es «no sé» (ADR-101).
        ...(ventas.margin ? { margen: ventas.margin.amount } : {}),
        coberturaDelMargen: ventas.marginCoverage,
        sesiones: nav.sesiones,
        agregaronAlCarrito: nav.agregaronAlCarrito.tasa,
        empezaronElCheckout: nav.empezaronElCheckout.tasa,
        conversion: nav.convirtieron.tasa,
        abandonaron: nav.abandonaron,
        ...(nav.medidoDesde ? { medidoDesde: nav.medidoDesde } : {}),
        topProductos: ventas.topProducts.slice(0, CUANTOS).map((p) => ({
          titulo: p.variantTitle ? `${p.title} (${p.variantTitle})` : p.title,
          unidades: p.quantity,
          ingresos: p.revenue.amount,
        })),
        // Sólo las que fallaron: un término que encuentra productos no es un
        // hallazgo, y llenaría el pedido de ruido.
        sinResultados: nav.terminos
          .filter((t) => t.sinResultados > 0)
          .slice(0, CUANTOS)
          .map((t) => ({ termino: t.termino, busquedas: t.sinResultados })),
      };

      return resumirNegocio(tienda.id, negocio);
    },
  });

  if (!puede('settings.write')) return null;

  const error = resumen.error as ErrorDeIA | Error | null;
  const codigo = error instanceof ErrorDeIA ? error.codigo : undefined;

  return (
    <Tarjeta sinRelleno>
      <TituloDeTarjeta
        accion={
          <Button
            variant="outline"
            size="sm"
            disabled={resumen.isPending || navegacion.isPending}
            onClick={() => resumen.mutate()}
          >
            <SparklesIcon aria-hidden="true" />
            {resumen.isPending ? 'Escribiendo…' : resumen.data ? 'Volver a escribir' : 'Resumir'}
          </Button>
        }
      >
        Qué pasó, en palabras
      </TituloDeTarjeta>

      <div className="flex flex-col gap-3 p-4">
        {codigo === 'sin_credencial' ? (
          <p className="text-muted-foreground text-sm" role="alert">
            Esta tienda todavía no tiene una clave de OpenAI.{' '}
            <Link to="/configuracion" className="underline underline-offset-4">
              Cargala en Configuración
            </Link>{' '}
            para que el Admin pueda escribir el resumen.
          </p>
        ) : (
          error && (
            <p className="text-destructive text-sm" role="alert">
              {error.message}
            </p>
          )
        )}

        {resumen.data ? (
          <p className="text-sm leading-relaxed" role="status">
            {resumen.data.resumen}
          </p>
        ) : (
          !error && (
            <p className="text-muted-foreground text-sm">
              Lee los números de esta pantalla y las visitas del mismo período, y dice cuál importa.
              No calcula nada: los números son estos, así que el resumen no puede decir otra cosa.
              Usa la clave de OpenAI de la tienda.
            </p>
          )
        )}
      </div>
    </Tarjeta>
  );
}
