import {
  ErrorDeCredencial,
  clienteDeUsuario,
  repositorioCredencialDeIA,
} from '@pick/adapter-supabase';
import {
  MODELO_POR_DEFECTO,
  cifrar,
  descifrar,
  esModelo,
  resolverCategoria,
  ultimosCuatro,
  type CategoriaConocida,
  type ModeloDeIA,
  type ProductoParaEnriquecer,
  type Propuesta,
} from '@pick/commerce-core';
import { proveedorOpenAI } from '@pick/adapter-openai';

/**
 * El servidor del Admin.
 *
 * Hasta la Fase 11 el Admin era una SPA sin ningún lado de servidor: todo lo que
 * necesitaba lo hacía Supabase por RPC con la identidad del usuario. BYOK rompió
 * eso, porque una credencial cifrada hay que descifrarla en algún lado que no
 * sea el navegador.
 *
 * **Existe sólo donde hace falta la clave maestra.** Leer si hay credencial y
 * quitarla no la necesitan, y por eso los hace el browser contra los mismos RPC:
 * una ruta acá que no toque la clave maestra sería una capa de más.
 *
 * **La autorización es de Postgres, no de este archivo.** El Worker toma el
 * `Authorization` de quien llamó y arma un cliente con esa identidad; las
 * funciones `ai_credential_*` son `security definer` y verifican
 * `settings.write` por su cuenta. El corolario importa: acá **no** hay secret
 * key de Supabase, así que un agujero en este código no da acceso a la base más
 * allá de lo que ya tenía quien llamó.
 *
 * Corre en `run_worker_first: ["/api/*"]`, así que el resto del sitio se sirve
 * como asset estático y nunca pasa por acá.
 */

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  /** 32 bytes en base64. `openssl rand -base64 32`. */
  PICK_AI_MASTER_KEY?: string;
  /** Secreto compartido con el Worker del storefront, sólo para /api/ia/vector. */
  PICK_SEARCH_TOKEN?: string;
}

const CABECERAS = {
  'content-type': 'application/json; charset=utf-8',
  // Respuestas por usuario y por tienda. Un proxy que las cachee le muestra a
  // alguien la configuración de otro.
  'cache-control': 'no-store',
} as const;

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: CABECERAS });
}

function error(codigo: string, message: string, status: number): Response {
  return json({ error: codigo, message }, status);
}

/**
 * Falla registrando el detalle y respondiendo lo justo.
 *
 * A diferencia del storefront —donde el mensaje del adapter nunca sale, porque
 * lo leería un comprador— acá hay dos clases de error y se tratan distinto:
 *
 * - Lo que dice **OpenAI** se le muestra al operador. Es su cuenta y su factura:
 *   «rechazó la credencial» o «llegaste al límite» son exactamente lo que
 *   necesita para resolverlo, y esconderlo lo deja mirando una pantalla que dice
 *   «probá de nuevo» para siempre.
 * - Lo que dice **Postgres** o cualquier cosa nuestra queda en el log. Publica
 *   nombres de tablas y restricciones, y no le sirve a nadie del otro lado.
 */
function falla(donde: string, causa: unknown): Response {
  console.error(`[admin/${donde}]`, causa);
  return error(
    'server_error',
    'No pudimos completar la operación. Probá de nuevo en unos segundos.',
    500,
  );
}

/**
 * Un JWT que la base no acepta.
 *
 * Se distingue del resto porque la acción del operador es otra: no es «probá de
 * nuevo», es «volvé a iniciar sesión». Sin esto, una sesión vencida deja al
 * Admin repitiendo un botón que nunca va a andar.
 */
function esSesionVencida(causa: unknown): boolean {
  return causa instanceof ErrorDeCredencial && causa.codigo === 'PGRST301';
}

/** El error de un proveedor externo, que sí se muestra. */
function fallaDelProveedor(donde: string, causa: unknown): Response {
  console.error(`[admin/${donde}]`, causa);
  return error('provider_error', (causa as Error).message, 502);
}

// ---------------------------------------------------------------------------
// El contexto de una llamada
// ---------------------------------------------------------------------------

interface Contexto {
  readonly claveMaestra: string;
  readonly credenciales: ReturnType<typeof repositorioCredencialDeIA>;
  readonly storeId: string;
  readonly cuerpo: Record<string, unknown>;
}

/**
 * Resuelve todo lo que las tres rutas necesitan, o devuelve la respuesta que
 * corta.
 *
 * Junto y no repetido en cada ruta porque los cuatro chequeos tienen que pasar
 * en todas, y una ruta nueva que se olvide de uno es el agujero.
 */
async function contexto(request: Request, env: Env): Promise<Contexto | Response> {
  const faltan = (
    [
      ['SUPABASE_URL', env.SUPABASE_URL],
      ['SUPABASE_PUBLISHABLE_KEY', env.SUPABASE_PUBLISHABLE_KEY],
      ['PICK_AI_MASTER_KEY', env.PICK_AI_MASTER_KEY],
    ] as const
  )
    .filter(([, valor]) => !valor)
    .map(([nombre]) => nombre);

  if (faltan.length > 0) {
    // Se nombra lo que falta: lo lee quien despliega, y un 503 mudo es una tarde
    // perdida. Son nombres de variables, no valores.
    console.error(`[admin/config] faltan secretos: ${faltan.join(', ')}`);
    return error(
      'sin_configurar',
      `Al Worker del Admin le faltan secretos: ${faltan.join(', ')}.`,
      503,
    );
  }

  const autorizacion = request.headers.get('authorization');
  if (!autorizacion?.startsWith('Bearer ')) {
    return error('sin_sesion', 'Tenés que iniciar sesión de nuevo.', 401);
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return error('bad_request', 'El cuerpo no es JSON.', 400);
  }

  const storeId = cuerpo.storeId;
  if (typeof storeId !== 'string' || storeId === '') {
    return error('bad_request', 'Falta la tienda.', 400);
  }

  const db = clienteDeUsuario(
    { url: env.SUPABASE_URL!, publishableKey: env.SUPABASE_PUBLISHABLE_KEY! },
    autorizacion.slice('Bearer '.length),
  );

  return {
    claveMaestra: env.PICK_AI_MASTER_KEY!,
    credenciales: repositorioCredencialDeIA(db),
    storeId,
    cuerpo,
  };
}

/**
 * La credencial en claro, o la respuesta que explica por qué no hay.
 *
 * El 409 es el que sostiene «un tenant sin OpenAI sigue funcionando
 * normalmente»: el botón está siempre y esto es lo que le dice al operador qué
 * le falta.
 */
async function credencialEnClaro(
  ctx: Contexto,
): Promise<{ apiKey: string; modelo: ModeloDeIA } | Response> {
  const guardada = await ctx.credenciales.cifrada(ctx.storeId);

  if (!guardada.configured || !guardada.ciphertext) {
    return error(
      'sin_credencial',
      'Esta tienda no tiene una credencial de OpenAI configurada.',
      409,
    );
  }

  if (!esModelo(guardada.model)) {
    // Pasa si se saca un modelo de la lista y quedó tiendas usándolo. Se dice en
    // vez de caer al de por defecto: cambiarle el modelo a alguien sin avisar es
    // cambiarle la factura.
    return error(
      'modelo_desconocido',
      `La tienda tiene guardado el modelo "${guardada.model}", que ya no está disponible. Elegí otro en Configuración.`,
      409,
    );
  }

  return { apiKey: await descifrar(ctx.claveMaestra, guardada.ciphertext), modelo: guardada.model };
}

// ---------------------------------------------------------------------------
// Las rutas
// ---------------------------------------------------------------------------

/** Guarda la credencial. Es la única ruta que ve la key en claro, y no la registra. */
async function guardarCredencial(ctx: Contexto): Promise<Response> {
  const apiKey = typeof ctx.cuerpo.apiKey === 'string' ? ctx.cuerpo.apiKey.trim() : '';
  if (apiKey === '') return error('bad_request', 'Falta la credencial.', 400);

  const modelo: ModeloDeIA = esModelo(ctx.cuerpo.modelo) ? ctx.cuerpo.modelo : MODELO_POR_DEFECTO;

  // Se prueba **antes** de guardar. Una credencial que no sirve guardada es una
  // pantalla que dice "configurada" y un botón que falla cada vez.
  try {
    await proveedorOpenAI().probar(apiKey);
  } catch (causa) {
    return fallaDelProveedor('ia/guardar', causa);
  }

  try {
    const estado = await ctx.credenciales.guardar(ctx.storeId, {
      ciphertext: await cifrar(ctx.claveMaestra, apiKey),
      last4: ultimosCuatro(apiKey),
      model: modelo,
    });
    return json(estado);
  } catch (causa) {
    return falla('ia/guardar', causa);
  }
}

/** Prueba la credencial **guardada**, que es la que se va a usar. */
async function probarCredencial(ctx: Contexto): Promise<Response> {
  const credencial = await credencialEnClaro(ctx);
  if (credencial instanceof Response) return credencial;

  try {
    await proveedorOpenAI().probar(credencial.apiKey);
    return json({ ok: true });
  } catch (causa) {
    return fallaDelProveedor('ia/probar', causa);
  }
}

async function enriquecer(ctx: Contexto): Promise<Response> {
  const producto = ctx.cuerpo.producto as ProductoParaEnriquecer | undefined;
  if (!producto || typeof producto.title !== 'string') {
    return error('bad_request', 'Falta el producto.', 400);
  }

  const categorias = Array.isArray(ctx.cuerpo.categorias)
    ? (ctx.cuerpo.categorias as CategoriaConocida[])
    : [];

  const credencial = await credencialEnClaro(ctx);
  if (credencial instanceof Response) return credencial;

  let propuesta;
  try {
    propuesta = await proveedorOpenAI().enriquecer({
      apiKey: credencial.apiKey,
      modelo: credencial.modelo,
      producto: {
        title: producto.title,
        description: producto.description,
        brand: producto.brand,
        categoria: producto.categoria,
        variantes: Array.isArray(producto.variantes) ? producto.variantes : [],
        imagenes: Array.isArray(producto.imagenes) ? producto.imagenes : [],
      },
      categorias,
      /*
       * Cuántas fotos mirar. Lo decide quien llama porque el lote de
       * descripciones manda una sola: la imagen es casi todo el costo, y tres
       * ángulos del mismo producto no cambian una descripción.
       */
      ...(typeof ctx.cuerpo.maximoDeImagenes === 'number'
        ? { maximoDeImagenes: ctx.cuerpo.maximoDeImagenes }
        : {}),
    });
  } catch (causa) {
    return fallaDelProveedor('ia/enriquecer', causa);
  }

  // La categoría se resuelve acá y no en el browser: una que la tienda no tenga
  // se descarta, así el Admin no puede ofrecer aplicar algo que no existe.
  const categoria = resolverCategoria(propuesta.category, categorias);

  const { category: _propuesta, ...resto } = propuesta;
  const respuesta: Propuesta = {
    ...resto,
    ...(categoria ? { categoryId: categoria.id, category: categoria.nombre } : {}),
  };

  return json({ propuesta: respuesta });
}

/**
 * La limpieza de fondo de una foto (ADR-130).
 *
 * **Reenvía el cuerpo de OpenAI sin decodificarlo.** La respuesta trae la imagen
 * en base64: decodificarla acá serían megabytes de CPU del Worker para después
 * volver a codificarla, y el que la necesita es el navegador, que además ya sabe
 * subir a Storage con el JWT de quien opera. Esperar a OpenAI —hasta dos
 * minutos, dice su documentación— no consume CPU mientras el cliente siga
 * conectado.
 *
 * Quien pide esto gasta la clave del comercio, así que pide `settings.write`,
 * igual que el enriquecimiento: eso lo decide `ai_credential_secret`.
 */
async function limpiarFondo(ctx: Contexto): Promise<Response> {
  const imagenUrl = ctx.cuerpo.imagenUrl;
  if (typeof imagenUrl !== 'string' || !imagenUrl.startsWith('https://')) {
    return error('bad_request', 'Falta la foto a limpiar.', 400);
  }

  const credencial = await credencialEnClaro(ctx);
  if (credencial instanceof Response) return credencial;

  const peticion = proveedorOpenAI().peticionDeLimpiezaDeFondo({
    apiKey: credencial.apiKey,
    imagenUrl,
  });

  let respuesta: Response;
  try {
    respuesta = await fetch(peticion.url, peticion.init);
  } catch (causa) {
    return fallaDelProveedor('ia/fondo', causa);
  }

  /*
   * El cuerpo viaja tal cual, con el status de OpenAI: si falló, el Admin
   * muestra lo que dijo, que es lo que el operador necesita para entender por
   * qué. Las cabeceras no se reenvían —traen cosas de OpenAI que no son del
   * navegador— y se fija la única que importa.
   */
  return new Response(respuesta.body, {
    status: respuesta.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * La ficha de un producto que todavía no existe, leída de sus fotos (ADR-131).
 *
 * A diferencia del enriquecimiento, acá no hay producto que describir: entran
 * fotos y sale una ficha para revisar, con lo que esté impreso en la etiqueta.
 * Mismo camino que las demás —JWT, `ai_credential_secret`, descifrar—, así que
 * pide `settings.write` por el mismo motivo: gasta la clave del comercio.
 */
async function ficha(ctx: Contexto): Promise<Response> {
  const imagenes = Array.isArray(ctx.cuerpo.imagenes)
    ? ctx.cuerpo.imagenes.filter(
        (url): url is string => typeof url === 'string' && url.startsWith('https://'),
      )
    : [];
  if (imagenes.length === 0) {
    return error('bad_request', 'Falta al menos una foto para leer.', 400);
  }

  const categorias = Array.isArray(ctx.cuerpo.categorias)
    ? (ctx.cuerpo.categorias as CategoriaConocida[])
    : [];

  const credencial = await credencialEnClaro(ctx);
  if (credencial instanceof Response) return credencial;

  let leida;
  try {
    leida = await proveedorOpenAI().ficha({
      apiKey: credencial.apiKey,
      modelo: credencial.modelo,
      imagenes,
      categorias,
    });
  } catch (causa) {
    return fallaDelProveedor('ia/ficha', causa);
  }

  // Igual que en el enriquecimiento: una categoría que la tienda no tiene se
  // descarta acá, no en el navegador.
  const categoria = resolverCategoria(leida.category, categorias);
  const { category: _leida, ...resto } = leida;

  return json({
    ficha: {
      ...resto,
      ...(categoria ? { categoryId: categoria.id, category: categoria.nombre } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// El router
// ---------------------------------------------------------------------------

const RUTAS: Record<string, (ctx: Contexto) => Promise<Response>> = {
  '/api/ia/credencial': guardarCredencial,
  '/api/ia/probar': probarCredencial,
  '/api/ia/enriquecer': enriquecer,
  '/api/ia/ficha': ficha,
  '/api/ia/fondo': limpiarFondo,
};

/**
 * El vector de una frase, para el buscador del storefront (ADR-132).
 *
 * Es la única ruta **sin JWT**, y tiene que serlo: quien busca en la tienda es
 * una persona anónima, no un miembro del comercio. Va aparte del router de
 * arriba justamente para que eso sea visible y no se cuele en las otras cuatro:
 * `contexto()` exige `Authorization: Bearer`, y esta ruta nunca pasa por ahí.
 *
 * Lo que la autentica es un secreto compartido entre los dos Workers. Sin él
 * sería un servicio de descifrado abierto a internet.
 *
 * **La credencial cifrada la manda quien llama.** El Worker del Admin no tiene
 * la secret key de Supabase —sólo la publishable— así que no puede leerla por su
 * cuenta, y darle la secret key para esto sería darle acceso a todo saltando
 * RLS. El storefront ya puede leer ese ciphertext con la suya; mandarlo acá no
 * le agrega ningún permiso a nadie, y el ciphertext sin la clave maestra no
 * abre nada. Lo que este Worker aporta es lo único que nadie más tiene: la
 * clave maestra, y nunca la devuelve — devuelve un vector.
 */
async function vectorDeLaFrase(request: Request, env: Env): Promise<Response> {
  if (!env.PICK_AI_MASTER_KEY || !env.PICK_SEARCH_TOKEN) {
    return error('sin_configurar', 'Falta PICK_AI_MASTER_KEY o PICK_SEARCH_TOKEN.', 503);
  }

  /*
   * Comparación de largo constante. Un `!==` sobre un secreto filtra por el
   * tiempo de respuesta cuántos caracteres del principio acertó quien prueba.
   */
  const enviado = request.headers.get('x-pick-search') ?? '';
  const esperado = env.PICK_SEARCH_TOKEN;
  let distinto = enviado.length === esperado.length ? 0 : 1;
  for (let i = 0; i < Math.max(enviado.length, esperado.length); i += 1) {
    distinto |= (enviado.charCodeAt(i) || 0) ^ (esperado.charCodeAt(i) || 0);
  }
  if (distinto !== 0) return error('no_autorizado', 'Secreto inválido.', 401);

  let cuerpo: { ciphertext?: unknown; termino?: unknown };
  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    return error('bad_request', 'El cuerpo no es JSON.', 400);
  }

  const ciphertext = typeof cuerpo.ciphertext === 'string' ? cuerpo.ciphertext : '';
  const termino = typeof cuerpo.termino === 'string' ? cuerpo.termino.trim() : '';
  if (ciphertext === '' || termino === '') {
    return error('bad_request', 'Faltan la credencial cifrada o el término.', 400);
  }

  let apiKey: string;
  try {
    apiKey = await descifrar(env.PICK_AI_MASTER_KEY, ciphertext);
  } catch {
    // Sin detalle: un mensaje distinto por cada motivo le diría a quien prueba
    // ciphertexts cuál está más cerca.
    return error('credencial_invalida', 'No se pudo abrir la credencial.', 400);
  }

  try {
    const { vectores, tokens } = await proveedorOpenAI().embeber({ apiKey, textos: [termino] });
    return json({ vector: vectores[0], tokens });
  } catch (causa) {
    return fallaDelProveedor('ia/vector', causa);
  }
}

/**
 * Exportada aparte del handler por defecto para que el dev server de Vite monte
 * **esta misma función**. Dos implementaciones del mismo router divergirían, y
 * la que diverge es siempre la que no se despliega.
 */
export async function manejar(request: Request, env: Env): Promise<Response> {
  const camino = new URL(request.url).pathname;

  if (request.method !== 'POST') {
    // Se responde antes de mirar la ruta: un GET a cualquiera de éstas es el
    // mismo error, y decir «no existe» para un POST mal hecho confunde.
    if (camino in RUTAS || camino === '/api/ia/vector') {
      return error('method_not_allowed', 'Esta ruta sólo acepta POST.', 405);
    }
    return error('not_found', 'No existe esa ruta.', 404);
  }

  // Sin JWT y con secreto compartido: va antes de `contexto()`, que lo exige.
  if (camino === '/api/ia/vector') {
    try {
      return await vectorDeLaFrase(request, env);
    } catch (causa) {
      return falla('ia/vector', causa);
    }
  }

  const ruta = RUTAS[camino];
  if (!ruta) return error('not_found', 'No existe esa ruta.', 404);

  const ctx = await contexto(request, env);
  if (ctx instanceof Response) return ctx;

  try {
    return await ruta(ctx);
  } catch (causa) {
    if (esSesionVencida(causa)) {
      return error('sin_sesion', 'Tu sesión venció. Volvé a iniciar sesión.', 401);
    }
    return falla('ia', causa);
  }
}

export default { fetch: manejar };
