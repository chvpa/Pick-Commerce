import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  repositorioAdminCatalogo,
  repositorioModelos,
  type Modelo,
  type VistaDeModelo,
} from '@pick/adapter-supabase';
import { BorrarConConfirmacion } from '@/components/acciones';
import { AlertCircleIcon, ArrowUpIcon, PlusIcon, XIcon } from '@/components/iconos';
import {
  CampoDeBusqueda,
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Segmentado,
  Selector,
  Tarjeta,
} from '@/components/pagina';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectItem } from '@/components/ui/select';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useCaracteristicas } from './CaracteristicasDelProducto';
import { avisosDelModelo } from './avisosDeModelo';

const VISTAS: readonly { valor: VistaDeModelo; etiqueta: string }[] = [
  { valor: 'photo', etiqueta: 'Foto' },
  { valor: 'swatch', etiqueta: 'Muestra' },
  { valor: 'text', etiqueta: 'Texto' },
];
const SIN_EJE = '__sin__';

/**
 * Productos › Modelos (ADR-162): productos que son el mismo artículo en otro
 * color o material. En la tienda se ven como un solo producto con opciones, y el
 * primero de la lista es el que aparece en el catálogo.
 */
export function Modelos({ inicial }: { inicial?: string }) {
  const tienda = useTiendaActiva();
  const escribe = usePuede()('catalog.write');
  const [q, setQ] = useState('');
  const [elegido, setElegido] = useState<string | 'nuevo' | null>(inicial ?? null);

  const lista = useQuery({
    queryKey: ['modelos', tienda.id, q],
    queryFn: () => repositorioModelos(db).listar(tienda.id, { q, perPage: 100 }),
    placeholderData: keepPreviousData,
  });

  const modelos = lista.data?.items ?? [];
  const actual =
    elegido === 'nuevo' ? null : (modelos.find((m) => m.id === elegido) ?? modelos[0] ?? null);

  return (
    <PaginaAdmin
      titulo="Modelos"
      descripcion="Productos que son el mismo artículo en otro color o material. En la ficha de la tienda se ven como opciones."
      acciones={
        escribe && (
          <Button size="lg" onClick={() => setElegido('nuevo')}>
            <PlusIcon aria-hidden="true" />
            Nuevo modelo
          </Button>
        )
      }
    >
      {lista.isError ? (
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudieron leer los modelos"
            error={lista.error as Error}
            onReintentar={() => void lista.refetch()}
          />
        </Tarjeta>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <Tarjeta sinRelleno>
            <div className="p-3">
              <CampoDeBusqueda
                valor={q}
                onCambio={setQ}
                placeholder="Buscar un modelo"
                etiqueta="Buscar un modelo"
              />
            </div>
            {lista.isPending ? (
              <Esqueleto filas={3} />
            ) : modelos.length === 0 ? (
              <EstadoVacio titulo={q ? 'Ningún modelo con ese nombre' : 'Todavía no hay modelos'}>
                Juntá en uno los productos que son el mismo artículo en otro color.
              </EstadoVacio>
            ) : (
              <ul aria-label="Modelos" className="flex flex-col px-1.5 pb-1.5">
                {modelos.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-current={actual?.id === m.id && elegido !== 'nuevo' ? 'true' : undefined}
                      onClick={() => setElegido(m.id)}
                      className={cn(
                        'focus-visible:ring-focus-tint flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-3',
                        actual?.id === m.id && elegido !== 'nuevo'
                          ? 'bg-[#f1f3f8]'
                          : 'hover:bg-[#f7f8fa]',
                      )}
                    >
                      <span className="truncate text-sm font-medium">{m.name}</span>
                      <span className="flex items-center gap-1.5">
                        {m.preview.map((p, i) =>
                          p.image ? (
                            <img
                              key={i}
                              src={p.image}
                              alt=""
                              className="size-5 rounded object-cover"
                            />
                          ) : (
                            <span key={i} className="size-5 rounded bg-[#eceef2]" />
                          ),
                        )}
                        <span className="text-ink-3 text-[12.5px]">
                          {m.count} {m.count === 1 ? 'producto' : 'productos'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {(elegido === 'nuevo' || actual) && (
            <Editor
              key={elegido === 'nuevo' ? 'nuevo' : actual!.id}
              modelo={elegido === 'nuevo' ? null : actual}
              soloLectura={!escribe}
              onGuardado={(id) => setElegido(id)}
              onBorrado={() => setElegido(null)}
            />
          )}
        </div>
      )}
    </PaginaAdmin>
  );
}

function Editor({
  modelo,
  soloLectura,
  onGuardado,
  onBorrado,
}: {
  modelo: Modelo | null;
  soloLectura: boolean;
  onGuardado: (id: string) => void;
  onBorrado: () => void;
}) {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();
  const caracteristicas = useCaracteristicas().data ?? [];
  const inicial = {
    name: modelo?.name ?? '',
    axis: modelo?.axis ?? null,
    display: modelo?.display ?? 'photo',
  };
  const [form, setForm] = useState(inicial);
  const [buscar, setBuscar] = useState('');

  const releer = () =>
    Promise.all([
      cliente.invalidateQueries({ queryKey: ['modelos', tienda.id] }),
      modelo && cliente.invalidateQueries({ queryKey: ['modelo', modelo.id] }),
    ]);

  const productos = useQuery({
    queryKey: ['modelo', modelo?.id],
    queryFn: () => repositorioModelos(db).productos(modelo!.id),
    enabled: modelo !== null,
  });

  const candidatos = useQuery({
    queryKey: ['productos', tienda.id, 'para-modelo', buscar],
    queryFn: () => repositorioAdminCatalogo(db).listar(tienda.id, { query: buscar, perPage: 8 }),
    enabled: modelo !== null && buscar.trim().length >= 2,
  });

  const guardar = useMutation({
    mutationFn: async () => {
      const datos = { ...form, name: form.name.trim() };
      const repo = repositorioModelos(db);
      if (modelo) {
        await repo.actualizar(modelo.id, datos);
        return modelo.id;
      }
      return repo.crear(tienda.id, tienda.tenantId, datos);
    },
    onSuccess: async (id) => {
      await releer();
      onGuardado(id);
    },
  });

  const fijar = useMutation({
    mutationFn: (ids: readonly string[]) => repositorioModelos(db).fijarProductos(modelo!.id, ids),
    onSuccess: releer,
  });

  const borrar = useMutation({
    mutationFn: () => repositorioModelos(db).borrar(modelo!.id),
    onSuccess: async () => {
      await releer();
      onBorrado();
    },
  });

  const items = productos.data ?? [];
  const ids = items.map((p) => p.id);
  const eje = caracteristicas.find((c) => c.name === form.axis);
  const ejeNombre = eje?.label.toLocaleLowerCase('es') ?? 'valor';
  const avisos = avisosDelModelo(items, form.axis ? ejeNombre : null);
  const sinCambios = JSON.stringify(form) === JSON.stringify(inicial);
  const fallo = (guardar.error ?? fijar.error ?? borrar.error) as Error | null;

  return (
    <Tarjeta className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-medium">Nombre</span>
          <Input
            value={form.name}
            disabled={soloLectura}
            placeholder="Ej. Court 3, Taladro 18V"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <span className="text-ink-3 text-xs">Sólo lo ves vos.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-medium">Se diferencian por</span>
          <Selector
            aria-label="Se diferencian por"
            value={form.axis ?? SIN_EJE}
            disabled={soloLectura}
            onValueChange={(v) => setForm((f) => ({ ...f, axis: v === SIN_EJE ? null : v }))}
          >
            <SelectItem value={SIN_EJE}>Sin elegir</SelectItem>
            {caracteristicas.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.label}
              </SelectItem>
            ))}
          </Selector>
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13.5px] font-medium">Cómo se muestra en la ficha</span>
        <Segmentado
          etiqueta="Cómo se muestra en la ficha"
          valor={form.display}
          onCambiar={(display) => !soloLectura && setForm((f) => ({ ...f, display }))}
          opciones={VISTAS}
        />
      </div>

      {!soloLectura && (
        <div className="flex justify-end">
          <Button
            disabled={guardar.isPending || sinCambios || form.name.trim() === ''}
            onClick={() => guardar.mutate()}
          >
            {guardar.isPending ? 'Guardando…' : modelo ? 'Guardar' : 'Crear modelo'}
          </Button>
        </div>
      )}

      {modelo && (
        <div className="border-line-row flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">Productos del modelo</h2>
            <span className="text-ink-3 text-[12.5px]">
              El primero es el que se ve en el catálogo
            </span>
          </div>
          {productos.isPending ? (
            <Esqueleto filas={2} />
          ) : items.length === 0 ? (
            <p className="text-ink-3 text-sm">Todavía no tiene productos. Buscalos abajo.</p>
          ) : (
            <ul aria-label="Productos del modelo" className="flex flex-col">
              {items.map((p, i) => (
                <li
                  key={p.id}
                  className="border-line-row flex items-center gap-3 border-b py-2.5 last:border-b-0"
                >
                  {p.image ? (
                    <img src={p.image} alt="" className="size-10 rounded-lg object-cover" />
                  ) : (
                    <span className="size-10 rounded-lg bg-[#eceef2]" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{p.title}</span>
                    <span className="text-ink-3 text-[12.5px]">
                      {p.value ?? `Sin ${ejeNombre}`} · {p.stock} en stock
                    </span>
                  </span>
                  {i === 0 ? (
                    <Badge variant="blue">En catálogo</Badge>
                  ) : (
                    !soloLectura && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Mostrar ${p.title} en el catálogo`}
                        disabled={fijar.isPending}
                        onClick={() => fijar.mutate([p.id, ...ids.filter((x) => x !== p.id)])}
                      >
                        <ArrowUpIcon />
                      </Button>
                    )
                  )}
                  {!soloLectura && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Quitar ${p.title} del modelo`}
                      disabled={fijar.isPending}
                      onClick={() => fijar.mutate(ids.filter((x) => x !== p.id))}
                    >
                      <XIcon />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!soloLectura && (
            <div className="flex flex-col gap-2">
              <CampoDeBusqueda
                valor={buscar}
                onCambio={setBuscar}
                placeholder="Buscar un producto para agregar"
                etiqueta="Buscar un producto para agregar al modelo"
              />
              {(candidatos.data?.items ?? [])
                .filter((p) => !ids.includes(p.id))
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                    {p.imagen ? (
                      <img src={p.imagen} alt="" className="size-8 rounded object-cover" />
                    ) : (
                      <span className="size-8 rounded bg-[#eceef2]" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={fijar.isPending}
                      onClick={() => fijar.mutate([...ids, p.id])}
                    >
                      Agregar
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {avisos.map((a) => (
            <p
              key={a}
              className="flex items-start gap-2 rounded-lg bg-[#fdf4e3] px-3 py-2 text-[13px] text-[#9a5b0b]"
            >
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              {a}
            </p>
          ))}
        </div>
      )}

      {fallo && (
        <p className="text-destructive text-sm" role="alert">
          {fallo.message}
        </p>
      )}

      {modelo && !soloLectura && (
        <div className="flex items-center gap-3">
          <BorrarConConfirmacion
            nombre={modelo.name}
            etiqueta="Borrar modelo"
            pendiente={borrar.isPending}
            que="Sus productos quedan sueltos: cada uno vuelve a verse solo en el catálogo."
            onConfirmar={() => borrar.mutate()}
          />
          <span className="text-ink-3 text-[13px]">Borrar el modelo no borra sus productos.</span>
        </div>
      )}
    </Tarjeta>
  );
}
