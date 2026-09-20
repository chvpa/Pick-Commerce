import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioAdminCatalogo, repositorioCatalogo } from '@pick/adapter-supabase';
import type { PropuestaDeDescripcion } from '@pick/commerce-core';
import { SparklesIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogoDeConfirmacion } from '@/components/acciones';
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
import { enriquecerProducto } from '@/lib/ia';
import { db } from '@/lib/supabase';
import { TOPE_POR_TANDA, enLote } from './lote';

const POR_PAGINA = 10;

/**
 * Descripciones que faltan, y las que propuso la IA (v2 Fase 8).
 *
 * Una sola pantalla y no dos como en las fotos, y la diferencia no es de gusto:
 * fotografiar es una tarea de depósito, con el teléfono en la mano, así que la
 * cola vive aparte. Esto se hace sentado y leyendo, así que la cola y lo que hay
 * para revisar conviene que estén a la vista juntas.
 *
 * Por qué existe: de los 3752 productos activos del piloto, 3674 no tienen
 * descripción. `search_doc` es título más marca y el vector semántico se arma
 * con eso más categoría y atributos, así que **el techo del buscador lo pone el
 * catálogo, no el modelo**. Cada descripción aprobada es un producto que se
 * puede encontrar con otras palabras.
 *
 * La IA propone y una persona aprueba (ADR-104, ADR-130). Nada se escribe solo.
 */
export function Descripciones() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const queryClient = useQueryClient();

  const [pagina, setPagina] = useState(1);
  const [marcadas, setMarcadas] = useState<readonly string[]>([]);
  const [porConfirmar, setPorConfirmar] = useState(false);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  const repo = repositorioAdminCatalogo(db);

  const cola = useQuery({
    queryKey: ['sin-descripcion', tienda.id],
    queryFn: () => repo.sinDescripcion(tienda.id, 1, TOPE_POR_TANDA),
  });

  const propuestas = useQuery({
    queryKey: ['descripciones', tienda.id, pagina],
    queryFn: () => repo.descripcionesPendientes(tienda.id, pagina, POR_PAGINA),
    placeholderData: keepPreviousData,
  });

  const categorias = useQuery({
    queryKey: ['categorias', tienda.id],
    queryFn: () => repositorioCatalogo(db).categorias(tienda.id),
  });

  const refrescar = async () => {
    setMarcadas([]);
    await queryClient.invalidateQueries({ queryKey: ['descripciones', tienda.id] });
    await queryClient.invalidateQueries({ queryKey: ['sin-descripcion', tienda.id] });
  };

  /**
   * Pedirle a la IA la descripción de los próximos de la cola.
   *
   * **Una sola foto por producto**: la imagen es casi todo el costo de la
   * llamada, y mirar tres ángulos del mismo producto no cambia una descripción.
   * En el enriquecimiento de a uno siguen yendo las tres.
   */
  const proponer = useMutation({
    mutationFn: async () => {
      const ids = (cola.data?.items ?? []).slice(0, TOPE_POR_TANDA).map((p) => p.id);
      const productos = await repo.productosParaDescribir(tienda.id, ids);
      const lista = (categorias.data ?? []).map((c) => ({ id: c.id, nombre: c.name }));

      setProgreso({ hechas: 0, total: productos.length });

      return enLote(
        productos,
        async (producto) => {
          const { propuesta } = await enriquecerProducto(
            tienda.id,
            {
              title: producto.title,
              ...(producto.brand ? { brand: producto.brand } : {}),
              ...(producto.categoria ? { categoria: producto.categoria } : {}),
              variantes: producto.variantes.map((v) => ({
                title: v.title,
                atributos: v.atributos,
              })),
              imagenes: [...producto.imagenes],
            },
            lista,
            1,
          );

          // Sólo la descripción. Lo demás que proponga se descarta: esta
          // pantalla decide una cosa, y mezclar marca o categoría acá haría que
          // aprobar signifique algo distinto de lo que se leyó.
          if (!propuesta.description?.trim()) {
            throw new Error('La IA no propuso ninguna descripción.');
          }
          await repo.proponerDescripcion(
            tienda.tenantId,
            tienda.id,
            producto.productId,
            propuesta.description.trim(),
          );
        },
        (producto) => producto.title,
        (hechas, total) => setProgreso({ hechas, total }),
      );
    },
    onSettled: async () => {
      setProgreso(null);
      await refrescar();
    },
  });

  const aprobar = useMutation({
    mutationFn: (ids: readonly string[]) => repo.aprobarDescripciones(tienda.id, ids),
    onSuccess: refrescar,
  });

  const rechazar = useMutation({
    mutationFn: (ids: readonly string[]) => repo.rechazarDescripciones(tienda.id, ids),
    onSuccess: refrescar,
  });

  const escribe = puede('catalog.write');
  const gasta = puede('settings.write');
  const pendiente = aprobar.isPending || rechazar.isPending;
  const cuentas = cola.data?.cuentas;
  const cuantos = Math.min(cola.data?.items.length ?? 0, TOPE_POR_TANDA);

  return (
    <PaginaAdmin
      titulo="Descripciones"
      icono={SparklesIcon}
      descripcion="Un producto sin descripción es un producto que sólo se encuentra escribiendo su nombre exacto. La IA propone y vos aprobás."
      acciones={
        gasta && cuantos > 0 ? (
          <Button size="lg" disabled={proponer.isPending} onClick={() => setPorConfirmar(true)}>
            <SparklesIcon aria-hidden="true" />
            {proponer.isPending ? 'Escribiendo…' : `Escribir ${cuantos}`}
          </Button>
        ) : undefined
      }
    >
      {cuentas && (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          <strong className="text-foreground">{cuentas.sinDescripcion}</strong> sin descripción ·{' '}
          <strong className="text-foreground">{cuentas.conDescripcion}</strong> de {cuentas.activos}{' '}
          ya la tienen · {cuentas.escritasSemana} escritas esta semana
          {cuentas.pendientes > 0 ? ` · ${cuentas.pendientes} esperando revisión` : ''}
        </p>
      )}

      {progreso && (
        <p className="text-sm" aria-live="polite">
          Escribiendo descripciones: {progreso.hechas} de {progreso.total}.
        </p>
      )}

      {proponer.data && !progreso && (
        <p className="text-sm" role="status">
          Listo: {proponer.data.hechas}{' '}
          {proponer.data.hechas === 1 ? 'descripción' : 'descripciones'} para revisar
          {proponer.data.errores.length > 0
            ? `, y ${proponer.data.errores.length} que falló: ${proponer.data.errores[0]!.motivo}`
            : ''}
          .
        </p>
      )}

      {(proponer.error ?? aprobar.error ?? rechazar.error) && (
        <p className="text-destructive text-sm" role="alert">
          {((proponer.error ?? aprobar.error ?? rechazar.error) as Error).message}
        </p>
      )}

      {propuestas.isError ? (
        <Tarjeta>
          <EstadoDeError
            titulo="No se pudieron cargar las propuestas"
            error={propuestas.error as Error}
            onReintentar={() => void propuestas.refetch()}
          />
        </Tarjeta>
      ) : propuestas.isPending ? (
        <Tarjeta>
          <Esqueleto />
        </Tarjeta>
      ) : propuestas.data.items.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo={
              cuentas && cuentas.sinDescripcion === 0
                ? 'Todos los productos activos tienen descripción'
                : 'No hay descripciones esperando revisión'
            }
          >
            {cuentas && cuentas.sinDescripcion > 0
              ? 'Tocá «Escribir» y la IA las propone. Nada se publica hasta que las leas.'
              : 'No queda nada por escribir.'}
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

          <ul aria-label="Descripciones propuestas" className="flex flex-col gap-3">
            {propuestas.data.items.map((propuesta) => (
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
            datos={propuestas.data}
            sustantivo="descripciones"
            cargando={propuestas.isFetching}
            onPagina={setPagina}
          />
        </>
      )}

      <DialogoDeConfirmacion
        abierto={porConfirmar}
        onAbierto={setPorConfirmar}
        titulo={`¿Escribir ${cuantos} ${cuantos === 1 ? 'descripción' : 'descripciones'}?`}
        descripcion={`Usa la clave de OpenAI de la tienda: cada producto se paga en esa cuenta. Se mira una foto por producto${
          (cola.data?.cuentas.sinDescripcion ?? 0) > cuantos
            ? `, y de ${cola.data?.cuentas.sinDescripcion} que faltan se hacen ${cuantos} por tanda`
            : ''
        }. No se publica nada: quedan para que las leas y decidas.`}
        confirmar="Escribir"
        pendiente={proponer.isPending}
        onConfirmar={() => {
          proponer.mutate();
          setPorConfirmar(false);
        }}
      />
    </PaginaAdmin>
  );
}

/** Una propuesta: se lee entera antes de decidir, así que va el texto completo. */
function Propuesta({
  propuesta,
  escribe,
  pendiente,
  marcada,
  onMarcar,
  onAprobar,
  onRechazar,
}: {
  propuesta: PropuestaDeDescripcion;
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
            aria-label={`Seleccionar la descripción de ${propuesta.title}`}
          />
        )}
        <span className="min-w-0 flex-1 font-medium">{propuesta.title}</span>
      </div>

      <p className="text-sm">{propuesta.proposed}</p>

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
