import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioCaracteristicas, type CambiosDeCaracteristica } from '@pick/adapter-supabase';
import {
  ETIQUETA_TIPO_DE_CARACTERISTICA,
  TIPOS_DE_CARACTERISTICA,
  agregarOpciones,
  claveDeCaracteristica,
  type Caracteristica,
  type TipoDeCaracteristica,
} from '@pick/commerce-core';
import { BorrarConConfirmacion } from '@/components/acciones';
import {
  FilterIcon,
  PaintBoardIcon,
  PlusIcon,
  TagsIcon,
  TextIcon,
  XIcon,
} from '@/components/iconos';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Segmentado,
  Tarjeta,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const ICONO: Readonly<
  Record<TipoDeCaracteristica, (p: { className?: string }) => React.ReactNode>
> = { options: TagsIcon, color: PaintBoardIcon, text: TextIcon };

const NUEVA: CambiosDeCaracteristica = {
  label: '',
  kind: 'options',
  options: [],
  filterable: true,
  forVariants: false,
  required: false,
};

/**
 * Productos › Características (ADR-161): lo que describe a los productos. Decide
 * qué filtros tiene el catálogo, qué se ofrece al cargar una variante y qué no se
 * puede publicar sin completar.
 */
export function Caracteristicas() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const escribe = puede('catalog.write');
  const [elegida, setElegida] = useState<string | 'nueva' | null>(null);

  const lista = useQuery({
    queryKey: ['caracteristicas', tienda.id],
    queryFn: () => repositorioCaracteristicas(db).listar(tienda.id),
  });
  const uso = useQuery({
    queryKey: ['caracteristicas-uso', tienda.id],
    queryFn: () => repositorioCaracteristicas(db).uso(tienda.id),
  });

  const todas = lista.data ?? [];
  const actual =
    elegida === 'nueva' ? null : (todas.find((c) => c.id === elegida) ?? todas[0] ?? null);
  const editando = elegida === 'nueva' || actual !== null;

  return (
    <PaginaAdmin
      titulo="Características"
      descripcion="Lo que describe a tus productos. Se usa al cargarlos, en los filtros de la tienda y en las variantes."
      acciones={
        escribe && (
          <Button size="lg" onClick={() => setElegida('nueva')}>
            <PlusIcon aria-hidden="true" />
            Nueva característica
          </Button>
        )
      }
    >
      {lista.isError ? (
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudieron leer las características"
            error={lista.error as Error}
            onReintentar={() => void lista.refetch()}
          />
        </Tarjeta>
      ) : lista.isPending ? (
        <Tarjeta sinRelleno>
          <Esqueleto filas={4} />
        </Tarjeta>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <Tarjeta sinRelleno>
            {todas.length === 0 ? (
              <EstadoVacio titulo="Todavía no hay características">
                Talle, color, material: lo que tus productos tienen y la gente quiere filtrar.
              </EstadoVacio>
            ) : (
              <ul aria-label="Características" className="flex flex-col p-1.5">
                {todas.map((c) => {
                  const Icono = ICONO[c.kind];
                  const activa = elegida !== 'nueva' && actual?.id === c.id;
                  const usan = uso.data?.[c.name] ?? 0;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-current={activa ? 'true' : undefined}
                        onClick={() => setElegida(c.id)}
                        className={cn(
                          'focus-visible:ring-focus-tint flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-3',
                          activa ? 'bg-[#f1f3f8]' : 'hover:bg-[#f7f8fa]',
                        )}
                      >
                        <span className="text-ink-3 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f1f2f5]">
                          <Icono className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">{c.label}</span>
                          <span className="text-ink-3 truncate text-[12.5px]">
                            {c.kind === 'text'
                              ? 'Texto libre'
                              : `${c.options.length} ${c.options.length === 1 ? 'opción' : 'opciones'}`}
                            {` · ${usan} ${usan === 1 ? 'producto' : 'productos'}`}
                          </span>
                        </span>
                        {c.filterable && (
                          <FilterIcon
                            className="text-ink-faint size-4"
                            aria-label="Filtro en la tienda"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>

          {editando && (
            <Editor
              key={actual?.id ?? 'nueva'}
              caracteristica={actual}
              existentes={todas}
              usan={actual ? (uso.data?.[actual.name] ?? 0) : 0}
              soloLectura={!escribe}
              onGuardada={(c) => setElegida(c.id)}
              onBorrada={() => setElegida(null)}
            />
          )}
        </div>
      )}
    </PaginaAdmin>
  );
}

function Editor({
  caracteristica,
  existentes,
  usan,
  soloLectura,
  onGuardada,
  onBorrada,
}: {
  caracteristica: Caracteristica | null;
  existentes: readonly Caracteristica[];
  usan: number;
  soloLectura: boolean;
  onGuardada: (c: Caracteristica) => void;
  onBorrada: () => void;
}) {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const inicial: CambiosDeCaracteristica = caracteristica ?? NUEVA;
  const [form, setForm] = useState<CambiosDeCaracteristica>(inicial);
  const [nuevaOpcion, setNuevaOpcion] = useState('');
  const cambiar = (parte: Partial<CambiosDeCaracteristica>) => setForm((f) => ({ ...f, ...parte }));

  const releer = () =>
    Promise.all([
      cliente.invalidateQueries({ queryKey: ['caracteristicas', tienda.id] }),
      cliente.invalidateQueries({ queryKey: ['caracteristicas-uso', tienda.id] }),
    ]);

  const guardar = useMutation({
    mutationFn: () => {
      const datos = { ...form, label: form.label.trim() };
      const repo = repositorioCaracteristicas(db);
      return caracteristica
        ? repo.actualizar(caracteristica.id, datos)
        : repo.crear(
            tienda.id,
            tienda.tenantId,
            claveDeCaracteristica(
              datos.label,
              existentes.map((c) => c.name),
            ),
            datos,
            existentes.length,
          );
    },
    onSuccess: async (c) => {
      await releer();
      onGuardada(c);
    },
  });

  const borrar = useMutation({
    mutationFn: () => repositorioCaracteristicas(db).borrar(caracteristica!.id),
    onSuccess: async () => {
      await releer();
      onBorrada();
    },
  });

  const sinCambios = JSON.stringify(form) === JSON.stringify(inicial);
  const agregar = () => {
    if (nuevaOpcion.trim() === '') return;
    cambiar({ options: agregarOpciones(form.options, nuevaOpcion) });
    setNuevaOpcion('');
  };

  return (
    <Tarjeta className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-medium">Nombre</span>
          <Input
            value={form.label}
            disabled={soloLectura}
            placeholder="Ej. Silueta"
            onChange={(e) => cambiar({ label: e.target.value })}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-medium">Tipo</span>
          <Segmentado
            etiqueta="Tipo"
            valor={form.kind}
            onCambiar={(kind) => !soloLectura && cambiar({ kind })}
            opciones={TIPOS_DE_CARACTERISTICA.map((t) => ({
              valor: t,
              etiqueta: ETIQUETA_TIPO_DE_CARACTERISTICA[t],
            }))}
          />
        </div>
      </div>

      {form.kind === 'text' ? (
        <p className="text-ink-3 text-[13px]">
          Cada producto la completa a mano. Sirve para datos como el origen o la garantía.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-[13.5px] font-medium">
            Opciones <span className="text-ink-faint font-normal">· {form.options.length}</span>
          </span>
          <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-[#e6e8ee] p-2">
            {form.options.map((o) => (
              <span
                key={o}
                className="text-ink-2 flex h-7 items-center gap-1 rounded-md bg-[#f1f2f5] pr-1 pl-2.5 text-[13px]"
              >
                {o}
                {!soloLectura && (
                  <button
                    type="button"
                    aria-label={`Quitar ${o}`}
                    onClick={() => cambiar({ options: form.options.filter((x) => x !== o) })}
                    className="text-ink-faint hover:text-foreground flex size-5 cursor-pointer items-center justify-center rounded"
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {!soloLectura && (
              <input
                value={nuevaOpcion}
                aria-label="Agregar opciones"
                placeholder={
                  form.options.length === 0 ? 'Escribí una opción y apretá Enter' : 'Agregar…'
                }
                onChange={(e) => setNuevaOpcion(e.target.value)}
                onBlur={agregar}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregar();
                  }
                }}
                className="h-7 min-w-40 flex-1 bg-transparent px-1 text-[13px] outline-none"
              />
            )}
          </div>
          <span className="text-ink-3 text-[12.5px]">
            Escribí y apretá Enter para agregar. Se puede pegar una lista separada por comas.
          </span>
        </div>
      )}

      <div className="border-line-row flex flex-col border-y">
        {(
          [
            [
              'filterable',
              'Mostrar como filtro en la tienda',
              'El cliente puede filtrar el catálogo por esta característica.',
            ],
            [
              'forVariants',
              'Se puede usar para variantes',
              'Como talle, color, capacidad o sabor: cada opción tiene su propio stock.',
            ],
            [
              'required',
              'Obligatoria al cargar un producto',
              'No se puede publicar un producto sin completarla.',
            ],
          ] as const
        ).map(([campo, titulo, ayuda]) => (
          <div
            key={campo}
            className="border-line-row flex items-center gap-4 border-b py-3 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{titulo}</span>
              <span className="text-ink-3 text-[12.5px]">{ayuda}</span>
            </span>
            <Switch
              aria-label={titulo}
              checked={form[campo]}
              disabled={soloLectura}
              onCheckedChange={(v) => cambiar({ [campo]: v === true })}
            />
          </div>
        ))}
      </div>

      {(guardar.error ?? borrar.error) && (
        <p className="text-destructive text-sm" role="alert">
          {((guardar.error ?? borrar.error) as Error).message}
        </p>
      )}

      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-3">
          {caracteristica && (
            <>
              <BorrarConConfirmacion
                nombre={caracteristica.label}
                etiqueta="Borrar característica"
                pendiente={borrar.isPending}
                que={`${usan === 0 ? 'Ningún producto la usa.' : `La usan ${usan} ${usan === 1 ? 'producto' : 'productos'}, que conservan el dato.`} Deja de ser un filtro y de ofrecerse al cargar.`}
                onConfirmar={() => borrar.mutate()}
              />
              <span className="text-ink-3 text-[13px]">
                {usan === 0
                  ? 'Ningún producto la usa'
                  : `La usan ${usan} ${usan === 1 ? 'producto' : 'productos'}`}
              </span>
            </>
          )}
          <Button
            className="ml-auto"
            disabled={guardar.isPending || sinCambios || form.label.trim() === ''}
            onClick={() => guardar.mutate()}
          >
            {guardar.isPending ? 'Guardando…' : caracteristica ? 'Guardar' : 'Crear característica'}
          </Button>
        </div>
      )}
    </Tarjeta>
  );
}
