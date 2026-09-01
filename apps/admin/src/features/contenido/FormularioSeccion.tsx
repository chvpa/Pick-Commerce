import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { repositorioContenido } from '@pick/adapter-supabase';
import {
  COLUMNAS_POR_DEFECTO,
  categoriasDe,
  columnasDe,
  moverEn,
  type Banner,
  type LayoutDeSeccion,
  type SeccionDeHome,
  type TipoDeSeccion,
} from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import { LayoutTemplateIcon } from '@/components/iconos';
import { Badge } from '@/components/ui/badge';
import {
  BarraDeAcciones,
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Selector,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Campo } from '@/components/campo';
import { BorrarConConfirmacion, BotonDeIcono, ControlDeOrden } from '@/components/acciones';
import { PencilIcon } from '@/components/iconos';
import { Switch } from '@/components/ui/switch';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { PanelDeEdicion } from '@/components/panel';
import { SelectorDeCategorias } from './SelectorDeCategorias';
import { SelectorDeDestino } from './SelectorDeDestino';
import { SelectorDeImagen } from './SelectorDeImagen';
import { AYUDA_TIPO, ETIQUETA_TIPO } from './etiquetas';
import { SelectItem } from '@/components/ui/select';

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
      <PaginaAdmin titulo="Sección" icono={LayoutTemplateIcon}>
        <Tarjeta sinRelleno>
          <Esqueleto />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (existentes.isError) {
    return (
      <PaginaAdmin titulo="Sección" icono={LayoutTemplateIcon}>
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudieron cargar las secciones"
            error={existentes.error as Error}
            onReintentar={() => void existentes.refetch()}
          />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  const seccion = id ? existentes.data.find((s) => s.id === id) : undefined;

  if (id && !seccion) {
    return (
      <PaginaAdmin titulo="Sección" icono={LayoutTemplateIcon}>
        <Tarjeta sinRelleno>
          <EstadoVacio titulo="Esa sección ya no existe">
            Puede que la hayan borrado desde otra pestaña.
          </EstadoVacio>
        </Tarjeta>
      </PaginaAdmin>
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
  const [categoryIds, setCategoryIds] = useState<readonly string[]>(
    inicial ? categoriasDe(inicial.settings) : [],
  );
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
          settings:
            type === 'tiles'
              ? { columns: Number(columns) || COLUMNAS_POR_DEFECTO }
              : type === 'categories'
                ? { categoryIds }
                : {},
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
      await navegar({ to: '/contenido/secciones' });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <PaginaAdmin
      titulo={id ? 'Editar sección' : 'Nueva sección'}
      icono={LayoutTemplateIcon}
      descripcion={id ? ETIQUETA_TIPO[type] : 'Un bloque de la portada.'}
    >
      <div className="flex max-w-2xl flex-col gap-5">
        <Tarjeta sinRelleno>
          <TituloDeTarjeta>La sección</TituloDeTarjeta>
          <form
            id="form-seccion"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              guardar.mutate();
            }}
            className="flex flex-col gap-6 p-4"
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
                <Selector
                  id="type"
                  value={type}
                  onValueChange={(valor) => setType(valor as TipoDeSeccion)}
                >
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ETIQUETA_TIPO[t]}
                    </SelectItem>
                  ))}
                </Selector>
              </Campo>
            )}

            {type === 'products' && (
              <Campo id="collection" label="Colección">
                <Selector
                  id="collection"
                  value={collectionId}
                  onValueChange={(valor) => setCollectionId(valor)}
                >
                  <SelectItem value="">Elegí una colección</SelectItem>
                  {(colecciones.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </Selector>
              </Campo>
            )}

            {/*
          El banner principal no lleva encabezado propio.

          Su texto va **en cada slide**, encima de la foto: un título de sección
          arriba del hero sería un segundo título compitiendo con el de la pieza,
          y el storefront ni siquiera lo dibuja. Ofrecer un campo que no se ve en
          ningún lado es peor que no ofrecerlo.
        */}
            {type !== 'hero' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  id="title"
                  label="Encabezado"
                  ayuda="El título que se ve arriba del bloque. Vacío: sin encabezado."
                >
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                  />
                </Campo>

                <Campo id="subtitle" label="Subtítulo" ayuda="Opcional. Va abajo del encabezado.">
                  <Input
                    id="subtitle"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.currentTarget.value)}
                  />
                </Campo>
              </div>
            )}

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
                  <Selector
                    id="layout"
                    value={layout}
                    onValueChange={(valor) => setLayout(valor as LayoutDeSeccion)}
                  >
                    <SelectItem value="static">{ESTATICO[type]}</SelectItem>
                    <SelectItem value="slider">Pasando de a una (slides)</SelectItem>
                  </Selector>
                </Campo>

                {type === 'tiles' && layout === 'static' && (
                  <Campo id="columns" label="Columnas" ayuda="En teléfono siempre va una por fila.">
                    <Selector
                      id="columns"
                      value={columns}
                      onValueChange={(valor) => setColumns(valor)}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </Selector>
                  </Campo>
                )}
              </div>
            )}

            {type === 'categories' && (
              <SelectorDeCategorias seleccion={categoryIds} onChange={setCategoryIds} />
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
          </form>
        </Tarjeta>

        {/* Las piezas se cargan con la sección ya creada: cuelgan de ella. */}
        {id && llevaPiezas(type) && <Piezas sectionId={id} tipo={type} />}
      </div>
      <BarraDeAcciones>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => void navegar({ to: '/contenido/secciones' })}
        >
          Cancelar
        </Button>
        {/*
      El botón vive fuera del `<form>` y lo envía por su id: es el atributo
      `form` de HTML. Sin él habría que meter el formulario alrededor de
      toda la página, y las piezas —que traen sus propios botones— quedarían
      adentro enviándolo sin querer.
      */}
        <Button type="submit" form="form-seccion" size="lg" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear sección'}
        </Button>
      </BarraDeAcciones>
    </PaginaAdmin>
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
    <Tarjeta sinRelleno>
      <TituloDeTarjeta
        accion={
          !editando && (
            <Button type="button" size="sm" onClick={() => abrir()}>
              Agregar {singular}
            </Button>
          )
        }
      >
        {tipo === 'hero' ? 'Slides' : 'Avisos'}
      </TituloDeTarjeta>

      <div className="flex flex-col gap-4 p-4">
        <p className="text-muted-foreground text-xs">
          {tipo === 'hero'
            ? 'Con más de uno se pasan; con uno solo es un banner fijo. El título y el subtítulo van acá, en cada slide, no en la sección.'
            : 'Cada aviso es una imagen con su título y su enlace.'}
        </p>

        {/*
          El editor es un panel y no un bloque encima de la lista.

          En línea competía con la barra de acciones de la sección —dos pares de
          «Guardar» a la vez, y la barra pegajosa flotando sobre los campos— y en
          una lista larga mandaba la vista al tope para editar el último.
        */}
        <PanelDeEdicion
          abierto={editando !== null}
          onCerrar={() => setEditando(null)}
          titulo={editando === 'nueva' ? `Nuevo ${singular}` : `Editar ${singular}`}
          acciones={
            <>
              <Button variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <>
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
              <SelectorDeDestino
                id="p-href"
                valor={borrador.href}
                onChange={(href) => setBorrador({ ...borrador, href })}
              />
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
              {/*
                Acá estaba «posición» como un número.

                Se sacó por lo mismo que se había sacado de la sección: al crear
                una pieza no hay contra qué compararla, y para ponerla entre dos
                que ya existen había que abrirlas, mirar sus números y elegir uno
                intermedio. Una pieza nueva va al final, y el orden se cambia con
                las flechas de la lista, que es donde se ve el resultado.
              */}
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
          </>
        </PanelDeEdicion>

        {consulta.isPending ? (
          <div className="bg-muted h-16 animate-pulse rounded-lg" />
        ) : consulta.data!.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Esta sección todavía no tiene {tipo === 'hero' ? 'slides' : 'avisos'}. Sin al menos uno
            no se dibuja en la home.
          </p>
        ) : (
          <ul aria-label={tipo === 'hero' ? 'Slides' : 'Avisos'} className="flex flex-col gap-2">
            {consulta.data!.map((p, i) => (
              <li
                key={p.id}
                className="border-border flex items-center gap-3 rounded-lg border p-3"
              >
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
      </div>
    </Tarjeta>
  );
}
