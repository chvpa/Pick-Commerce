import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { repositorioAdminCatalogo, repositorioContenido } from '@pick/adapter-supabase';
import {
  slugify,
  type CatalogFilters,
  type CatalogSort,
  type Coleccion,
} from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const SELECT =
  'border-border bg-background focus-visible:border-ring focus-visible:ring-ring/50 ' +
  'h-9 cursor-pointer rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3';

const ORDENES: readonly { valor: CatalogSort; label: string }[] = [
  { valor: 'relevance', label: 'Como están en el catálogo' },
  { valor: 'newest', label: 'Novedades (lo último que entró)' },
  { valor: 'best-selling', label: 'Más vendidos' },
  { valor: 'price-asc', label: 'Precio, de menor a mayor' },
  { valor: 'price-desc', label: 'Precio, de mayor a menor' },
  { valor: 'title-asc', label: 'Título, alfabético' },
];

/**
 * Alta y edición de una colección.
 *
 * Manual o dinámica, y la diferencia es lo único que cambia el formulario: la
 * manual elige productos a mano, la dinámica guarda una consulta. No es una
 * decisión de implementación que se filtró a la interfaz — es la decisión que el
 * comercio toma: «esta lista la armo yo» contra «esta se arma sola».
 */
export function FormularioColeccion({ id }: { id?: string }) {
  const tienda = useTiendaActiva();

  const existente = useQuery({
    queryKey: ['coleccion', tienda.id, id],
    queryFn: () => repositorioContenido(db).coleccion(tienda.id, id!),
    enabled: Boolean(id),
  });

  if (id && existente.isPending) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Cargando la colección…
      </p>
    );
  }

  if (existente.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        No se pudo cargar la colección: {(existente.error as Error).message}
      </p>
    );
  }

  /*
   * Los campos se montan **con** el dato, no vacíos y rellenados después.
   *
   * El primer intento usaba un efecto que hacía `setState` al llegar la
   * consulta, y el compilador de React lo rechaza con razón: eso encadena
   * renders, y acá además hay un momento —corto pero real— en el que el
   * formulario muestra valores vacíos sobre una colección que sí existe.
   * Separando la carga del formulario, el estado inicial ya es el correcto.
   */
  return <Campos key={id ?? 'nueva'} id={id} inicial={existente.data ?? undefined} />;
}

function Campos({ id, inicial }: { id?: string; inicial?: Coleccion }) {
  const tienda = useTiendaActiva();
  const navegar = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(inicial?.title ?? '');
  const [handle, setHandle] = useState(inicial?.handle ?? '');
  const [subtitle, setSubtitle] = useState(inicial?.subtitle ?? '');
  const [published, setPublished] = useState(inicial?.published ?? false);
  const [enHome, setEnHome] = useState(inicial?.homePosition !== undefined);
  const [homePosition, setHomePosition] = useState(String(inicial?.homePosition ?? 0));
  const [dinamica, setDinamica] = useState(Boolean(inicial?.rules));
  const [sort, setSort] = useState<CatalogSort>(inicial?.sort ?? 'relevance');
  const [reglas, setReglas] = useState<CatalogFilters>(inicial?.rules ?? {});
  const [productIds, setProductIds] = useState<readonly string[]>(inicial?.productIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () =>
      repositorioContenido(db).guardarColeccion(
        tienda.id,
        {
          title,
          handle: handle || slugify(title),
          ...(subtitle ? { subtitle } : {}),
          published,
          ...(enHome ? { homePosition: Number(homePosition) || 0 } : {}),
          ...(dinamica ? { sort, rules: reglas } : { productIds }),
        },
        id,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['colecciones', tienda.id] });
      await navegar({ to: '/contenido', search: { tab: 'colecciones' } });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        guardar.mutate();
      }}
      className="flex max-w-2xl flex-col gap-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">Título</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
          <span className="text-muted-foreground text-xs">
            Es el encabezado del carrusel en la home.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="handle">Handle</Label>
          <Input
            id="handle"
            value={handle}
            placeholder={slugify(title)}
            onChange={(e) => setHandle(e.currentTarget.value)}
          />
          <span className="text-muted-foreground text-xs">Vacío: sale del título.</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subtitle">Bajada</Label>
        <Input
          id="subtitle"
          value={subtitle}
          onChange={(e) => setSubtitle(e.currentTarget.value)}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Cómo se arma</legend>
        <select
          value={dinamica ? 'dinamica' : 'manual'}
          onChange={(e) => setDinamica(e.currentTarget.value === 'dinamica')}
          className={SELECT}
          aria-label="Cómo se arma la colección"
        >
          <option value="manual">La armo yo, eligiendo productos</option>
          <option value="dinamica">Se arma sola, con una regla</option>
        </select>

        {dinamica ? (
          <ReglasDinamicas
            sort={sort}
            onSort={setSort}
            reglas={reglas}
            onReglas={setReglas}
          />
        ) : (
          <SelectorDeProductos ids={productIds} onChange={setProductIds} />
        )}
      </fieldset>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3">
          <Switch checked={published} onCheckedChange={setPublished} />
          <span className="text-sm">Publicada</span>
        </label>

        <label className="flex items-center gap-3">
          <Switch checked={enHome} onCheckedChange={setEnHome} />
          <span className="text-sm">Mostrar como sección de la home</span>
        </label>

        {enHome && (
          <div className="flex flex-col gap-1.5 pl-12">
            <Label htmlFor="homePosition">Posición en la home</Label>
            <Input
              id="homePosition"
              inputMode="numeric"
              value={homePosition}
              onChange={(e) => setHomePosition(e.currentTarget.value)}
              className="w-24"
            />
            <span className="text-muted-foreground text-xs">
              Menor primero. Una sección sin productos no se dibuja.
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={guardar.isPending || !title}>
          {guardar.isPending ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear colección'}
        </Button>
        <Button type="button" variant="outline" onClick={() => void navegar({ to: '/contenido', search: { tab: 'colecciones' } })}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * La regla de una colección dinámica.
 *
 * Se edita como facetas —marca, categoría, atributos— porque **es** lo que la
 * PLP filtra: `rules` tiene exactamente la forma de `CatalogFilters` y la
 * resuelve el mismo `catalog_search` (ADR-056). Sin reglas, la colección es
 * "todo el catálogo con este orden", que es justo lo que hace falta para
 * novedades y más vendidos.
 */
function ReglasDinamicas({
  sort,
  onSort,
  reglas,
  onReglas,
}: {
  sort: CatalogSort;
  onSort: (s: CatalogSort) => void;
  reglas: CatalogFilters;
  onReglas: (r: CatalogFilters) => void;
}) {
  const tienda = useTiendaActiva();

  // Las facetas disponibles salen del catálogo real, no de una lista fija: cada
  // tienda tiene los atributos que cargó.
  const facetas = useQuery({
    queryKey: ['facetas-para-coleccion', tienda.id],
    queryFn: async () => {
      const { repositorioCatalogo } = await import('@pick/adapter-supabase');
      return repositorioCatalogo(db).buscar(tienda.id, { perPage: 1 });
    },
  });

  function alternar(name: string, value: string): void {
    const actuales = reglas[name] ?? [];
    const siguientes = actuales.includes(value)
      ? actuales.filter((v) => v !== value)
      : [...actuales, value];

    const copia = { ...reglas };
    if (siguientes.length === 0) delete copia[name];
    else copia[name] = siguientes;
    onReglas(copia);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sort">Orden</Label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => onSort(e.currentTarget.value as CatalogSort)}
          className={SELECT}
        >
          {ORDENES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.label}
            </option>
          ))}
        </select>
        {sort === 'best-selling' && (
          <span className="text-muted-foreground text-xs">
            Con la tienda todavía sin ventas, todos los productos empatan en cero y el orden
            queda arbitrario. Conviene publicarla cuando haya pedidos.
          </span>
        )}
      </div>

      <div className="border-border flex flex-col gap-4 rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">
          Sin nada marcado, la colección es todo el catálogo con ese orden.
        </p>
        {facetas.isPending ? (
          <p className="text-muted-foreground text-sm">Cargando filtros…</p>
        ) : (
          facetas.data?.facets.map((f) => (
            <div key={f.name} className="flex flex-col gap-2">
              <span className="text-sm font-medium capitalize">{f.name}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {f.values.map((v) => (
                  <label key={v.value} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={(reglas[f.name] ?? []).includes(v.value)}
                      onCheckedChange={() => alternar(f.name, v.value)}
                    />
                    {v.value}
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Los productos de una colección manual, en el orden en que se eligen. */
function SelectorDeProductos({
  ids,
  onChange,
}: {
  ids: readonly string[];
  onChange: (ids: readonly string[]) => void;
}) {
  const tienda = useTiendaActiva();
  const [texto, setTexto] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(texto), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const consulta = useQuery({
    queryKey: ['productos-para-coleccion', tienda.id, query],
    queryFn: () => repositorioAdminCatalogo(db).listar(tienda.id, { query, page: 1, perPage: 20 }),
  });

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      <Input
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        placeholder="Buscar productos"
        aria-label="Buscar productos"
      />
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {ids.length} elegido{ids.length === 1 ? '' : 's'}
        {consulta.data && consulta.data.total > 20
          ? ` · se muestran los primeros 20 de ${consulta.data.total}`
          : ''}
      </p>
      <div className={cn('flex max-h-64 flex-col gap-2 overflow-y-auto')}>
        {consulta.isPending ? (
          <p className="text-muted-foreground text-sm">Buscando…</p>
        ) : (consulta.data?.items ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">Ningún producto coincide.</p>
        ) : (
          consulta.data!.items.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={ids.includes(p.id)}
                onCheckedChange={() =>
                  onChange(
                    ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id],
                  )
                }
              />
              <span className="truncate">{p.title}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
