import type { HistorialDeActividad } from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * La historia de un pedido o de un producto (ADR-159): quién, qué y cuándo, la
 * más reciente primero. La función decide qué se puede ver: nunca los ajustes ni
 * el equipo, y nada de otra organización.
 */
export async function historialDe(
  db: PickSupabaseClient,
  storeId: string,
  subjectId: string,
  limite = 50,
): Promise<HistorialDeActividad> {
  const { data, error } = await db.rpc('admin_subject_activity', {
    p_store_id: storeId,
    p_subject_id: subjectId,
    p_limit: limite,
  });
  if (error) throw new Error(`No se pudo leer la historia: ${error.message}`);
  return data as unknown as HistorialDeActividad;
}
