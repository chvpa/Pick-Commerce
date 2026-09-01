import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioContenido } from '@pick/adapter-supabase';
import { moverEn, type SeccionDeHome } from '@pick/commerce-core';
import { GalleryVerticalEndIcon } from '@/components/iconos';
import { buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { BorrarConConfirmacion, ControlDeOrden, EnlaceDeEdicion } from '@/components/acciones';
import { Esqueleto, EstadoDeError, EstadoVacio, PaginaAdmin, Tarjeta } from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { ETIQUETA_TIPO } from './etiquetas';

/**
 * Los bloques de la portada, en el orden en que se ven.
 *
 * Era una pestaña dentro de una pantalla «Contenido». Pasó a ser una pantalla
 * propia colgada del submenú del sidebar: la pestaña obligaba a entrar a
 * Contenido y recién ahí elegir, y su estado vivía en un parámetro de búsqueda
 * que había que acordarse de arrastrar en cada navegación (ADR-098).
 */
export function Secciones() {
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

  const nombreDeColeccion = (id?: string): string =>
    colecciones.data?.find((c) => c.id === id)?.title ?? '—';

  return (
    <PaginaAdmin
      titulo="Secciones"
      icono={GalleryVerticalEndIcon}
      descripcion="Los bloques de la portada, de arriba hacia abajo. Sólo se ven los publicados."
      acciones={
        puede('catalog.write') && (
          <Link to="/contenido/secciones/nueva" className={buttonVariants({ size: 'lg' })}>
            Nueva sección
          </Link>
        )
      }
    >
      {/* Un fallo al mover, publicar o borrar no puede quedar en silencio: la
          lista se refresca sola y parecería que no pasó nada. */}
      {(mover.error ?? publicar.error ?? borrar.error) && (
        <p className="text-destructive text-sm" role="alert">
          {((mover.error ?? publicar.error ?? borrar.error) as Error).message}
        </p>
      )}

      <Tarjeta sinRelleno>
        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar las secciones"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : consulta.isPending ? (
          <Esqueleto />
        ) : consulta.data.length === 0 ? (
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
            Una sección es un bloque de la portada: el banner principal, un carrusel de productos,
            la tira de categorías. Empezá por el banner.
          </EstadoVacio>
        ) : (
          // Filas divididas por una línea y no tarjetas sueltas: adentro de una
          // tarjeta, cada fila con su propio borde eran cajas dentro de una caja.
          <ul aria-label="Secciones de la portada" className="divide-border divide-y">
            {consulta.data.map((s, i) => (
              <li key={s.id} className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3">
                {/*
                  El orden **es** la lista, no un número que hay que traducir.
                  Antes acá se mostraba `position` y había que abrir el
                  formulario para cambiarlo, mirando los números de las otras
                  para elegir uno intermedio.
                */}
                {puede('catalog.write') && (
                  <ControlDeOrden
                    nombre={s.title ?? ETIQUETA_TIPO[s.type]}
                    primero={i === 0}
                    ultimo={i === consulta.data.length - 1}
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
      </Tarjeta>
    </PaginaAdmin>
  );
}
