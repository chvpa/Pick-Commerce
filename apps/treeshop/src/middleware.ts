import { defineMiddleware } from 'astro:middleware';
import { getSecret } from 'astro:env/server';
import { drenarNotificaciones, enSegundoPlano } from './lib/notificaciones.ts';
import {
  COOKIE_DE_DISPOSITIVO,
  COOKIE_DE_SESION,
  COOKIE_SIN_PERSONALIZACION,
  DIAS_DE_DISPOSITIVO,
  MINUTOS_DE_SESION,
  anotar,
  cuentaComoVisita,
  purgar,
  recalcularAfinidad,
  tocaPurgar,
  volcar,
} from './lib/analytics.ts';

/**
 * Falla legible cuando falta configuración.
 *
 * Sin esto, un deploy sin credenciales responde **500 con el cuerpo vacío**:
 * `astro:env` valida al importar y la excepción no llega a ninguna pantalla. Es
 * el peor error posible de diagnosticar —no dice qué falta, ni siquiera que sea
 * de configuración— y le pasa justo a quien despliega esto por primera vez.
 *
 * `getSecret` también valida contra el schema y lanza si falta, así que se
 * pregunta atrapando la excepción: lo que interesa no es el valor, es si llegó.
 *
 * 503 y no 500: la aplicación está bien, es el entorno el que no está listo, y
 * un buscador que recibe 503 vuelve a intentar en vez de desindexar la página.
 */
const REQUERIDAS = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const;

/**
 * Cada cuánto, como mucho, se mira si hay correos por mandar.
 *
 * Sin freno, cada visita a cada página costaría una consulta a la cola. Con él,
 * el costo es una consulta cada medio minuto por isolate, y el retraso máximo de
 * un aviso es ese medio minuto más lo que tarde en llegar la próxima visita.
 */
const CADA = 30_000;
let ultimoDrenaje = 0;

/**
 * Manda lo que haya quedado encolado, aprovechando el tráfico del sitio.
 *
 * El correo de «recibimos tu pedido» ya sale en el propio checkout; los que
 * dependen de esto son los que dispara el Admin —pago confirmado, enviado,
 * entregado—, y el Admin vive en otro dominio. Podría avisar por HTTP, y de
 * hecho hay un endpoint para eso, pero apoyarse **sólo** en ese aviso deja la
 * cola varada si el Admin no alcanza al storefront.
 *
 * Va con `waitUntil`: no toca el tiempo de respuesta de nadie.
 */
function vaciarLaColaDeCorreos(locals: App.Locals): void {
  const ahora = Date.now();
  if (ahora - ultimoDrenaje < CADA) return;
  ultimoDrenaje = ahora;

  void enSegundoPlano(locals, drenarNotificaciones()).catch(() => {
    // El drenaje ya registra sus propios fallos. Que no salga un correo no
    // puede afectar a quien está mirando una página.
  });
}

/**
 * Abre o renueva la sesión anónima, y decide si esta petición se cuenta.
 *
 * Tres cosas que parecen detalles y no lo son:
 *
 * - **Sólo sobre HTML.** Astro adjunta las cookies al final de la cadena, así que
 *   sin esta condición la de sesión viajaría también en el sitemap, que es la
 *   única respuesta con `cache-control: public`. El día que haya dominio propio
 *   con una regla de caché, un `anonymous_session_id` quedaría compartido entre
 *   personas.
 * - **Bots y precargas quedan afuera**, y sin sesión no se anota nada. Ver
 *   `cuentaComoVisita`.
 * - **Deslizante.** Se re-emite en cada visita, así que media hora sin moverse
 *   cierra la sesión y volver empieza otra. Es la definición corriente de sesión
 *   y el identificador menos persistente que permite calcular conversión
 *   (PROJECT.md §23).
 */
function abrirSesion(context: Parameters<Parameters<typeof defineMiddleware>[0]>[0]): void {
  if (!cuentaComoVisita(context.request)) return;

  const existente = context.cookies.get(COOKIE_DE_SESION)?.value;
  const sessionId = existente ?? crypto.randomUUID();
  context.locals.sessionId = sessionId;

  context.cookies.set(COOKIE_DE_SESION, sessionId, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: MINUTOS_DE_SESION * 60,
  });

  abrirDispositivo(context);
}

/**
 * El identificador del navegador, que es lo que dura más que una visita.
 *
 * **Son dos cookies y no una, y esa es toda la decisión.** `pick_sid` dice qué
 * pasó en esta visita y es el denominador del embudo; estirarla habría
 * multiplicado la conversión por veinte sin que nada avisara. `pick_did` dice
 * qué viene haciendo este navegador, y es lo que levanta el techo de lo que el
 * sitio puede recordar —hasta hoy, treinta minutos—.
 *
 * Con la personalización apagada no se abre **y además se borra la que hubiera**:
 * apagar tiene que quitar el identificador, no sólo dejar de usarlo. Sin eso,
 * volver a prender recuperaría un historial que la persona creyó haber cortado.
 */
function abrirDispositivo(context: Parameters<Parameters<typeof defineMiddleware>[0]>[0]): void {
  if (context.cookies.get(COOKIE_SIN_PERSONALIZACION)?.value) {
    context.cookies.delete(COOKIE_DE_DISPOSITIVO, { path: '/' });
    return;
  }

  const existente = context.cookies.get(COOKIE_DE_DISPOSITIVO)?.value;
  const deviceId = existente ?? crypto.randomUUID();
  context.locals.deviceId = deviceId;

  context.cookies.set(COOKIE_DE_DISPOSITIVO, deviceId, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: DIAS_DE_DISPOSITIVO * 24 * 60 * 60,
  });
}

/**
 * Manda los eventos que juntó la petición, y cada tanto borra los viejos.
 *
 * Va con `waitUntil`, después de generar la respuesta: nadie espera por esto.
 *
 * El `catch` es propio y ruidoso a propósito. `enSegundoPlano` se traga los
 * fallos, y acá eso sería lo peor posible: si el insert falla desde el primer
 * despliegue —una FK mal puesta, un permiso— el sitio funciona perfecto y el
 * panel queda vacío sin una sola señal de que algo está roto.
 */
function guardarLosEventos(locals: App.Locals): void {
  void enSegundoPlano(
    locals,
    volcar(locals).catch((error: unknown) => {
      console.error('[analytics] no se pudieron guardar los eventos', error);
    }),
  );

  if (!tocaPurgar()) return;

  /*
   * Y el recálculo de lo que se mira junto, en la misma ventana. Quien decide de
   * verdad es la base: acá alcanza con proponerlo (ADR-127).
   */
  enSegundoPlano(
    locals,
    recalcularAfinidad().catch((error: unknown) => {
      console.error('[afinidad] no se pudo recalcular', error);
    }),
  );
  void enSegundoPlano(
    locals,
    purgar().catch((error: unknown) => {
      console.error('[analytics] falló la purga', error);
    }),
  );
}

function llego(nombre: string): boolean {
  try {
    return Boolean(getSecret(nombre));
  } catch {
    return false;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  /*
   * El middleware también corre al prerenderizar, y ahí no hay entorno: el
   * adapter construye las páginas estáticas en un workerd sin variables. Sin
   * esta guarda, la página de error quedaría prerenderizada como contenido.
   */
  if (context.isPrerendered) return next();

  const faltan = REQUERIDAS.filter((nombre) => !llego(nombre));
  if (faltan.length === 0) {
    abrirSesion(context);

    const respuesta = await next();

    /*
     * La vista se anota **después** de generar la respuesta, no antes: sólo acá
     * se sabe si esto terminó siendo HTML. Un `GET /llms.txt` o el sitemap no son
     * páginas y no cuentan.
     *
     * `Astro.rewrite` vuelve a correr esta cadena dentro del mismo request —el
     * PDP reescribe a `/404` cuando el handle no existe—, así que este bloque
     * puede ejecutarse dos veces. `volcar` lo resuelve vaciando el buffer, que es
     * lo que hace que el segundo pase no duplique nada.
     */
    if (respuesta.headers.get('content-type')?.startsWith('text/html')) {
      anotar(context.locals, 'page_view', context.url.pathname);
    }

    guardarLosEventos(context.locals);
    vaciarLaColaDeCorreos(context.locals);
    return respuesta;
  }

  const lista = faltan.map((n) => `<li><code>${n}</code></li>`).join('');

  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8">
     <title>Falta configuración</title>
     <style>
       body { font: 16px/1.6 system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1.5rem }
       code { background: #f1f1f1; padding: .1em .35em; border-radius: .25em }
     </style>
     <h1>Falta configuración</h1>
     <p>El storefront no puede leer el catálogo. Estas variables no llegaron al Worker:</p>
     <ul>${lista}</ul>
     <p>Van como <strong>secretos de runtime</strong> del Worker
     (<em>Settings › Variables and Secrets</em>), no como variables de build: el
     catálogo se consulta en cada petición, no al construir.</p>`,
    {
      status: 503,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Que no se cachee: apenas se carguen las variables, la petición
        // siguiente tiene que funcionar.
        'cache-control': 'no-store',
      },
    },
  );
});
