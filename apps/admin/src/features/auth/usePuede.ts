import { useCallback } from 'react';
import { can } from '@pick/commerce-core';
import type { Permission } from '@pick/commerce-types';
import { useSesion } from '@/features/auth/SesionContext';
import { useTienda } from '@/features/tienda/TiendaContext';

/**
 * Qué puede hacer quien está mirando, en la tienda que está mirando.
 *
 * **Esto no autoriza nada.** La autorización de verdad son las políticas de la
 * base: un viewer que fuerce la ruta o dispare la mutación a mano recibe el
 * rechazo igual (ADR-052). Lo que hace este hook es que la pantalla no le
 * ofrezca botones que la base le va a negar, que es una diferencia de trato, no
 * de seguridad.
 *
 * Resuelve por el tenant de la tienda activa y no por "el rol del usuario": una
 * persona puede ser owner de un comercio y viewer de otro, y con el selector
 * cambia lo que puede hacer sin volver a entrar.
 *
 * Sin tienda o sin membresía devuelve `false` para todo. Es lo correcto por
 * defecto: si no se sabe qué rol tiene, no se le ofrece nada.
 */
export function usePuede(): (permiso: Permission) => boolean {
  const { sesion } = useSesion();
  const { tienda } = useTienda();
  const membresias = sesion?.membresias;

  return useCallback(
    (permiso: Permission) => {
      if (!tienda || !membresias) return false;
      const membresia = membresias.find((m) => m.tenantId === tienda.tenantId);
      return membresia ? can(membresia, permiso) : false;
    },
    [membresias, tienda],
  );
}
