import { slugify } from './admin-catalog.ts';

/**
 * Inteligencia artificial: el puerto, el cifrado de la credencial y las reglas
 * del enriquecimiento.
 *
 * BYOK. La key es del comercio, no de Pick: se guarda cifrada y **nunca** llega
 * al browser. Ver PROJECT.md §25.
 *
 * Todo acá usa APIs web estándar —`crypto.subtle`, `TextEncoder`, `atob`— así
 * que corre igual en workerd, en Node y en un test. Es lo que permite que el
 * mismo módulo lo usen el Worker del Admin y `node --test`.
 */

// ---------------------------------------------------------------------------
// Los modelos
// ---------------------------------------------------------------------------

/**
 * Los modelos ofrecidos, del más barato al más caro.
 *
 * Precios por millón de tokens, verificados contra la documentación de OpenAI y
 * no desde la memoria. El precio va a la vista porque el que paga es el
 * comercio: sin él, elegir modelo es elegir a ciegas.
 */
export const MODELOS = [
  {
    id: 'gpt-5.6-luna',
    nombre: 'Luna',
    nota: 'USD 0,20 por millón de tokens. Alcanza para una ficha de producto.',
  },
  {
    id: 'gpt-5.6-terra',
    nombre: 'Terra',
    nota: 'USD 2. Diez veces más caro, descripciones más finas.',
  },
  {
    id: 'gpt-5.6-sol',
    nombre: 'Sol',
    nota: 'USD 4. El más caro; en una ficha rara vez cambia algo.',
  },
] as const;

export type ModeloDeIA = (typeof MODELOS)[number]['id'];

export const MODELO_POR_DEFECTO: ModeloDeIA = 'gpt-5.6-luna';

export function esModelo(valor: unknown): valor is ModeloDeIA {
  return MODELOS.some((m) => m.id === valor);
}

/**
 * El modelo que limpia el fondo de una foto (ADR-130).
 *
 * No es el mismo que escribe la ficha: son dos familias distintas y el comercio
 * elige una sola, la de texto. Ésta va fija porque la elección no es de gusto —
 * la documentación dice «Sunburst para los casos donde la precisión de la
 * edición importa más, Flare para generar rápido»— y acá lo que importa es que
 * el producto salga igual a como entró. Confirmado contra `/v1/models`.
 */
export const MODELO_DE_IMAGEN = 'gpt-image-2.5-sunburst';

/**
 * Lo que se le pide, y todo lo que **no**.
 *
 * Una edición de GPT Image regenera la imagen: no hay forma de garantizar que un
 * logo o un color queden intactos, y por eso nada de esto se publica sin que una
 * persona lo apruebe viendo la original al lado (ADR-130). El pedido es lo más
 * angosto posible para que haya poco que inventar.
 */
export const INSTRUCCION_DE_FONDO =
  'Quitá el fondo y dejá el producto sobre fondo blanco liso. ' +
  'No cambies el producto: ni su forma, ni sus colores, ni sus texturas, ' +
  'ni los logos, ni los textos, ni las etiquetas. ' +
  'No agregues sombras, reflejos, objetos ni decoración. ' +
  'No recortes partes del producto ni lo muevas de lugar.';

// ---------------------------------------------------------------------------
// El puerto
// ---------------------------------------------------------------------------

export interface CategoriaConocida {
  readonly id: string;
  readonly nombre: string;
}

export interface VarianteParaEnriquecer {
  readonly title: string;
  readonly atributos: Readonly<Record<string, string>>;
}

export interface ProductoParaEnriquecer {
  readonly title: string;
  readonly description?: string;
  readonly brand?: string;
  readonly categoria?: string;
  readonly variantes: readonly VarianteParaEnriquecer[];
  /** URLs públicas del bucket de medios. Van a la visión tal cual. */
  readonly imagenes: readonly string[];
}

/** Lo que se le manda al proveedor para que proponga una ficha. */
export interface PeticionDeEnriquecimiento {
  readonly apiKey: string;
  readonly modelo: ModeloDeIA;
  readonly producto: ProductoParaEnriquecer;
  readonly categorias: readonly CategoriaConocida[];
}

/**
 * El proveedor de IA.
 *
 * Uno solo por ahora —OpenAI, que es lo que fija el stack cerrado— pero el
 * puerto existe desde v1 porque CLAUDE.md lo nombra entre las abstracciones
 * permitidas, y porque el Worker no tiene por qué saber cómo se arma un cuerpo
 * de la Responses API.
 */
export interface PeticionDeFondo {
  readonly apiKey: string;
  /** La foto original, ya publicada: viaja por URL y no como archivo. */
  readonly imagenUrl: string;
}

/**
 * Una petición armada y sin ejecutar.
 *
 * Existe porque quien la ejecuta no es quien sabe armarla: el Worker del Admin
 * la manda y reenvía la respuesta al navegador sin decodificarla (ADR-130).
 */
export interface PeticionArmada {
  readonly url: string;
  readonly init: RequestInit;
}

export interface AIProvider {
  readonly id: string;
  /** Comprueba que la key sirva. No consume tokens. Lanza con el motivo. */
  probar(apiKey: string): Promise<void>;
  enriquecer(peticion: PeticionDeEnriquecimiento): Promise<PropuestaCruda>;
  /** La petición que limpia el fondo de una foto. No la ejecuta. */
  peticionDeLimpiezaDeFondo(peticion: PeticionDeFondo): PeticionArmada;
  /** La ficha de un producto que todavía no existe, mirando sus fotos (ADR-131). */
  ficha(peticion: PeticionDeFicha): Promise<FichaCruda>;
}

// ---------------------------------------------------------------------------
// El cifrado
// ---------------------------------------------------------------------------

const LARGO_DEL_IV = 12;
const BYTES_DE_LA_CLAVE = 32;

/*
 * El tipo dice `ArrayBuffer` y no `ArrayBufferLike` a propósito: `crypto.subtle`
 * pide un `BufferSource`, que excluye los `SharedArrayBuffer`, y sin esto el
 * typecheck rechaza cada llamada.
 */
function base64ABytes(texto: string): Uint8Array<ArrayBuffer> {
  const binario = atob(texto);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function bytesABase64(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

async function claveDeCifrado(maestra: string): Promise<CryptoKey> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ABytes(maestra);
  } catch {
    throw new Error('La clave maestra no es base64 válido.');
  }
  if (bytes.length !== BYTES_DE_LA_CLAVE) {
    throw new Error(
      `La clave maestra tiene que ser de ${BYTES_DE_LA_CLAVE} bytes en base64; llegaron ${bytes.length}.`,
    );
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Cifra la credencial con AES-GCM.
 *
 * El iv va **adelante del ciphertext** en el mismo paquete, así que la fila de
 * la base es una sola columna de texto. Con dos columnas hay dos formas de que
 * queden desparejas —una migración que copia una y no la otra, un update
 * parcial— y ninguna falla ruidosamente.
 *
 * GCM y no CBC porque autentica: un ciphertext adulterado no descifra a basura,
 * lanza. Eso es lo que hace que un byte cambiado en la base se note.
 *
 * ponytail: sin versión de clave. Rotar hoy sería reescribir las filas con la
 * clave nueva y no hay ninguna en producción; cuando haga falta, se agrega una
 * columna `key_version` y se descifra probando las dos.
 */
export async function cifrar(claveMaestra: string, texto: string): Promise<string> {
  const clave = await claveDeCifrado(claveMaestra);
  const iv = crypto.getRandomValues(new Uint8Array(LARGO_DEL_IV));
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, new TextEncoder().encode(texto)),
  );

  const paquete = new Uint8Array(iv.length + cifrado.length);
  paquete.set(iv);
  paquete.set(cifrado, iv.length);
  return bytesABase64(paquete);
}

/** Lanza si el paquete fue adulterado o la clave maestra no es la que cifró. */
export async function descifrar(claveMaestra: string, paquete: string): Promise<string> {
  const bytes = base64ABytes(paquete);
  if (bytes.length <= LARGO_DEL_IV) {
    throw new Error('El paquete cifrado está incompleto.');
  }
  const clave = await claveDeCifrado(claveMaestra);
  const abierto = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, LARGO_DEL_IV) },
    clave,
    bytes.subarray(LARGO_DEL_IV),
  );
  return new TextDecoder().decode(abierto);
}

/**
 * Los últimos cuatro caracteres, que es lo único de la key que vuelve a verse.
 *
 * Alcanza para que quien la cargó reconozca cuál es, y no alcanza para nada más.
 */
export function ultimosCuatro(apiKey: string): string {
  return apiKey.trim().slice(-4);
}

// ---------------------------------------------------------------------------
// El enriquecimiento
// ---------------------------------------------------------------------------

/** Lo que devuelve el modelo, ya recortado a los campos permitidos. */
export interface PropuestaCruda {
  readonly title?: string;
  readonly description?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

/** Lo que llega al Admin: la categoría ya resuelta contra las que existen. */
export interface Propuesta extends PropuestaCruda {
  readonly categoryId?: string;
}

/**
 * Los campos que la IA no puede proponer, ni aunque los devuelva.
 *
 * Es la lista de PROJECT.md §20, textual. Un precio o un stock inventados no se
 * notan al leerlos —son números plausibles— y se descubren cuando alguien compra
 * algo que no existe, o a un precio que no es.
 */
export const CAMPOS_PROHIBIDOS = [
  'sku',
  'barcode',
  'stock',
  'cost',
  'price',
  'compare_at_price',
  'tax',
  'currency',
] as const;

/** Los mismos, como los escribiría alguien en español dentro de un atributo. */
const PROHIBIDOS_EN_ESPANOL = [
  'precio',
  'costo',
  'impuesto',
  'moneda',
  'codigo-de-barra',
  'codigo-de-barras',
];

/**
 * El esquema de la respuesta, para structured outputs con `strict: true`.
 *
 * En modo estricto **todas** las propiedades tienen que estar en `required` y
 * `additionalProperties` tiene que ser `false`, así que lo opcional se expresa
 * como un tipo que admite `null`. El efecto secundario es el que importa: un
 * esquema que no declara `price` hace que la API no pueda devolverlo. La
 * prohibición vive en el contrato, no en un pedido dentro del prompt.
 *
 * `attributes` es un arreglo de pares y no un objeto porque el modo estricto no
 * admite claves libres: con `additionalProperties: false` no hay forma de
 * declarar un `Record<string, string>`.
 */
export const ESQUEMA_DE_PROPUESTA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'brand', 'category', 'attributes'],
  properties: {
    title: {
      type: ['string', 'null'],
      description: 'Nombre comercial del producto, sin la marca adelante. Null si el actual sirve.',
    },
    description: {
      type: ['string', 'null'],
      description: 'Dos o tres frases sobre qué es y para qué sirve. Sin promesas ni precios.',
    },
    brand: {
      type: ['string', 'null'],
      description: 'Sólo si se lee en la foto o en el nombre. Null si no consta.',
    },
    category: {
      type: ['string', 'null'],
      description: 'Exactamente una de las categorías listadas, o null si ninguna corresponde.',
    },
    attributes: {
      type: 'array',
      description: 'Rasgos descriptivos: material, color, género, temporada. Vacío si no constan.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'valor'],
        properties: { nombre: { type: 'string' }, valor: { type: 'string' } },
      },
    },
  },
} as const;

/**
 * Las instrucciones del sistema.
 *
 * La regla que más importa es la última: **no consta** es una respuesta válida.
 * Sin eso el modelo rellena, y una ficha con un material inventado es peor que
 * una incompleta, porque nadie la revisa dos veces.
 */
/*
 * Literal y no un arreglo con `.join()`.
 *
 * Un `.join()` a nivel de módulo es una **llamada**, y Rollup no puede darla por
 * pura: el arreglo entero sobrevivía al tree-shaking y viajaba en el bundle de
 * todas las páginas del storefront —que no tiene nada que ver con esto— por el
 * barrel del core. Medido: 0,3 KB gzip por página, y era el **único** símbolo
 * del módulo que quedaba. Las constantes de al lado no lo hacen porque son
 * literales.
 */
export const INSTRUCCIONES = `Sos quien redacta fichas de producto para una tienda online.
Escribís en español rioplatense, sin signos de exclamación y sin lenguaje publicitario.

Reglas:
- Describís lo que se ve en las fotos y lo que dicen los datos. Nada más.
- No inventás precios, stock, SKU, códigos de barra, costos ni impuestos, y tampoco los mencionás.
- La categoría sale de la lista que te dan, escrita igual. Si ninguna corresponde, va null.
- Un campo que ya está bien vuelve como null: se propone lo que mejora, no todo.
- Si un dato no consta, va null o se omite. No completar es la respuesta correcta.`;

/** El texto que describe el producto actual: lo que la visión no puede ver. */
export function entradaDelProducto(
  producto: ProductoParaEnriquecer,
  categorias: readonly CategoriaConocida[],
): string {
  return [
    `Nombre actual: ${producto.title}`,
    `Descripción actual: ${producto.description?.trim() || '(vacía)'}`,
    `Marca actual: ${producto.brand?.trim() || '(sin marca)'}`,
    `Categoría actual: ${producto.categoria?.trim() || '(sin categoría)'}`,
    '',
    'Variantes:',
    ...producto.variantes.map((v) => {
      const attrs = Object.entries(v.atributos)
        .map(([clave, valor]) => `${clave}=${valor}`)
        .join(', ');
      return `- ${v.title}${attrs ? ` (${attrs})` : ''}`;
    }),
    '',
    categorias.length > 0
      ? `Categorías disponibles: ${categorias.map((c) => c.nombre).join(' | ')}`
      : 'Categorías disponibles: ninguna, la tienda no tiene categorías cargadas.',
  ].join('\n');
}

/*
 * Comparar por `slugify` y no por igualdad de texto: es el mismo normalizador
 * que ya usa el catálogo para el handle, así que "Calzado  Deportivo",
 * "calzado deportivo" y "Calzado-Deportivo" son el mismo nombre acá y allá.
 * También es como la propia tabla `categories` identifica una categoría.
 */
function esProhibido(nombre: string): boolean {
  const clave = slugify(nombre);
  return (
    CAMPOS_PROHIBIDOS.some((campo) => clave === slugify(campo)) ||
    PROHIBIDOS_EN_ESPANOL.includes(clave)
  );
}

/**
 * Recorta la respuesta del modelo a los campos permitidos.
 *
 * Redundante con el esquema estricto, y va igual: es lo que hace la regla
 * verificable. El esquema es una promesa del proveedor; esto es una garantía
 * nuestra, y el test que le mete un `price` adentro es la prueba de que existe.
 *
 * Los atributos se filtran con el mismo criterio, porque son la puerta de atrás:
 * un `precio: 90.000` dentro de los atributos termina en la ficha igual.
 */
export function soloCamposPermitidos(bruto: unknown): PropuestaCruda {
  if (typeof bruto !== 'object' || bruto === null) return {};
  const entrada = bruto as Record<string, unknown>;

  const texto = (clave: string): string | undefined => {
    const valor = entrada[clave];
    if (typeof valor !== 'string') return undefined;
    const limpio = valor.trim();
    return limpio === '' ? undefined : limpio;
  };

  const attrs: Record<string, string> = {};
  if (Array.isArray(entrada.attributes)) {
    for (const par of entrada.attributes) {
      if (typeof par !== 'object' || par === null) continue;
      const { nombre, valor } = par as Record<string, unknown>;
      if (typeof nombre !== 'string' || typeof valor !== 'string') continue;
      if (nombre.trim() === '' || valor.trim() === '') continue;
      if (esProhibido(nombre)) continue;
      attrs[nombre.trim()] = valor.trim();
    }
  }

  const title = texto('title');
  const description = texto('description');
  const brand = texto('brand');
  const category = texto('category');

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(brand ? { brand } : {}),
    ...(category ? { category } : {}),
    ...(Object.keys(attrs).length > 0 ? { attributes: attrs } : {}),
  };
}

/**
 * Resuelve el nombre que devolvió el modelo contra las categorías de la tienda.
 *
 * Sin coincidencia devuelve `undefined` y la propuesta sale sin categoría. Es
 * deliberado: una categoría inventada no rompe nada al proponerse, pero el
 * operador la aplicaría creyendo que existe y el producto quedaría sin
 * clasificar — peor que verlo vacío, porque parece resuelto.
 */
export function resolverCategoria(
  nombre: string | undefined,
  categorias: readonly CategoriaConocida[],
): CategoriaConocida | undefined {
  if (!nombre) return undefined;
  const buscado = slugify(nombre);
  if (buscado === '') return undefined;
  return categorias.find((c) => slugify(c.nombre) === buscado);
}

// ---------------------------------------------------------------------------
// La credencial guardada
// ---------------------------------------------------------------------------

/** Lo que la pantalla de configuración puede mostrar. Nunca el ciphertext. */
export interface EstadoDeCredencial {
  readonly configured: boolean;
  readonly last4?: string;
  /**
   * Texto y no `ModeloDeIA`: lo guardado puede ser un modelo que ya no está en
   * la lista. Se valida donde importa —antes de facturarle una llamada al
   * comercio— y no acá, donde el único efecto sería no poder mostrar la
   * configuración que tiene.
   */
  readonly model?: string;
  readonly updatedAt?: string;
}

/** Lo que sólo el Worker pide: inútil sin la clave maestra. */
export interface CredencialCifrada {
  readonly configured: boolean;
  readonly ciphertext?: string;
  readonly model?: string;
}

export interface RepositorioCredencialDeIA {
  estado(storeId: string): Promise<EstadoDeCredencial>;
  cifrada(storeId: string): Promise<CredencialCifrada>;
  guardar(
    storeId: string,
    credencial: { ciphertext: string; last4: string; model: ModeloDeIA },
  ): Promise<EstadoDeCredencial>;
  quitar(storeId: string): Promise<EstadoDeCredencial>;
}

// ---------------------------------------------------------------------------
// El alta con la cámara
// ---------------------------------------------------------------------------

/**
 * La ficha de un producto que todavía no existe (ADR-131).
 *
 * El enriquecimiento de ADR-104 mira un producto cargado y **no puede** devolver
 * precio, SKU ni código de barras: su esquema no los declara, así que la API no
 * tiene dónde ponerlos. Acá el caso es otro y la regla se enmienda en un punto:
 * cuando el dato está **impreso en la etiqueta que se fotografió**, leerlo no es
 * inventarlo. Lo que no cambia es quién decide: el valor leído se ofrece, nunca
 * se aplica solo, y nada se guarda sin que una persona mire la pantalla.
 *
 * Por eso vive en un esquema aparte en vez de ensanchar el otro: la garantía de
 * ADR-104 sobre un producto ya cargado sigue siendo estructural.
 */
export interface PeticionDeFicha {
  readonly apiKey: string;
  readonly modelo: ModeloDeIA;
  /** URLs públicas de las fotos recién subidas. */
  readonly imagenes: readonly string[];
  readonly categorias: readonly CategoriaConocida[];
}

/** Lo que se leyó de la etiqueta, si se leyó. */
export interface EtiquetaLeida {
  /** En unidades mayores, que es como lo escribe el operador. */
  readonly price?: number;
  /** El precio tal como está impreso. Es la evidencia que hace honesto aceptarlo. */
  readonly printedPrice?: string;
  readonly sku?: string;
  /** Sólo si el dígito verificador cierra. */
  readonly barcode?: string;
}

export interface FichaCruda extends PropuestaCruda {
  /** Talles leídos en la etiqueta o en la prenda. Uno por variante. */
  readonly sizes?: readonly string[];
  readonly label?: EtiquetaLeida;
}

/**
 * El esquema de la ficha, para structured outputs con `strict: true`.
 *
 * `label` es un objeto siempre presente con sus cuatro campos anulables, y no un
 * objeto anulable: el modo estricto expresa lo opcional con `["tipo", "null"]` y
 * un objeto entero en null es la forma que la documentación no promete.
 */
export const ESQUEMA_DE_FICHA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'brand', 'category', 'attributes', 'sizes', 'label'],
  properties: {
    title: {
      type: ['string', 'null'],
      description: 'Nombre comercial del producto, sin la marca adelante.',
    },
    description: {
      type: ['string', 'null'],
      description: 'Dos o tres frases sobre qué es y para qué sirve. Sin promesas ni precios.',
    },
    brand: {
      type: ['string', 'null'],
      description: 'Sólo si se lee en la foto. Null si no consta.',
    },
    category: {
      type: ['string', 'null'],
      description: 'Exactamente una de las categorías listadas, o null si ninguna corresponde.',
    },
    attributes: {
      type: 'array',
      description: 'Rasgos descriptivos: material, color, género, temporada. Vacío si no constan.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'valor'],
        properties: { nombre: { type: 'string' }, valor: { type: 'string' } },
      },
    },
    sizes: {
      type: 'array',
      description:
        'Talles escritos en la etiqueta o en la prenda, uno por elemento, tal como figuran. Vacío si no se lee ninguno.',
      items: { type: 'string' },
    },
    label: {
      type: 'object',
      additionalProperties: false,
      required: ['price', 'printedPrice', 'sku', 'barcode'],
      description: 'Lo que está impreso en la etiqueta. Todo null si no hay etiqueta legible.',
      properties: {
        price: {
          type: ['number', 'null'],
          description: 'El precio en unidades enteras, sin separadores ni símbolo de moneda.',
        },
        printedPrice: {
          type: ['string', 'null'],
          description: 'El precio tal como está impreso, con su símbolo y sus separadores.',
        },
        sku: {
          type: ['string', 'null'],
          description: 'El código interno impreso, si se lee con claridad.',
        },
        barcode: {
          type: ['string', 'null'],
          description: 'Los dígitos del código de barras, sin espacios. Null si no se leen todos.',
        },
      },
    },
  },
} as const;

/**
 * Las instrucciones del alta.
 *
 * La regla del medio es la que sostiene la enmienda a ADR-104: **copiar lo
 * impreso, nunca deducirlo**. Un precio estimado por lo que parece valer la
 * prenda es exactamente lo que ADR-104 prohíbe, y se ve igual que uno leído.
 */
/* Literal y no un `.join()`, por el mismo motivo que `INSTRUCCIONES`. */
export const INSTRUCCIONES_DE_FICHA = `Sos quien carga productos nuevos en una tienda online, mirando las fotos que le acaban de sacar.
Escribís en español rioplatense, sin signos de exclamación y sin lenguaje publicitario.

Reglas:
- Describís lo que se ve en las fotos. Nada más.
- Los talles salen de lo que esté escrito en la etiqueta o en la prenda. Si no se lee ninguno, la lista va vacía.
- El precio, el SKU y el código de barras se copian SÓLO si están impresos y se leen con claridad. No se deducen, no se estiman, no se completan por parecido con otro producto: ante la duda, van null.
- El precio va dos veces: el número en unidades enteras y el texto tal como está impreso.
- La categoría sale de la lista que te dan, escrita igual. Si ninguna corresponde, va null.
- Si un dato no consta, va null o vacío. No completar es la respuesta correcta.`;

/** El texto que acompaña a las fotos: lo único que la visión no puede ver. */
export function entradaDeLaFicha(categorias: readonly CategoriaConocida[]): string {
  return [
    'Producto nuevo, sin datos cargados. Todo sale de las fotos.',
    '',
    categorias.length > 0
      ? `Categorías disponibles: ${categorias.map((c) => c.nombre).join(' | ')}`
      : 'Categorías disponibles: ninguna, la tienda no tiene categorías cargadas.',
  ].join('\n');
}

/**
 * ¿Los dígitos cierran con su dígito verificador?
 *
 * EAN-8, UPC-A, EAN-13 y GTIN-14 usan el mismo algoritmo: pesos 3 y 1 alternados
 * desde la derecha, y el verificador completa la decena. Existe para que un
 * dígito mal leído en una foto **no se ofrezca**: un código de barras casi
 * correcto no falla al guardarlo, falla meses después en la pistola del
 * depósito o en el catálogo de un marketplace.
 */
export function esCodigoDeBarras(valor: string): boolean {
  const digitos = valor.trim();
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digitos)) return false;

  const numeros = [...digitos].map(Number);
  const verificador = numeros.pop()!;
  let suma = 0;
  let peso = 3;
  for (let i = numeros.length - 1; i >= 0; i -= 1) {
    suma += numeros[i]! * peso;
    peso = peso === 3 ? 1 : 3;
  }
  return (10 - (suma % 10)) % 10 === verificador;
}

/**
 * Recorta la ficha a lo que se puede ofrecer.
 *
 * Reusa `soloCamposPermitidos` para la parte que comparte con el
 * enriquecimiento —incluido el filtro de atributos, que es la puerta de atrás
 * por donde un precio se cuela como rasgo descriptivo— y agrega lo propio del
 * alta.
 */
export function soloCamposDeFicha(bruto: unknown): FichaCruda {
  const base = soloCamposPermitidos(bruto);
  if (typeof bruto !== 'object' || bruto === null) return base;
  const entrada = bruto as Record<string, unknown>;

  const sizes = Array.isArray(entrada.sizes)
    ? [
        ...new Set(
          entrada.sizes
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim())
            .filter((t) => t !== ''),
        ),
      ]
    : [];

  const cruda =
    typeof entrada.label === 'object' && entrada.label !== null
      ? (entrada.label as Record<string, unknown>)
      : {};

  const texto = (valor: unknown): string | undefined => {
    if (typeof valor !== 'string') return undefined;
    const limpio = valor.trim();
    return limpio === '' ? undefined : limpio;
  };

  const price =
    typeof cruda.price === 'number' && Number.isFinite(cruda.price) && cruda.price > 0
      ? cruda.price
      : undefined;
  const printedPrice = texto(cruda.printedPrice);
  const sku = texto(cruda.sku);
  const barcode = texto(cruda.barcode);

  const label: EtiquetaLeida = {
    ...(price === undefined ? {} : { price }),
    ...(printedPrice ? { printedPrice } : {}),
    ...(sku ? { sku } : {}),
    ...(barcode && esCodigoDeBarras(barcode) ? { barcode } : {}),
  };

  return {
    ...base,
    ...(sizes.length > 0 ? { sizes } : {}),
    ...(Object.keys(label).length > 0 ? { label } : {}),
  };
}

/**
 * El SKU que se propone cuando la etiqueta no trae uno.
 *
 * El catálogo lo exige y es único por tienda, así que dejarlo vacío no es una
 * opción: sin SKU no hay variante, y sin variante no hay nada que vender. Sale
 * del handle y del talle porque son los dos datos que ya se decidieron en la
 * pantalla, y queda editable.
 */
export function skuSugerido(handle: string, talle?: string): string {
  return slugify([handle, talle].filter((parte) => parte && parte.trim() !== '').join('-'))
    .toUpperCase()
    .replace(/-+/g, '-');
}
