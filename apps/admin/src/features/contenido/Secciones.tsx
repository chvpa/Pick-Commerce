import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioContenido } from '@pick/adapter-supabase';
import {
  TOPE_DE_COLECCIONES,
  columnasEnElTelefonoDe,
  formatMoney,
  moverEn,
  type SeccionDeHome,
  type TipoDeSeccion,
} from '@pick/commerce-core';
import {
  ExternalLinkIcon,
  GalleryVerticalEndIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PlusIcon,
  TagsIcon,
} from '@/components/iconos';
import { buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { BorrarConConfirmacion, ControlDeOrden, EnlaceDeEdicion } from '@/components/acciones';
import { Esqueleto, EstadoDeError, EstadoVacio, PaginaAdmin, Tarjeta } from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { ETIQUETA_TIPO } from './etiquetas';
import { PestanasDeContenido } from './PestanasDeContenido';

const ICONO_DEL_TIPO: Readonly<
  Record<TipoDeSeccion, (p: { className?: string }) => React.ReactNode>
> = {
  hero: GalleryVerticalEndIcon,
  tiles: LayoutDashboardIcon,
  products: PackageIcon,
  categories: TagsIcon,
};

/** Fecha y hora cortas: «17/09/26, 22:14». Un recálculo de ayer no es lo mismo que uno de hoy. */
function cuando(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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

  // El selector necesita todas para poder nombrar la colección de cada
  // sección, así que pide una página del tamaño del techo en vez de «todo».
  const colecciones = useQuery({
    queryKey: ['colecciones', tienda.id, 'todas'],
    queryFn: () =>
      repositorioContenido(db).colecciones(tienda.id, { perPage: TOPE_DE_COLECCIONES }),
  });

  /*
   * Cuándo se recalcularon las recomendaciones. Los órdenes «Tendencia» y
   * «Preferencias» se arman solos, así que el comercio tiene que poder ver que
   * se armaron —y cuándo—: sin eso, una sección que no cambia parece rota y una
   * que cambia parece arbitraria (ADR-127).
   */
  const recomendaciones = useQuery({
    queryKey: ['recomendaciones', tienda.id],
    queryFn: () => repositorioContenido(db).estadoDeRecomendaciones(tienda.id),
  });

  /*
   * Qué trajo cada sección en el último mes. Va con las secciones y no en una
   * pantalla aparte: la pregunta aparece mirando la lista —«¿esto sirve?»— y una
   * métrica que hay que ir a buscar no se mira.
   */
  const resultado = useQuery({
    queryKey: ['resultado-secciones', tienda.id],
    queryFn: () => repositorioContenido(db).resultadoDeSecciones(tienda.id),
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
    colecciones.data?.items.find((c) => c.id === id)?.title ?? '—';

  return (
    <PaginaAdmin
      titulo="Secciones"
      descripcion="Los bloques de la portada, de arriba hacia abajo. Sólo se ven los publicados."
      acciones={
        <>
          {tienda.domain && (
            <a
              href={`https://${tienda.domain}/`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Ver la portada
              <ExternalLinkIcon aria-hidden="true" />
            </a>
          )}
          {puede('catalog.write') && (
            <Link to="/contenido/secciones/nueva" className={buttonVariants({ size: 'lg' })}>
              <PlusIcon aria-hidden="true" />
              Nueva sección
            </Link>
          )}
        </>
      }
    >
      <PestanasDeContenido activa="secciones" />

      {/* Un fallo al mover, publicar o borrar no puede quedar en silencio: la
          lista se refresca sola y parecería que no pasó nada. */}
      {(mover.error ?? publicar.error ?? borrar.error) && (
        <p className="text-destructive text-sm" role="alert">
          {((mover.error ?? publicar.error ?? borrar.error) as Error).message}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                <li key={s.id} className="hover:bg-row-hover flex items-center gap-3 px-4 py-3">
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
                  <Icono tipo={s.type} />
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
                      {s.type === 'tiles' &&
                        s.layout === 'static' &&
                        columnasEnElTelefonoDe(s.settings) === 2 &&
                        ' · dos por fila en el teléfono'}
                      {/*
                      Lo que trajo, en la misma línea que lo describe. Sólo en
                      las de productos: un hero no tiene a dónde llevar que se
                      pueda atribuir. Un cero se muestra —es información— y lo
                      que no se midió todavía, no.
                    */}
                      {s.type === 'products' &&
                        resultado.data?.[s.id] &&
                        ` · ${resultado.data[s.id]!.clicks} ${
                          resultado.data[s.id]!.clicks === 1 ? 'entrada' : 'entradas'
                        } y ${formatMoney(
                          { amount: resultado.data[s.id]!.revenue, currency: tienda.currency },
                          tienda.locale,
                        )} en 30 días`}
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

        {consulta.data && consulta.data.length > 0 && (
          <VistaPrevia secciones={consulta.data} tienda={tienda.name} />
        )}
      </div>

      {/*
        Dos cosas que un orden automático necesita para no dar miedo: cuándo se
        armó, y cómo se ve para alguien que llega por primera vez —que es la
        mitad del tráfico y lo que ve un buscador—.
      */}
      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {recomendaciones.data?.computedAt
              ? `Recomendaciones actualizadas el ${cuando(recomendaciones.data.computedAt, tienda.locale)} · ${recomendaciones.data.productsCount} productos con señal, ${recomendaciones.data.pairsCount} relaciones.`
              : 'Las recomendaciones se calculan solas con el tráfico de la tienda. Todavía no corrieron.'}
          </p>
          {tienda.domain && (
            <a
              href={`https://${tienda.domain}/?frio=1`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Ver la portada como un visitante nuevo
            </a>
          )}
        </div>
      </Tarjeta>
    </PaginaAdmin>
  );
}

function Icono({ tipo }: { tipo: TipoDeSeccion }) {
  const Componente = ICONO_DEL_TIPO[tipo];
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[#f3f4f7] text-[#535b6e]"
    >
      <Componente className="size-[18px]" />
    </span>
  );
}

/**
 * La portada en un teléfono, como esquema: qué bloque va dónde y cómo se arma.
 *
 * No es una captura —la tienda real está a un clic, en «Ver la portada»—: es lo
 * que se decide en esta pantalla, el orden, lo publicado y la forma de cada
 * bloque, dibujado sin pedir nada más. Lo despublicado no aparece, como en la
 * tienda.
 */
function VistaPrevia({
  secciones,
  tienda,
}: {
  secciones: readonly SeccionDeHome[];
  tienda: string;
}) {
  const publicadas = secciones.filter((s) => s.published);
  const celda = 'rounded-[4px] bg-[#e6e8ee]';
  return (
    <Tarjeta className="flex flex-col gap-3 lg:sticky lg:top-20">
      <span className="text-ink-3 text-[12.5px] font-medium">Vista previa · teléfono</span>
      <div
        aria-label="Vista previa de la portada en un teléfono"
        role="img"
        className="mx-auto flex w-[200px] flex-col gap-2 overflow-hidden rounded-[22px] border-[5px] border-[#0e1525] bg-white p-2 pb-4"
      >
        <div className="flex items-center justify-between px-1 py-1">
          <span className="truncate text-[9px] font-semibold">{tienda}</span>
          <span className="flex gap-1">
            <span className="size-1.5 rounded-full bg-[#c9cedb]" />
            <span className="size-1.5 rounded-full bg-[#c9cedb]" />
          </span>
        </div>
        {publicadas.length === 0 && (
          <span className="text-ink-3 px-2 py-8 text-center text-[10px]">
            Nada publicado todavía
          </span>
        )}
        {publicadas.map((s) => (
          <div key={s.id} className="flex flex-col gap-1">
            {s.title && s.type !== 'hero' && <span className="h-1.5 w-16 rounded bg-[#c9cedb]" />}
            {s.type === 'hero' ? (
              <div className="flex flex-col gap-1">
                <span className="h-24 rounded-[6px] bg-[#dfe5fb]" />
                {s.layout === 'slider' && (
                  <span className="flex justify-center gap-1">
                    <span className="size-1 rounded-full bg-[#3b5bdb]" />
                    <span className="size-1 rounded-full bg-[#c9cedb]" />
                    <span className="size-1 rounded-full bg-[#c9cedb]" />
                  </span>
                )}
              </div>
            ) : s.type === 'tiles' ? (
              s.layout === 'slider' ? (
                <div className="flex gap-1 overflow-hidden">
                  <span className={`${celda} h-12 w-[85%] shrink-0`} />
                  <span className={`${celda} h-12 w-[85%] shrink-0`} />
                </div>
              ) : (
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${columnasEnElTelefonoDe(s.settings)}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from(
                    { length: columnasEnElTelefonoDe(s.settings) === 2 ? 4 : 2 },
                    (_, i) => (
                      <span key={i} className={`${celda} h-12`} />
                    ),
                  )}
                </div>
              )
            ) : s.type === 'products' ? (
              <div className="flex gap-1 overflow-hidden">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="flex w-[42%] shrink-0 flex-col gap-0.5">
                    <span className={`${celda} h-14`} />
                    <span className="h-1 w-3/4 rounded bg-[#e6e8ee]" />
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex gap-1.5 overflow-hidden">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="size-9 shrink-0 rounded-full bg-[#e6e8ee]" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}
