import { useState } from 'react';
import { subirImagenDeProducto } from '@pick/adapter-supabase';
import type { ProductImage } from '@pick/commerce-types';
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
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File): Promise<void> {
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
        <div className="flex items-start gap-3">
          <img
            src={valor.url}
            alt=""
            className="border-border h-20 w-20 rounded-lg border object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              value={valor.alt}
              onChange={(e) => onChange({ ...valor, alt: e.currentTarget.value })}
              placeholder="Texto alternativo"
              aria-label={`Texto alternativo de ${label}`}
            />
            <span className="text-muted-foreground text-xs">
              {valor.width} × {valor.height} px
            </span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(undefined)}>
            Quitar
          </Button>
        </div>
      ) : (
        <Input
          type="file"
          accept="image/*"
          disabled={subiendo}
          onChange={(e) => {
            const archivo = e.currentTarget.files?.[0];
            if (archivo) void subir(archivo);
            // Se limpia para que elegir el mismo archivo dos veces vuelva a
            // disparar el evento.
            e.currentTarget.value = '';
          }}
        />
      )}

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
