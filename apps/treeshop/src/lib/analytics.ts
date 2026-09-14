import { destinoSupabase } from '@pick/adapter-supabase';
import {
  esNavegacionDePersona,
  esPrecarga,
  type AnalyticsDestination,
  type EventoDeTienda,
  type TipoDeEvento,
} from '@pick/commerce-core';
import { clienteDelStorefront, tiendaActual } from './db.ts';

/**
 * Los eventos del storefront.
 *
 * Todo se registra **del lado del servidor**: cada uno de los ocho eventos tiene
 * un momento en el que el Worker ya está trabajando, así que ninguno cuesta un
 * byte de JavaScript. Eso no es sólo peso — hace que el seguimiento no dependa de
 * que el visitante no tenga un bloqueador, y cumple sin esfuerzo el «los eventos
 * no bloquean UX» del Definition of Done.
 *
 * El recorrido de un evento:
 *
 *   1. la página o el endpoint llama a `anotar(locals, ...)`, que sólo empuja a
 *      un array en `locals` — no toca la red;
 *   2. el middleware, después de generar la respuesta, llama a `volcar(...)`;
 *   3. eso hace **un** insert con todo lo del request, dentro de `waitUntil`.
 *
 * Un request, un viaje a la base, y ninguno en el camino crítico.
 */

/** Cuánto vive la sesión anónima. Deslizante: cada visita la renueva. */
export const MINUTOS_DE_SESION = 30;

/**
 * Cuánto vive el identificador de dispositivo. Deslizante, como la sesión.
 *
 * **No es lo mismo que la sesión y por eso son dos cookies.** `pick_sid` dice
 * qué pasó en esta visita y es el denominador del embudo —que cuenta
 * `distinct session_id`—, así que estirarla habría multiplicado la conversión
 * por veinte sin que nada avisara. `pick_did` dice qué viene haciendo este
 * navegador, que es lo que la Fase 2 necesita poder recordar.
 *
 * Seis meses: cubre una temporada completa de compra, se renueva con cada
 * visita —así que quien vuelve no lo pierde nunca— y caduca solo en quien no
 * volvió. Coincide con `DIAS_DE_RETENCION` a propósito: no tiene sentido
 * recordar quién es alguien más tiempo del que se guardan sus eventos.
 */
export const DIAS_DE_DISPOSITIVO = 180;

/** Cuánto se guarda. Ver `purgarSiTocaAgregar` más abajo. */
const DIAS_DE_RETENCION = 180;

export const COOKIE_DE_SESION = 'pick_sid';
export const COOKIE_DE_DISPOSITIVO = 'pick_did';

/**
 * Con qué se apaga la personalización.
 *
 * Es un **interruptor y no un aviso de cookies**: un banner lo descarta todo el
 * mundo sin leerlo y no da una elección real. Vive en el pie y en la página de
 * privacidad, y mientras esté puesta no se abre `pick_did` ni se guarda
 * `device_id` en ningún evento.
 *
 * La ausencia de la cookie significa «personalizado», que es el default. Es la
 * decisión de producto que va escrita en PROJECT.md §23, no una comodidad: lo
 * contrario —pedir permiso antes de poder medir nada— deja al comercio sin
 * denominador desde el primer día.
 */
export const COOKIE_SIN_PERSONALIZACION = 'pick_no_perso';

let destino: AnalyticsDestination | undefined;

function analytics(tenantId: string): AnalyticsDestination {
  destino ??= destinoSupabase(clienteDelStorefront(), tenantId);
  return destino;
}

/**
 * Deja un evento listo para el volcado.
 *
 * No lanza nunca y no espera nada: si algo de acá pudiera romper una página, el
 * seguimiento habría dejado de ser gratis.
 */
export function anotar(
  locals: App.Locals,
  type: TipoDeEvento,
  path: string,
  data?: Readonly<Record<string, unknown>>,
): void {
  const sessionId = locals.sessionId;
  // Sin sesión no hay nada que anotar: es una precarga, un bot, o una respuesta
  // que no es HTML. Los tres se descartaron antes, en el middleware.
  if (!sessionId) return;

  locals.eventos ??= [];
  locals.eventos.push({
    type,
    sessionId,
    path,
    ...(locals.deviceId ? { deviceId: locals.deviceId } : {}),
    ...(data ? { data } : {}),
  });
}

/**
 * Si esta petición cuenta como la navegación de una persona.
 *
 * Dos descartes, y los dos son la diferencia entre una conversión creíble y una
 * que da lástima:
 *
 * - **Bots.** El sitio los invita a propósito (ADR-046) y el sitemap publica el
 *   catálogo entero. Como no aceptan cookies, cada petición suya sería una sesión
 *   nueva.
 * - **Precargas.** El `ClientRouter` de la PLP precarga todos los enlaces al
 *   pasar el mouse por encima, y cada precarga es un GET real.
 *
 * El Definition of Done no atrapa ninguno de los dos, porque el numerador de la
 * conversión sale de `orders` y coincide igual. Lo que se pudre en silencio es el
 * denominador.
 */
export function cuentaComoVisita(request: Request): boolean {
  if (
    esPrecarga({
      secPurpose: request.headers.get('sec-purpose'),
      xMoz: request.headers.get('x-moz'),
    })
  ) {
    return false;
  }
  return esNavegacionDePersona(request.headers.get('user-agent'));
}

/**
 * Manda lo que la petición haya juntado.
 *
 * `splice(0)` y no una lectura: `Astro.rewrite` **vuelve a correr la cadena de
 * middleware dentro del mismo request** —el PDP reescribe a `/404` cuando el
 * handle no existe— con los mismos `locals`. Leyendo y dejando, el buffer se
 * insertaría dos veces y un producto inexistente contaría dos vistas.
 */
export async function volcar(locals: App.Locals): Promise<void> {
  const pendientes = locals.eventos?.splice(0) ?? [];
  if (pendientes.length === 0) return;

  const { tenantId, storeId } = await tiendaActual();
  await analytics(tenantId).registrar(storeId, pendientes as readonly EventoDeTienda[]);
}

/**
 * Cada cuánto, como mucho, se borra lo viejo.
 *
 * No hay ningún planificador en el proyecto —ni `pg_cron`, ni cron trigger de
 * Worker, ni acción programada—, así que la purga viaja con el tráfico, igual que
 * el drenaje de la cola de correos.
 *
 * El techo, declarado: **si la tienda deja de recibir visitas, deja de
 * limpiarse.** Es aceptable porque una tienda sin visitas tampoco genera filas.
 */
const CADA = 6 * 60 * 60 * 1000;
let ultimaPurga = 0;

export function tocaPurgar(): boolean {
  const ahora = Date.now();
  if (ahora - ultimaPurga < CADA) return false;
  ultimaPurga = ahora;
  return true;
}

export async function purgar(): Promise<void> {
  const { tenantId, storeId } = await tiendaActual();
  const borrados = await analytics(tenantId).purgar(storeId, DIAS_DE_RETENCION);
  if (borrados > 0) console.log(`[analytics] purgados ${borrados} eventos`);
}
