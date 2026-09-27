import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioAdminCatalogo } from '@pick/adapter-supabase';
import type { EstadoDeResena, ResenaAdmin } from '@pick/commerce-core';
import { ResenaIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Paginacion,
  Selector,
  Tarjeta,
} from '@/components/pagina';
import { SelectItem } from '@/components/ui/select';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

const POR_PAGINA = 20;

const ETIQUETA: Record<EstadoDeResena, string> = {
  pending: 'Esperando revisión',
  published: 'Publicadas',
  rejected: 'Rechazadas',
};

/**
 * Moderar reseñas (ADR-140).
 *
 * La pantalla hace **dos** cosas y ninguna más: publicar y rechazar. No hay forma
 * de editar el texto ni la estrella, y no es que falte el campo: la base no
 * concede `update` sobre la tabla, así que el único camino es
 * `admin_moderate_reviews`, que sólo toca el estado. Poder corregir una reseña es
 * poder escribirla, y ahí deja de ser una reseña.
 *
 * Arranca en «esperando revisión» porque es lo único que pide una acción. Las
 * publicadas y las rechazadas se miran con el filtro, y desde ahí se puede volver
 * atrás: rechazar por error no es irreversible.
 */
export function Resenas() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const cliente = useQueryClient();

  const [estado, setEstado] = useState<EstadoDeResena>('pending');
  const [pagina, setPagina] = useState(1);
  const [marcadas, setMarcadas] = useState<readonly string[]>([]);

  const repo = repositorioAdminCatalogo(db);

  const consulta = useQuery({
    queryKey: ['resenas', tienda.id, estado, pagina],
    queryFn: () => repo.resenas(tienda.id, estado, pagina, POR_PAGINA),
    placeholderData: keepPreviousData,
  });

  const moderar = useMutation({
    mutationFn: ({ ids, a }: { ids: readonly string[]; a: EstadoDeResena }) =>
      repo.moderarResenas(tienda.id, ids, a),
    onSuccess: async () => {
      setMarcadas([]);
      await cliente.invalidateQueries({ queryKey: ['resenas', tienda.id] });
    },
  });

  const modera = puede('catalog.write');
  const datos = consulta.data;

  return (
    <PaginaAdmin
      titulo="Reseñas"
      icono={ResenaIcon}
      descripcion="Lo que escribió quien compró. Se publica o se rechaza; el texto y la estrella no se editan."
      acciones={
        <Selector
          value={estado}
          aria-label="Estado"
          onValueChange={(v) => {
            setEstado(v as EstadoDeResena);
            setPagina(1);
            setMarcadas([]);
          }}
        >
          {(Object.keys(ETIQUETA) as EstadoDeResena[]).map((e) => (
            <SelectItem key={e} value={e}>
              {ETIQUETA[e]}
            </SelectItem>
          ))}
        </Selector>
      }
    >
      {datos && datos.pendientes > 0 && estado !== 'pending' && (
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">{datos.pendientes}</strong>{' '}
          {datos.pendientes === 1 ? 'reseña espera' : 'reseñas esperan'} revisión.
        </p>
      )}

      {moderar.error && (
        <p className="text-destructive text-sm" role="alert">
          {(moderar.error as Error).message}
        </p>
      )}

      {consulta.isError ? (
        <Tarjeta>
          <EstadoDeError
            titulo="No se pudieron cargar las reseñas"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      ) : consulta.isPending ? (
        <Tarjeta>
          <Esqueleto />
        </Tarjeta>
      ) : datos && datos.items.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo={
              estado === 'pending'
                ? 'No hay reseñas esperando revisión'
                : `No hay reseñas ${ETIQUETA[estado].toLowerCase()}`
            }
          >
            {estado === 'pending'
              ? 'Las escribe quien compró el producto y ya lo recibió, así que aparecen solas después de una entrega.'
              : 'Cambiá el filtro para ver las otras.'}
          </EstadoVacio>
        </Tarjeta>
      ) : (
        datos && (
          <>
            {modera && marcadas.length > 0 && (
              <div
                className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5"
                role="group"
                aria-label="Acciones sobre lo seleccionado"
              >
                <p className="text-sm" aria-live="polite">
                  {marcadas.length} {marcadas.length === 1 ? 'seleccionada' : 'seleccionadas'}
                </p>
                <Button
                  size="sm"
                  disabled={moderar.isPending}
                  onClick={() => moderar.mutate({ ids: marcadas, a: 'published' })}
                >
                  Publicar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={moderar.isPending}
                  onClick={() => moderar.mutate({ ids: marcadas, a: 'rejected' })}
                >
                  Rechazar
                </Button>
              </div>
            )}

            <ul aria-label="Reseñas" className="flex flex-col gap-3">
              {datos.items.map((r) => (
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

            <Paginacion
              datos={datos}
              sustantivo="reseñas"
              cargando={consulta.isFetching}
              onPagina={setPagina}
            />
          </>
        )
      )}
    </PaginaAdmin>
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
  return (
    <li className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        {modera && (
          <Checkbox
            checked={marcada}
            onCheckedChange={(v) => onMarcar(v === true)}
            aria-label={`Seleccionar la reseña de ${resena.producto}`}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{resena.producto}</span>
          <span className="text-muted-foreground text-xs">
            {resena.cliente ?? 'Sin nombre'} ·{' '}
            {new Date(resena.fecha).toLocaleDateString('es-PY', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
            })}
          </span>
        </div>
        {/* La estrella, que es lo primero que se mira y lo que nadie puede cambiar. */}
        <span className="text-sm tabular-nums" aria-label={`${resena.rating} de 5`}>
          <span aria-hidden="true">{'★'.repeat(resena.rating)}</span>
        </span>
      </div>

      {resena.body ? (
        <p className="text-sm leading-relaxed">{resena.body}</p>
      ) : (
        <p className="text-muted-foreground text-sm italic">Sin texto: sólo puntuación.</p>
      )}

      {modera && (
        <div className="flex gap-2">
          {resena.status !== 'published' && (
            <Button size="sm" disabled={pendiente} onClick={() => onEstado('published')}>
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
              Volver a pendiente
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
