import type { PreferenciasDelVisitante } from '@pick/commerce-core';
import { getSecret } from 'astro:env/server';
import { clienteDeAuth, clienteDeUsuario, type PickSupabaseClient } from '@pick/adapter-supabase';
import { EVENTO_CODIGO } from '@pick/commerce-core';
import type { Money, Order } from '@pick/commerce-types';
import type { Json } from '@pick/commerce-types/database';
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

/**
 * Un pedido propio, o `null` si no lo es.
 *
 * **No hay función nueva para «mi pedido»**: `order_json` es `language sql
 * stable` y security invoker, así que con el JWT del comprador lo filtra RLS por
 * `app.es_mi_pedido`. Pedir el id de un pedido ajeno devuelve vacío, no el
 * pedido de otro — y eso tiene su caso en la suite de aislamiento.
 */
export async function miPedido(accessToken: string, orderId: string): Promise<Order | null> {
  const db = clienteDeUsuario(conexionPublica(), accessToken);
  const { data, error } = await db.rpc('order_json', { p_order_id: orderId });

  if (error) throw new Error(`No se pudo leer el pedido: ${error.message}`);
  const pedido = data as unknown as Order | null;
  return pedido?.id ? pedido : null;
}

/**
 * El correo verificado de la sesión, o `null`.
 *
 * Se le pregunta a Supabase con `getUser` en vez de decodificar el JWT de la
 * cookie, y la diferencia no es ceremonia: el propio SDK advierte que el usuario
 * que sale de un token guardado en una cookie **no se puede dar por bueno** sin
 * verificarlo contra el servidor de Auth. Y este valor decide de qué ficha de
 * cliente cuelga el pedido, así que es exactamente el caso donde importa.
 */
export async function emailDelComprador(accessToken: string): Promise<string | null> {
  const db = clienteDeAuth(conexionPublica());
  const { data, error } = await db.auth.getUser(accessToken);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export interface DireccionGuardada {
  readonly id: string;
  readonly label: string | null;
  readonly address: DireccionDeEnvio;
  readonly isDefault: boolean;
}

export interface DireccionDeEnvio {
  readonly street: string;
  readonly city: string;
  readonly zone?: string;
  readonly reference?: string;
}

/**
 * Las direcciones guardadas de quien está mirando.
 *
 * Con su JWT: la política de `customer_addresses` es `for all` acotada por
 * `app.current_customer(store_id)`, así que la tabla se consulta directamente
 * sin una función intermedia. Es la diferencia con el resto del storefront, que
 * usa la secret key y no puede darse ese lujo (ADR-052).
 */
export async function misDirecciones(accessToken: string): Promise<readonly DireccionGuardada[]> {
  const { storeId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);

  const { data, error } = await db
    .from('customer_addresses')
    .select('id, label, address, is_default')
    .eq('store_id', storeId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`No se pudieron leer las direcciones: ${error.message}`);

  return (data ?? []).map((fila) => ({
    id: fila.id,
    label: fila.label,
    address: fila.address as unknown as DireccionDeEnvio,
    isDefault: fila.is_default,
  }));
}

/**
 * Guarda una dirección de la cuenta.
 *
 * `customer_id` sale de `app.current_customer(store_id)`, **nunca del cuerpo**:
 * es la regla de ADR-121 y acá es lo que impide colgar una dirección de la
 * cuenta de otro. El `with check` de la política lo vuelve a comprobar del lado
 * de la base, que es donde vale.
 */
/**
 * La ficha de cliente de esta sesión en esta tienda.
 *
 * Se lee de `customer_accounts` y no llamando a `app.current_customer`: esa
 * función vive en el schema `app`, que PostgREST no expone —y no se le va a
 * poner un envoltorio en `public` sólo para esto, que sería una función más
 * alcanzable por `authenticated`—. La política `customer_accounts_propia` ya
 * deja leer la fila propia y nada más.
 */
async function fichaDeLaSesion(db: PickSupabaseClient, storeId: string): Promise<string> {
  const { data, error } = await db
    .from('customer_accounts')
    .select('customer_id')
    .eq('store_id', storeId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo resolver la cuenta: ${error.message}`);
  if (!data?.customer_id) throw new Error('La sesión no tiene cuenta en esta tienda.');
  return data.customer_id;
}

/** Los productos guardados de quien está mirando, del más nuevo al más viejo. */
export async function misFavoritos(accessToken: string): Promise<readonly string[]> {
  const { storeId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);

  const { data, error } = await db
    .from('wishlist_items')
    .select('product_id')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`No se pudieron leer los guardados: ${error.message}`);
  return (data ?? []).map((f) => f.product_id);
}

/**
 * Las preferencias de quien entró a su cuenta.
 *
 * Es el mismo bucket que `visitor_preferences` —dos marcas y dos categorías—
 * pero de la persona y no del navegador: sigue del teléfono al escritorio y
 * sobrevive a la purga de eventos, porque está materializado (ADR-128).
 *
 * Va con el token del comprador, como lo guardado: la función es `definer` y
 * filtra por la identidad de quien llama, así que nadie puede pedir el perfil de
 * otro. Un fallo devuelve `{}` y la vitrina cae al escalón siguiente.
 */
export async function misPreferencias(
  accessToken: string,
): Promise<PreferenciasDelVisitante | undefined> {
  try {
    const { storeId } = await tiendaActual();
    const db = clienteDeUsuario(conexionPublica(), accessToken);

    const { data, error } = await db.rpc('my_preferences', { p_store_id: storeId });
    if (error) throw new Error(error.message);

    const prefiere = data as unknown as PreferenciasDelVisitante;
    return Object.keys(prefiere ?? {}).length > 0 ? prefiere : undefined;
  } catch (error) {
    console.error('[preferencias] no se pudo leer el perfil de la cuenta', error);
    return undefined;
  }
}

/**
 * Borra el perfil de quien apagó la personalización.
 *
 * Lo llama el interruptor. La función filtra por la identidad de quien llama, y
 * el recálculo no lo vuelve a armar porque sólo mira visitas con personalización
 * prendida: sin esas dos cosas, apagar duraría hasta la próxima corrida
 * (ADR-128).
 */
export async function olvidarMisPreferencias(accessToken: string): Promise<void> {
  const { storeId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);

  const { error } = await db.rpc('forget_my_preferences', { p_store_id: storeId });
  if (error) throw new Error(`No se pudo borrar el perfil: ${error.message}`);
}

export interface ProductoGuardado {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly brand: string | null;
  readonly image: { url: string; alt: string | null } | null;
  /** Publicado y con stock. Lo no disponible **se muestra**, no se esconde. */
  readonly available: boolean;
  readonly savedAt: string;
}

/**
 * Lo guardado, listo para dibujar.
 *
 * Va por `wishlist_products` y no por el catálogo, y el motivo está en la
 * migración: el catálogo **esconde** lo archivado y lo sin stock, que es lo
 * contrario de lo que esta pantalla necesita. Tampoco trae precio, para que no
 * pueda discrepar con el del catálogo.
 */
export async function productosGuardados(
  accessToken: string,
): Promise<readonly ProductoGuardado[]> {
  const { storeId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);

  const { data, error } = await db.rpc('wishlist_products', { p_store_id: storeId });
  if (error) throw new Error(`No se pudieron leer los guardados: ${error.message}`);
  return data as unknown as readonly ProductoGuardado[];
}

/**
 * Guarda productos en la cuenta. Idempotente por construcción.
 *
 * El `unique (store_id, customer_id, product_id)` es lo que hace que volcar la
 * wishlist de `localStorage` al entrar no necesite preguntar qué había: volcar
 * dos veces, o volcar algo que ya estaba, no duplica nada.
 *
 * `customer_id` sale de la sesión y **nunca del cuerpo** (ADR-121). El
 * `with check` de la política lo vuelve a comprobar del lado de la base, que es
 * donde vale.
 */
export async function guardarFavoritos(
  accessToken: string,
  productIds: readonly string[],
): Promise<void> {
  if (productIds.length === 0) return;

  const { storeId, tenantId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);
  const cliente = await fichaDeLaSesion(db, storeId);

  const { error } = await db.from('wishlist_items').upsert(
    productIds.map((product_id) => ({
      tenant_id: tenantId,
      store_id: storeId,
      customer_id: cliente,
      product_id,
    })),
    { onConflict: 'store_id,customer_id,product_id', ignoreDuplicates: true },
  );

  if (error) throw new Error(`No se pudo guardar: ${error.message}`);
}

/** Saca un producto de la cuenta. RLS se encarga de que sea la propia. */
export async function quitarFavorito(accessToken: string, productId: string): Promise<void> {
  const { storeId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);

  const { error } = await db
    .from('wishlist_items')
    .delete()
    .eq('store_id', storeId)
    .eq('product_id', productId);

  if (error) throw new Error(`No se pudo quitar: ${error.message}`);
}

/**
 * Ata esta sesión anónima a la persona que acaba de entrar.
 *
 * Es lo que convierte media hora de memoria en todo su historial: `store_events`
 * guarda el id de sesión y **nunca la identidad** (PROJECT.md §23), así que el
 * cruce vive en esta tabla aparte y sólo lo puede hacer el servidor.
 *
 * Con la secret key porque `session_identities` no tiene políticas, y eso
 * también es a propósito: ver la migración.
 *
 * La clave primaria es `(store_id, session_id)`, así que entrar de nuevo desde
 * el mismo navegador **pisa** el vínculo. Correcto: lo que ese dispositivo haga
 * de ahora en adelante es de quien lo está usando ahora.
 */
export async function atarLaSesion(sessionId: string, customerId: string): Promise<void> {
  const db = clienteDelStorefront();
  const { storeId, tenantId } = await tiendaActual();

  const { error } = await db
    .from('session_identities')
    .upsert(
      { session_id: sessionId, tenant_id: tenantId, store_id: storeId, customer_id: customerId },
      { onConflict: 'store_id,session_id' },
    );

  if (error) throw new Error(`No se pudo atar la sesión: ${error.message}`);
}

export async function guardarDireccion(
  accessToken: string,
  entrada: { label: string | null; address: DireccionDeEnvio; porDefecto: boolean },
): Promise<void> {
  const { storeId, tenantId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);

  const cliente = await fichaDeLaSesion(db, storeId);

  // Una sola por defecto. Se apagan las otras antes de insertar; RLS acota el
  // update a las propias, así que no hace falta nombrar al cliente.
  if (entrada.porDefecto) {
    const { error } = await db
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('store_id', storeId)
      .eq('is_default', true);
    if (error) throw new Error(`No se pudo reordenar las direcciones: ${error.message}`);
  }

  const { error } = await db.from('customer_addresses').insert({
    tenant_id: tenantId,
    store_id: storeId,
    customer_id: cliente,
    label: entrada.label,
    address: entrada.address as unknown as Json,
    is_default: entrada.porDefecto,
  });

  if (error) throw new Error(`No se pudo guardar la dirección: ${error.message}`);
}

/** Borra una dirección propia. RLS se encarga de que sea propia. */
export async function borrarDireccion(accessToken: string, id: string): Promise<void> {
  const db = clienteDeUsuario(conexionPublica(), accessToken);
  const { error } = await db.from('customer_addresses').delete().eq('id', id);
  if (error) throw new Error(`No se pudo borrar la dirección: ${error.message}`);
}

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

/** Lo que el PDP necesita saber del comprador para ofrecerle reseñar, o no. */
export interface EstadoDeResena {
  readonly puede: boolean;
  readonly yaEscribio: boolean;
  readonly pendiente: boolean;
}

/**
 * Si quien está mirando puede reseñar este producto, y si ya lo hizo (ADR-140).
 *
 * Una sola llamada: `mi_resena` resuelve las dos cosas adentro, donde puede mirar
 * los pedidos entregados y el catálogo a la vez. Un fallo devuelve el caso
 * conservador —no puede—, porque un formulario ofrecido a quien no compró termina
 * en un rechazo de la base y en una pantalla de error.
 */
export async function estadoDeResena(
  accessToken: string,
  productId: string,
): Promise<EstadoDeResena> {
  const conservador: EstadoDeResena = { puede: false, yaEscribio: false, pendiente: false };
  try {
    const { storeId } = await tiendaActual();
    const db = clienteDeUsuario(conexionPublica(), accessToken);

    const { data, error } = await db.rpc('mi_resena', {
      p_store_id: storeId,
      p_product_id: productId,
    });

    if (error) throw new Error(error.message);
    return (data as unknown as EstadoDeResena) ?? conservador;
  } catch (error) {
    console.error('[resenas] no se pudo resolver si puede reseñar', error);
    return conservador;
  }
}

/**
 * Escribe la reseña del comprador.
 *
 * **El pedido que la justifica lo elige la base**, no esta función: si el id
 * viajara en el payload habría que validar que sea suyo, que esté entregado y que
 * tenga ese producto, y eso es exactamente lo que no hay que escribir dos veces.
 */
export async function escribirResena(
  accessToken: string,
  productId: string,
  rating: number,
  body: string | null,
): Promise<void> {
  const { storeId } = await tiendaActual();
  const db = clienteDeUsuario(conexionPublica(), accessToken);

  const { error } = await db.rpc('escribir_resena', {
    p_store_id: storeId,
    p_product_id: productId,
    p_rating: rating,
    // El tipo generado no acepta `null`: omitir el argumento es lo mismo, porque
    // la función tiene `default null`.
    ...(body === null ? {} : { p_body: body }),
  });

  if (error) throw new Error(error.message);
}
