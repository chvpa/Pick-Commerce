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
import { LayoutTemplateIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import {
  BarraDeAcciones,
  Esqueleto,
  EstadoDeError,
  PaginaAdmin,
  Selector,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Campo } from '@/components/campo';
import { Switch } from '@/components/ui/switch';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { SelectItem } from '@/components/ui/select';

const ORDENES: readonly { valor: CatalogSort; label: string }[] = [
  { valor: 'relevance', label: 'Como están en el catálogo' },
  { valor: 'newest', label: 'Novedades (lo último que entró)' },
  { valor: 'best-selling', label: 'Más vendidos' },
  { valor: 'price-asc', label: 'Precio, de menor a mayor' },
  { valor: 'price-desc', label: 'Precio, de mayor a menor' },
  { valor: 'title-asc', label: 'Título, alfabético' },
];

/**
 * Los órdenes que se arman solos con lo que hace la gente.
 *
 * Van separados y con su propia etiqueta porque no son lo mismo que los de
 * arriba: éstos cambian sin que nadie toque nada, y eso hay que decirlo antes de
 * que el comercio se pregunte por qué su colección se ve distinta hoy.
 */
const ORDENES_AUTOMATICOS: readonly { valor: CatalogSort; label: string }[] = [
  { valor: 'trending', label: 'Tendencia (lo que se está moviendo)' },
  { valor: 'preferencias', label: 'Preferencias (se adapta a cada visitante)' },
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
      <PaginaAdmin titulo="Editar colección" icono={LayoutTemplateIcon}>
        <Tarjeta sinRelleno>
          <Esqueleto />
        </Tarjeta>
      </PaginaAdmin>
    );
  }

  if (existente.isError) {
    return (
      <PaginaAdmin titulo="Editar colección" icono={LayoutTemplateIcon}>
        <Tarjeta sinRelleno>
          <EstadoDeError
            titulo="No se pudo cargar la colección"
            error={existente.error as Error}
            onReintentar={() => void existente.refetch()}
          />
        </Tarjeta>
      </PaginaAdmin>
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
  // Se conserva el handle de una colección que ya existe y se deriva del nombre
  // al crearla. No se ofrece: ver el comentario del formulario más abajo.
  const handle = inicial?.handle ?? '';
  const [subtitle, setSubtitle] = useState(inicial?.subtitle ?? '');
  const [published, setPublished] = useState(inicial?.published ?? false);
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
          ...(dinamica ? { sort, rules: reglas } : { productIds }),
        },
        id,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['colecciones', tienda.id] });
      await navegar({ to: '/contenido/colecciones' });
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
    >
      <PaginaAdmin
        titulo={id ? 'Editar colección' : 'Nueva colección'}
        icono={LayoutTemplateIcon}
        descripcion="Una lista de productos. Para mostrarla en la portada, creá una sección de carrusel."
      >
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="flex max-w-2xl flex-col gap-5">
          <Tarjeta sinRelleno>
            <TituloDeTarjeta>La colección</TituloDeTarjeta>
            <div className="flex flex-col gap-6 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="title" label="Nombre" ayuda="Es el encabezado del carrusel en la home.">
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                  />
                </Campo>

                {/*
          El handle no se muestra.

          Es la dirección con la que el storefront pide la colección, sale del
          nombre y no hay nada que decidir ahí. Ofrecerlo era pedirle a alguien
          que elija un identificador técnico —y equivocarse tenía consecuencias
          que no se ven hasta que una sección deja de encontrar sus productos.
          Se conserva el que ya tenga una colección editada: cambiarlo en
          silencio rompería lo que la apunte.
        */}

                <Campo
                  id="subtitle"
                  label="Subtítulo"
                  ayuda="Opcional. Va abajo del nombre, más chico."
                >
                  <Input
                    id="subtitle"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.currentTarget.value)}
                  />
                </Campo>
              </div>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-sm font-medium">Cómo se arma</legend>
                <Selector
                  value={dinamica ? 'dinamica' : 'manual'}
                  onValueChange={(valor) => setDinamica(valor === 'dinamica')}
                  aria-label="Cómo se arma la colección"
                >
                  <SelectItem value="manual">La armo yo, eligiendo productos</SelectItem>
                  <SelectItem value="dinamica">Se arma sola, con una regla</SelectItem>
                </Selector>

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

              {/*
        Acá estaba «mostrar como sección de la home» con su posición.

        Se sacó porque decía lo mismo desde dos lados. Una colección **se pone**
        en la home creando una sección de tipo carrusel que la apunte, y ahí se
        elige el orden arrastrándola entre las demás. Con las dos puertas, mover
        una colección en Contenido → Secciones no coincidía con lo que decía este
        formulario, y no había forma de saber cuál mandaba.
      */}
              <label className="flex items-center gap-3">
                <Switch checked={published} onCheckedChange={setPublished} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Publicada</span>
                  <span className="text-muted-foreground text-xs">
                    Despublicada, las secciones que la usan dejan de dibujarse.
                  </span>
                </span>
              </label>
            </div>
          </Tarjeta>
        </div>
        <BarraDeAcciones>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void navegar({ to: '/contenido/colecciones' })}
          >
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={guardar.isPending || !title}>
            {guardar.isPending ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear colección'}
          </Button>
        </BarraDeAcciones>
      </PaginaAdmin>
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
        <Selector id="sort" value={sort} onValueChange={(valor) => onSort(valor as CatalogSort)}>
          {[...ORDENES, ...ORDENES_AUTOMATICOS].map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.label}
            </SelectItem>
          ))}
        </Selector>
        {sort === 'preferencias' && (
          <span className="text-muted-foreground text-xs">
            Cada visitante ve primero las marcas y categorías que viene mirando. Si es su primera
            visita, ve lo que se está moviendo; y si la tienda todavía no tiene tráfico, el orden
            del catálogo. Nunca queda vacía.
          </span>
        )}
        {sort === 'trending' && (
          <span className="text-muted-foreground text-xs">
            Se arma solo con lo que la gente miró y compró esta semana. Si todavía no hay datos
            suficientes, se muestra el orden del catálogo: la colección nunca queda vacía.
          </span>
        )}
        {sort === 'best-selling' && (
          <span className="text-muted-foreground text-xs">
            Con la tienda todavía sin ventas, todos los productos empatan en cero y el orden queda
            arbitrario. Conviene publicarla cuando haya pedidos.
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
                  onChange(ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id])
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
