import type { Caracteristica, TipoDeCaracteristica } from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/** Lo que se edita de una característica. La clave no: se fija al crearla (ADR-161). */
export type CambiosDeCaracteristica = Omit<Caracteristica, 'id' | 'name' | 'position'>;

function aCaracteristica(fila: {
  id: string;
  name: string;
  label: string;
  kind: string;
  options: unknown;
  filterable: boolean;
  for_variants: boolean;
  required: boolean;
  position: number;
}): Caracteristica {
  return {
    id: fila.id,
    name: fila.name,
    label: fila.label,
    kind: fila.kind as TipoDeCaracteristica,
    options: Array.isArray(fila.options) ? (fila.options as string[]) : [],
    filterable: fila.filterable,
    forVariants: fila.for_variants,
    required: fila.required,
    position: fila.position,
  };
}

const COLUMNAS = 'id, name, label, kind, options, filterable, for_variants, required, position';

/** Las características de una tienda, por RLS: escribe quien tiene `catalog.write`. */
export function repositorioCaracteristicas(db: PickSupabaseClient) {
  return {
    async listar(storeId: string): Promise<readonly Caracteristica[]> {
      const { data, error } = await db
        .from('attribute_definitions')
        .select(COLUMNAS)
        .eq('store_id', storeId)
        .order('position')
        .order('label');
      if (error) throw new Error(`No se pudieron leer las características: ${error.message}`);
      return (data ?? []).map(aCaracteristica);
    },

    async crear(
      storeId: string,
      tenantId: string,
      name: string,
      cambios: CambiosDeCaracteristica,
      position: number,
    ): Promise<Caracteristica> {
      const { data, error } = await db
        .from('attribute_definitions')
        .insert({
          tenant_id: tenantId,
          store_id: storeId,
          name,
          position,
          label: cambios.label,
          kind: cambios.kind,
          options: [...cambios.options],
          filterable: cambios.filterable,
          visible_pdp: true,
          for_variants: cambios.forVariants,
          required: cambios.required,
        })
        .select(COLUMNAS)
        .single();
      if (error) throw new Error(`No se pudo crear la característica: ${error.message}`);
      return aCaracteristica(data);
    },

    async actualizar(id: string, cambios: CambiosDeCaracteristica): Promise<Caracteristica> {
      const { data, error } = await db
        .from('attribute_definitions')
        .update({
          label: cambios.label,
          kind: cambios.kind,
          options: [...cambios.options],
          filterable: cambios.filterable,
          for_variants: cambios.forVariants,
          required: cambios.required,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(COLUMNAS)
        .single();
      if (error) throw new Error(`No se pudo guardar la característica: ${error.message}`);
      return aCaracteristica(data);
    },

    async borrar(id: string): Promise<void> {
      const { error } = await db.from('attribute_definitions').delete().eq('id', id);
      if (error) throw new Error(`No se pudo borrar la característica: ${error.message}`);
    },

    /** Cuántos productos usan cada clave. */
    async uso(storeId: string): Promise<Readonly<Record<string, number>>> {
      const { data, error } = await db.rpc('admin_attribute_usage', { p_store_id: storeId });
      if (error) throw new Error(`No se pudo contar el uso: ${error.message}`);
      return (data ?? {}) as Record<string, number>;
    },
  };
}
