import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { repositorioContenido } from '@pick/adapter-supabase';
import {
  COLUMNAS_POR_DEFECTO,
  columnasDe,
  type Banner,
  type LayoutDeSeccion,
  type SeccionDeHome,
  type TipoDeSeccion,
} from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { SelectorDeImagen } from './SelectorDeImagen';
import { AYUDA_TIPO, ETIQUETA_TIPO } from './etiquetas';

const SELECT =
  'border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 ' +
  'h-9 cursor-pointer rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3';

const TIPOS: readonly TipoDeSeccion[] = ['hero', 'tiles', 'products', 'categories'];

/** Los dos tipos que llevan piezas gráficas. */
function llevaPiezas(tipo: TipoDeSeccion): boolean {
  return tipo === 'hero' || tipo === 'tiles';
}

/**
 * Alta y edición de una sección de la home.
 *
 * Una sección es un bloque de la portada. El tipo decide qué muestra —el banner
 * principal, los avisos, un carrusel de productos, las categorías— y `layout` si
 * las piezas van estáticas o pasando como slides.
 */
export function FormularioSeccion({ id }: { id?: string }) {
  const tienda = useTiendaActiva();

  const existentes = useQuery({
    queryKey: ['secciones', tienda.id],
    queryFn: () => repositorioContenido(db).secciones(tienda.id),
  });

  if (existentes.isPending) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Cargando…
      </p>
    );
  }

  if (existentes.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        No se pudieron cargar las secciones: {(existentes.error as Error).message}
      </p>
    );
  }

  const seccion = id ? existentes.data.find((s) => s.id === id) : undefined;

  if (id && !seccion) {
    return (
      <p className="text-muted-foreground text-sm">
        Esa sección ya no existe. Puede que la hayan borrado desde otra pestaña.
      </p>
    );
  }

  // Los campos se montan con el dato ya puesto, sin efecto que los rellene.
  return (
    <Campos
      key={id ?? 'nueva'}
      id={id}
      inicial={seccion}
      siguientePosicion={Math.max(0, ...existentes.data.map((s) => s.position + 1))}
    />
  );
}

function Campos({
  id,
  inicial,
  siguientePosicion,
}: {
  id?: string;
  inicial?: SeccionDeHome;
  siguientePosicion: number;
}) {
  const tienda = useTiendaActiva();
  const navegar = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState<TipoDeSeccion>(inicial?.type ?? 'hero');
  const [title, setTitle] = useState(inicial?.title ?? '');
  const [subtitle, setSubtitle] = useState(inicial?.subtitle ?? '');
  const [layout, setLayout] = useState<LayoutDeSeccion>(inicial?.layout ?? 'static');
  const [columns, setColumns] = useState(
    String(inicial ? columnasDe(inicial.settings) : COLUMNAS_POR_DEFECTO),
  );
  const [collectionId, setCollectionId] = useState(inicial?.collectionId ?? '');
  const [position, setPosition] = useState(String(inicial?.position ?? siguientePosicion));
  const [published, setPublished] = useState(inicial?.published ?? false);
  const [error, setError] = useState<string | null>(null);

  const colecciones = useQuery({
    queryKey: ['colecciones', tienda.id],
    queryFn: () => repositorioContenido(db).colecciones(tienda.id),
    enabled: type === 'products',
  });

  const guardar = useMutation({
    mutationFn: () =>
      repositorioContenido(db).guardarSeccion(
        tienda.id,
        {
          type,
          ...(title ? { title } : {}),
          ...(subtitle ? { subtitle } : {}),
          layout,
          settings: type === 'tiles' ? { columns: Number(columns) || COLUMNAS_POR_DEFECTO } : {},
          ...(type === 'products' && collectionId ? { collectionId } : {}),
          position: Number(position) || 0,
          published,
        },
        id,
      ),
    onSuccess: async (nuevoId) => {
      await queryClient.invalidateQueries({ queryKey: ['secciones', tienda.id] });
      // Al crear una sección con piezas se queda en el formulario: sin id no se
      // pueden cargar, y mandarla a la lista la obligaría a volver a entrar.
      if (!id && llevaPiezas(type)) {
        await navegar({ to: '/contenido/secciones/$id', params: { id: nuevoId } });
        return;
      }
      await navegar({ to: '/contenido', search: { tab: 'secciones' } });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          guardar.mutate();
        }}
        className="flex flex-col gap-6"
      >
        <fieldset className="flex flex-col gap-1.5">
          <Label htmlFor="type">Tipo de sección</Label>
          <select
            id="type"
            value={type}
            disabled={Boolean(id)}
            onChange={(e) => setType(e.currentTarget.value as TipoDeSeccion)}
            className={SELECT}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO[t]}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs">{AYUDA_TIPO[type]}</span>
          {id && (
            <span className="text-muted-foreground text-xs">
              El tipo no se cambia después de crearla: sus piezas dejarían de tener sentido.
              Creá otra y borrá ésta.
            </span>
          )}
        </fieldset>

        {type === 'products' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="collection">Colección</Label>
            <select
              id="collection"
              value={collectionId}
              onChange={(e) => setCollectionId(e.currentTarget.value)}
              className={SELECT}
            >
              <option value="">Elegí una colección</option>
              {(colecciones.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Encabezado</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
            <span className="text-muted-foreground text-xs">
              {type === 'hero'
                ? 'Normalmente vacío: el banner principal lleva su texto en cada pieza.'
                : 'El título que se ve arriba del bloque. Vacío: sin encabezado.'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subtitle">Bajada</Label>
            <Input
              id="subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.currentTarget.value)}
            />
          </div>
        </div>

        {llevaPiezas(type) && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="layout">Cómo se muestran</Label>
              <select
                id="layout"
                value={layout}
                onChange={(e) => setLayout(e.currentTarget.value as LayoutDeSeccion)}
                className={SELECT}
              >
                <option value="static">
                  {type === 'hero' ? 'Una debajo de la otra' : 'En grilla'}
                </option>
                <option value="slider">Pasando de a una (slides)</option>
              </select>
              <span className="text-muted-foreground text-xs">
                Con una sola pieza da lo mismo. Los slides se pasan deslizando o con los
                puntos; no rotan solos, para no moverse encima de quien está leyendo.
              </span>
            </div>

            {type === 'tiles' && layout === 'static' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="columns">Columnas</Label>
                <select
                  id="columns"
                  value={columns}
                  onChange={(e) => setColumns(e.currentTarget.value)}
                  className={SELECT}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground text-xs">
                  En teléfono siempre va una por fila.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="position">Posición en la home</Label>
            <Input
              id="position"
              inputMode="numeric"
              value={position}
              onChange={(e) => setPosition(e.currentTarget.value)}
            />
            <span className="text-muted-foreground text-xs">Menor primero.</span>
          </div>
          <label className="flex items-center gap-3 self-end pb-2">
            <Switch checked={published} onCheckedChange={setPublished} />
            <span className="text-sm">Publicada</span>
          </label>
        </div>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear sección'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void navegar({ to: '/contenido', search: { tab: 'secciones' } })}
          >
            Cancelar
          </Button>
        </div>
      </form>

      {/* Las piezas se cargan con la sección ya creada: cuelgan de ella. */}
      {id && llevaPiezas(type) && <Piezas sectionId={id} tipo={type} />}
    </div>
  );
}

const PIEZA_VACIA = {
  title: '',
  subtitle: '',
  href: '',
  ctaLabel: '',
  position: 0,
  published: true,
  image: undefined as ProductImage | undefined,
  imageMobile: undefined as ProductImage | undefined,
};

/** Los slides de un banner principal o los avisos de un bloque. */
function Piezas({ sectionId, tipo }: { sectionId: string; tipo: TipoDeSeccion }) {
  const tienda = useTiendaActiva();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<string | 'nueva' | null>(null);
  const [borrador, setBorrador] = useState(PIEZA_VACIA);
  const [error, setError] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['piezas', tienda.id, sectionId],
    queryFn: () => repositorioContenido(db).piezas(tienda.id, sectionId),
  });

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ['piezas', tienda.id, sectionId] });

  const guardar = useMutation({
    mutationFn: async () => {
      if (!borrador.image) throw new Error('La pieza necesita una imagen.');
      return repositorioContenido(db).guardarBanner(
        tienda.id,
        {
          sectionId,
          title: borrador.title,
          ...(borrador.subtitle ? { subtitle: borrador.subtitle } : {}),
          image: borrador.image,
          ...(borrador.imageMobile ? { imageMobile: borrador.imageMobile } : {}),
          ...(borrador.href ? { href: borrador.href } : {}),
          ...(borrador.ctaLabel ? { ctaLabel: borrador.ctaLabel } : {}),
          position: borrador.position,
          published: borrador.published,
        },
        editando === 'nueva' ? undefined : (editando ?? undefined),
      );
    },
    onSuccess: async () => {
      await invalidar();
      setEditando(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const borrar = useMutation({
    mutationFn: (pieza: string) => repositorioContenido(db).borrarBanner(tienda.id, pieza),
    onSuccess: invalidar,
  });

  function abrir(p?: Banner): void {
    setError(null);
    setEditando(p?.id ?? 'nueva');
    setBorrador(
      p
        ? {
            title: p.title,
            subtitle: p.subtitle ?? '',
            href: p.href ?? '',
            ctaLabel: p.ctaLabel ?? '',
            position: p.position,
            published: p.published,
            image: p.image,
            imageMobile: p.imageMobile,
          }
        : { ...PIEZA_VACIA, position: consulta.data?.length ?? 0 },
    );
  }

  const singular = tipo === 'hero' ? 'slide' : 'aviso';

  return (
    <section className="flex flex-col gap-4 border-t pt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium">{tipo === 'hero' ? 'Slides' : 'Avisos'}</h2>
          <p className="text-muted-foreground text-xs">
            {tipo === 'hero'
              ? 'Con más de uno se pasan; con uno solo es un banner fijo.'
              : 'Cada aviso es una imagen con su título y su enlace.'}
          </p>
        </div>
        {!editando && (
          <Button size="sm" onClick={() => abrir()}>
            Agregar {singular}
          </Button>
        )}
      </div>

      {editando && (
        <div className="border-border flex flex-col gap-4 rounded-lg border p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-title">Título</Label>
              <Input
                id="p-title"
                value={borrador.title}
                onChange={(e) => setBorrador({ ...borrador, title: e.currentTarget.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-subtitle">Bajada</Label>
              <Input
                id="p-subtitle"
                value={borrador.subtitle}
                onChange={(e) => setBorrador({ ...borrador, subtitle: e.currentTarget.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-href">A dónde lleva</Label>
              <Input
                id="p-href"
                value={borrador.href}
                placeholder="/catalogo?categoria=calzado"
                onChange={(e) => setBorrador({ ...borrador, href: e.currentTarget.value })}
              />
              <span className="text-muted-foreground text-xs">
                Una ruta de la tienda. Vacío: no enlaza.
              </span>
            </div>
            {tipo === 'hero' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-cta">Texto del botón</Label>
                <Input
                  id="p-cta"
                  value={borrador.ctaLabel}
                  placeholder="Ver catálogo"
                  onChange={(e) => setBorrador({ ...borrador, ctaLabel: e.currentTarget.value })}
                />
                <span className="text-muted-foreground text-xs">
                  Vacío: el enlace se ve como texto en vez de botón.
                </span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-position">Posición</Label>
              <Input
                id="p-position"
                inputMode="numeric"
                value={String(borrador.position)}
                onChange={(e) =>
                  setBorrador({ ...borrador, position: Number(e.currentTarget.value) || 0 })
                }
              />
            </div>
          </div>

          <SelectorDeImagen
            label="Imagen"
            valor={borrador.image}
            onChange={(image) => setBorrador({ ...borrador, image })}
          />
          <SelectorDeImagen
            label="Imagen para teléfono"
            opcional
            ayuda="Sin ella se usa la de escritorio. Una foto apaisada en una pantalla angosta suele perder justo lo que decía."
            valor={borrador.imageMobile}
            onChange={(imageMobile) => setBorrador({ ...borrador, imageMobile })}
          />

          <label className="flex items-center gap-3">
            <Switch
              checked={borrador.published}
              onCheckedChange={(v) => setBorrador({ ...borrador, published: v })}
            />
            <span className="text-sm">Visible</span>
          </label>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {consulta.isPending ? (
        <div className="bg-muted h-16 animate-pulse rounded-lg" />
      ) : consulta.data!.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Esta sección todavía no tiene {tipo === 'hero' ? 'slides' : 'avisos'}. Sin al menos
          uno no se dibuja en la home.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {consulta.data!.map((p) => (
            <li key={p.id} className="border-border flex items-center gap-4 rounded-lg border p-3">
              <img src={p.image.url} alt="" className="h-14 w-24 rounded object-cover" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{p.title}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {p.href ?? 'Sin enlace'} · posición {p.position}
                </span>
              </div>
              {!p.published && <Badge variant="secondary">Oculto</Badge>}
              <Button variant="outline" size="sm" onClick={() => abrir(p)}>
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={borrar.isPending}
                onClick={() => borrar.mutate(p.id)}
              >
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
