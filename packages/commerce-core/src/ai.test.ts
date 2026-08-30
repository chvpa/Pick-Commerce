import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPOS_PROHIBIDOS,
  ESQUEMA_DE_PROPUESTA,
  cifrar,
  descifrar,
  entradaDelProducto,
  esModelo,
  resolverCategoria,
  soloCamposPermitidos,
  ultimosCuatro,
} from './ai.ts';

/**
 * Dos cosas se prueban acá y son de naturaleza distinta.
 *
 * El **cifrado** protege la credencial de un comercio: si falla, falla en
 * silencio y de la peor manera posible.
 *
 * El **filtro de campos** es lo que convierte «prohibir inventar datos críticos»
 * —una frase del ROADMAP— en algo comprobable. Sin estos tests la regla existe
 * sólo en el prompt, que es una sugerencia.
 */

// ---------------------------------------------------------------------------
// Cifrado
// ---------------------------------------------------------------------------

/** 32 bytes en base64, que es lo que exige AES-256-GCM. */
const MAESTRA = Buffer.alloc(32, 7).toString('base64');
const OTRA_MAESTRA = Buffer.alloc(32, 9).toString('base64');

test('la credencial vuelve intacta del ida y vuelta', async () => {
  const key = 'sk-proj-loQueSeaQueDevuelvaOpenAI-1234';
  assert.equal(await descifrar(MAESTRA, await cifrar(MAESTRA, key)), key);
});

test('dos cifrados de lo mismo dan paquetes distintos', async () => {
  // El iv es aleatorio por llamada. Si dos paquetes iguales salieran iguales,
  // quien mire la base sabría que dos comercios cargaron la misma key.
  const a = await cifrar(MAESTRA, 'sk-igual');
  const b = await cifrar(MAESTRA, 'sk-igual');
  assert.notEqual(a, b);
});

test('un paquete adulterado no descifra a basura: lanza', async () => {
  const paquete = await cifrar(MAESTRA, 'sk-original');
  const bytes = Buffer.from(paquete, 'base64');
  // El último byte es del tag de autenticación de GCM. Sin autenticación esto
  // devolvería texto corrupto sin avisar, que es el fallo silencioso que se
  // quiere evitar.
  bytes[bytes.length - 1]! ^= 0xff;

  await assert.rejects(() => descifrar(MAESTRA, bytes.toString('base64')));
});

test('con otra clave maestra no se abre', async () => {
  const paquete = await cifrar(MAESTRA, 'sk-original');
  await assert.rejects(() => descifrar(OTRA_MAESTRA, paquete));
});

test('una clave maestra del largo equivocado se rechaza al usarla', async () => {
  await assert.rejects(
    () => cifrar(Buffer.alloc(16, 1).toString('base64'), 'sk-x'),
    /32 bytes/,
    'una clave de 16 bytes tiene que fallar diciendo cuántos hacen falta',
  );
});

test('de la key sólo vuelven a verse cuatro caracteres', () => {
  assert.equal(ultimosCuatro('sk-proj-abcdefghijkl9876'), '9876');
});

// ---------------------------------------------------------------------------
// Los campos que la IA no puede proponer
// ---------------------------------------------------------------------------

test('una propuesta con precio y stock sale sin ellos', () => {
  const salida = soloCamposPermitidos({
    title: 'Campera de lluvia',
    description: 'Impermeable, con capucha.',
    price: 389000,
    sku: 'CAM-001',
    stock: 12,
    cost: 200000,
    tax: { iva: 10 },
    attributes: [],
  }) as Record<string, unknown>;

  assert.equal(salida.title, 'Campera de lluvia');
  for (const campo of CAMPOS_PROHIBIDOS) {
    assert.equal(salida[campo], undefined, `${campo} no puede sobrevivir al filtro`);
  }
});

test('un campo prohibido disfrazado de atributo tampoco pasa', () => {
  // La puerta de atrás: el esquema no tiene `price`, pero `attributes` admite
  // cualquier par, así que "Precio: 90.000" entraría en la ficha igual.
  const { attributes } = soloCamposPermitidos({
    attributes: [
      { nombre: 'Material', valor: 'Algodón' },
      { nombre: 'Precio', valor: '90.000' },
      { nombre: 'costo', valor: '50.000' },
      { nombre: 'Código de barras', valor: '779000123' },
      { nombre: 'SKU', valor: 'X-1' },
    ],
  });

  assert.deepEqual(attributes, { Material: 'Algodón' });
});

test('el esquema estricto no declara ningún campo prohibido', () => {
  // Es la primera línea de defensa: lo que el esquema no declara, la API no lo
  // puede devolver. El filtro de arriba es la segunda.
  const declarados = Object.keys(ESQUEMA_DE_PROPUESTA.properties);
  for (const campo of CAMPOS_PROHIBIDOS) {
    assert.ok(!declarados.includes(campo), `el esquema no debería declarar ${campo}`);
  }
  assert.equal(ESQUEMA_DE_PROPUESTA.additionalProperties, false);
  // En modo estricto, todo lo declarado tiene que estar en `required`.
  assert.deepEqual([...ESQUEMA_DE_PROPUESTA.required].sort(), declarados.sort());
});

test('los vacíos y los tipos equivocados se descartan en vez de llegar como basura', () => {
  assert.deepEqual(soloCamposPermitidos({ title: '   ', description: 42, brand: null }), {});
  assert.deepEqual(soloCamposPermitidos(null), {});
  assert.deepEqual(soloCamposPermitidos('un texto suelto'), {});
});

// ---------------------------------------------------------------------------
// La categoría
// ---------------------------------------------------------------------------

const CATEGORIAS = [
  { id: 'c1', nombre: 'Camperas' },
  { id: 'c2', nombre: 'Calzado deportivo' },
];

test('la categoría se resuelve aunque cambien acentos, mayúsculas o espacios', () => {
  assert.equal(resolverCategoria('calzado  DEPORTIVO', CATEGORIAS)?.id, 'c2');
});

test('una categoría que la tienda no tiene se descarta', () => {
  // El caso caro: aplicarla dejaría el producto sin clasificar y con aspecto de
  // resuelto.
  assert.equal(resolverCategoria('Indumentaria técnica', CATEGORIAS), undefined);
  assert.equal(resolverCategoria(undefined, CATEGORIAS), undefined);
  assert.equal(resolverCategoria('Camperas', []), undefined);
});

// ---------------------------------------------------------------------------
// La entrada del modelo
// ---------------------------------------------------------------------------

test('la entrada nombra las categorías disponibles y no oculta los huecos', () => {
  const texto = entradaDelProducto(
    {
      title: 'Campera',
      variantes: [{ title: 'M', atributos: { color: 'Azul' } }],
      imagenes: [],
    },
    CATEGORIAS,
  );

  assert.match(texto, /Camperas \| Calzado deportivo/);
  assert.match(texto, /- M \(color=Azul\)/);
  // Un campo vacío se dice vacío. Omitirlo haría que el modelo no sepa que hay
  // algo que completar.
  assert.match(texto, /Descripción actual: \(vacía\)/);
});

test('sin categorías, la entrada lo dice en vez de dejar la lista en blanco', () => {
  const texto = entradaDelProducto({ title: 'X', variantes: [], imagenes: [] }, []);
  assert.match(texto, /la tienda no tiene categorías/);
});

test('sólo se aceptan los modelos de la lista', () => {
  assert.ok(esModelo('gpt-5.6-luna'));
  assert.ok(!esModelo('gpt-4'));
  assert.ok(!esModelo(undefined));
});
