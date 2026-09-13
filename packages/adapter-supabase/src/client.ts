import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@pick/commerce-types/database';

export type PickSupabaseClient = SupabaseClient<Database>;

export interface ConexionPublica {
  readonly url: string;
  /** Puede llegar al browser: la protege RLS. */
  readonly publishableKey: string;
}

/**
 * No extiende `ConexionPublica`: este cliente nunca usa la publishable key, y
 * pedirla obligaba a los llamadores a inventar un valor de relleno.
 */
export interface ConexionServidor {
  readonly url: string;
  /** Saltea RLS por completo. Nunca en el browser. */
  readonly secretKey: string;
}

/**
 * Cliente para el Admin, con la identidad del usuario.
 *
 * RLS es lo que impide que una query devuelva filas de otra organización, así
 * que este cliente puede consultar tablas directamente. Ver ADR-052.
 */
export function clienteDeUsuario(
  conexion: ConexionPublica,
  accessToken: string,
): PickSupabaseClient {
  return createClient<Database>(conexion.url, conexion.publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente de servidor. **Saltea RLS.**
 *
 * Lo usan el storefront y los jobs, que no tienen un usuario detrás. En este
 * camino RLS no protege nada: la única defensa es que quien lo use pase por el
 * servicio de dominio, que verifica permisos y tenant.
 *
 * Falla si se lo intenta crear en el browser. No es paranoia: basta un import
 * mal ubicado para que un bundler meta la secret key en el bundle del cliente,
 * y ese error no lo detecta ni el typecheck ni el lint.
 */
export function clienteDeServidor(conexion: ConexionServidor): PickSupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error(
      'clienteDeServidor no puede usarse en el browser: expondría la secret key, que saltea RLS.',
    );
  }

  return createClient<Database>(conexion.url, conexion.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente de un solo uso para operar contra Auth sin identidad previa.
 *
 * Existe por un fallo que se midió antes de entregarlo: **`verifyOtp` le deja la
 * sesión puesta al cliente sobre el que se llama.** `persistSession: false` sólo
 * impide escribirla en disco; en memoria queda igual, y a partir de ahí ese
 * cliente habla con el JWT de quien acaba de entrar en vez de con su propia
 * credencial.
 *
 * En el storefront eso sería grave y silencioso: `clienteDelStorefront()` se
 * memoiza por isolate, así que un comprador que entra le cambiaría la identidad
 * al catálogo de todos los que caigan en ese isolate hasta que el isolate muera.
 * Se vio como un `permission denied` en la petición **siguiente** al login,
 * que no se parece en nada a la causa.
 *
 * Por eso este cliente se crea, se usa una vez y se tira. Y con la publishable
 * key: canjear un código es una operación pública y no hay motivo para hacerla
 * con la clave que saltea RLS.
 */
export function clienteDeAuth(conexion: ConexionPublica): PickSupabaseClient {
  return createClient<Database>(conexion.url, conexion.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente para el Admin en el browser.
 *
 * Persiste la sesión —a diferencia de los otros dos, que son de un solo uso—
 * porque una SPA autenticada no puede pedir credenciales en cada recarga.
 * Usa la publishable key: todo lo que devuelva pasa por RLS.
 */
export function clienteDeBrowser(conexion: ConexionPublica): PickSupabaseClient {
  return createClient<Database>(conexion.url, conexion.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
