import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { repositorioContenido } from '@pick/adapter-supabase';
import {
  moverEn,
  slugify,
  tipoDe,
  type CategoriaAdmin,
  type Coleccion,
  type SeccionDeHome,
} from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { LayoutTemplateIcon, PencilIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  BorrarConConfirmacion,
  BotonDeIcono,
  ControlDeOrden,
  EnlaceDeEdicion,
} from '@/components/acciones';
import { Esqueleto, EstadoDeError, EstadoVacio, PaginaAdmin, Tarjeta } from '@/components/pagina';
import { SelectorDeImagen } from './SelectorDeImagen';
import { ETIQUETA_ORDEN, ETIQUETA_TIPO } from './etiquetas';

type Pestana = 'secciones' | 'colecciones' | 'categorias';

const PESTANAS: readonly { id: Pestana; label: string }[] = [
  { id: 'secciones', label: 'Secciones' },
  { id: 'colecciones', label: 'Colecciones' },
  { id: 'categorias', label: 'Categorías' },
];

/**
 * El contenido de la tienda: secciones de la home, colecciones y categorías.
 *
 * Las tres en una sección con pestañas y no en tres del sidebar: son lo mismo
 * —lo que el comercio cura para la vidriera— y se tocan juntas. Con tres
 * entradas más el sidebar pasaba de siete a diez, y a partir de ahí una lista de
 * navegación deja de leerse de un vistazo.
 */
export function Contenido() {
  /*
   * La pestaña vive en la URL: guardar una colección vuelve acá, y sin esto
   * caía en Banners y la persona no veía lo que acababa de crear. Lo encontró el
   * smoke, no una lectura del código.
   *
   * `strict: false` porque este componente no declara la ruta: si alguna vez se
   * monta en otra, no se rompe por un tipo de search que no le corresponde. El
   * valor se valida contra `PESTANAS` igual, que es lo que importa.
   */
  const navegar = useNavigate();
  const buscada = useSearch({ strict: false }) as { tab?: string };
  const pestana: Pestana = PESTANAS.some((p) => p.id === buscada.tab)
    ? (buscada.tab as Pestana)
    : 'secciones';

  const setPestana = (tab: Pestana): void => {
    void navegar({ to: '/contenido', search: { tab } });
  };

  const puede = usePuede();
  const DESCRIPCION: Record<Pestana, string> = {
    secciones: 'Los bloques de la portada, de arriba hacia abajo. Sólo se ven los publicados.',
    colecciones: 'Listas de productos. Para mostrar una en la portada, creá una sección.',
    categorias: 'Cómo se agrupa el catálogo. La portada las muestra con su imagen.',
  };

  return (
    <PaginaAdmin
      titulo="Contenido"
      icono={LayoutTemplateIcon}
      descripcion={DESCRIPCION[pestana]}
      acciones={
        puede('catalog.write') &&
        (pestana === 'secciones' ? (
          <Link to="/contenido/secciones/nueva" className={buttonVariants({ size: 'lg' })}>
            Nueva sección
          </Link>
        ) : pestana === 'colecciones' ? (
          <Link to="/contenido/colecciones/nueva" className={buttonVariants({ size: 'lg' })}>
            Nueva colección
          </Link>
        ) : null)
      }
    >
      {/*
        Las pestañas viven **dentro** de la tarjeta, no encima.

        Es lo que hace el Admin de Shopify y resuelve una ambigüedad: una pestaña
        suelta arriba parece navegación de la aplicación, y la misma pestaña
        pegada a la lista se lee como lo que es —un filtro de lo que hay abajo—.
      */}
      <Tarjeta sinRelleno>
        <div
          role="tablist"
          aria-label="Tipo de contenido"
          className="border-border flex gap-1 border-b px-2"
        >
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={cn(
                'cursor-pointer border-b-2 px-3 py-2.5 text-sm transition-colors',
                pestana === p.id
                  ? 'border-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {pestana === 'secciones' && <PanelSecciones />}
        {pestana === 'colecciones' && <PanelColecciones />}
        {pestana === 'categorias' && <PanelCategorias />}
      </Tarjeta>
    </PaginaAdmin>
  );
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

function PanelSecciones() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: ['secciones', tienda.id],
    queryFn: () => repositorioContenido(db).secciones(tienda.id),
  });

  const colecciones = useQuery({
    queryKey: ['colecciones', tienda.id],
    queryFn: () => repositorioContenido(db).colecciones(tienda.id),
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['secciones', tienda.id] });

  const borrar = useMutation({
    mutationFn: (id: string) => repositorioContenido(db).borrarSeccion(tienda.id, id),
    onSuccess: refrescar,
  });

  const mover = useMutation({
    mutationFn: ({ desde, hacia }: { desde: number; hacia: number }) =>
      repositorioContenido(db).reordenarSecciones(
        tienda.id,
        moverEn(consulta.data ?? [], desde, hacia).map((s) => s.id),
      ),
    // Se refresca también al fallar: si algunas filas se movieron y otras no, lo
    // que hay que mostrar es lo que quedó en la base, no lo que se pidió.
    onSettled: refrescar,
  });

  const publicar = useMutation({
    mutationFn: ({ seccion, published }: { seccion: SeccionDeHome; published: boolean }) =>
      // La sección entera, no sólo el campo: el repositorio guarda el registro
      // completo, y mandar de menos borraría el layout o la colección apuntada.
      repositorioContenido(db).guardarSeccion(tienda.id, { ...seccion, published }, seccion.id),
    onSuccess: refrescar,
  });

  if (consulta.isError) {
    return (
      <EstadoDeError
        titulo="No se pudieron cargar las secciones"
        error={consulta.error as Error}
        onReintentar={() => void consulta.refetch()}
      />
    );
  }

  const nombreDeColeccion = (id?: string): string =>
    colecciones.data?.find((c) => c.id === id)?.title ?? '—';

  return (
    <>
      {/* Un fallo al mover, publicar o borrar no puede quedar en silencio: la
          lista se refresca sola y parecería que no pasó nada. */}
      {(mover.error ?? publicar.error ?? borrar.error) && (
        <p className="text-destructive border-b px-4 py-3 text-sm" role="alert">
          {((mover.error ?? publicar.error ?? borrar.error) as Error).message}
        </p>
      )}

      {consulta.isPending ? (
        <Esqueleto />
      ) : consulta.data!.length === 0 ? (
        <EstadoVacio
          titulo="La portada no tiene ninguna sección"
          accion={
            puede('catalog.write') && (
              <Link to="/contenido/secciones/nueva" className={buttonVariants({ size: 'lg' })}>
                Nueva sección
              </Link>
            )
          }
        >
          Una sección es un bloque de la portada: el banner principal, un carrusel de productos, la
          tira de categorías. Empezá por el banner.
        </EstadoVacio>
      ) : (
        // Filas divididas por una línea y no tarjetas sueltas: adentro de una
        // tarjeta, cada fila con su propio borde eran cajas dentro de una caja.
        <ul aria-label="Secciones de la portada" className="divide-border divide-y">
          {consulta.data!.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              {/*
                El orden **es** la lista, no un número que hay que traducir. Antes
                acá se mostraba `position` y había que abrir el formulario para
                cambiarlo, mirando los números de las otras para elegir uno
                intermedio.
              */}
              {puede('catalog.write') && (
                <ControlDeOrden
                  nombre={s.title ?? ETIQUETA_TIPO[s.type]}
                  primero={i === 0}
                  ultimo={i === consulta.data!.length - 1}
                  pendiente={mover.isPending}
                  onSubir={() => mover.mutate({ desde: i, hacia: i - 1 })}
                  onBajar={() => mover.mutate({ desde: i, hacia: i + 1 })}
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {s.title ?? ETIQUETA_TIPO[s.type]}
                  {s.type === 'products' && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · {nombreDeColeccion(s.collectionId)}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {ETIQUETA_TIPO[s.type]}
                  {(s.type === 'hero' || s.type === 'tiles') &&
                    ` · ${s.layout === 'slider' ? 'carrusel' : 'estático'}`}
                </span>
              </div>
              {/*
                El interruptor **es** el estado: prende y apaga la sección sin
                abrir su formulario, que es lo que se hace al armar una portada.
              */}
              <Switch
                checked={s.published}
                disabled={publicar.isPending || !puede('catalog.write')}
                onCheckedChange={(published) => publicar.mutate({ seccion: s, published })}
                aria-label={`${s.published ? 'Despublicar' : 'Publicar'} ${s.title ?? ETIQUETA_TIPO[s.type]}`}
              />
              {puede('catalog.write') && (
                <>
                  <EnlaceDeEdicion
                    etiqueta={`Editar ${s.title ?? ETIQUETA_TIPO[s.type]}`}
                    to="/contenido/secciones/$id"
                    params={{ id: s.id }}
                  />
                  <BorrarConConfirmacion
                    nombre={s.title ?? ETIQUETA_TIPO[s.type]}
                    etiqueta={`Borrar ${s.title ?? ETIQUETA_TIPO[s.type]}`}
                    pendiente={borrar.isPending}
                    que={
                      s.type === 'hero' || s.type === 'tiles'
                        ? 'Se borra el bloque y sus piezas. Las imágenes quedan subidas.'
                        : 'Se borra el bloque de la portada. La colección y sus productos no se tocan.'
                    }
                    onConfirmar={() => borrar.mutate(s.id)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Colecciones
// ---------------------------------------------------------------------------

function PanelColecciones() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: ['colecciones', tienda.id],
    queryFn: () => repositorioContenido(db).colecciones(tienda.id),
  });

  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: ['colecciones', tienda.id] });
    // Una sección de carrusel apunta a una colección: si se despublicó o se
    // borró, la lista de secciones también cambió de significado.
    await queryClient.invalidateQueries({ queryKey: ['secciones', tienda.id] });
  };

  const publicar = useMutation({
    mutationFn: ({ coleccion, published }: { coleccion: Coleccion; published: boolean }) =>
      // Se manda la colección entera porque el repositorio guarda todo el
      // registro. Sin repetir `rules` y `productIds`, prender el interruptor
      // convertiría una dinámica en una manual vacía.
      repositorioContenido(db).guardarColeccion(
        tienda.id,
        { ...coleccion, published },
        coleccion.id,
      ),
    onSuccess: refrescar,
  });

  const borrar = useMutation({
    mutationFn: (id: string) => repositorioContenido(db).borrarColeccion(tienda.id, id),
    onSuccess: refrescar,
  });

  if (consulta.isError) {
    return (
      <EstadoDeError
        titulo="No se pudieron cargar las colecciones"
        error={consulta.error as Error}
        onReintentar={() => void consulta.refetch()}
      />
    );
  }

  return (
    <>
      {(publicar.error ?? borrar.error) && (
        <p className="text-destructive border-b px-4 py-3 text-sm" role="alert">
          {((publicar.error ?? borrar.error) as Error).message}
        </p>
      )}

      {consulta.isPending ? (
        <Esqueleto />
      ) : consulta.data!.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay colecciones"
          accion={
            puede('catalog.write') && (
              <Link to="/contenido/colecciones/nueva" className={buttonVariants({ size: 'lg' })}>
                Nueva colección
              </Link>
            )
          }
        >
          Una colección es una lista de productos: se arma a mano o sola, con una regla. Después se
          muestra en la portada con una sección de carrusel.
        </EstadoVacio>
      ) : (
        <ul aria-label="Colecciones" className="divide-border divide-y">
          {consulta.data!.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{c.title}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {tipoDe(c) === 'dinamica'
                    ? `Se arma sola${c.sort ? `, por ${ETIQUETA_ORDEN[c.sort] ?? c.sort}` : ''}`
                    : `${c.productIds?.length ?? 0} productos elegidos a mano`}
                </span>
              </div>

              {/* Mismo criterio que en secciones: el interruptor es el estado. */}
              <Switch
                checked={c.published}
                disabled={publicar.isPending || !puede('catalog.write')}
                onCheckedChange={(published) => publicar.mutate({ coleccion: c, published })}
                aria-label={`${c.published ? 'Despublicar' : 'Publicar'} ${c.title}`}
              />

              {puede('catalog.write') && (
                <>
                  <EnlaceDeEdicion
                    etiqueta={`Editar ${c.title}`}
                    to="/contenido/colecciones/$id"
                    params={{ id: c.id }}
                  />
                  <BorrarConConfirmacion
                    nombre={c.title}
                    etiqueta={`Borrar ${c.title}`}
                    pendiente={borrar.isPending}
                    que="Se borra la lista, no los productos. Las secciones de la portada que la usaban dejan de mostrarse."
                    onConfirmar={() => borrar.mutate(c.id)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

const CATEGORIA_VACIA = {
  name: '',
  slug: '',
  position: 0,
  image: undefined as ProductImage | undefined,
};

function PanelCategorias() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<string | 'nueva' | null>(null);
  const [borrador, setBorrador] = useState(CATEGORIA_VACIA);
  const [error, setError] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['categorias-admin', tienda.id],
    queryFn: () => repositorioContenido(db).categorias(tienda.id),
  });

  const guardar = useMutation({
    mutationFn: () =>
      repositorioContenido(db).guardarCategoria(
        tienda.id,
        {
          name: borrador.name,
          slug: borrador.slug || slugify(borrador.name),
          position: borrador.position,
          ...(borrador.image ? { image: borrador.image } : {}),
        },
        editando === 'nueva' ? undefined : (editando ?? undefined),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categorias-admin', tienda.id] });
      // La home y el formulario de producto leen la otra clave.
      await queryClient.invalidateQueries({ queryKey: ['categorias', tienda.id] });
      setEditando(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function abrir(c?: CategoriaAdmin): void {
    setError(null);
    setEditando(c?.id ?? 'nueva');
    setBorrador(
      c
        ? { name: c.name, slug: c.slug, position: c.position, image: c.image }
        : { ...CATEGORIA_VACIA, position: consulta.data?.length ?? 0 },
    );
  }

  if (consulta.isError) {
    return (
      <EstadoDeError
        titulo="No se pudieron cargar las categorías"
        error={consulta.error as Error}
        onReintentar={() => void consulta.refetch()}
      />
    );
  }

  return (
    <>
      {/*
        La acción de este panel no puede vivir arriba en el encabezado como la de
        los otros dos: no navega a ninguna ruta, abre un formulario acá mismo. Va
        en una franja pegada a la lista, que es a lo que pertenece.
      */}
      {puede('catalog.write') && !editando && (
        <div className="border-border flex justify-end border-b px-4 py-3">
          <Button size="sm" onClick={() => abrir()}>
            Nueva categoría
          </Button>
        </div>
      )}

      {editando && (
        <div className="border-border flex flex-col gap-4 border-b p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-name">Nombre</Label>
              <Input
                id="c-name"
                value={borrador.name}
                onChange={(e) => setBorrador({ ...borrador, name: e.currentTarget.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-slug">Slug</Label>
              <Input
                id="c-slug"
                value={borrador.slug}
                placeholder={slugify(borrador.name)}
                onChange={(e) => setBorrador({ ...borrador, slug: e.currentTarget.value })}
              />
              <span className="text-muted-foreground text-xs">
                Va en la URL del catálogo. Vacío: sale del nombre.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-position">Posición</Label>
              <Input
                id="c-position"
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
            opcional
            valor={borrador.image}
            onChange={(image) => setBorrador({ ...borrador, image })}
          />

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || !borrador.name}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {consulta.isPending ? (
        <Esqueleto />
      ) : consulta.data!.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay categorías"
          accion={
            puede('catalog.write') &&
            !editando && (
              <Button size="lg" onClick={() => abrir()}>
                Nueva categoría
              </Button>
            )
          }
        >
          Son los grupos con los que se navega el catálogo. La portada las muestra con su imagen.
        </EstadoVacio>
      ) : (
        <ul aria-label="Categorías" className="divide-border divide-y">
          {consulta.data!.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              {c.image ? (
                <img src={c.image.url} alt="" className="size-10 rounded-md object-cover" />
              ) : (
                <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-md text-[10px]">
                  sin foto
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground truncate text-xs">/{c.slug}</span>
              </div>
              {puede('catalog.write') && (
                <BotonDeIcono
                  etiqueta={`Editar ${c.name}`}
                  icono={PencilIcon}
                  onClick={() => abrir(c)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
