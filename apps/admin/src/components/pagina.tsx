import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from '@/components/iconos';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * La estructura de una pantalla del Admin.
 *
 * Las medidas son las del handoff de diseño (ADR-143), que conserva lo que ya
 * hacía esta pieza:
 *
 * - **El título vive en el contenido, no en la barra de arriba.** La barra es
 *   del buscador y de la cuenta; el encabezado es parte de la página: nombre,
 *   una línea que explica, y las acciones a la derecha.
 * - **La acción principal está siempre en el mismo lugar**: arriba a la derecha,
 *   y es la única oscura.
 * - **En un teléfono las acciones bajan a su propia línea** en vez de salirse
 *   de la pantalla: antes «Nuevo producto» quedaba cortado contra el borde.
 *
 * Sin ícono al lado del título: el handoff no lo tiene, y el sidebar ya dice en
 * qué sección se está.
 */
export function PaginaAdmin({
  titulo,
  insignias,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  /** Etiquetas de estado, a la derecha del título. Para pantallas de detalle. */
  insignias?: ReactNode;
  /** Una línea que explica de qué va la pantalla. Opcional y breve. */
  descripcion?: ReactNode;
  /** Los botones de la esquina superior derecha. El principal va último. */
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em]">{titulo}</h1>
            {insignias}
          </div>
          {descripcion && <p className="text-ink-3 text-sm">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>

      {children}
    </div>
  );
}

/**
 * El encabezado de una tarjeta que contiene una lista, una tabla o un bloque.
 *
 * Un `h2` dentro de la caja y no un título suelto encima: el rótulo pertenece a
 * la caja, y afuera se leía como si fuera un nivel más de la página. Sin línea
 * debajo: las filas traen la suya arriba, y dos líneas seguidas se leen como un
 * borde grueso.
 */
export function TituloDeTarjeta({
  children,
  accion,
}: {
  children: ReactNode;
  /** Un enlace o un botón chico, a la derecha. */
  accion?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-[18px] pb-3">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {accion}
    </div>
  );
}

/**
 * La caja blanca con su borde: con la página también blanca, es el borde lo que
 * la separa del fondo.
 *
 * `overflow-hidden` para que una tabla ancha se recorte con el radio de la
 * tarjeta en vez de asomar por la esquina.
 */
export function Tarjeta({
  children,
  className,
  sinRelleno = false,
}: {
  children: ReactNode;
  className?: string;
  /** Para tablas y listas, que traen su propio espaciado. */
  sinRelleno?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-card border-border overflow-hidden rounded-[14px] border',
        !sinRelleno && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * El texto de cada opción, indexado por su valor.
 *
 * Recorre en profundidad porque las opciones pueden venir agrupadas, y también
 * dentro de un `map`, que React entrega como un arreglo más.
 */
function etiquetasDe(nodos: ReactNode): Record<string, ReactNode> {
  const etiquetas: Record<string, ReactNode> = {};

  function visitar(nodo: ReactNode): void {
    Children.forEach(nodo, (hijo) => {
      if (!isValidElement(hijo)) return;
      const props = hijo.props as { value?: unknown; children?: ReactNode };
      if (typeof props.value === 'string') {
        etiquetas[props.value] = props.children;
        return;
      }
      if (props.children) visitar(props.children);
    });
  }

  visitar(nodos);
  return etiquetas;
}

/**
 * Un desplegable, con el mismo largo de llamada que tenía el `<select>` nativo.
 *
 * Envuelve el `Select` de shadcn —que es Base UI por debajo— porque su forma
 * completa son cinco elementos anidados, y repetirlos en las veintipico de
 * pantallas que tienen un desplegable garantiza que alguna se escriba distinto.
 * Acá el sitio de llamada sigue siendo el control más sus opciones:
 *
 *     <Selector value={estado} onValueChange={setEstado} aria-label="Estado">
 *       <SelectItem value="todos">Todos</SelectItem>
 *     </Selector>
 *
 * Para lo que necesite más —grupos, separadores— están los primitivos sueltos;
 * esto no los esconde, sólo evita repetirlos.
 *
 * `w-full` por defecto: un desplegable de Base UI se ajusta a su contenido, así
 * que sin esto una fila de filtros cambia de ancho según lo que esté elegido.
 */
export function Selector({
  value,
  onValueChange,
  children,
  className,
  placeholder,
  disabled,
  id,
  title,
  'aria-label': ariaLabel,
}: {
  value: string;
  onValueChange: (valor: string) => void;
  children: ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Por qué está deshabilitado, cuando lo está. */
  title?: string;
  'aria-label'?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(String(v))}
      /*
       * Sin esto el disparador muestra el **valor** y no su etiqueta: la fila de
       * un pedido decía «received» en vez de «Recibido», y el filtro sin elegir
       * quedaba vacío. Base UI lo resuelve con `items`, y acá se arma leyendo las
       * propias opciones para que ningún sitio de llamada tenga que escribir las
       * etiquetas dos veces.
       */
      items={etiquetasDe(children)}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        className={cn('w-full', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/** El esqueleto de una lista mientras carga. */
export function Esqueleto({ filas = 5 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="bg-muted h-8 w-full animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

/**
 * El pie de una lista paginada, como el handoff: «21–40 de 64» y dos flechas.
 *
 * Va **dentro** de la tarjeta, pegado a lo que pagina, y no suelto debajo. Es la
 * misma pieza en productos, pedidos, clientes y promociones: estaba escrita
 * cuatro veces, y una de las copias ya se había quedado con otro espaciado.
 *
 * Con una sola página no se dibuja: un «1–3 de 3» con las dos flechas apagadas
 * es decorado.
 */
export function Paginacion({
  datos,
  sustantivo,
  cargando,
  onPagina,
}: {
  datos: {
    readonly total: number;
    readonly page: number;
    readonly pageCount: number;
    readonly perPage?: number;
  };
  /** En plural, para el recuento: «productos», «pedidos». */
  sustantivo: string;
  cargando: boolean;
  onPagina: (pagina: number) => void;
}) {
  if (datos.pageCount <= 1) return null;

  const porPagina = datos.perPage ?? Math.ceil(datos.total / datos.pageCount);
  const desde = (datos.page - 1) * porPagina + 1;
  const hasta = Math.min(datos.page * porPagina, datos.total);

  return (
    <div className="border-line-row flex items-center justify-between gap-3 border-t px-5 py-3">
      <p className="text-muted-foreground text-[13px] tabular-nums" aria-live="polite">
        {desde}–{hasta} de {datos.total} {sustantivo}
      </p>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={datos.page <= 1 || cargando}
          onClick={() => onPagina(datos.page - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página siguiente"
          disabled={datos.page >= datos.pageCount || cargando}
          onClick={() => onPagina(datos.page + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}

/**
 * Las pestañas de una lista: «Todos», «Por cobrar», «Para preparar»…, cada una
 * con su cuenta.
 *
 * Son **enlaces** y no un `role="tablist"`: no muestran paneles distintos,
 * filtran la misma lista, y la pestaña va en la URL —`?tab=cobrar`— para que se
 * pueda compartir, recargar y llegar a ella desde el Inicio o la paleta.
 *
 * Una cuenta `urgente` se pinta con el tono de lo que pide: ámbar lo que falta
 * cobrar, azul lo que falta hacer. El resto, gris.
 */
export function Pestanas<T extends string>({
  pestanas,
  activa,
  to,
  etiqueta,
}: {
  pestanas: readonly {
    readonly valor: T;
    readonly etiqueta: string;
    readonly cuenta?: number;
    readonly urgente?: 'amber' | 'blue';
    readonly icono?: (props: { className?: string }) => ReactNode;
    /** Una ruta propia. Sin esto, la pestaña es `?tab=` de `to`. */
    readonly to?: string;
  }[];
  activa: T;
  /** La ruta de la lista; la pestaña va en `?tab=`. */
  to: string;
  /** El nombre del grupo para un lector de pantalla: «Estados de los pedidos». */
  etiqueta: string;
}) {
  return (
    <nav
      aria-label={etiqueta}
      className="flex gap-0.5 overflow-x-auto border-b border-[#eceef2] [scrollbar-width:none]"
    >
      {pestanas.map((p) => {
        const es = p.valor === activa;
        const urgente = p.urgente && (p.cuenta ?? 0) > 0 ? p.urgente : null;
        return (
          <Link
            key={p.valor}
            to={p.to ?? to}
            {...(p.to ? {} : { search: { tab: p.valor } })}
            aria-current={es ? 'page' : undefined}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap outline-none',
              'focus-visible:ring-focus-tint focus-visible:ring-3',
              es
                ? 'text-foreground border-[#3b5bdb]'
                : 'text-ink-3 hover:text-foreground border-transparent',
            )}
          >
            {p.icono && <p.icono className="size-[15px]" />}
            {p.etiqueta}
            {p.cuenta !== undefined && (
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                  urgente === 'amber'
                    ? 'bg-[#fdf4e3] text-[#9a5b0b]'
                    : urgente === 'blue'
                      ? 'bg-[#edf1fe] text-[#2b47bd]'
                      : 'text-ink-3 bg-[#f1f2f5]',
                )}
              >
                {p.cuenta}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * El buscador de una lista, con su lupa adentro.
 *
 * La búsqueda va al servidor, así que quien lo usa espera a que se deje de
 * escribir antes de consultar: sin eso, cada tecla sería un pedido a la base.
 */
export function CampoDeBusqueda({
  valor,
  onCambio,
  placeholder,
  etiqueta,
  className,
}: {
  valor: string;
  onCambio: (valor: string) => void;
  placeholder: string;
  /** Para un lector de pantalla: el campo no tiene rótulo a la vista. */
  etiqueta: string;
  className?: string;
}) {
  return (
    <div className={cn('relative min-w-48 flex-[0_1_340px]', className)}>
      <SearchIcon className="text-ink-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.currentTarget.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className="h-9 pl-9"
      />
    </div>
  );
}

/**
 * Un filtro que se agrega: «+ Pago», y elegido, «Pago: Pagado ×».
 *
 * Es el filtro del handoff: no ocupa lugar mientras no se usa, y cuando se usa
 * dice qué está filtrando y se saca de un toque. Un desplegable con «Todos»
 * siempre a la vista ocupaba lo mismo filtrando o no.
 */
export function FiltroAgregable<T extends string>({
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  etiqueta: string;
  valor: T | null;
  opciones: readonly { readonly valor: T; readonly etiqueta: string }[];
  onCambiar: (valor: T | null) => void;
}) {
  const elegida = opciones.find((o) => o.valor === valor);

  if (elegida) {
    return (
      <span className="text-foreground inline-flex h-9 items-center rounded-[9px] border border-[#c9d4f8] bg-[#f5f7fe] text-[13.5px] font-medium">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus-visible:ring-focus-tint flex h-full cursor-pointer items-center gap-1 rounded-l-[9px] pr-1 pl-3 outline-none focus-visible:ring-3">
            <span className="text-ink-3 font-normal">{etiqueta}:</span> {elegida.etiqueta}
            <ChevronDownIcon className="text-ink-faint size-3" />
          </DropdownMenuTrigger>
          <MenuDeOpciones etiqueta={etiqueta} opciones={opciones} onCambiar={onCambiar} />
        </DropdownMenu>
        <button
          type="button"
          aria-label={`Sacar el filtro de ${etiqueta.toLowerCase()}`}
          onClick={() => onCambiar(null)}
          className="text-ink-3 hover:text-foreground focus-visible:ring-focus-tint flex h-full cursor-pointer items-center rounded-r-[9px] pr-2.5 pl-1 outline-none focus-visible:ring-3"
        >
          <XIcon className="size-3.5" />
        </button>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="text-ink-3 hover:text-foreground focus-visible:ring-focus-tint inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border border-dashed border-[#d3d7df] bg-white px-3 text-[13.5px] font-medium outline-none hover:border-[#b9bfcb] focus-visible:ring-3">
        <PlusIcon className="size-3.5" />
        {etiqueta}
      </DropdownMenuTrigger>
      <MenuDeOpciones etiqueta={etiqueta} opciones={opciones} onCambiar={onCambiar} />
    </DropdownMenu>
  );
}

function MenuDeOpciones<T extends string>({
  etiqueta,
  opciones,
  onCambiar,
}: {
  etiqueta: string;
  opciones: readonly { readonly valor: T; readonly etiqueta: string }[];
  onCambiar: (valor: T | null) => void;
}) {
  return (
    <DropdownMenuContent align="start" className="min-w-44">
      {/* El rótulo va dentro de un grupo: fuera de uno, Base UI lanza al abrir. */}
      <DropdownMenuGroup>
        <DropdownMenuLabel>{etiqueta}</DropdownMenuLabel>
        {opciones.map((o) => (
          <DropdownMenuItem key={o.valor} onClick={() => onCambiar(o.valor)}>
            {o.etiqueta}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

/** La franja de filtros que va arriba de una tabla, dentro de su tarjeta. */
export function BarraDeFiltros({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-[#eceef2] px-5 py-4">
      {children}
    </div>
  );
}

/**
 * Lo que se ve cuando todavía no hay nada.
 *
 * Centrado y con su acción adentro: un listado vacío que sólo dice «no hay
 * nada» deja a la persona sin saber si falta cargar algo o si algo falló, y la
 * obliga a buscar el botón en otra parte de la pantalla.
 */
export function EstadoVacio({
  titulo,
  children,
  accion,
}: {
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-[15px] font-semibold">{titulo}</p>
      {children && <p className="text-muted-foreground max-w-md text-sm">{children}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

/**
 * Lo que se ve cuando una consulta falla.
 *
 * Trae su propio botón de reintentar: un error sin salida obliga a recargar la
 * página entera, y esa caja estaba copiada en diez pantallas —cada una con su
 * botón, su borde y su redacción—.
 */
export function EstadoDeError({
  titulo = 'No se pudo cargar',
  error,
  onReintentar,
}: {
  titulo?: string;
  error: Error;
  onReintentar?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-[15px] font-semibold">{titulo}</p>
      <p className="text-muted-foreground max-w-md text-sm">{error.message}</p>
      {onReintentar && (
        <Button variant="outline" size="sm" onClick={onReintentar}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/**
 * Las acciones de un formulario largo, pegadas al pie.
 *
 * Antes vivían arriba a la derecha, en la cabecera de la pantalla. Con un
 * formulario de tres tarjetas eso significa que apenas se baja a llenarlo el
 * botón de guardar deja de verse, y hay que volver arriba para confirmar algo
 * que se terminó de escribir abajo.
 *
 * `sticky` y no `fixed`, y ahí está la diferencia que importa: una barra fija
 * flota sobre el contenido y en un teléfono tapa el último campo justo cuando se
 * lo está completando. Una pegajosa **ocupa su lugar** en el flujo, así que
 * acompaña el scroll sin cubrir nada y al llegar al final del formulario se
 * queda donde le toca.
 *
 * El principal va último: es el orden de lectura y el que espera el pulgar en la
 * esquina inferior derecha.
 */
export function BarraDeAcciones({ children }: { children: ReactNode }) {
  return (
    <div
      className={
        'border-border sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 ' +
        'border-t bg-white/90 px-4 py-3 backdrop-blur-[10px] sm:mx-0 sm:rounded-b-[14px]'
      }
    >
      {children}
    </div>
  );
}

/**
 * La barra de lo elegido: flota abajo, como en el handoff, a la vista mientras
 * se recorre la lista, y desaparece apenas no hay nada elegido.
 *
 * En el teléfono ocupa el ancho y los botones dicen su forma corta, o sólo el
 * ícono: las frases enteras no entran. El nombre accesible es siempre la entera.
 */
export function BarraDeSeleccion({
  cuenta,
  etiqueta,
  onSoltar,
  children,
}: {
  cuenta: number;
  /** «Acciones sobre los pedidos elegidos». */
  etiqueta: string;
  onSoltar: () => void;
  children: ReactNode;
}) {
  if (cuenta === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label={etiqueta}
      className="shadow-modal fixed inset-x-4 bottom-4 z-30 flex items-center gap-1 rounded-xl bg-[#0e1525] p-1.5 text-white sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2"
    >
      <span className="px-2 text-[13.5px] font-medium whitespace-nowrap tabular-nums sm:px-3">
        {cuenta} {cuenta === 1 ? 'elegido' : 'elegidos'}
      </span>
      {children}
      <button
        type="button"
        aria-label="Dejar de elegir"
        onClick={onSoltar}
        className="ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#c9cedb] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 sm:ml-0"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

export function BotonDeLote({
  icono: Icono,
  etiqueta,
  corta,
  disabled,
  onClick,
}: {
  icono: (props: { className?: string }) => ReactNode;
  etiqueta: string;
  /** Lo que dice en el teléfono. Sin esto, ahí va sólo el ícono. */
  corta?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[13.5px] font-medium whitespace-nowrap outline-none hover:bg-white/[0.18] focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icono className="size-[15px]" />
      {corta && (
        <span aria-hidden="true" className="sm:hidden">
          {corta}
        </span>
      )}
      <span aria-hidden="true" className="hidden sm:inline">
        {etiqueta}
      </span>
    </button>
  );
}
