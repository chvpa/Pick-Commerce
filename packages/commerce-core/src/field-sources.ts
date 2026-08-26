import type { FieldSource } from '@pick/commerce-types';

/**
 * Origen de cada campo sincronizable (PROJECT.md §10).
 *
 * Se guarda como `{"price":"ERP"}`: la ausencia de una clave significa
 * COMMERCE. Guardar sólo las excepciones evita tener que migrar la fila entera
 * cada vez que aparece un campo nuevo.
 */
export type FieldSources = Readonly<Record<string, string>>;

export function origenDe(fuentes: FieldSources | null | undefined, campo: string): FieldSource {
  return fuentes?.[campo] === 'ERP' ? 'ERP' : 'COMMERCE';
}

export function esEditable(fuentes: FieldSources | null | undefined, campo: string): boolean {
  return origenDe(fuentes, campo) === 'COMMERCE';
}

/**
 * Corta la edición de un campo que pertenece al ERP.
 *
 * El ERP conserva autoridad sobre lo que le pertenece: escribirlo localmente
 * crea una verdad paralela que el próximo sync pisa sin avisar, y entre medio
 * el comercio vendió con datos que no eran.
 */
export function assertEditable(fuentes: FieldSources | null | undefined, campo: string): void {
  if (!esEditable(fuentes, campo)) {
    throw new Error(`El campo ${campo} lo administra el ERP y no se edita localmente`);
  }
}
