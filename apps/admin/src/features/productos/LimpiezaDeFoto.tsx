import { useState } from 'react';
import { SparklesIcon } from '@/components/iconos';
import { Button } from '@/components/ui/button';
import { subirImagenDeProducto } from '@pick/adapter-supabase';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { normalizarFoto } from '@/lib/foto';
import { limpiarFondo } from '@/lib/ia';
import { db } from '@/lib/supabase';

/**
 * Limpiar el fondo de **una** foto, dentro del producto (ADR-130, ADR-131).
 *
 * Es la misma operación que el lote del listado, en el lugar donde se está
 * mirando esa foto. La diferencia con el lote es dónde queda la decisión: acá no
 * hace falta una propuesta en la base, porque la comparación y la aceptación
 * pasan en la misma pantalla y **nada se publica hasta que se guarda el
 * producto**.
 *
 * La original tampoco se pierde: el archivo sigue en Storage y su URL queda en
 * el campo hasta que alguien toque «Usar esta».
 */
export function LimpiezaDeFoto({
  url,
  onAplicar,
}: {
  url: string;
  onAplicar: (foto: { url: string; width: number; height: number }) => void;
}) {
  const tienda = useTiendaActiva();
  const [propuesta, setPropuesta] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limpiar = async () => {
    setPendiente(true);
    setError(null);
    try {
      const archivo = await limpiarFondo(tienda.id, url);
      const normalizada = await normalizarFoto(archivo);
      const subida = await subirImagenDeProducto(db, tienda.tenantId, normalizada.archivo, 'ia');
      setPropuesta({ url: subida.url, width: normalizada.width, height: normalizada.height });
    } catch (causa) {
      setError((causa as Error).message);
    } finally {
      setPendiente(false);
    }
  };

  // Una URL de otro sitio no se puede editar: OpenAI la descarga, y lo que se
  // sube después es del bucket de la tienda. Se dice en vez de fallar al pedirlo.
  if (!url.startsWith('http')) return null;

  return (
    <div className="flex flex-col gap-2">
      {propuesta ? (
        <>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <figure className="flex flex-col gap-1">
              <img
                src={url}
                alt="Foto original"
                className="bg-muted aspect-square w-full rounded-md object-contain"
              />
              <figcaption className="text-muted-foreground text-xs">Original</figcaption>
            </figure>
            <figure className="flex flex-col gap-1">
              <img
                src={propuesta.url}
                alt="Propuesta de la IA"
                className="bg-muted aspect-square w-full rounded-md object-contain"
              />
              <figcaption className="text-muted-foreground text-xs">Propuesta de la IA</figcaption>
            </figure>
          </div>
          <p className="text-muted-foreground text-xs">
            La IA redibuja la foto: mirá que el producto, los logos y los textos hayan quedado
            iguales.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onAplicar(propuesta);
                setPropuesta(null);
              }}
            >
              Usar esta
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPropuesta(null)}>
              Descartar
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={pendiente}
          onClick={() => void limpiar()}
        >
          <SparklesIcon aria-hidden="true" />
          {pendiente ? 'Limpiando el fondo…' : 'Limpiar fondo con IA'}
        </Button>
      )}

      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
