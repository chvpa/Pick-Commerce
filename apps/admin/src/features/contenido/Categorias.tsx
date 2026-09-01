import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioContenido } from '@pick/adapter-supabase';
import { slugify, type CategoriaAdmin } from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import { PencilIcon, TagsIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BorrarConConfirmacion, BotonDeIcono } from '@/components/acciones';
import { PanelDeEdicion } from '@/components/panel';
import {
  BarraDeFiltros,
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Paginacion,
  Tarjeta,
} from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { SelectorDeImagen } from './SelectorDeImagen';

const CATEGORIA_VACIA = {
  name: '',
  slug: '',
  image: undefined as ProductImage | undefined,
};

const POR_PAGINA = 20;

/**
 * Cómo se agrupa el catálogo.
 *
 * La edición abre un panel —modal en desktop, hoja en mobile— en vez de un
 * formulario encima de la lista. Con el formulario arriba, editar el último
 * elemento mandaba la vista al tope y había que desplazarse hasta arriba para
 * escribir; el panel deja la lista detrás sin mover el scroll.
 *
 * **La posición no se edita acá.** El orden con el que la portada las muestra lo
 * decide la sección de tipo Categorías, que elige cuáles y en qué orden. Tener
 * dos lugares donde ordenar lo mismo garantizaba que uno de los dos mintiera.
 */
export function Categorias() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const queryClient = useQueryClient();

  const [editando, setEditando] = useState<string | 'nueva' | null>(null);
  const [borrador, setBorrador] = useState(CATEGORIA_VACIA);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);

  const consulta = useQuery({
    queryKey: ['categorias-admin', tienda.id, busqueda, page],
    queryFn: () =>
      repositorioContenido(db).paginaDeCategorias(tienda.id, {
        page,
        perPage: POR_PAGINA,
        query: busqueda,
      }),
    placeholderData: keepPreviousData,
  });

  async function refrescar(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['categorias-admin', tienda.id] });
    // La portada, el formulario de producto y la sección de categorías leen la
    // otra clave.
    await queryClient.invalidateQueries({ queryKey: ['categorias', tienda.id] });
  }

  const guardar = useMutation({
    mutationFn: () =>
      repositorioContenido(db).guardarCategoria(
        tienda.id,
        {
          name: borrador.name,
          slug: borrador.slug || slugify(borrador.name),
          // La posición ya no se edita, pero la columna sigue existiendo y es
          // `not null`: se manda cero y la ordena el nombre.
          position: 0,
          ...(borrador.image ? { image: borrador.image } : {}),
        },
        editando === 'nueva' ? undefined : (editando ?? undefined),
      ),
    onSuccess: async () => {
      await refrescar();
      setEditando(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => repositorioContenido(db).borrarCategoria(tienda.id, id),
    onSuccess: refrescar,
  });

  /*
   * Cambiar de tienda cierra el panel y descarta el borrador.
   *
   * El estado del formulario no sabe de qué tienda es: con uno abierto y un
   * cambio de tienda seguía mostrando el registro de la anterior y, peor,
   * guardarlo lo habría escrito en la nueva. Hoy el panel es modal y no se puede
   * llegar al selector con él abierto, pero la garantía no puede depender de eso:
   * un cambio de tienda por cualquier otra vía tiene que descartarlo igual.
   *
   * Ajuste de estado durante el render y no un efecto: es el patrón que React
   * documenta para esto, y no dispara un render en cascada.
   */
  const [tiendaDelPanel, setTiendaDelPanel] = useState(tienda.id);
  if (tiendaDelPanel !== tienda.id) {
    setTiendaDelPanel(tienda.id);
    setEditando(null);
    setBorrador(CATEGORIA_VACIA);
  }

  function abrir(c?: CategoriaAdmin): void {
    setError(null);
    setEditando(c?.id ?? 'nueva');
    setBorrador(c ? { name: c.name, slug: c.slug, image: c.image } : CATEGORIA_VACIA);
  }

  const datos = consulta.data;

  return (
    <PaginaAdmin
      titulo="Categorías"
      icono={TagsIcon}
      descripcion="Cómo se agrupa el catálogo. Qué categorías muestra la portada y en qué orden se decide en la sección de Categorías."
      acciones={
        puede('catalog.write') && (
          <Button size="lg" onClick={() => abrir()}>
            Nueva categoría
          </Button>
        )
      }
    >
      <PanelDeEdicion
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
        titulo={editando === 'nueva' ? 'Nueva categoría' : 'Editar categoría'}
        descripcion="El nombre lo ve quien navega; la URL es la dirección del catálogo filtrado."
        acciones={
          <>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || !borrador.name}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-name">Nombre</Label>
          <Input
            id="c-name"
            value={borrador.name}
            autoFocus
            onChange={(e) => setBorrador({ ...borrador, name: e.currentTarget.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-slug">URL</Label>
          <Input
            id="c-slug"
            value={borrador.slug}
            placeholder={slugify(borrador.name)}
            onChange={(e) => setBorrador({ ...borrador, slug: e.currentTarget.value })}
          />
          <span className="text-muted-foreground text-xs">
            Va en la dirección del catálogo. Vacío: sale del nombre.
          </span>
        </div>

        <SelectorDeImagen
          label="Imagen"
          opcional
          ayuda="La portada la muestra en la tira de categorías."
          valor={borrador.image}
          onChange={(image) => setBorrador({ ...borrador, image })}
        />

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </PanelDeEdicion>

      {(datos?.total ?? 0) > POR_PAGINA || busqueda !== '' ? (
        <BarraDeFiltros>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-buscar">Buscar</Label>
            <Input
              id="c-buscar"
              className="h-8 w-72"
              value={busqueda}
              placeholder="Nombre de la categoría"
              onChange={(e) => {
                setBusqueda(e.currentTarget.value);
                setPage(1);
              }}
            />
          </div>
        </BarraDeFiltros>
      ) : null}

      <Tarjeta sinRelleno>
        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar las categorías"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : consulta.isPending ? (
          <Esqueleto />
        ) : datos && datos.items.length === 0 ? (
          <EstadoVacio
            titulo={busqueda ? 'Ninguna categoría coincide' : 'Todavía no hay categorías'}
            accion={
              puede('catalog.write') &&
              !busqueda && (
                <Button size="lg" onClick={() => abrir()}>
                  Nueva categoría
                </Button>
              )
            }
          >
            {busqueda
              ? 'Probá con otro nombre.'
              : 'Son los grupos con los que se navega el catálogo. La portada las muestra con su imagen.'}
          </EstadoVacio>
        ) : (
          <ul aria-label="Categorías" className="divide-border divide-y">
            {datos?.items.map((c) => (
              <li key={c.id} className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3">
                {c.image ? (
                  <img
                    src={c.image.url}
                    alt=""
                    className="border-border size-10 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md text-[10px]">
                    sin foto
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="text-muted-foreground truncate font-mono text-xs">
                    /{c.slug}
                  </span>
                </div>
                {puede('catalog.write') && (
                  <div className="flex shrink-0 items-center gap-1">
                    <BotonDeIcono
                      etiqueta={`Editar ${c.name}`}
                      icono={PencilIcon}
                      onClick={() => abrir(c)}
                    />
                    <BorrarConConfirmacion
                      nombre={c.name}
                      etiqueta={`Borrar ${c.name}`}
                      que="Los productos que la tienen quedan sin categoría: no se borra ninguno. Las subcategorías sí se borran con ella."
                      pendiente={borrar.isPending}
                      onConfirmar={() => borrar.mutate(c.id)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {datos && (
          <Paginacion
            datos={datos}
            sustantivo="categorías"
            cargando={consulta.isFetching}
            onPagina={setPage}
          />
        )}
      </Tarjeta>

      {borrar.isError && (
        <p className="text-destructive text-sm" role="alert">
          {(borrar.error as Error).message}
        </p>
      )}
    </PaginaAdmin>
  );
}
