import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { repositorioAdminCatalogo } from '@pick/adapter-supabase';
import {
  ESTADOS_DE_RESENA,
  type EstadoDeResena,
  type ResenaAdmin,
  type ResumenDeResenas,
} from '@pick/commerce-core';
import { useAvisar } from '@/components/aviso';
import { CheckCircleIcon, ArchiveIcon, ReturnIcon } from '@/components/iconos';
import {
  BarraDeSeleccion,
  BotonDeLote,
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Paginacion,
  Pestanas,
  Tarjeta,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const POR_PAGINA = 20;

const ETIQUETA: Record<EstadoDeResena, string> = {
  pending: 'Esperando revisión',
  published: 'Publicadas',
  rejected: 'Rechazadas',
};

function Estrellas({ valor, className }: { valor: number; className?: string }) {
  return (
    <span
      className={cn('tracking-[1px] whitespace-nowrap', className)}
      aria-label={`${valor} de 5`}
    >
      <span aria-hidden="true" className="text-[#e8930c]">
        {'★'.repeat(Math.round(valor))}
      </span>
      <span aria-hidden="true" className="text-[#dfe2e8]">
        {'★'.repeat(5 - Math.round(valor))}
      </span>
    </span>
  );
}

/**
 * Moderar reseñas, como lo dibuja el handoff (ADR-140, ADR-151).
 *
 * La pantalla hace **dos** cosas y ninguna más: publicar y rechazar. No hay forma
 * de editar el texto ni la estrella, y no es que falte el campo: la base no
 * concede `update` sobre la tabla, así que el único camino es
 * `admin_moderate_reviews`, que sólo toca el estado. Poder corregir una reseña es
 * poder escribirla, y ahí deja de ser una reseña.
 *
 * Arriba, la nota de la tienda: el promedio y cuántas hay de cada estrella, de lo
 * publicado, que es lo que ve quien compra. Las pestañas arrancan en «esperando
 * revisión», que es lo único que pide una acción.
 */
export function Resenas() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const cliente = useQueryClient();
  const avisar = useAvisar();
  const { tab } = useSearch({ from: '/productos/resenas' });
  const estado: EstadoDeResena = tab ?? 'pending';

  const [pagina, setPagina] = useState(1);
  const [marcadas, setMarcadas] = useState<readonly string[]>([]);

  // Otra pestaña: la página y lo marcado eran de la lista anterior.
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    setPagina(1);
    setMarcadas([]);
  }

  const repo = repositorioAdminCatalogo(db);

  const consulta = useQuery({
    queryKey: ['resenas', tienda.id, estado, pagina],
    queryFn: () => repo.resenas(tienda.id, estado, pagina, POR_PAGINA),
    placeholderData: keepPreviousData,
  });

  const moderar = useMutation({
    mutationFn: ({ ids, a }: { ids: readonly string[]; a: EstadoDeResena }) =>
      repo.moderarResenas(tienda.id, ids, a),
    onSuccess: async (_, { ids, a }) => {
      setMarcadas([]);
      const n = ids.length;
      avisar(
        a === 'published'
          ? n === 1
            ? 'Reseña publicada'
            : `${n} reseñas publicadas`
          : a === 'rejected'
            ? n === 1
              ? 'Reseña rechazada'
              : `${n} reseñas rechazadas`
            : n === 1
              ? 'Volvió a esperar revisión'
              : `${n} volvieron a esperar revisión`,
      );
      await cliente.invalidateQueries({ queryKey: ['resenas', tienda.id] });
      void cliente.invalidateQueries({ queryKey: ['tareas', tienda.id] });
    },
  });

  const modera = puede('catalog.write');
  const datos = consulta.data;
  const visibles = datos?.items ?? [];
  const marcadasVisibles = marcadas.filter((id) => visibles.some((r) => r.id === id));

  return (
    <PaginaAdmin
      titulo="Reseñas"
      descripcion="Lo que escribió quien compró. Se publica o se rechaza; el texto y la estrella no se editan."
    >
      {moderar.error && (
        <p className="text-destructive text-sm" role="alert">
          {(moderar.error as Error).message}
        </p>
      )}

      {datos && <Resumen resumen={datos.resumen} />}

      <Pestanas
        etiqueta="Reseñas por estado"
        to="/productos/resenas"
        activa={estado}
        pestanas={ESTADOS_DE_RESENA.map((e) => ({
          valor: e,
          etiqueta: ETIQUETA[e],
          ...(datos ? { cuenta: datos.resumen[e] } : {}),
          ...(e === 'pending' ? { urgente: 'amber' as const } : {}),
        }))}
      />

      {consulta.isError ? (
        <Tarjeta>
          <EstadoDeError
            titulo="No se pudieron cargar las reseñas"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      ) : consulta.isPending ? (
        <Tarjeta sinRelleno>
          <Esqueleto />
        </Tarjeta>
      ) : visibles.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo={
              estado === 'pending'
                ? 'No hay reseñas esperando revisión'
                : `No hay reseñas ${ETIQUETA[estado].toLowerCase()}`
            }
          >
            Las escribe quien compró el producto y ya lo recibió, así que aparecen solas después de
            una entrega.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <Tarjeta sinRelleno>
          {modera && (
            <div className="text-ink-3 flex h-10 items-center gap-3 border-b border-[#eceef2] px-5 text-[12.5px]">
              <Checkbox
                checked={marcadasVisibles.length === visibles.length}
                indeterminate={
                  marcadasVisibles.length > 0 && marcadasVisibles.length < visibles.length
                }
                onCheckedChange={(v) => setMarcadas(v ? visibles.map((r) => r.id) : [])}
                aria-label="Elegir todas las reseñas de esta página"
              />
              <span aria-hidden="true">Seleccionar todas</span>
            </div>
          )}
          <ul aria-label="Reseñas" aria-busy={consulta.isFetching}>
            {visibles.map((r) => (
              <Fila
                key={r.id}
                resena={r}
                modera={modera}
                pendiente={moderar.isPending}
                marcada={marcadas.includes(r.id)}
                onMarcar={(marcar) =>
                  setMarcadas((previas) =>
                    marcar ? [...previas, r.id] : previas.filter((id) => id !== r.id),
                  )
                }
                onEstado={(a) => moderar.mutate({ ids: [r.id], a })}
              />
            ))}
          </ul>
          {datos && (
            <Paginacion
              datos={datos}
              sustantivo="reseñas"
              cargando={consulta.isFetching}
              onPagina={(p) => {
                setPagina(p);
                setMarcadas([]);
              }}
            />
          )}
        </Tarjeta>
      )}

      <BarraDeSeleccion
        cuenta={modera ? marcadasVisibles.length : 0}
        etiqueta="Acciones sobre las reseñas elegidas"
        onSoltar={() => setMarcadas([])}
      >
        {estado !== 'published' && (
          <BotonDeLote
            icono={CheckCircleIcon}
            etiqueta="Publicar"
            corta="Publicar"
            disabled={moderar.isPending}
            onClick={() => moderar.mutate({ ids: marcadasVisibles, a: 'published' })}
          />
        )}
        {estado !== 'rejected' && (
          <BotonDeLote
            icono={ArchiveIcon}
            etiqueta="Rechazar"
            corta="Rechazar"
            disabled={moderar.isPending}
            onClick={() => moderar.mutate({ ids: marcadasVisibles, a: 'rejected' })}
          />
        )}
      </BarraDeSeleccion>
    </PaginaAdmin>
  );
}

/** La nota de la tienda: el promedio, cuántas de cada estrella, y lo que paga reseñar. */
function Resumen({ resumen }: { resumen: ResumenDeResenas }) {
  const tienda = useTiendaActiva();
  const maximo = Math.max(1, ...resumen.estrellas);
  return (
    <Tarjeta className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="flex flex-col items-start gap-1">
        <span className="text-[34px] leading-10 font-semibold tabular-nums">
          {resumen.promedio === null
            ? '—'
            : Number(resumen.promedio).toLocaleString(tienda.locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
        </span>
        {resumen.promedio !== null && (
          <Estrellas valor={Number(resumen.promedio)} className="text-[15px]" />
        )}
        <span className="text-ink-3 text-[12.5px]">
          {resumen.published === 0
            ? 'Todavía no hay reseñas publicadas'
            : `${resumen.published} ${resumen.published === 1 ? 'reseña publicada' : 'reseñas publicadas'}`}
        </span>
      </div>
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((n) => {
          const cuenta = resumen.estrellas[n - 1] ?? 0;
          return (
            <div key={n} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="text-ink-3 w-7 tabular-nums">{n} ★</span>
              <span className="h-1.5 flex-1 rounded-full bg-[#eceef2]" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-[#e8930c]"
                  style={{ width: `${(cuenta / maximo) * 100}%` }}
                />
              </span>
              <span className="text-ink-3 w-8 text-right tabular-nums">{cuenta}</span>
            </div>
          );
        })}
      </div>
      {resumen.puntosPorResena ? (
        <p className="text-ink-2 max-w-[240px] rounded-[10px] bg-[#f2eefe] px-3.5 py-3 text-[13px]">
          Las reseñas publicadas suman{' '}
          <strong className="font-semibold">{resumen.puntosPorResena} puntos</strong> de fidelidad a
          quien las escribió.
        </p>
      ) : null}
    </Tarjeta>
  );
}

/** Una reseña: se lee entera antes de decidir, así que va el texto completo. */
function Fila({
  resena,
  modera,
  pendiente,
  marcada,
  onMarcar,
  onEstado,
}: {
  resena: ResenaAdmin;
  modera: boolean;
  pendiente: boolean;
  marcada: boolean;
  onMarcar: (marcar: boolean) => void;
  onEstado: (a: EstadoDeResena) => void;
}) {
  const tienda = useTiendaActiva();
  return (
    <li
      className={cn(
        'flex flex-col gap-3 border-b border-[#f0f1f4] px-5 py-4 last:border-b-0',
        marcada && 'bg-[#f5f7fe]',
      )}
    >
      <div className="flex items-start gap-3">
        {modera && (
          <Checkbox
            checked={marcada}
            onCheckedChange={(v) => onMarcar(v === true)}
            aria-label={`Elegir la reseña de ${resena.producto}`}
            className="mt-2.5"
          />
        )}
        <span className="size-10 shrink-0 overflow-hidden rounded-[9px] bg-[repeating-linear-gradient(135deg,#f3f4f7_0_5px,#eaecf1_5px_10px)]">
          {resena.imagen && <img src={resena.imagen} alt="" className="size-10 object-cover" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            to="/productos/$id"
            params={{ id: resena.productId }}
            className="truncate font-medium hover:underline"
          >
            {resena.producto}
          </Link>
          <span className="text-ink-3 flex flex-wrap items-center gap-x-1.5 text-[12.5px]">
            {resena.cliente ?? 'Sin nombre'} ·{' '}
            {new Date(resena.fecha).toLocaleDateString(tienda.locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            {/*
              Siempre: sólo puede reseñar quien compró y recibió (ADR-140). Decirlo
              es lo que hace que una reseña valga más que un comentario.
            */}
            <span className="inline-flex items-center gap-1 text-[#13774a]">
              · <CheckCircleIcon className="size-3.5" />
              Compró y recibió
            </span>
          </span>
        </div>
        {/* La estrella, que es lo primero que se mira y lo que nadie puede cambiar. */}
        <Estrellas valor={resena.rating} className="text-sm" />
      </div>

      {resena.body ? (
        <p className="text-sm leading-relaxed whitespace-pre-line">{resena.body}</p>
      ) : (
        <p className="text-ink-3 text-sm italic">Sin texto: sólo puntuación.</p>
      )}

      {modera && (
        <div className="flex flex-wrap gap-2">
          {resena.status !== 'published' && (
            <Button size="sm" disabled={pendiente} onClick={() => onEstado('published')}>
              <CheckCircleIcon />
              Publicar
            </Button>
          )}
          {resena.status !== 'rejected' && (
            <Button
              variant="outline"
              size="sm"
              disabled={pendiente}
              onClick={() => onEstado('rejected')}
            >
              Rechazar
            </Button>
          )}
          {resena.status !== 'pending' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pendiente}
              onClick={() => onEstado('pending')}
            >
              <ReturnIcon />
              Volver a pendiente
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
