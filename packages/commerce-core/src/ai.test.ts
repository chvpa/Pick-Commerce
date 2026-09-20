import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPOS_PROHIBIDOS,
  ESQUEMA_DE_FICHA,
  LARGO_DE_DESCRIPCION,
  ESQUEMA_DE_PROPUESTA,
  cifrar,
  descifrar,
  entradaDeLaFicha,
  entradaDelProducto,
  costoEstimado,
  esCodigoDeBarras,
  esModelo,
  resolverCategoria,
  hashDelTexto,
  skuSugerido,
  soloCamposDeFicha,
  soloCamposPermitidos,
  textoParaEmbeber,
  tokensEstimados,
  ultimosCuatro,
  USD_POR_MILLON_EMBEBIDO,
  vectorATexto,
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

// ---------------------------------------------------------------------------
// El alta con la cámara (ADR-131)
// ---------------------------------------------------------------------------

/*
 * Lo que se prueba acá es dónde está el límite de la enmienda a ADR-104: se
 * copia lo impreso, y un dato que no se puede verificar no se ofrece.
 */

test('el dígito verificador acepta los tres formatos que existen en una etiqueta', () => {
  assert.ok(esCodigoDeBarras('9780306406157')); // EAN-13
  assert.ok(esCodigoDeBarras('036000291452')); // UPC-A
  assert.ok(esCodigoDeBarras('96385074')); // EAN-8
  assert.ok(esCodigoDeBarras(' 9780306406157 '));
});

test('un dígito mal leído no pasa el verificador', () => {
  // Es el caso real: la foto tiene el código completo y el modelo confunde un
  // dígito. Sin esta comprobación, el código entra y falla meses después.
  assert.ok(!esCodigoDeBarras('9780306406158'));
  assert.ok(!esCodigoDeBarras('978030640615'));
  assert.ok(!esCodigoDeBarras('97803064O6157'));
  assert.ok(!esCodigoDeBarras(''));
});

test('la ficha ofrece lo que se leyó de la etiqueta', () => {
  const ficha = soloCamposDeFicha({
    title: 'Vestido midi de lino',
    description: 'Vestido de lino con tiras.',
    brand: null,
    category: null,
    attributes: [{ nombre: 'material', valor: 'Lino' }],
    sizes: ['S', 'M', 'M', ' L '],
    label: {
      price: 250000,
      printedPrice: 'Gs. 250.000',
      sku: 'VD-449',
      barcode: '9780306406157',
    },
  });

  assert.equal(ficha.title, 'Vestido midi de lino');
  assert.deepEqual(ficha.sizes, ['S', 'M', 'L']);
  assert.deepEqual(ficha.label, {
    price: 250000,
    printedPrice: 'Gs. 250.000',
    sku: 'VD-449',
    barcode: '9780306406157',
  });
});

test('un código de barras que no cierra se descarta y el resto de la etiqueta queda', () => {
  const ficha = soloCamposDeFicha({
    sizes: [],
    label: { price: 90000, printedPrice: '90.000', sku: null, barcode: '9780306406158' },
  });

  assert.equal(ficha.label?.barcode, undefined);
  assert.equal(ficha.label?.price, 90000);
  assert.equal(ficha.sizes, undefined);
});

test('la ficha filtra los atributos prohibidos, igual que el enriquecimiento', () => {
  // La puerta de atrás: el precio tiene su campo, así que uno metido como rasgo
  // descriptivo es ruido que nadie pidió.
  const ficha = soloCamposDeFicha({
    attributes: [
      { nombre: 'color', valor: 'Azul' },
      { nombre: 'precio', valor: '250.000' },
    ],
    sizes: ['U'],
    label: {},
  });

  assert.deepEqual(ficha.attributes, { color: 'Azul' });
  assert.equal(ficha.label, undefined);
});

test('un precio que no es un número positivo no se ofrece', () => {
  for (const price of [0, -1, 'mucho', null, Number.NaN]) {
    const ficha = soloCamposDeFicha({ sizes: [], label: { price } });
    assert.equal(ficha.label?.price, undefined);
  }
});

test('el SKU propuesto sale del handle y del talle, y se puede leer', () => {
  assert.equal(skuSugerido('vestido-midi-lino', 'M'), 'VESTIDO-MIDI-LINO-M');
  assert.equal(skuSugerido('vestido-midi-lino'), 'VESTIDO-MIDI-LINO');
  assert.equal(skuSugerido('Vestido Midi', 'Talle 38'), 'VESTIDO-MIDI-TALLE-38');
});

test('la entrada de la ficha dice que no hay datos cargados', () => {
  const texto = entradaDeLaFicha(CATEGORIAS);
  assert.match(texto, /Todo sale de las fotos/);
  assert.match(texto, /Camperas \| Calzado deportivo/);
});

test('el esquema de la ficha no deja lugar para inventar fuera de la etiqueta', () => {
  // Es la misma garantía estructural de ADR-104, corrida un paso: lo que el
  // modelo puede devolver son estos campos y ningún otro.
  assert.equal(ESQUEMA_DE_FICHA.additionalProperties, false);
  assert.deepEqual(Object.keys(ESQUEMA_DE_FICHA.properties.label.properties), [
    'price',
    'printedPrice',
    'sku',
    'barcode',
  ]);
  for (const campo of ['stock', 'cost', 'compare_at_price', 'tax', 'currency']) {
    assert.ok(!(campo in ESQUEMA_DE_FICHA.properties));
  }
});

test('el esquema del enriquecimiento sigue sin poder devolver un precio', () => {
  // La enmienda es del alta, no del producto ya cargado. Si esto se rompe, se
  // rompió ADR-104 sin que nadie lo haya decidido.
  for (const campo of CAMPOS_PROHIBIDOS) {
    assert.ok(!(campo in ESQUEMA_DE_PROPUESTA.properties));
  }
});

// ---------------------------------------------------------------------------
// Los vectores (ADR-132)
// ---------------------------------------------------------------------------

test('lo que se embebe es más que el título y la marca', () => {
  // Es la diferencia con `search_doc`: de acá sale que «invierno» encuentre una
  // campera de abrigo aunque la palabra no figure en el título.
  const texto = textoParaEmbeber({
    title: 'Campera rompeviento',
    brand: 'Puma',
    categoria: 'Camperas',
    atributos: ['material: poliéster', 'temporada: invierno'],
    description: 'Abriga y corta el viento.',
  });

  assert.equal(
    texto,
    'Campera rompeviento. Puma. Camperas. material: poliéster. temporada: invierno. Abriga y corta el viento.',
  );
});

test('lo que falta se omite, no deja huecos', () => {
  assert.equal(textoParaEmbeber({ title: 'Remera', brand: '   ' }), 'Remera');
});

test('una descripción larga se recorta antes de embeberla', () => {
  // Las últimas frases de una ficha larga son cuidados de lavado y política de
  // cambios: diluyen el vector hacia el promedio de la tienda.
  const texto = textoParaEmbeber({ title: 'X', description: 'a'.repeat(900) });
  assert.equal(texto.length, 'X. '.length + LARGO_DE_DESCRIPCION);
});

test('el hash del texto es estable y distinto para textos distintos', async () => {
  // De esto depende no pagar dos veces lo mismo: si el hash cambiara entre
  // corridas, cada `camelot:importar` reembebería el catálogo entero.
  const a = await hashDelTexto('campera de invierno');
  const b = await hashDelTexto('campera de invierno');
  const c = await hashDelTexto('campera de verano');

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('el costo estimado sale del precio publicado, no de un número inventado', () => {
  // 3753 productos × ~60 tokens es lo que cuesta embeber Treeshop entero.
  const tokens = tokensEstimados(Array.from({ length: 3753 }, () => 'a'.repeat(240)));
  assert.ok(tokens > 200_000 && tokens < 260_000, `tokens fuera de rango: ${tokens}`);
  assert.ok(costoEstimado(tokens) < 0.01, 'embeber el catálogo debería costar centavos');
  assert.equal(costoEstimado(1_000_000), USD_POR_MILLON_EMBEBIDO);
});

test('el vector viaja a Postgres en la forma que castea', () => {
  assert.equal(vectorATexto([0.1, -0.2, 0]), '[0.1,-0.2,0]');
});
