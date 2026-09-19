import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioAdminCatalogo, subirImagenDeProducto } from '@pick/adapter-supabase';
import type { ProductoSinFoto } from '@pick/commerce-core';
import { CameraIcon } from '@/components/iconos';
import { buttonVariants } from '@/components/ui/button';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  PaginaAdmin,
  Paginacion,
  Tarjeta,
} from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { normalizarFoto } from '@/lib/foto';
import { db } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const POR_PAGINA = 20;

/**
 * Lo que no se ve, para salir a fotografiarlo (v2 Fase 5).
 *
 * Un producto con stock y sin foto está oculto de la vitrina (ADR-112) y no se
 * vende. Esta pantalla es la lista para recuperarlos, y está pensada para usarse
 * **desde el teléfono, parado en el depósito**: una tarjeta por producto con lo
 * justo para encontrarlo —título, marca, SKU— y un botón que abre la cámara.
 *
 * La foto se achica en el teléfono antes de subir, y apenas se guarda el
 * producto vuelve solo a la vitrina: no hay nada más que publicar. La limpieza
 * del fondo con IA es una mejora aparte, encima de esto (ADR-130).
 */
export function SinFoto() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const [pagina, setPagina] = useState(1);

  const consulta = useQuery({
    queryKey: ['sin-foto', tienda.id, pagina],
    queryFn: () => repositorioAdminCatalogo(db).sinFoto(tienda.id, pagina, POR_PAGINA),
    placeholderData: keepPreviousData,
  });

  const cuentas = consulta.data?.cuentas;

  return (
    <PaginaAdmin
      titulo="Sin foto"
      icono={CameraIcon}
      descripcion="Productos que la tienda no muestra porque no tienen foto. Primero los que tienen stock: una foto los vuelve a poner en la vitrina."
    >
      {cuentas && (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          <strong className="text-foreground">{cuentas.sinFotoConStock}</strong> con stock esperando
          foto · <strong className="text-foreground">{cuentas.recuperadosSemana}</strong>{' '}
          {cuentas.recuperadosSemana === 1 ? 'recuperado' : 'recuperados'} esta semana ·{' '}
          {cuentas.listables} de {cuentas.activos} activos se ven hoy
        </p>
      )}

      {consulta.isError ? (
        <Tarjeta>
          <EstadoDeError
            titulo="No se pudo cargar la lista"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        </Tarjeta>
      ) : consulta.isPending ? (
        <Tarjeta>
          <Esqueleto />
        </Tarjeta>
      ) : consulta.data.items.length === 0 ? (
        <Tarjeta>
          <EstadoVacio titulo="Todos los productos activos tienen foto">
            No queda nada oculto por falta de foto.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <>
          <ul
            aria-label="Productos sin foto"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {consulta.data.items.map((p) => (
              <FilaSinFoto key={p.id} producto={p} escribe={puede('catalog.write')} />
            ))}
          </ul>
          <Paginacion
            datos={consulta.data}
            sustantivo="productos"
            cargando={consulta.isFetching}
            onPagina={setPagina}
          />
        </>
      )}
    </PaginaAdmin>
  );
}

/**
 * Una tarjeta: encontrar el producto y sacarle la foto.
 *
 * El input tiene `capture="environment"`, que en un teléfono abre directo la
 * cámara de atrás; en una computadora abre el selector de archivos, que es lo
 * que se quiere ahí.
 */
function FilaSinFoto({ producto, escribe }: { producto: ProductoSinFoto; escribe: boolean }) {
  const tienda = useTiendaActiva();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);

  const subir = useMutation({
    mutationFn: async (original: File) => {
      const { archivo, width, height } = await normalizarFoto(original);
      const { url } = await subirImagenDeProducto(db, tienda.tenantId, archivo);
      await repositorioAdminCatalogo(db).agregarFoto(tienda.tenantId, tienda.id, producto.id, {
        url,
        alt: producto.title,
        width,
        height,
      });
    },
    // La lista y las cuentas cambian: el producto sale de la cola y entra a la
    // vitrina. Se refresca al terminar, no antes, para no sacarlo de la pantalla
    // mientras todavía sube.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sin-foto', tienda.id] }),
  });

  return (
    <li className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{producto.title}</span>
        <span className="text-muted-foreground truncate text-xs">
          {[producto.brand, producto.sku].filter(Boolean).join(' · ')}
        </span>
        <span
          className={cn(
            'text-xs',
            producto.stock > 0 ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {producto.stock > 0 ? `${producto.stock} en stock` : 'Sin stock'}
        </span>
      </div>

      {escribe && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label={`Foto de ${producto.title}`}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0];
              // Se limpia para que elegir el mismo archivo otra vez vuelva a
              // disparar el cambio: si la subida falló, se tiene que poder
              // reintentar.
              evento.target.value = '';
              if (archivo) subir.mutate(archivo);
            }}
          />
          <button
            type="button"
            disabled={subir.isPending}
            onClick={() => input.current?.click()}
            className={buttonVariants({ size: 'lg', className: 'w-full' })}
          >
            <CameraIcon aria-hidden="true" />
            {subir.isPending ? 'Subiendo…' : 'Tomar foto'}
          </button>
          {subir.isError && (
            <p className="text-destructive text-sm" role="alert">
              {(subir.error as Error).message}
            </p>
          )}
        </>
      )}
    </li>
  );
}
