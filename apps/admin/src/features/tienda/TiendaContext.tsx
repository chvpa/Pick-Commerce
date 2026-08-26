import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repositorioTiendas } from '@pick/adapter-supabase';
import type { TiendaResumen } from '@pick/commerce-core';
import { db } from '@/lib/supabase';

/**
 * Sobre qué tienda se está trabajando.
 *
 * El Admin es multitenant: un usuario puede administrar varias organizaciones y
 * cada una tener más de una tienda. Todo lo que se lista o se guarda va acotado
 * por esta selección, y **no es la que autoriza**: RLS decide igual, aunque
 * alguien fuerce otro id. Ver ADR-052.
 */
interface Contexto {
  tiendas: readonly TiendaResumen[];
  tienda: TiendaResumen | null;
  elegir: (id: string) => void;
  cargando: boolean;
  error: Error | null;
}

const TiendaContext = createContext<Contexto | null>(null);

const CLAVE = 'pick:admin:tienda';

export function ProveedorTienda({ children }: { children: ReactNode }) {
  const [elegida, setElegida] = useState<string | null>(() => {
    try {
      return globalThis.localStorage?.getItem(CLAVE) ?? null;
    } catch {
      // Modo privado o storage bloqueado: se elige de nuevo en cada sesión.
      return null;
    }
  });

  const { data, isPending, error } = useQuery({
    queryKey: ['tiendas'],
    queryFn: () => repositorioTiendas(db).mias(),
  });

  const tiendas = useMemo(() => data ?? [], [data]);

  // Con una sola tienda no hay nada que elegir; con la elegida ausente —porque
  // se le quitó el acceso— se cae a la primera en vez de dejar la pantalla vacía.
  const tienda = useMemo(
    () => tiendas.find((t) => t.id === elegida) ?? tiendas[0] ?? null,
    [tiendas, elegida],
  );

  useEffect(() => {
    if (!tienda) return;
    try {
      globalThis.localStorage?.setItem(CLAVE, tienda.id);
    } catch {
      // Sin persistencia la selección dura lo que la pestaña.
    }
  }, [tienda]);

  const valor = useMemo<Contexto>(
    () => ({
      tiendas,
      tienda,
      elegir: setElegida,
      cargando: isPending,
      error: error as Error | null,
    }),
    [tiendas, tienda, isPending, error],
  );

  return <TiendaContext value={valor}>{children}</TiendaContext>;
}

export function useTienda(): Contexto {
  const ctx = use(TiendaContext);
  if (!ctx) throw new Error('useTienda necesita estar dentro de ProveedorTienda');
  return ctx;
}

/** La tienda activa, para pantallas que no tienen nada que hacer sin una. */
export function useTiendaActiva(): TiendaResumen {
  const { tienda } = useTienda();
  if (!tienda) throw new Error('No hay tienda seleccionada');
  return tienda;
}
