import { useQuery } from '@tanstack/react-query';
import { repositorioTiendas } from '@pick/adapter-supabase';
import type { Sucursal } from '@pick/commerce-core';
import { db } from '@/lib/supabase';
import { useTiendaActiva } from './TiendaContext';

/**
 * Las sucursales de la tienda activa.
 *
 * Tres pantallas guardan stock —la ficha del producto, el alta con la cámara y
 * el import de CSV— y las tres tienen que decir **a qué sucursal** va, porque
 * `admin_save_product` ya no elige una por su cuenta. Con una sola sucursal la
 * respuesta es obvia y ninguna pregunta nada; con dos, cada una ofrece elegir.
 *
 * Cacheado por tienda: una sucursal se crea una vez y se mira muchas.
 */
export function useSucursales() {
  const tienda = useTiendaActiva();

  const consulta = useQuery({
    queryKey: ['sucursales', tienda.id],
    queryFn: () => repositorioTiendas(db).sucursales(tienda.id),
    staleTime: 5 * 60 * 1000,
  });

  const sucursales: readonly Sucursal[] = consulta.data ?? [];

  return {
    sucursales,
    cargando: consulta.isPending,
    /** Hay que preguntar a cuál va el stock. */
    varias: sucursales.length > 1,
    /**
     * La sucursal a usar cuando no hay nada que elegir. `undefined` mientras la
     * consulta viaja o si la tienda no tiene ninguna, que es un error que la base
     * nombra al guardar.
     */
    unica: sucursales.length === 1 ? sucursales[0]!.id : undefined,
  };
}
