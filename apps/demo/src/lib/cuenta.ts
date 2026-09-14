import { getSecret } from 'astro:env/server';
import { clienteDeAuth, clienteDeUsuario } from '@pick/adapter-supabase';
import { EVENTO_CODIGO } from '@pick/commerce-core';
import type { Money } from '@pick/commerce-types';
import { clienteDelStorefront, tiendaActual } from './db.ts';
import type { SesionDeComprador } from './sesion.ts';

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

export function conexionPublica(): { url: string; publishableKey: string } {
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
export async function canjearCodigo(email: string, codigo: string): Promise<CanjeLogrado | null> {
  const db = clienteDeAuth(conexionPublica());

  /*
   * El tipo tiene que coincidir con el del enlace que se generó, y `pedirCodigo`
   * elige uno de dos. Se prueban los dos en el mismo orden que allá: un código
   * de `signup` no verifica como `magiclink` y viceversa.
   */
  for (const type of ['signup', 'magiclink'] as const) {
    const { data, error } = await db.auth.verifyOtp({ email, token: codigo, type });
    if (!error && data.session && data.user) {
      return {
        sesion: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
        userId: data.user.id,
        // **El email sale de acá y no del cuerpo de la petición.** Es el que
        // Supabase acaba de verificar contra el código; el del formulario es un
        // dato del navegador. La diferencia importa porque con este valor se
        // decide a qué ficha de cliente se engancha la cuenta.
        email: data.user.email ?? email,
      };
    }
  }

  return null;
}

export interface CanjeLogrado {
  readonly sesion: SesionDeComprador;
  readonly userId: string;
  /** Verificado por Supabase, no el que vino del formulario. */
  readonly email: string;
}

/**
 * Engancha la cuenta con lo que esa persona compró como invitada.
 *
 * `customers` se identifica por `(store_id, email)` y `create_order` hace upsert
 * por ahí desde la Fase 5, así que quien compró sin cuenta **ya tiene ficha**:
 * entrar no crea un cliente nuevo, engancha el que estaba. Quien nunca compró no
 * tiene ninguna y la función se la crea vacía, para que la cuenta exista igual.
 *
 * Corre con la secret key porque escribe en dos tablas que el comprador no puede
 * tocar. Devuelve `null` si no se pudo vincular, y ahí la cuenta se ve vacía:
 * ver el motivo en la migración.
 */
export async function vincularCuenta(userId: string, email: string): Promise<string | null> {
  const db = clienteDelStorefront();
  const { storeId } = await tiendaActual();

  const { data, error } = await db.rpc('link_customer_account', {
    p_store_id: storeId,
    p_user_id: userId,
    p_email: email,
  });

  if (error) throw new Error(`No se pudo vincular la cuenta: ${error.message}`);
  return data;
}

/**
 * Los pedidos de quien está mirando.
 *
 * **Con el JWT del comprador, no con la secret key.** Es el único camino del
 * storefront donde la base decide de verdad quién ve qué: `customer_orders` es
 * security invoker y lo acota RLS por `app.current_customer(store_id)`. Pasar
 * por `clienteDelStorefront()` acá devolvería los pedidos de toda la tienda
 * (ADR-121).
 */
export async function misPedidos(accessToken: string, pagina = 1): Promise<PaginaDePedidos> {
  const { storeId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);

  const { data, error } = await db.rpc('customer_orders', {
    p_store_id: storeId,
    p_page: pagina,
    p_per_page: POR_PAGINA,
  });

  if (error) throw new Error(`No se pudieron leer los pedidos: ${error.message}`);
  return data as unknown as PaginaDePedidos;
}

/** Cuántos pedidos por página. El techo de la función es 50. */
export const POR_PAGINA = 10;

export interface PedidoDeLaCuenta {
  readonly id: string;
  readonly number: number;
  readonly createdAt: string;
  readonly status: string;
  readonly paymentStatus: string;
  readonly total: Money;
  readonly itemCount: number;
}

export interface PaginaDePedidos {
  readonly items: readonly PedidoDeLaCuenta[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
}
