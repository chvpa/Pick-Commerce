import { useQuery } from '@tanstack/react-query';
import { repositorioContenido } from '@pick/adapter-supabase';
import { Pestanas } from '@/components/pagina';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

type Pestana = 'secciones' | 'colecciones' | 'categorias';

/**
 * Las tres pantallas de la tienda como pestañas de una (ADR-152).
 *
 * El handoff junta Secciones, Colecciones y Categorías bajo «Secciones», y el
 * sidebar deja de tener las dos últimas. Siguen siendo tres rutas —los
 * marcadores, las migas y el formulario de cada una no cambian—, y cada pantalla
 * dibuja esta misma barra arriba.
 *
 * Las cuentas piden una fila: lo que importa es el total, y la lista de cada
 * pestaña ya tiene su propia consulta paginada.
 */
export function PestanasDeContenido({ activa }: { activa: Pestana }) {
  const tienda = useTiendaActiva();
  const repo = repositorioContenido(db);

  // La misma clave que la lista de Secciones: si se viene de ahí, no se pide.
  const secciones = useQuery({
    queryKey: ['secciones', tienda.id],
    queryFn: () => repo.secciones(tienda.id),
  });
  const colecciones = useQuery({
    queryKey: ['colecciones', tienda.id, 'cuenta'],
    queryFn: () => repo.colecciones(tienda.id, { perPage: 1 }),
  });
  const categorias = useQuery({
    queryKey: ['categorias', tienda.id, 'cuenta'],
    queryFn: () => repo.paginaDeCategorias(tienda.id, { page: 1, perPage: 1 }),
  });

  return (
    <Pestanas
      etiqueta="Contenido de la tienda"
      to="/contenido/secciones"
      activa={activa}
      pestanas={[
        {
          valor: 'secciones' as const,
          etiqueta: 'Secciones',
          to: '/contenido/secciones',
          ...(secciones.data ? { cuenta: secciones.data.length } : {}),
        },
        {
          valor: 'colecciones' as const,
          etiqueta: 'Colecciones',
          to: '/contenido/colecciones',
          ...(colecciones.data ? { cuenta: colecciones.data.total } : {}),
        },
        {
          valor: 'categorias' as const,
          etiqueta: 'Categorías',
          to: '/contenido/categorias',
          ...(categorias.data ? { cuenta: categorias.data.total } : {}),
        },
      ]}
    />
  );
}
