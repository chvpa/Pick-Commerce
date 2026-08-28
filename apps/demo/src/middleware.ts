import { defineMiddleware } from 'astro:middleware';
import { getSecret } from 'astro:env/server';
import { drenarNotificaciones, enSegundoPlano } from './lib/notificaciones.ts';

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
    const respuesta = await next();
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
