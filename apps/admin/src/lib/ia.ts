import { db } from './supabase.ts';

/**
 * Las llamadas al Worker del Admin.
 *
 * Sólo tres cosas pasan por acá, y son las que necesitan la clave maestra de
 * cifrado: guardar la credencial, probarla y enriquecer un producto. Leer si hay
 * credencial y quitarla van directo por RPC como todo lo demás del Admin —no
 * tocan el secreto— y por eso no están en este archivo.
 *
 * Mismo origen que la app, así que la ruta va relativa y no hay CORS: en
 * producción el Worker atiende `/api/*` antes que los assets, y en `pnpm dev` lo
 * monta el propio dev server con el mismo handler.
 */

/** Un error del Worker, con el código que permite distinguir qué hacer. */
export class ErrorDeIA extends Error {
  readonly codigo: string;

  constructor(mensaje: string, codigo: string) {
    super(mensaje);
    this.name = 'ErrorDeIA';
    this.codigo = codigo;
  }
}

async function pedir<T>(ruta: string, cuerpo: Record<string, unknown>): Promise<T> {
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErrorDeIA('Tu sesión venció. Volvé a iniciar sesión.', 'sin_sesion');

  const respuesta = await fetch(ruta, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  });

  // El Worker responde JSON siempre, incluso al fallar. Si no lo hace, es que
  // algo se interpuso —un proxy, un 502 de la plataforma— y el mensaje genérico
  // es honesto porque no sabemos qué pasó.
  const datos = (await respuesta.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;

  if (!respuesta.ok) {
    throw new ErrorDeIA(
      datos?.message ?? 'No pudimos comunicarnos con el servidor.',
      datos?.error ?? 'server_error',
    );
  }

  return datos as T;
}

export interface EstadoDeIA {
  configured: boolean;
  last4?: string;
  model?: string;
  updatedAt?: string;
}

/**
 * Guarda la credencial.
 *
 * El Worker la prueba contra OpenAI **antes** de cifrarla y guardarla, así que
 * una que no sirve nunca queda registrada como configurada.
 */
export function guardarCredencial(
  storeId: string,
  apiKey: string,
  modelo: string,
): Promise<EstadoDeIA> {
  return pedir('/api/ia/credencial', { storeId, apiKey, modelo });
}

/** Prueba la credencial ya guardada, que es la que se va a usar. */
export function probarCredencial(storeId: string): Promise<{ ok: true }> {
  return pedir('/api/ia/probar', { storeId });
}

export interface PropuestaDeIA {
  title?: string;
  description?: string;
  brand?: string;
  category?: string;
  categoryId?: string;
  attributes?: Record<string, string>;
}

export function enriquecerProducto(
  storeId: string,
  producto: {
    title: string;
    description?: string;
    brand?: string;
    categoria?: string;
    variantes: { title: string; atributos: Record<string, string> }[];
    imagenes: string[];
  },
  categorias: { id: string; nombre: string }[],
): Promise<{ propuesta: PropuestaDeIA }> {
  return pedir('/api/ia/enriquecer', { storeId, producto, categorias });
}
