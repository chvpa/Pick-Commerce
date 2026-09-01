import { Children, isValidElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * La estructura de una pantalla del Admin.
 *
 * Sigue la distribución de Shopify, que resuelve bien tres cosas que acá estaban
 * repartidas de cualquier manera:
 *
 * - **El título vive en el contenido, no en la barra de arriba.** Con el título
 *   arriba, la barra crece con migas y acciones y el contenido empieza sin
 *   contexto. Acá el encabezado es parte de la página: ícono, nombre, y las
 *   acciones a la derecha en la misma línea.
 * - **La acción principal está siempre en el mismo lugar**: arriba a la derecha,
 *   y es la única oscura. Antes cada pantalla la ponía donde le quedaba —una al
 *   lado de un párrafo, otra debajo de un filtro—.
 * - **El contenido va en tarjetas** sobre un fondo apagado. Es lo que separa
 *   «esto es una lista» de «esto es la página», sin líneas divisorias.
 *
 * No se copia lo que Shopify tiene y nosotros no: ni buscador global, ni pestañas
 * guardadas, ni barra de progreso de configuración.
 */
export function PaginaAdmin({
  titulo,
  icono: Icono,
  insignias,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  /** El mismo ícono que la sección tiene en el menú lateral. */
  icono?: ComponentType<{ className?: string }>;
  /** Etiquetas de estado, a la derecha del título. Para pantallas de detalle. */
  insignias?: ReactNode;
  /** Una línea que explica de qué va la pantalla. Opcional y breve. */
  descripcion?: ReactNode;
  /** Los botones de la esquina superior derecha. El principal va último. */
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {Icono && <Icono className="text-muted-foreground size-5 shrink-0" />}
              {titulo}
            </h1>
            {insignias}
          </div>
          {descripcion && <p className="text-muted-foreground text-sm">{descripcion}</p>}
        </div>
        {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
      </div>

      {children}
    </div>
  );
}

/**
 * El encabezado de una tarjeta que contiene una lista, una tabla o un bloque.
 *
 * Un `h2` chico sobre una línea divisoria, y no un título suelto encima de la
 * caja: el rótulo pertenece a la caja, y afuera se leía como si fuera un nivel
 * más de la página.
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
    <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
      <h2 className="text-sm font-medium">{children}</h2>
      {accion}
    </div>
  );
}

/**
 * La caja blanca sobre el fondo apagado.
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
        'bg-card border-border overflow-hidden rounded-xl border shadow-xs',
        !sinRelleno && 'p-4',
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
 * El pie de una lista paginada.
 *
 * Va **dentro** de la tarjeta, pegado a lo que pagina, y no suelto debajo. Es la
 * misma pieza en productos, pedidos, clientes y promociones: estaba escrita
 * cuatro veces, y una de las copias ya se había quedado con otro espaciado.
 *
 * Con una sola página no se dibuja: un «página 1 de 1» con los dos botones
 * apagados es decorado.
 */
export function Paginacion({
  datos,
  sustantivo,
  cargando,
  onPagina,
}: {
  datos: { readonly total: number; readonly page: number; readonly pageCount: number };
  /** En plural, para el recuento: «productos», «pedidos». */
  sustantivo: string;
  cargando: boolean;
  onPagina: (pagina: number) => void;
}) {
  if (datos.pageCount <= 1) return null;

  return (
    <div className="border-border flex items-center justify-between gap-3 border-t p-3">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {datos.total} {sustantivo} · página {datos.page} de {datos.pageCount}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={datos.page <= 1 || cargando}
          onClick={() => onPagina(datos.page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={datos.page >= datos.pageCount || cargando}
          onClick={() => onPagina(datos.page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

/** La franja de filtros que va arriba de una tabla, dentro de su tarjeta. */
export function BarraDeFiltros({ children }: { children: ReactNode }) {
  return (
    <div className="border-border flex flex-wrap items-end gap-3 border-b p-3">{children}</div>
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
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-base font-medium">{titulo}</p>
      {children && <p className="text-muted-foreground max-w-md text-sm">{children}</p>}
      {accion && <div className="mt-1">{accion}</div>}
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
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-base font-medium">{titulo}</p>
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
        'bg-background/85 border-border sticky bottom-0 z-10 -mx-4 flex flex-wrap ' +
        'items-center justify-end gap-3 border-t px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-b-xl'
      }
    >
      {children}
    </div>
  );
}
