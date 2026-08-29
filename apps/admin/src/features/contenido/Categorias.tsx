import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioContenido } from '@pick/adapter-supabase';
import { slugify, type CategoriaAdmin } from '@pick/commerce-core';
import type { ProductImage } from '@pick/commerce-types';
import { PencilIcon, TagsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BotonDeIcono } from '@/components/acciones';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Tarjeta,
  TituloDeTarjeta,
} from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { SelectorDeImagen } from './SelectorDeImagen';

const CATEGORIA_VACIA = {
  name: '',
  slug: '',
  position: 0,
  image: undefined as ProductImage | undefined,
};

/**
 * Cómo se agrupa el catálogo.
 *
 * El alta y la edición no navegan a otra ruta: son cuatro campos y una imagen,
 * y abrirlos acá mismo evita perder de vista la lista contra la que se está
 * decidiendo. Por eso el botón principal es un `<button>` y no un enlace.
 */
export function Categorias() {
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

  return (
    <PaginaAdmin
      titulo="Categorías"
      icono={TagsIcon}
      descripcion="Cómo se agrupa el catálogo. La portada las muestra con su imagen."
      acciones={
        puede('catalog.write') &&
        !editando && (
          <Button size="lg" onClick={() => abrir()}>
            Nueva categoría
          </Button>
        )
      }
    >
      {editando && (
        <Tarjeta sinRelleno>
          <TituloDeTarjeta>
            {editando === 'nueva' ? 'Nueva categoría' : 'Editar categoría'}
          </TituloDeTarjeta>
          <div className="flex flex-col gap-4 p-4">
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
              <Button
                onClick={() => guardar.mutate()}
                disabled={guardar.isPending || !borrador.name}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Tarjeta>
      )}

      <Tarjeta sinRelleno>
        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar las categorías"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : consulta.isPending ? (
          <Esqueleto />
        ) : consulta.data.length === 0 ? (
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
            {consulta.data.map((c) => (
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
      </Tarjeta>
    </PaginaAdmin>
  );
}
