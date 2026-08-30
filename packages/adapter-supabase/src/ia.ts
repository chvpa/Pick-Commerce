import type {
  CredencialCifrada,
  EstadoDeCredencial,
  RepositorioCredencialDeIA,
} from '@pick/commerce-core';
import type { PostgrestError } from '@supabase/supabase-js';
import type { PickSupabaseClient } from './client.ts';

/**
 * Error con el código de PostgREST puesto.
 *
 * Existe por un caso concreto: `PGRST301` —el JWT no sirve— tiene que llegar al
 * usuario como «volvé a iniciar sesión» y no como «probá de nuevo», y quien lo
 * traduce es el Worker. Comparar el mensaje sería frágil: cambia de texto según
 * el motivo («cryptographic operation failed», «Empty JWT…»), y encima está en
 * inglés.
 */
export class ErrorDeCredencial extends Error {
  readonly codigo: string;

  constructor(mensaje: string, error: PostgrestError) {
    super(`${mensaje}: ${error.message}`);
    this.name = 'ErrorDeCredencial';
    this.codigo = error.code;
  }
}

/**
 * La credencial de OpenAI de una tienda.
 *
 * **Todo pasa por RPC, ninguna consulta directa.** `ai_credentials` no tiene
 * políticas: es la tabla de un secreto y nadie la lee de frente. Las tres
 * funciones son `security definer` y verifican `settings.write` por su cuenta,
 * así que la autorización vive en la base y no en quien llame a esto.
 *
 * Se usa desde dos lados con el mismo cliente por identidad de usuario: la
 * pantalla de configuración en el browser, que sólo puede llamar a `estado`, y
 * el Worker del Admin, que además pide `cifrada`. El Worker no tiene la secret
 * key de Supabase ni la necesita — reenvía el JWT de quien apretó el botón.
 */
export function repositorioCredencialDeIA(db: PickSupabaseClient): RepositorioCredencialDeIA {
  async function llamar<T>(
    nombre: 'ai_credential_status' | 'ai_credential_secret',
    storeId: string,
    quehacer: string,
  ): Promise<T> {
    const { data, error } = await db.rpc(nombre, { p_store_id: storeId });
    if (error) throw new ErrorDeCredencial(quehacer, error);
    return data as unknown as T;
  }

  async function guardar(
    storeId: string,
    credencial: { ciphertext: string | null; last4: string; model: string },
  ): Promise<EstadoDeCredencial> {
    const { data, error } = await db.rpc('admin_save_ai_credential', {
      p_store_id: storeId,
      // El generador de tipos declara no-nulo todo argumento de función, así que
      // el `null` que significa «quitar la credencial» no se puede expresar sin
      // el cast. Mismo caso que el `as never` de `admin_save_settings`.
      p_ciphertext: credencial.ciphertext as unknown as string,
      p_last4: credencial.last4,
      p_model: credencial.model,
    });
    if (error) throw new ErrorDeCredencial('No se pudo guardar la credencial de IA', error);
    return data as unknown as EstadoDeCredencial;
  }

  return {
    estado: (storeId) =>
      llamar<EstadoDeCredencial>(
        'ai_credential_status',
        storeId,
        'No se pudo leer la configuración de IA',
      ),

    cifrada: (storeId) =>
      llamar<CredencialCifrada>(
        'ai_credential_secret',
        storeId,
        'No se pudo leer la credencial de IA',
      ),

    guardar: (storeId, credencial) => guardar(storeId, credencial),

    // Quitar es el mismo RPC sin ciphertext. `last4` y `model` viajan igual
    // porque la firma los pide; la función los ignora en esta rama.
    quitar: (storeId) => guardar(storeId, { ciphertext: null, last4: '', model: '' }),
  };
}
