import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aTallaDelERP,
  normalizarTalla,
  normalizarRespuesta,
  parseOracleJson,
  proveedorEstiloSport,
} from './index.ts';

/**
 * El adapter del ORDS de Estilo Sport.
 *
 * Los fixtures reproducen el **formato exacto del cable** capturado el
 * 29/08/2026 —doble codificación y saltos de línea literales adentro—, con
 * valores inventados: este repositorio es público y las filas reales llevaban
 * nombres, códigos de barras y precios de venta de un cliente. Lo que los tests
 * necesitan es la forma, no los valores; el generador comprueba que la
 * serialización sintética sea indistinguible de la real.
 *
 * `tallas-reales.json` sí son los 70 valores distintos de `cod_talla` del
 * catálogo entero, porque de ahí sale la regla de normalización y una lista de
 * talles no identifica a nadie.
 */

const leer = (nombre: string) =>
  readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url), 'utf8');

const BULK = leer('ords-bulk.json');
const TALLAS_REALES: readonly string[] = JSON.parse(leer('tallas-reales.json'));

test('parsea la respuesta doble-codificada con saltos de línea adentro', () => {
  const filas = parseOracleJson(BULK);
  assert.equal(filas.length, 12);
  assert.equal(filas[0]!.codigo, '900');
  assert.equal(filas[0]!.articulo, 'INFLADOR DE PRUEBA');
  assert.equal(filas[0]!.cod_barra, '7000000000001');
});

test('un JSON que no envuelve un array se rechaza nombrando el problema', () => {
  assert.throws(() => parseOracleJson('{"error":"sin sesión"}'), /array de artículos/);
});

test('el ORDS manda números donde la documentación dice strings', () => {
  // La doc describe `"cant_dispon": "3"`; el cable manda `1`. Las dos formas
  // tienen que entrar, porque el día que cambie no queremos enterarnos con un
  // catálogo en cero.
  const { items: conNumeros } = normalizarRespuesta(BULK);
  assert.ok(conNumeros.every((i) => Number.isFinite(i.available)));
  assert.ok(conNumeros.every((i) => Number.isInteger(i.price.amount)));

  const { items: conStrings } = normalizarRespuesta(
    JSON.stringify([
      {
        codigo: '1',
        cod_origen: 'x',
        cod_barra: 'b1',
        articulo: 'A',
        rubro: '',
        familia: 'F',
        linea: '',
        marca: 'NIKE',
        cod_talla: 'M',
        cant_dispon: '3',
        precio_vta: '189990',
      },
    ]),
  );
  assert.equal(conStrings[0]!.available, 3);
  assert.equal(conStrings[0]!.price.amount, 189990);
});

test('un stock o un precio ilegibles cortan en vez de guardar basura', () => {
  const roto = JSON.stringify([
    {
      codigo: '1',
      cod_origen: 'x',
      cod_barra: 'b1',
      articulo: 'A',
      rubro: '',
      familia: 'F',
      linea: '',
      marca: '',
      cod_talla: 'M',
      cant_dispon: 'no sé',
      precio_vta: 1000,
    },
  ]);
  assert.throws(() => normalizarRespuesta(roto), /b1/);
});

// ---------------------------------------------------------------------------
// Tallas: el campo del ORDS tiene tres caracteres de ancho
// ---------------------------------------------------------------------------

test('la talla de tres dígitos gana el punto decimal', () => {
  assert.equal(normalizarTalla('105'), '10.5');
  assert.equal(normalizarTalla('445'), '44.5');
  assert.equal(normalizarTalla('275'), '27.5');
});

test('la talla que ya vino con punto no se toca', () => {
  // `"8.5"` entra en tres caracteres, así que el ORDS la manda con punto. Una
  // regla del tipo «sacar el punto siempre» la convertiría en 85.
  assert.equal(normalizarTalla('8.5'), '8.5');
  assert.equal(normalizarTalla('1.5'), '1.5');
});

test('las tallas de uno y dos dígitos y las de letra pasan sin tocar', () => {
  for (const t of ['8', '9', '38', '42', '45', 'S', 'M', 'XL', 'XXS']) {
    assert.equal(normalizarTalla(t), t, `${t} no debía cambiar`);
  }
});

test('la vuelta al ERP respeta el mismo ancho', () => {
  assert.equal(aTallaDelERP('10.5'), '105');
  assert.equal(
    aTallaDelERP('8.5'),
    '8.5',
    'le sacó el punto a una talla que el ERP manda con punto',
  );
  assert.equal(aTallaDelERP('XL'), 'XL');
  assert.equal(aTallaDelERP('42'), '42');
});

test('ida y vuelta sin pérdida sobre las 70 tallas reales del catálogo', () => {
  // Es la prueba que importa: si el par de funciones no fuera consistente, un
  // pedido saldría con la talla equivocada y se facturaría mal.
  assert.equal(TALLAS_REALES.length, 70);
  for (const cruda of TALLAS_REALES) {
    assert.equal(
      aTallaDelERP(normalizarTalla(cruda)),
      cruda,
      `la talla ${cruda} no sobrevive la ida y vuelta`,
    );
  }
});

test('ninguna talla real se normaliza a la misma que otra', () => {
  // Dos tallas distintas del ERP que colapsen en una sola mandarían el stock de
  // una a la variante de la otra, y eso no se ve hasta que falta mercadería.
  const normalizadas = TALLAS_REALES.map(normalizarTalla);
  assert.equal(new Set(normalizadas).size, TALLAS_REALES.length);
});

// ---------------------------------------------------------------------------
// Mapeo de campos
// ---------------------------------------------------------------------------

test('marca GENERICA se descarta, la marca real se conserva', () => {
  const { items } = normalizarRespuesta(BULK);
  const generica = items.find((i) => i.barcode === '7000000000001');
  assert.equal(generica?.brand, undefined, 'guardó GENERICA como si fuera una marca');
  assert.ok(items.some((i) => i.brand === undefined));
});

test('familia se conserva porque es la única pista de categoría que sirve', () => {
  const { items } = normalizarRespuesta(BULK);
  assert.equal(items[0]!.family, 'ACCESORIOS DE PRUEBA');
  // `rubro` y `linea` valen 'GENERICO' en las 9032 filas: no se mapean, para que
  // nadie los tome después por una categoría.
  const claves = Object.keys(items[0]!);
  assert.ok(!claves.includes('rubro') && !claves.includes('linea'), claves.join(', '));
});

test('el precio del ERP entra como entero en guaraníes', () => {
  const { items } = normalizarRespuesta(BULK);
  assert.deepEqual(items[0]!.price, { amount: 70000, currency: 'PYG' });
});

test('agrega el stock de dos filas de la misma variante', () => {
  const dosLotes = JSON.stringify([
    {
      codigo: '1',
      cod_origen: 'x',
      cod_barra: 'MISMO',
      articulo: 'A',
      rubro: '',
      familia: 'F',
      linea: '',
      marca: '',
      cod_talla: '105',
      cant_dispon: 1,
      precio_vta: 1000,
    },
    {
      codigo: '1',
      cod_origen: 'x',
      cod_barra: 'MISMO',
      articulo: 'A',
      rubro: '',
      familia: 'F',
      linea: '',
      marca: '',
      cod_talla: '105',
      cant_dispon: 2,
      precio_vta: 1000,
    },
  ]);
  const { items } = normalizarRespuesta(dosLotes);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.available, 3);
  assert.equal(items[0]!.size, '10.5');
  assert.equal(items[0]!.erpSize, '105');
});

// ---------------------------------------------------------------------------
// La capa HTTP
// ---------------------------------------------------------------------------

function proveedorFalso(responder: (url: string, init?: RequestInit) => Response) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const adapter = proveedorEstiloSport({
    url: 'https://proxy.test/',
    secret: 'clave-de-prueba',
    fetch: ((url: string, init?: RequestInit) => {
      llamadas.push({ url: String(url), init });
      return Promise.resolve(responder(String(url), init));
    }) as unknown as typeof globalThis.fetch,
  });
  return { adapter, llamadas };
}

test('manda el x-api-key y normaliza la barra final de la URL', async () => {
  const { adapter, llamadas } = proveedorFalso(() => new Response(BULK));
  await adapter.fetchInventory();

  assert.equal(llamadas[0]!.url, 'https://proxy.test/stock');
  const headers = llamadas[0]!.init?.headers as Record<string, string>;
  assert.equal(headers['x-api-key'], 'clave-de-prueba');
});

test('la consulta por artículo escapa el código', async () => {
  const { adapter, llamadas } = proveedorFalso(() => new Response(BULK));
  await adapter.fetchItem('AB C/1');
  assert.equal(llamadas[0]!.url, 'https://proxy.test/stock?articulo=AB%20C%2F1');
});

test('un 503 dice que el problema es de red, no de Oracle', async () => {
  // La distinción decide si reintentar sirve de algo.
  const { adapter } = proveedorFalso(() => new Response('{"code":"ETIMEDOUT"}', { status: 503 }));
  await assert.rejects(adapter.fetchInventory(), /el proxy no alcanzó a Oracle/);
});

test('otro error HTTP se atribuye a Oracle', async () => {
  const { adapter } = proveedorFalso(
    () => new Response('{"upstream_status":400}', { status: 400 }),
  );
  await assert.rejects(adapter.fetchInventory(), /Oracle rechazó/);
});

test('healthCheck devuelve false en vez de explotar cuando no hay red', async () => {
  const adapter = proveedorEstiloSport({
    url: 'https://proxy.test',
    secret: 'x',
    fetch: (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof globalThis.fetch,
  });
  assert.equal(await adapter.healthCheck(), false);
});

test('el adapter declara lo que el ERP no sabe hacer', async () => {
  const { adapter } = proveedorFalso(() => new Response(BULK));
  // No prometer reservas es lo que impide que el checkout ofrezca cero
  // overselling con un ERP que no puede sostenerlo.
  assert.equal(adapter.capabilities.supportsReservations, false);
  assert.equal(adapter.capabilities.supportsDeltaSync, false);
  assert.equal(adapter.capabilities.supportsWebhooks, false);
  assert.equal(adapter.capabilities.supportsLocationBreakdown, false);
  assert.equal(adapter.capabilities.supportsLiveStock, true);
});

// ---------------------------------------------------------------------------
// Los tres códigos, cada uno en su nivel
// ---------------------------------------------------------------------------

test('el SKU sale de cod_origen, no del código de barras', () => {
  // La primera versión usaba `cod_barra` como SKU, que es el código de la caja.
  const { items } = normalizarRespuesta(BULK);
  const primero = items[0]!;
  assert.equal(primero.sku, 'ORG900', 'el SKU no es el código de modelo');
  assert.equal(primero.internalCode, '900', 'perdió el código del ERP');
  assert.equal(primero.barcode, '7000000000001', 'perdió el código de barras');
});

test('un modelo con varias tallas comparte SKU y se agrupa en un producto', () => {
  const { items } = normalizarRespuesta(BULK);
  const deLaRemera = items.filter((i) => i.sku === 'ORG901');
  assert.equal(deLaRemera.length, 3, 'las tres tallas de la remera no comparten SKU');
  assert.deepEqual(deLaRemera.map((i) => i.erpSize).sort(), ['M', 'S', 'XL']);
});

test('sin cod_origen se cae al código del ERP en vez de quedarse sin modelo', () => {
  // Sin código de modelo no habría con qué agrupar y cada talla sería un
  // producto suelto.
  const { items: sinOrigen } = normalizarRespuesta(
    JSON.stringify([
      {
        codigo: '777',
        cod_origen: '',
        cod_barra: 'b1',
        articulo: 'A',
        rubro: '',
        familia: 'F',
        linea: '',
        marca: '',
        cod_talla: 'M',
        cant_dispon: 1,
        precio_vta: 1000,
      },
    ]),
  );
  assert.equal(sinOrigen[0]!.sku, '777');
});
