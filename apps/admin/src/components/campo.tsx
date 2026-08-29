import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/**
 * Un campo de formulario con su rótulo, su ayuda y su error.
 *
 * Existe porque los campos se armaban a mano uno por uno, y **tres de ellos se
 * habían quedado sin mostrar su error**: la validación los rechazaba y el
 * formulario no decía nada, así que el botón de guardar no hacía nada y no había
 * forma de saber por qué. Con el error como parte del campo y no como tres
 * líneas que hay que acordarse de escribir, eso deja de poder pasar.
 *
 * `aria-describedby` no es un adorno: sin él, un lector de pantalla lee el
 * campo, lo anuncia como inválido y no dice **qué** está mal.
 */
export function Campo({
  id,
  label,
  error,
  ayuda,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  /** Qué se espera, cuando no es evidente. Va arriba del error, no en su lugar. */
  ayuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? 'flex flex-col gap-1.5'}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {ayuda && <span className="text-muted-foreground text-xs">{ayuda}</span>}
      {error && (
        <span id={`${id}-error`} role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </div>
  );
}

/** Los atributos que un input necesita para que su error se lea y se anuncie. */
export function atributosDeError(id: string, error?: string) {
  return {
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
}
