/**
 * Lo que se le pide a una contraseña nueva, a la vista mientras se escribe
 * (ADR-157). Es la regla de la pantalla: el proyecto de Supabase pide seis
 * caracteres y nada más, así que quien cree un usuario por otro camino
 * —`pnpm admin:crear`— no pasa por acá.
 */
export const REGLAS_DE_CONTRASENA: readonly {
  readonly etiqueta: string;
  readonly cumple: (contrasena: string) => boolean;
}[] = [
  { etiqueta: 'Al menos 8 caracteres', cumple: (c) => c.length >= 8 },
  { etiqueta: 'Un número', cumple: (c) => /\d/.test(c) },
  { etiqueta: 'Una mayúscula', cumple: (c) => /\p{Lu}/u.test(c) },
];

export function contrasenaValida(contrasena: string): boolean {
  return REGLAS_DE_CONTRASENA.every((r) => r.cumple(contrasena));
}
