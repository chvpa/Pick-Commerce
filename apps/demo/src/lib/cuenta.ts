import { getSecret } from 'astro:env/server';
import { clienteDeAuth } from '@pick/adapter-supabase';
import { EVENTO_CODIGO } from '@pick/commerce-core';
import { clienteDelStorefront, tiendaActual } from './db.ts';

/**
 * Entrar a la cuenta, con el correo del comercio.
 *
 * **El código lo genera Supabase y lo mandamos nosotros**, y eso no es un rodeo:
 * un correo al comprador tiene que salir del comercio (ADR-123), y el SMTP de
 * Supabase Auth tiene un solo remitente para **todo el proyecto**. Con cinco
 * tiendas, los compradores de las cinco recibirían el código desde el dominio de
 * la primera.
 *
 * `auth.admin.generateLink()` no manda ningún correo: existe justamente «para
 * enviarse por un proveedor propio» y devuelve `email_otp`, el código en crudo.
 * Así que se encola en `notification_outbox` con el `store_id` de esta tienda y
 * lo manda el drenador que ya existe, con el `EMAIL_FROM` de acá.
 *
 * Lo que eso evita: el Send Email Hook, con su ruta HTTP, su verificación de
 * firma y su clave de Resend metida en la base (ADR-122).
 */

/** Cuánto vale el código, en minutos. Se dice en el correo. */
export const MINUTOS_DEL_CODIGO = 15;

/**
 * Pide el código y lo encola.
 *
 * **No dice si el email existe.** `auth.users` es del proyecto entero, así que
 * una respuesta distinta para un email conocido sería enumeración de clientes
 * **entre comercios**: cualquiera podría preguntarle a la tienda A si una
 * persona compró en la B. Por eso el tipo de enlace se elige acá adentro y el
 * llamador recibe siempre lo mismo, incluso cuando falla.
 */
export async function pedirCodigo(email: string): Promise<void> {
  const db = clienteDelStorefront();
  const { storeId, tenantId } = await tiendaActual();

  /*
   * **El orden importa, y es al revés de lo que parece.** Medido contra el
   * proyecto real, porque la documentación no lo dice:
   *
   *   email nuevo       signup vale; magiclink devuelve un código que **no**
   *                     verifica, porque el usuario queda sin confirmar
   *   email registrado  signup falla con «already been registered»; vale
   *                     magiclink
   *
   * O sea que `magiclink` primero es la trampa: no falla nunca sobre un email
   * nuevo, así que la rama de `signup` no se usaría jamás y quien se registrara
   * por primera vez recibiría un código que le dicen que es inválido. Se pide
   * `signup` primero **porque es el que falla cuando no corresponde**.
   */
  let otp = await generar(db, 'signup', email);
  otp ??= await generar(db, 'magiclink', email);

  // Sin código no hay nada que mandar, y no se dice por qué: el motivo más
  // probable es que el email no exista y decirlo es justamente lo que no se
  // puede hacer.
  if (!otp) return;

  const { error } = await db.from('notification_outbox').insert({
    tenant_id: tenantId,
    store_id: storeId,
    event: EVENTO_CODIGO,
    recipient: email,
    payload: { codigo: otp, minutos: MINUTOS_DEL_CODIGO },
  });

  if (error) throw new Error(`No se pudo encolar el código: ${error.message}`);
}

/**
 * La conexión pública, para lo que no necesita saltear RLS.
 *
 * `SUPABASE_PUBLISHABLE_KEY` es un secreto nuevo del Worker del storefront, que
 * hasta ahora sólo tenía la secret key: es lo que habilita el primer camino de
 * este sitio donde RLS decide de verdad (ADR-121).
 */
/**
 * El secreto que falta para que las cuentas funcionen, o `null` si están todos.
 *
 * No va a `REQUERIDAS` del middleware, y la diferencia importa: sin
 * `SUPABASE_PUBLISHABLE_KEY` el catálogo, el carrito y el checkout andan
 * perfecto —usan la secret key— así que tumbar la tienda entera por una
 * credencial que sólo hace falta para entrar a una cuenta sería apagar la caja
 * porque no anda el probador. Lo dicen las dos rutas de `/api/cuenta/`, con un
 * 503 que nombra lo que falta en el log del Worker.
 */
export function faltaParaLasCuentas(): string | null {
  for (const nombre of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const) {
    try {
      if (!getSecret(nombre)) return nombre;
    } catch {
      return nombre;
    }
  }
  return null;
}

function conexionPublica(): { url: string; publishableKey: string } {
  const url = getSecret('SUPABASE_URL');
  const publishableKey = getSecret('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !publishableKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY en el entorno del Worker.');
  }
  return { url, publishableKey };
}

type Cliente = ReturnType<typeof clienteDelStorefront>;

/** El código en crudo, o `null` si Supabase no lo pudo generar con ese tipo. */
async function generar(
  db: Cliente,
  tipo: 'magiclink' | 'signup',
  email: string,
): Promise<string | null> {
  const { data, error } = await db.auth.admin.generateLink(
    tipo === 'signup'
      ? // La contraseña es obligatoria en el alta y no se usa nunca: acá se
        // entra con código. Aleatoria y desechada, para que nadie pueda entrar
        // con ella.
        { type: 'signup', email, password: crypto.randomUUID() }
      : { type: 'magiclink', email },
  );

  if (error || !data.properties?.email_otp) return null;
  return data.properties.email_otp;
}

/**
 * Canjea el código por una sesión.
 *
 * Devuelve los tokens para que los guarde el middleware en su cookie httpOnly.
 * **No van al navegador**: el storefront no manda supabase-js al cliente
 * (ADR-121).
 *
 * Va sobre un cliente **de un solo uso**, y no sobre el del storefront, porque
 * `verifyOtp` le deja la sesión puesta al cliente sobre el que corre —aun con
 * `persistSession: false`, que sólo habla del disco—. Con el cliente memoizado
 * del storefront, un comprador que entra le cambiaría la identidad al catálogo
 * de todo el isolate. Ver `clienteDeAuth`.
 */
export async function canjearCodigo(
  email: string,
  codigo: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const db = clienteDeAuth(conexionPublica());

  /*
   * El tipo tiene que coincidir con el del enlace que se generó, y `pedirCodigo`
   * elige uno de dos. Se prueban los dos en el mismo orden que allá: un código
   * de `signup` no verifica como `magiclink` y viceversa.
   */
  for (const type of ['signup', 'magiclink'] as const) {
    const { data, error } = await db.auth.verifyOtp({ email, token: codigo, type });
    if (!error && data.session) {
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    }
  }

  return null;
}
