import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioAdminCatalogo } from '@pick/adapter-supabase';
import type { PropuestaDeFoto } from '@pick/commerce-core';
import { SparklesIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Paginacion,
  Tarjeta,
} from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

const POR_PAGINA = 12;

/**
 * Revisar lo que propuso la IA, con la original al lado (ADR-130).
 *
 * Es la mitad que hace honesta la decisión de dejar que una IA toque una foto de
 * un producto real: **nada se publica sin que una persona lo mire**. Una edición
 * generativa puede cambiar un logo o un color sin avisar, así que las dos fotos
 * se muestran juntas y del mismo tamaño; aprobar es un acto explícito y queda
 * registrado quién lo hizo.
 *
 * La original no se borra nunca: sigue en la propuesta, y por eso se puede
 * volver atrás.
 */
export function RevisarFotos() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const queryClient = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const [marcadas, setMarcadas] = useState<readonly string[]>([]);

  const consulta = useQuery({
    queryKey: ['propuestas', tienda.id, pagina],
    queryFn: () => repositorioAdminCatalogo(db).propuestasPendientes(tienda.id, pagina, POR_PAGINA),
    placeholderData: keepPreviousData,
  });

  const refrescar = () => {
    setMarcadas([]);
    return queryClient.invalidateQueries({ queryKey: ['propuestas', tienda.id] });
  };

  const aprobar = useMutation({
    mutationFn: (ids: readonly string[]) =>
      repositorioAdminCatalogo(db).aprobarPropuestas(tienda.id, ids),
    onSuccess: refrescar,
  });

  const rechazar = useMutation({
    mutationFn: (ids: readonly string[]) =>
      repositorioAdminCatalogo(db).rechazarPropuestas(tienda.id, ids),
    onSuccess: refrescar,
  });

  const escribe = puede('catalog.write');
  const pendiente = aprobar.isPending || rechazar.isPending;

  return (
    <PaginaAdmin
      titulo="Fotos con fondo limpio"
      icono={SparklesIcon}
      descripcion="Lo que propuso la IA, al lado de la foto original. Nada se publica hasta que lo apruebes, y la original se guarda por si querés volver."
    >
      {(aprobar.error ?? rechazar.error) && (
        <p className="text-destructive text-sm" role="alert">
          {((aprobar.error ?? rechazar.error) as Error).message}
        </p>
      )}

      {consulta.isError ? (
        <Tarjeta>
          <EstadoDeError
            titulo="No se pudieron cargar las propuestas"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      ) : consulta.isPending ? (
        <Tarjeta>
          <Esqueleto />
        </Tarjeta>
      ) : consulta.data.items.length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="No hay fotos esperando revisión">
            Elegí productos en el listado y pedí «Limpiar fondo con IA»: las propuestas aparecen
            acá.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <>
          {escribe && marcadas.length > 0 && (
            <div
              className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5"
              role="group"
              aria-label="Acciones sobre lo seleccionado"
            >
              <p className="text-sm" aria-live="polite">
                {marcadas.length} {marcadas.length === 1 ? 'seleccionada' : 'seleccionadas'}
              </p>
              <Button size="sm" disabled={pendiente} onClick={() => aprobar.mutate(marcadas)}>
                Publicar las seleccionadas
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pendiente}
                onClick={() => rechazar.mutate(marcadas)}
              >
                Descartar
              </Button>
            </div>
          )}

          <ul
            aria-label="Fotos propuestas"
            className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3"
          >
            {consulta.data.items.map((propuesta) => (
              <Propuesta
                key={propuesta.id}
                propuesta={propuesta}
                escribe={escribe}
                pendiente={pendiente}
                marcada={marcadas.includes(propuesta.id)}
                onMarcar={(marcar) =>
                  setMarcadas((previas) =>
                    marcar
                      ? [...previas, propuesta.id]
                      : previas.filter((id) => id !== propuesta.id),
                  )
                }
                onAprobar={() => aprobar.mutate([propuesta.id])}
                onRechazar={() => rechazar.mutate([propuesta.id])}
              />
            ))}
          </ul>

          <Paginacion
            datos={consulta.data}
            sustantivo="fotos"
            cargando={consulta.isFetching}
            onPagina={setPagina}
          />
        </>
      )}
    </PaginaAdmin>
  );
}

/** Las dos fotos, del mismo tamaño: comparar es lo único que hace honesta la aprobación. */
function Propuesta({
  propuesta,
  escribe,
  pendiente,
  marcada,
  onMarcar,
  onAprobar,
  onRechazar,
}: {
  propuesta: PropuestaDeFoto;
  escribe: boolean;
  pendiente: boolean;
  marcada: boolean;
  onMarcar: (marcar: boolean) => void;
  onAprobar: () => void;
  onRechazar: () => void;
}) {
  return (
    <li className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        {escribe && (
          <Checkbox
            checked={marcada}
            onCheckedChange={(valor) => onMarcar(valor === true)}
            aria-label={`Seleccionar la foto de ${propuesta.title}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{propuesta.title}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <figure className="flex flex-col gap-1">
          <img
            src={propuesta.originalUrl}
            alt={`Foto original de ${propuesta.title}`}
            loading="lazy"
            className="bg-muted aspect-square w-full rounded-md object-contain"
          />
          <figcaption className="text-muted-foreground text-xs">Original</figcaption>
        </figure>
        <figure className="flex flex-col gap-1">
          <img
            src={propuesta.proposedUrl}
            alt={`Propuesta de la IA para ${propuesta.title}`}
            loading="lazy"
            className="bg-muted aspect-square w-full rounded-md object-contain"
          />
          <figcaption className="text-muted-foreground text-xs">Propuesta de la IA</figcaption>
        </figure>
      </div>

      {escribe && (
        <div className="flex gap-2">
          <Button size="sm" disabled={pendiente} onClick={onAprobar}>
            Publicar
          </Button>
          <Button variant="outline" size="sm" disabled={pendiente} onClick={onRechazar}>
            Descartar
          </Button>
        </div>
      )}
    </li>
  );
}
