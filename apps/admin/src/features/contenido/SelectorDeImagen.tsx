import { useRef, useState } from 'react';
import { subirImagenDeProducto } from '@pick/adapter-supabase';
import type { ProductImage } from '@pick/commerce-types';
import { ImageUpIcon } from '@/components/iconos';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

/**
 * Sube una imagen y la devuelve con sus dimensiones **reales**.
 *
 * Se miden en el browser con `createImageBitmap`, que es lo único que las conoce
 * sin volver a descargar el archivo. Inventarlas produce exactamente el salto de
 * layout que las columnas existen para evitar (ADR-034). Es la misma cuenta que
 * hace el formulario de producto; acá se extrae porque la usan tres pantallas.
 *
 * El bucket es `product-media` aunque esto no sea un producto: la política de
 * Storage exige que el primer directorio del path sea el tenant, y esa es la
 * garantía que importa. Un bucket por tipo de contenido sería una política más
 * que mantener sin ganar nada.
 *
 * La superficie es una zona de arrastre y no un `<input type="file">` crudo. El
 * `input` sigue existiendo debajo —oculto pero real— porque es lo que hace que
 * esto funcione con teclado y con lector de pantalla: arrastrar es un atajo, no
 * el único camino.
 */
export function SelectorDeImagen({
  label,
  valor,
  onChange,
  opcional = false,
  ayuda,
}: {
  label: string;
  valor?: ProductImage;
  onChange: (imagen: ProductImage | undefined) => void;
  opcional?: boolean;
  ayuda?: string;
}) {
  const tienda = useTiendaActiva();
  const [subiendo, setSubiendo] = useState(false);
  const [encima, setEncima] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  async function subir(archivo: File): Promise<void> {
    if (!archivo.type.startsWith('image/')) {
      setError('Ese archivo no es una imagen.');
      return;
    }

    setSubiendo(true);
    setError(null);
    try {
      const bitmap = await createImageBitmap(archivo);
      const { width, height } = bitmap;
      bitmap.close();

      const { url } = await subirImagenDeProducto(db, tienda.tenantId, archivo);
      onChange({ url, alt: valor?.alt ?? '', width, height });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label}
        {opcional && <span className="text-muted-foreground font-normal"> (opcional)</span>}
      </Label>
      {ayuda && <span className="text-muted-foreground text-xs">{ayuda}</span>}

      {valor ? (
        <div className="border-border flex items-start gap-3 rounded-lg border p-3">
          <img
            src={valor.url}
            alt=""
            className="border-border size-20 shrink-0 rounded-md border object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              value={valor.alt}
              onChange={(e) => onChange({ ...valor, alt: e.currentTarget.value })}
              placeholder="Texto alternativo"
              aria-label={`Texto alternativo de ${label}`}
            />
            <span className="text-muted-foreground text-xs">
              {valor.width} × {valor.height} px · describí la imagen para quien no puede verla
            </span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(undefined)}>
            Quitar
          </Button>
        </div>
      ) : (
        /*
          Un `<button>` y no un `<div>` con `onClick`: el teclado lo alcanza con
          Tab y lo activa con Enter sin que haya que reimplementar nada. Los
          eventos de arrastre van encima, que es lo único que un botón no trae.
        */
        <button
          type="button"
          disabled={subiendo}
          onClick={() => archivoRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            const archivo = e.dataTransfer.files[0];
            if (archivo) void subir(archivo);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg',
            'border-2 border-dashed px-4 py-8 text-center transition-colors',
            'focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-60',
            encima ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
          )}
        >
          <ImageUpIcon className="text-muted-foreground size-6" aria-hidden="true" />
          <span className="text-sm font-medium">
            {subiendo ? 'Subiendo…' : 'Arrastrá una imagen o hacé clic'}
          </span>
          <span className="text-muted-foreground text-xs">JPG, PNG o WebP</span>
        </button>
      )}

      <input
        ref={archivoRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const archivo = e.currentTarget.files?.[0];
          if (archivo) void subir(archivo);
          // Se limpia para que elegir el mismo archivo dos veces vuelva a
          // disparar el evento.
          e.currentTarget.value = '';
        }}
      />

      {subiendo && (
        <span className="text-muted-foreground text-xs" role="status">
          Subiendo…
        </span>
      )}
      {error && (
        <span className="text-destructive text-xs" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
