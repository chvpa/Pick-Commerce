import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveDeDeduplicacion,
  esNavegacionDePersona,
  cuentaComoVista,
  esPrecarga,
  normalizarTermino,
} from './analytics.ts';

/**
 * Los tres filtros de este módulo deciden el **denominador** de la conversión, y
 * el Definition of Done de la fase no los cubre: pide que las métricas coincidan
 * con `orders`, y coinciden siempre, porque el numerador sale de ahí. Lo que se
 * pudre en silencio es lo de abajo. Por eso están acá y no como un `if` suelto en
 * el middleware.
 */

// ---------------------------------------------------------------------------
// Términos de búsqueda
// ---------------------------------------------------------------------------

test('el mismo término escrito de distintas formas es uno solo', () => {
  const esperado = 'campera cortaviento';
  for (const crudo of [
    'campera cortaviento',
    'Campera Cortaviento',
    '  campera cortaviento  ',
    'campera    cortaviento',
    'CAMPERA\tCORTAVIENTO',
  ]) {
    assert.equal(normalizarTermino(crudo), esperado, `falló con «${crudo}»`);
  }
});

test('el término se acota, porque entra en la clave de deduplicación', () => {
  // Sin tope, la clave la escribe cualquiera desde la barra de direcciones.
  const largo = normalizarTermino('a'.repeat(500));
  assert.equal(largo.length, 120);
});

test('una búsqueda vacía se normaliza a vacío y no a un espacio', () => {
  assert.equal(normalizarTermino('   '), '');
});

// ---------------------------------------------------------------------------
// Deduplicación
// ---------------------------------------------------------------------------

test('reintentar el checkout con la misma clave no cuenta dos compras', () => {
  /*
   * `create_order` es idempotente: repetir la clave devuelve el pedido que ya
   * existe y el endpoint responde 201 igual. Sin esto, un «no pudimos
   * conectarnos» seguido de reintento son dos conversiones y un pedido.
   */
  const primera = claveDeDeduplicacion('checkout_completed', 'sesion-1', { orderId: 'ped-9' });
  const reintento = claveDeDeduplicacion('checkout_completed', 'sesion-1', { orderId: 'ped-9' });
  assert.equal(primera, 'ped-9');
  assert.equal(reintento, primera);
});

test('dos pedidos distintos de la misma sesión sí son dos compras', () => {
  assert.notEqual(
    claveDeDeduplicacion('checkout_completed', 'sesion-1', { orderId: 'ped-9' }),
    claveDeDeduplicacion('checkout_completed', 'sesion-1', { orderId: 'ped-10' }),
  );
});

test('el cupón se cuenta una vez por sesión aunque el checkout revalide', () => {
  const clave = claveDeDeduplicacion('coupon_applied', 'sesion-1', { code: 'VERANO' });
  assert.equal(clave, 'sesion-1:verano');
  // El mismo código en otro caso es el mismo cupón.
  assert.equal(claveDeDeduplicacion('coupon_applied', 'sesion-1', { code: 'verano' }), clave);
  // Otra sesión es otro uso.
  assert.notEqual(claveDeDeduplicacion('coupon_applied', 'sesion-2', { code: 'VERANO' }), clave);
});

test('cambiar de faceta con una búsqueda puesta no son cinco búsquedas', () => {
  // La PLP reenvía `q` en un campo oculto en cada submit de filtros.
  const clave = claveDeDeduplicacion('search', 'sesion-1', { term: 'campera' });
  assert.equal(claveDeDeduplicacion('search', 'sesion-1', { term: 'campera' }), clave);
  assert.notEqual(claveDeDeduplicacion('search', 'sesion-1', { term: 'zapatilla' }), clave);
});

test('lo que se repite de verdad no se deduplica', () => {
  // Dos vistas son dos vistas, y agregar dos veces al carrito son dos altas.
  for (const tipo of ['page_view', 'product_view', 'add_to_cart', 'begin_checkout'] as const) {
    assert.equal(
      claveDeDeduplicacion(tipo, 'sesion-1', { handle: 'campera' }),
      undefined,
      `${tipo} no debería deduplicarse`,
    );
  }
});

test('sin el dato que la forma, no hay clave', () => {
  // Mejor contar de más que inventar una clave que agrupe cosas distintas.
  assert.equal(claveDeDeduplicacion('checkout_completed', 'sesion-1', undefined), undefined);
  assert.equal(claveDeDeduplicacion('coupon_applied', 'sesion-1', {}), undefined);
});

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

const NAVEGADORES = [
  // Chrome en Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  // Safari en iPhone
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  // Firefox en Linux
  'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  // Chrome en Android
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
];

const ROBOTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
  'Mozilla/5.0 (compatible; YandexBot/3.0)',
  'facebookexternalhit/1.1',
  'curl/8.7.1',
  'python-requests/2.32.3',
  'node-fetch/1.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
];

test('un navegador de verdad cuenta como persona', () => {
  // Es el error caro: descartar navegadores deja la conversión mirando al techo
  // y nadie lo nota, porque el número sigue siendo plausible.
  for (const ua of NAVEGADORES) {
    assert.equal(esNavegacionDePersona(ua), true, `descartó un navegador: ${ua}`);
  }
});

test('los crawlers no cuentan como sesiones', () => {
  for (const ua of ROBOTS) {
    assert.equal(esNavegacionDePersona(ua), false, `dejó pasar un bot: ${ua}`);
  }
});

test('sin user-agent no hay navegador', () => {
  // Los que no lo mandan son scripts, y además no aceptan cookies: cada petición
  // suya sería una sesión nueva.
  assert.equal(esNavegacionDePersona(null), false);
  assert.equal(esNavegacionDePersona(undefined), false);
  assert.equal(esNavegacionDePersona('   '), false);
});

// ---------------------------------------------------------------------------
// Precarga
// ---------------------------------------------------------------------------

test('la precarga del router no es una visita', () => {
  // Chrome, con `<link rel="prefetch">`.
  assert.equal(esPrecarga({ secPurpose: 'prefetch' }), true);
  assert.equal(esPrecarga({ secPurpose: 'prefetch;prerender' }), true);
  // Firefox.
  assert.equal(esPrecarga({ xMoz: 'prefetch' }), true);
});

test('una navegación normal no se descarta por precaución', () => {
  assert.equal(esPrecarga({}), false);
  assert.equal(esPrecarga({ secPurpose: null, xMoz: null }), false);
  // Chrome manda esta cabecera también en navegaciones comunes.
  assert.equal(esPrecarga({ secPurpose: 'navigate' }), false);
});

// --- Qué cuenta como una página vista ----------------------------------------

test('una página que alguien vio de verdad cuenta', () => {
  assert.ok(
    cuentaComoVista({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      pathname: '/productos/campera',
    }),
  );
  assert.ok(cuentaComoVista({ status: 200, contentType: 'text/html', pathname: '/' }));
});

test('un 404 no es una página vista, aunque devuelva HTML', () => {
  /*
   * El caso que motivó todo esto. La página de error es `prerender = false`
   * (ADR-057), así que `/wp-admin/install.php` corría el middleware entero y
   * devolvía HTML: 584 vistas en 584 sesiones distintas, una por petición,
   * porque un escáner no guarda cookies.
   */
  for (const ruta of ['/wp-admin/install.php', '/.env', '/productos/no-existe']) {
    assert.equal(
      cuentaComoVista({ status: 404, contentType: 'text/html', pathname: ruta }),
      false,
      `${ruta} se contó como visita`,
    );
  }
});

test('la reescritura interna a la página de error no cuenta', () => {
  // Un PDP inexistente reescribe a `/404` y esa pasada vuelve a entrar al
  // middleware: sin esto, un solo 404 dejaba dos filas con rutas distintas.
  assert.equal(cuentaComoVista({ status: 200, contentType: 'text/html', pathname: '/404' }), false);
});

test('lo que no es una página no cuenta', () => {
  // `/favicon.ico` daba 43 vistas en el piloto: se pide, no se mira.
  for (const tipo of ['image/x-icon', 'application/json', 'text/xml', null, undefined]) {
    assert.equal(
      cuentaComoVista({ status: 200, contentType: tipo, pathname: '/favicon.ico' }),
      false,
      `${tipo} se contó como visita`,
    );
  }
});

test('una redirección tampoco: la página vista es la de destino', () => {
  for (const status of [301, 302, 307, 500, 503]) {
    assert.equal(
      cuentaComoVista({ status, contentType: 'text/html', pathname: '/catalogo' }),
      false,
      `${status} se contó como visita`,
    );
  }
});
