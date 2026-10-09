import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { historialDe } from '@pick/adapter-supabase';
import { cambiosLegibles, queHizo, type EntradaDeActividad } from '@pick/commerce-core';
import { ArrowRightIcon, HourglassIcon, LockIcon } from '@/components/iconos';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { usePuede } from '@/features/auth/usePuede';
import { haceCuanto } from '@/features/dashboard/tareas';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

/** Quien hizo un cambio y ya no tiene usuario: la fila queda, el nombre no. */
const SIN_NOMBRE = 'Alguien que ya no está';

/**
 * «Creado por · Modificado por · Última modificación» y su historia, en el
 * pedido y en el producto (ADR-159).
 *
 * La creación de un pedido la hace quien compra, en la tienda: no pasa por el
 * registro, que anota a las personas del comercio, así que la dice la pantalla
 * con lo que el pedido ya sabe. Un producto creado antes del registro, o por un
 * importador, no tiene autor que mostrar, y no se inventa.
 */
export function Franja({
  subjectId,
  creacion,
}: {
  subjectId: string;
  /** Cuando quien creó no es del equipo: el comprador de un pedido. */
  creacion?: { readonly por: string; readonly cuando: string };
}) {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const consulta = useQuery({
    queryKey: ['actividad', tienda.id, subjectId],
    queryFn: () => historialDe(db, tienda.id, subjectId),
  });

  if (consulta.isPending) return <div className="bg-muted -mt-3 h-4 w-72 animate-pulse rounded" />;
  if (consulta.isError) {
    return (
      <p className="text-ink-3 -mt-3 text-[13px]">
        No se pudo leer quién lo modificó.{' '}
        <button
          type="button"
          onClick={() => void consulta.refetch()}
          className="text-link cursor-pointer underline-offset-4 hover:underline"
        >
          Reintentar
        </button>
      </p>
    );
  }

  const { items, total } = consulta.data;
  const ahora = new Date();
  const hace = (iso: string) => haceCuanto(iso, ahora, tienda.locale);
  const quien = (e: EntradaDeActividad) => e.actor ?? SIN_NOMBRE;

  const alta = items.find(
    (e) => e.action === 'insert' && (e.entity === 'orders' || e.entity === 'products'),
  );
  const cambios = items.filter((e) => e !== alta);
  const modificaron = [...new Set(cambios.map(quien))];
  const ultimo = cambios[0];

  const creado = creacion ?? (alta ? { por: quien(alta), cuando: alta.at } : undefined);
  if (!creado && cambios.length === 0) return null;

  return (
    <div className="text-ink-3 -mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] print:hidden">
      {creado && (
        <span>
          Creado por <strong className="text-ink-2 font-medium">{creado.por}</strong> ·{' '}
          {hace(creado.cuando)}
        </span>
      )}
      {modificaron.length > 0 && (
        <span>
          Modificado por{' '}
          <strong className="text-ink-2 font-medium">{modificaron.join(', ')}</strong>
        </span>
      )}
      {ultimo && <span>Última modificación · {hace(ultimo.at)}</span>}
      {total > 0 && (
        <Dialog>
          <DialogTrigger className="text-link hover:text-link-hover focus-visible:ring-focus-tint flex cursor-pointer items-center gap-1 rounded font-medium outline-none focus-visible:ring-3">
            <HourglassIcon className="size-3.5" />
            Ver cambios ({total})
          </DialogTrigger>
          <DialogContent className="max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Historial de cambios</DialogTitle>
            </DialogHeader>
            <ul aria-label="Cambios" className="flex flex-col">
              {items.map((e) => (
                <li
                  key={e.id}
                  className="border-line-row flex gap-3 border-b px-5 py-3 last:border-b-0"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#edf1fe] text-[12.5px] font-semibold text-[#2b47bd]">
                    {quien(e).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13.5px]">
                    <span>
                      <strong className="font-semibold">{quien(e)}</strong> {queHizo(e)}
                      {e.sensitive && (
                        <Badge variant="red" className="ml-2 align-middle">
                          Sensible
                        </Badge>
                      )}
                    </span>
                    {cambiosLegibles(e, tienda).map((c) => (
                      <span
                        key={c.campo}
                        className="text-ink-3 flex flex-wrap items-center gap-1.5 text-[12.5px]"
                      >
                        {c.campo}:{' '}
                        <span className="line-through decoration-[#c8cdd7]">{c.antes}</span>
                        <ArrowRightIcon className="size-3" aria-label="pasó a" />
                        <span className="text-foreground">{c.despues}</span>
                      </span>
                    ))}
                    <span className="text-ink-faint text-[12px]">
                      {new Date(e.at).toLocaleString(tienda.locale, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-ink-3 flex items-center gap-1.5 border-t border-[#f0f1f4] px-5 py-3 text-[12.5px]">
              <LockIcon className="size-3.5" />
              Nadie puede editar ni borrar este registro.
              {total > items.length && ` Se ven los últimos ${items.length} de ${total}.`}
              {puede('member.manage') && (
                <Link
                  to="/configuracion/$seccion"
                  params={{ seccion: 'actividad' }}
                  className="text-link hover:text-link-hover ml-auto font-medium"
                >
                  Ver toda la actividad
                </Link>
              )}
            </p>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
