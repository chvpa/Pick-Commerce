import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { repositorioContenido } from '@pick/adapter-supabase';
import { slugify, tipoDe, type Banner, type CategoriaAdmin } from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { SelectorDeImagen } from './SelectorDeImagen';

type Pestana = 'banners' | 'colecciones' | 'categorias';

const PESTANAS: readonly { id: Pestana; label: string }[] = [
  { id: 'banners', label: 'Banners' },
  { id: 'colecciones', label: 'Colecciones' },
  { id: 'categorias', label: 'Categorías' },
];

/**
 * El contenido de la tienda: banners, colecciones y categorías.
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
    : 'banners';

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

      {pestana === 'banners' && <PanelBanners />}
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
// Banners
// ---------------------------------------------------------------------------

const BANNER_VACIO = {
  title: '',
  subtitle: '',
  href: '',
  position: 0,
  published: false,
  image: undefined as ProductImage | undefined,
  imageMobile: undefined as ProductImage | undefined,
};

function PanelBanners() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null);
  const [borrador, setBorrador] = useState(BANNER_VACIO);
  const [error, setError] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['banners', tienda.id],
    queryFn: () => repositorioContenido(db).banners(tienda.id),
  });

  const guardar = useMutation({
    mutationFn: async () => {
      if (!borrador.image) throw new Error('El banner necesita una imagen.');
      return repositorioContenido(db).guardarBanner(
        tienda.id,
        {
          title: borrador.title,
          ...(borrador.subtitle ? { subtitle: borrador.subtitle } : {}),
          image: borrador.image,
          ...(borrador.imageMobile ? { imageMobile: borrador.imageMobile } : {}),
          ...(borrador.href ? { href: borrador.href } : {}),
          position: borrador.position,
          published: borrador.published,
        },
        editando === 'nuevo' ? undefined : (editando ?? undefined),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['banners', tienda.id] });
      setEditando(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => repositorioContenido(db).borrarBanner(tienda.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['banners', tienda.id] }),
  });

  function abrir(b?: Banner): void {
    setError(null);
    setEditando(b?.id ?? 'nuevo');
    setBorrador(
      b
        ? {
            title: b.title,
            subtitle: b.subtitle ?? '',
            href: b.href ?? '',
            position: b.position,
            published: b.published,
            image: b.image,
            imageMobile: b.imageMobile,
          }
        : { ...BANNER_VACIO, position: (consulta.data?.length ?? 0) },
    );
  }

  if (consulta.isError) {
    return <ErrorDeCarga error={consulta.error as Error} reintentar={() => void consulta.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Piezas de la home, en orden. Sólo se ven las publicadas.
        </p>
        {puede('catalog.write') && !editando && (
          <Button size="sm" onClick={() => abrir()}>
            Nuevo banner
          </Button>
        )}
      </div>

      {editando && (
        <div className="border-border flex flex-col gap-4 rounded-lg border p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-title">Título</Label>
              <Input
                id="b-title"
                value={borrador.title}
                onChange={(e) => setBorrador({ ...borrador, title: e.currentTarget.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-subtitle">Bajada</Label>
              <Input
                id="b-subtitle"
                value={borrador.subtitle}
                onChange={(e) => setBorrador({ ...borrador, subtitle: e.currentTarget.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-href">A dónde lleva</Label>
              <Input
                id="b-href"
                value={borrador.href}
                placeholder="/catalogo?categoria=calzado"
                onChange={(e) => setBorrador({ ...borrador, href: e.currentTarget.value })}
              />
              <span className="text-muted-foreground text-xs">
                Una ruta de la tienda. Vacío: el banner no enlaza.
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-position">Posición</Label>
              <Input
                id="b-position"
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
            <span className="text-sm">Publicado</span>
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
        <div className="bg-muted h-20 animate-pulse rounded-lg" />
      ) : consulta.data!.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Todavía no hay banners.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {consulta.data!.map((b) => (
            <li
              key={b.id}
              className="border-border flex items-center gap-4 rounded-lg border p-3"
            >
              <img src={b.image.url} alt="" className="h-14 w-24 rounded object-cover" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{b.title}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {b.href ?? 'Sin enlace'} · posición {b.position}
                </span>
              </div>
              <Badge variant={b.published ? 'default' : 'secondary'}>
                {b.published ? 'Publicado' : 'Borrador'}
              </Badge>
              {puede('catalog.write') && (
                <>
                  <Button variant="outline" size="sm" onClick={() => abrir(b)}>
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={borrar.isPending}
                    onClick={() => borrar.mutate(b.id)}
                  >
                    Borrar
                  </Button>
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

  const consulta = useQuery({
    queryKey: ['colecciones', tienda.id],
    queryFn: () => repositorioContenido(db).colecciones(tienda.id),
  });

  if (consulta.isError) {
    return <ErrorDeCarga error={consulta.error as Error} reintentar={() => void consulta.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Las que tienen posición son las secciones de la home, de arriba hacia abajo.
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
        <ul className="flex flex-col gap-2">
          {consulta.data!.map((c) => (
            <li key={c.id} className="border-border flex items-center gap-4 rounded-lg border p-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{c.title}</span>
                <span className="text-muted-foreground truncate text-xs">
                  /{c.handle} ·{' '}
                  {tipoDe(c) === 'dinamica'
                    ? `dinámica${c.sort ? `, por ${c.sort}` : ''}`
                    : 'manual'}
                </span>
              </div>
              {c.homePosition !== undefined && (
                <Badge variant="outline">Home · {c.homePosition}</Badge>
              )}
              <Badge variant={c.published ? 'default' : 'secondary'}>
                {c.published ? 'Publicada' : 'Borrador'}
              </Badge>
              {puede('catalog.write') && (
                <Link
                  to="/contenido/colecciones/$id"
                  params={{ id: c.id }}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Editar
                </Link>
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
        <ul className="flex flex-col gap-2">
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
                <Button variant="outline" size="sm" onClick={() => abrir(c)}>
                  Editar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
