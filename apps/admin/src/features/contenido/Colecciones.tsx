import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioContenido } from '@pick/adapter-supabase';
import { tipoDe, type Coleccion } from '@pick/commerce-core';
import { LibraryBigIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { BorrarConConfirmacion, EnlaceDeEdicion } from '@/components/acciones';
import { Esqueleto, EstadoDeError, EstadoVacio, PaginaAdmin, Tarjeta } from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { ETIQUETA_ORDEN } from './etiquetas';

/** Las listas de productos que después arman los carruseles de la portada. */
export function Colecciones() {
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

  return (
    <PaginaAdmin
      titulo="Colecciones"
      icono={LibraryBigIcon}
      descripcion="Listas de productos. Para mostrar una en la portada, creá una sección de carrusel."
      acciones={
        puede('catalog.write') && (
          <Link to="/contenido/colecciones/nueva" className={buttonVariants({ size: 'lg' })}>
            Nueva colección
          </Link>
        )
      }
    >
      {(publicar.error ?? borrar.error) && (
        <p className="text-destructive text-sm" role="alert">
          {((publicar.error ?? borrar.error) as Error).message}
        </p>
      )}

      <Tarjeta sinRelleno>
        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar las colecciones"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : consulta.isPending ? (
          <Esqueleto />
        ) : consulta.data.length === 0 ? (
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
            Una colección es una lista de productos: se arma a mano o sola, con una regla. Después
            se muestra en la portada con una sección de carrusel.
          </EstadoVacio>
        ) : (
          <ul aria-label="Colecciones" className="divide-border divide-y">
            {consulta.data.map((c) => (
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
      </Tarjeta>
    </PaginaAdmin>
  );
}
