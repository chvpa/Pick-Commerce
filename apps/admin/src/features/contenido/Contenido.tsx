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
} from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { PencilIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  BorrarConConfirmacion,
  BotonDeIcono,
  ControlDeOrden,
  EnlaceDeEdicion,
} from '@/components/acciones';
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

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Tipo de contenido" className="border-border flex gap-1 border-b">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={cn(
              'cursor-pointer border-b-2 px-4 py-2 text-sm transition-colors',
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
    </div>
  );
}

/** Lo que se muestra cuando una consulta falla, en vez de una lista vacía mentirosa. */
function ErrorDeCarga({ error, reintentar }: { error: Error; reintentar: () => void }) {
  return (
    <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
      <p className="text-sm">No se pudo cargar.</p>
      <p className="text-muted-foreground text-xs">{error.message}</p>
      <Button variant="outline" size="sm" onClick={reintentar}>
        Reintentar
      </Button>
    </div>
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

  if (consulta.isError) {
    return (
      <ErrorDeCarga error={consulta.error as Error} reintentar={() => void consulta.refetch()} />
    );
  }

  const nombreDeColeccion = (id?: string): string =>
    colecciones.data?.find((c) => c.id === id)?.title ?? '—';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Los bloques de la home, de arriba hacia abajo. Sólo se ven los publicados.
        </p>
        {puede('catalog.write') && (
          <Link to="/contenido/secciones/nueva" className={buttonVariants({ size: 'sm' })}>
            Nueva sección
          </Link>
        )}
      </div>

      {/* Un fallo al mover o al borrar no puede quedar en silencio: la lista se
          refresca sola y parecería que no pasó nada. */}
      {(mover.error ?? borrar.error) && (
        <p className="text-destructive text-sm" role="alert">
          {((mover.error ?? borrar.error) as Error).message}
        </p>
      )}

      {consulta.isPending ? (
        <div className="bg-muted h-20 animate-pulse rounded-lg" />
      ) : consulta.data!.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          La home no tiene ninguna sección. Empezá por un banner principal.
        </p>
      ) : (
        <ul aria-label="Secciones de la portada" className="flex flex-col gap-2">
          {consulta.data!.map((s, i) => (
            <li key={s.id} className="border-border flex items-center gap-3 rounded-lg border p-3">
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
              <Badge variant={s.published ? 'default' : 'secondary'}>
                {s.published ? 'Publicada' : 'Borrador'}
              </Badge>
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
    </div>
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
    return <ErrorDeCarga error={consulta.error as Error} reintentar={() => void consulta.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Listas de productos. Para mostrar una en la portada, creá una sección de carrusel.
        </p>
        {puede('catalog.write') && (
          <Link to="/contenido/colecciones/nueva" className={buttonVariants({ size: 'sm' })}>
            Nueva colección
          </Link>
        )}
      </div>

      {consulta.isPending ? (
        <div className="bg-muted h-20 animate-pulse rounded-lg" />
      ) : consulta.data!.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Todavía no hay colecciones. Son las que arman los carruseles de la home.
        </p>
      ) : (
        <ul aria-label="Colecciones" className="flex flex-col gap-2">
          {consulta.data!.map((c) => (
            <li key={c.id} className="border-border flex items-center gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{c.title}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {tipoDe(c) === 'dinamica'
                    ? `Se arma sola${c.sort ? `, por ${ETIQUETA_ORDEN[c.sort] ?? c.sort}` : ''}`
                    : `${c.productIds?.length ?? 0} productos elegidos a mano`}
                </span>
              </div>

              {puede('catalog.write') ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <Switch
                    checked={c.published}
                    disabled={publicar.isPending}
                    onCheckedChange={(published) => publicar.mutate({ coleccion: c, published })}
                    aria-label={`${c.published ? 'Despublicar' : 'Publicar'} ${c.title}`}
                  />
                  <Badge variant={c.published ? 'default' : 'secondary'}>
                    {c.published ? 'Publicada' : 'Borrador'}
                  </Badge>
                </label>
              ) : (
                <Badge variant={c.published ? 'default' : 'secondary'}>
                  {c.published ? 'Publicada' : 'Borrador'}
                </Badge>
              )}

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
    </div>
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
    return <ErrorDeCarga error={consulta.error as Error} reintentar={() => void consulta.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          La home las muestra con su imagen. Sin imagen se ven igual, sólo con el nombre.
        </p>
        {puede('catalog.write') && !editando && (
          <Button size="sm" onClick={() => abrir()}>
            Nueva categoría
          </Button>
        )}
      </div>

      {editando && (
        <div className="border-border flex flex-col gap-4 rounded-lg border p-5">
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
        <div className="bg-muted h-20 animate-pulse rounded-lg" />
      ) : consulta.data!.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Todavía no hay categorías.
        </p>
      ) : (
        <ul aria-label="Categorías" className="flex flex-col gap-2">
          {consulta.data!.map((c) => (
            <li key={c.id} className="border-border flex items-center gap-4 rounded-lg border p-3">
              {c.image ? (
                <img src={c.image.url} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded text-[10px]">
                  sin foto
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  /{c.slug} · posición {c.position}
                </span>
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
    </div>
  );
}
