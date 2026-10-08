import { useQuery } from '@tanstack/react-query';
import { repositorioContenido } from '@pick/adapter-supabase';
import type { CategoriaAdmin } from '@pick/commerce-core';
import { db } from '@/lib/supabase';
import { useTiendaActiva } from './TiendaContext';

/**
 * Las categorías de la tienda activa, con su padre.
 *
 * Siete pantallas las piden con la misma clave, y la pedían con dos funciones
 * distintas: una traía el padre y la otra no. React Query guarda una sola
 * respuesta por clave, así que cada pantalla recibía la de la que hubiera cargado
 * primero, y la que necesitaba el árbol lo perdía según por dónde se entrara.
 * Una clave, una función.
 */
export function useCategorias() {
  const tienda = useTiendaActiva();
  return useQuery({
    queryKey: ['categorias', tienda.id],
    queryFn: () => repositorioContenido(db).categorias(tienda.id),
  });
}

/** «Prendas › Camperas»: la hoja sola no se distingue entre ramas. Ordenadas. */
export function rutasDeCategorias(
  categorias: readonly Pick<CategoriaAdmin, 'id' | 'name' | 'parentId'>[],
): { valor: string; etiqueta: string }[] {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const ruta = (c: Pick<CategoriaAdmin, 'id' | 'name' | 'parentId'>, vistos = 0): string => {
    // Un ciclo en el árbol no puede colgar la pantalla: se corta en cinco niveles.
    const padre = c.parentId && vistos < 5 ? porId.get(c.parentId) : undefined;
    return padre ? `${ruta(padre, vistos + 1)} › ${c.name}` : c.name;
  };
  return categorias
    .map((c) => ({ valor: c.id, etiqueta: ruta(c) }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
}
