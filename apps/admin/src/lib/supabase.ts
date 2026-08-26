import { clienteDeBrowser, type PickSupabaseClient } from '@pick/adapter-supabase';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Si falta la configuración se expone como dato en vez de lanzar al importar.
 * Un `throw` a nivel de módulo deja la app en pantalla en blanco con el motivo
 * sólo en la consola, y quien despliega mal el Admin merece verlo en pantalla.
 */
export const configuracionFaltante: string[] = [
  ...(url ? [] : ['VITE_SUPABASE_URL']),
  ...(publishableKey ? [] : ['VITE_SUPABASE_PUBLISHABLE_KEY']),
];

/**
 * Cliente del Admin. Usa la publishable key: **todo lo que devuelva pasa por
 * RLS**, así que nada acá depende de que el frontend se porte bien.
 *
 * La secret key no existe en esta app ni puede existir: la expondría el bundle.
 */
export const db: PickSupabaseClient =
  configuracionFaltante.length === 0
    ? clienteDeBrowser({ url: url!, publishableKey: publishableKey! })
    : // Nunca se usa: `App` corta antes si falta configuración.
      (null as unknown as PickSupabaseClient);
