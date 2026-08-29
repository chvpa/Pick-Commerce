import { useState, type ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * Las acciones que se repiten en cada fila del Admin.
 *
 * Viven acá y no copiadas en cada pantalla porque son tres decisiones que tienen
 * que ser la misma en todas: qué ícono significa editar, cuál borrar, y que
 * borrar **siempre** pregunte antes. Una lista que borra sin preguntar y otra que
 * pregunta enseñan que el botón es impredecible, y eso se paga con un borrado
 * que nadie quiso.
 *
 * El nombre accesible va en un `<span class="sr-only">` y la pista visual en
 * `title`. Un `<button>` con sólo un `<svg>` adentro **no tiene nombre**: un
 * lector de pantalla lo anuncia como «botón» a secas. Se usa `title` y no el
 * componente de tooltip que trae el scaffold porque ese exige un provider que
 * hoy no está montado, monta un portal por fila, y no aparece nunca en una
 * pantalla táctil.
 */

export function BotonDeIcono({
  etiqueta,
  icono: Icono,
  onClick,
  disabled,
  tono = 'normal',
  className,
}: {
  etiqueta: string;
  icono: typeof PencilIcon;
  onClick?: () => void;
  disabled?: boolean;
  tono?: 'normal' | 'destructivo';
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={etiqueta}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        tono === 'destructivo' && 'text-muted-foreground hover:text-destructive',
        className,
      )}
    >
      <Icono aria-hidden="true" />
      <span className="sr-only">{etiqueta}</span>
    </Button>
  );
}

/** El lápiz que lleva a la pantalla de edición. */
export function EnlaceDeEdicion({
  etiqueta = 'Editar',
  to,
  params,
}: {
  etiqueta?: string;
  to: string;
  params?: Record<string, string>;
}) {
  return (
    // Enlace y no botón: navega. Con un botón se pierden abrir en otra pestaña,
    // copiar la dirección y el retroceso del navegador.
    <Link
      to={to}
      params={params}
      title={etiqueta}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
    >
      <PencilIcon aria-hidden="true" />
      <span className="sr-only">{etiqueta}</span>
    </Link>
  );
}

/**
 * Confirmación controlada por quien la usa.
 *
 * Existe porque no todo lo que hay que confirmar lo dispara un botón: hay un
 * interruptor que archiva un producto y un `<select>` que cancela un pedido. Con
 * un componente que trae su propio disparador, esos dos casos no entran, y
 * fueron justamente los que quedaron con el `confirm()` del navegador —modal
 * bloqueante, sin estilo, sin foco gestionado y ocultable por el browser.
 *
 * El botón que confirma dice **el verbo**, no «Sí»: un «Sí» aislado no dice a
 * qué se le está diciendo que sí.
 */
export function DialogoDeConfirmacion({
  abierto,
  onAbierto,
  titulo,
  descripcion,
  confirmar,
  onConfirmar,
  pendiente,
  destructivo = true,
}: {
  abierto: boolean;
  onAbierto: (abierto: boolean) => void;
  titulo: string;
  descripcion: ReactNode;
  /** El verbo. «Archivar», «Cancelar el pedido», «Quitar». */
  confirmar: string;
  onConfirmar: () => void;
  pendiente?: boolean;
  /** `false` cuando la acción no destruye nada, como publicar en lote. */
  destructivo?: boolean;
}) {
  return (
    <AlertDialog open={abierto} onOpenChange={onAbierto}>
      <AlertDialogContent>
        <AlertDialogTitle>{titulo}</AlertDialogTitle>
        <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button type="button" variant="outline" />} disabled={pendiente}>
            Cancelar
          </AlertDialogClose>
          <Button
            type="button"
            variant={destructivo ? 'destructive' : 'default'}
            disabled={pendiente}
            onClick={() => {
              onConfirmar();
              onAbierto(false);
            }}
          >
            {confirmar}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * El tacho, con su confirmación.
 *
 * La pregunta nombra **lo que se va a borrar** y no «este elemento»: quien llega
 * acá después de recorrer una lista larga necesita comprobar que apuntó a la fila
 * que creía.
 */
export function BorrarConConfirmacion({
  nombre,
  que = 'Se borra para siempre y no se puede deshacer.',
  onConfirmar,
  pendiente,
  etiqueta = 'Borrar',
}: {
  /** Lo que se borra, tal como lo ve la persona. Va en la pregunta. */
  nombre: string;
  /** Qué implica, cuando hay algo que no es obvio: qué se lleva puesto, por ejemplo. */
  que?: ReactNode;
  onConfirmar: () => void;
  pendiente?: boolean;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <BotonDeIcono
        etiqueta={etiqueta}
        icono={Trash2Icon}
        tono="destructivo"
        disabled={pendiente}
        onClick={() => setAbierto(true)}
      />

      <DialogoDeConfirmacion
        abierto={abierto}
        onAbierto={setAbierto}
        titulo={`¿Borrar «${nombre}»?`}
        descripcion={que}
        confirmar={pendiente ? 'Borrando…' : 'Borrar'}
        onConfirmar={onConfirmar}
        pendiente={pendiente}
      />
    </>
  );
}

/**
 * Subir y bajar una fila.
 *
 * Botones y no arrastrar-y-soltar, por dos motivos. El repo no tiene librería de
 * drag and drop y sumar una exige un ADR. Y sobre todo: arrastrar no se puede
 * hacer con el teclado sin construir aparte todo el manejo de foco y los
 * anuncios, así que una implementación honesta termina teniendo **igual** estos
 * botones. Con listas de cinco o seis bloques, que es lo que tiene una portada,
 * el arrastre no agrega nada que compense.
 */
export function ControlDeOrden({
  nombre,
  primero,
  ultimo,
  onSubir,
  onBajar,
  pendiente,
}: {
  nombre: string;
  primero: boolean;
  ultimo: boolean;
  onSubir: () => void;
  onBajar: () => void;
  pendiente?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col">
      <BotonDeIcono
        etiqueta={`Subir ${nombre}`}
        icono={ArrowUpIcon}
        onClick={onSubir}
        disabled={primero || pendiente}
        className="size-6 [&_svg]:size-3.5"
      />
      <BotonDeIcono
        etiqueta={`Bajar ${nombre}`}
        icono={ArrowDownIcon}
        onClick={onBajar}
        disabled={ultimo || pendiente}
        className="size-6 [&_svg]:size-3.5"
      />
    </div>
  );
}
