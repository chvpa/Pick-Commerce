import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { repositorioContenido } from '@pick/adapter-supabase';
import {
  COLUMNAS_POR_DEFECTO,
  columnasDe,
  moverEn,
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
import { Campo } from '@/components/campo';
import { BorrarConConfirmacion, BotonDeIcono, ControlDeOrden } from '@/components/acciones';
import { PencilIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { SelectorDeImagen } from './SelectorDeImagen';
import { AYUDA_TIPO, ETIQUETA_TIPO } from './etiquetas';

const SELECT =
  'border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 ' +
  'h-9 cursor-pointer rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3';

const TIPOS: readonly TipoDeSeccion[] = ['hero', 'tiles', 'products', 'categories'];

/**
 * Qué significa «estático» en cada tipo.
 *
 * En el banner principal **no** es apilar: un hero ocupa el alto de la pantalla y
 * tres apilados empujan el catálogo tan abajo que nadie llega. Ahí estático
 * quiere decir de a dos.
 */
const ESTATICO: Record<TipoDeSeccion, string> = {
  hero: 'De a dos, uno al lado del otro',
  tiles: 'En grilla',
  categories: 'En grilla',
  products: 'En grilla',
};

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
  // La posición ya no se escribe: se cambia con las flechas de la lista. Se
  // conserva la que tiene, y una sección nueva va al final.
  const position = inicial?.position ?? siguientePosicion;
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
          position,
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
        {/*
          Al crear se elige el tipo; al editar sólo se informa cuál es.

          El tipo no se puede cambiar —las piezas de un hero no significan nada
          en un carrusel de productos— y un `<select>` deshabilitado sigue
          pareciendo un control: invita a hacer clic y no pasa nada. Decirlo como
          dato es más honesto que ofrecer algo que no funciona.
        */}
        {id ? (
          <div className="bg-muted/40 border-border flex flex-col gap-0.5 rounded-lg border p-4">
            <p className="text-sm font-medium">{ETIQUETA_TIPO[type]}</p>
            <p className="text-muted-foreground text-xs">
              {AYUDA_TIPO[type]}. El tipo se elige al crear la sección y no se cambia después.
            </p>
          </div>
        ) : (
          <Campo id="type" label="Tipo de sección" ayuda={AYUDA_TIPO[type]}>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.currentTarget.value as TipoDeSeccion)}
              className={SELECT}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {type === 'products' && (
          <Campo id="collection" label="Colección">
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
          </Campo>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            id="title"
            label="Encabezado"
            ayuda={
              type === 'hero'
                ? 'Normalmente vacío: el banner principal lleva su texto en cada pieza.'
                : 'El título que se ve arriba del bloque. Vacío: sin encabezado.'
            }
          >
            <Input id="title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
          </Campo>

          <Campo id="subtitle" label="Subtítulo" ayuda="Opcional. Va abajo del encabezado.">
            <Input
              id="subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.currentTarget.value)}
            />
          </Campo>
        </div>

        {/*
          El carrusel de productos no ofrece esta elección: siempre pasa de a uno,
          que es lo que hace un carrusel. Las otras tres sí.
        */}
        {type !== 'products' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="layout"
              label="Cómo se muestran"
              ayuda="Con una sola pieza da lo mismo. Los slides se pasan deslizando o con los puntos; no rotan solos, para no moverse encima de quien está leyendo."
            >
              <select
                id="layout"
                value={layout}
                onChange={(e) => setLayout(e.currentTarget.value as LayoutDeSeccion)}
                className={SELECT}
              >
                <option value="static">{ESTATICO[type]}</option>
                <option value="slider">Pasando de a una (slides)</option>
              </select>
            </Campo>

            {type === 'tiles' && layout === 'static' && (
              <Campo id="columns" label="Columnas" ayuda="En teléfono siempre va una por fila.">
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
              </Campo>
            )}
          </div>
        )}

        {/*
          Acá estaba «posición en la home» como un número.

          Se sacó porque pedía traducir a mano una idea que es espacial: para
          poner un bloque arriba de otro había que abrir los dos, mirar sus
          números y elegir uno intermedio. Ahora el orden se cambia en la lista
          con las flechas, que es donde se ve el resultado.
        */}
        <label className="flex items-center gap-3">
          <Switch checked={published} onCheckedChange={setPublished} />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Publicada</span>
            <span className="text-muted-foreground text-xs">
              Sin publicar no aparece en la tienda, aunque tenga contenido.
            </span>
          </span>
        </label>

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

  const mover = useMutation({
    mutationFn: ({ desde, hacia }: { desde: number; hacia: number }) =>
      repositorioContenido(db).reordenarPiezas(
        tienda.id,
        moverEn(consulta.data ?? [], desde, hacia).map((p) => p.id),
      ),
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
              <Label htmlFor="p-subtitle">Subtítulo</Label>
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
        <ul aria-label={tipo === 'hero' ? 'Slides' : 'Avisos'} className="flex flex-col gap-2">
          {consulta.data!.map((p, i) => (
            <li key={p.id} className="border-border flex items-center gap-3 rounded-lg border p-3">
              <ControlDeOrden
                nombre={p.title}
                primero={i === 0}
                ultimo={i === consulta.data!.length - 1}
                pendiente={mover.isPending}
                onSubir={() => mover.mutate({ desde: i, hacia: i - 1 })}
                onBajar={() => mover.mutate({ desde: i, hacia: i + 1 })}
              />
              <img src={p.image.url} alt="" className="h-14 w-24 rounded object-cover" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{p.title}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {p.href ?? 'Sin enlace'}
                </span>
              </div>
              {!p.published && <Badge variant="secondary">Oculto</Badge>}
              <BotonDeIcono
                etiqueta={`Editar ${p.title}`}
                icono={PencilIcon}
                onClick={() => abrir(p)}
              />
              <BorrarConConfirmacion
                nombre={p.title}
                etiqueta={`Borrar ${p.title}`}
                pendiente={borrar.isPending}
                que={`Se quita ${tipo === 'hero' ? 'este slide' : 'este aviso'} de la sección. La imagen queda subida.`}
                onConfirmar={() => borrar.mutate(p.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
