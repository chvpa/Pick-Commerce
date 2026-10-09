import type { EntradaDeActividad, HistorialDeActividad } from '@pick/commerce-core';
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

/** Una fila del registro completo: además de lo de la historia, a quién mirar y desde dónde. */
export interface FilaDelRegistro extends EntradaDeActividad {
  readonly actorId?: string;
  readonly subjectId?: string;
  readonly storeId?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface PaginaDelRegistro {
  readonly items: readonly FilaDelRegistro[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}

/** Configuración › Registro de actividad (ADR-160). Sólo quien administra el equipo. */
export async function registroDeActividad(
  db: PickSupabaseClient,
  tenantId: string,
  filtro: { actorId?: string; soloSensibles?: boolean; page?: number; perPage?: number } = {},
): Promise<PaginaDelRegistro> {
  const { data, error } = await db.rpc('admin_activity_log', {
    p_tenant: tenantId,
    ...(filtro.actorId ? { p_actor: filtro.actorId } : {}),
    p_sensitive_only: filtro.soloSensibles ?? false,
    p_page: filtro.page ?? 1,
    p_per_page: filtro.perPage ?? 50,
  });
  if (error) throw new Error(`No se pudo leer el registro: ${error.message}`);
  return data as unknown as PaginaDelRegistro;
}
