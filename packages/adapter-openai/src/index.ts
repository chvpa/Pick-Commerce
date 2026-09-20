import {
  DIMENSIONES_DE_EMBEDDING,
  ESQUEMA_DE_FICHA,
  ESQUEMA_DE_PROPUESTA,
  INSTRUCCIONES,
  INSTRUCCIONES_DE_FICHA,
  INSTRUCCION_DE_FONDO,
  MODELO_DE_EMBEDDINGS,
  MODELO_DE_IMAGEN,
  entradaDeLaFicha,
  entradaDelProducto,
  soloCamposDeFicha,
  soloCamposPermitidos,
  type AIProvider,
  type Embeddings,
  type FichaCruda,
  type PeticionArmada,
  type PeticionDeEmbeddings,
  type PeticionDeEnriquecimiento,
  type PeticionDeFicha,
  type PeticionDeFondo,
  type PropuestaCruda,
} from '@pick/commerce-core';

/**
 * OpenAI (PROJECT.md §25, stack cerrado).
 *
 * Sin el SDK, por el mismo argumento que `adapter-resend`: la superficie que se
 * usa son **dos** endpoints, y el paquete oficial es un envoltorio de `fetch`
 * alrededor de eso. Además esto corre dentro de un Worker, donde una dependencia
 * de 400 KB se paga en cada arranque en frío.
 *
 * Contrato verificado contra la documentación y no desde la memoria:
 *
 * - La salida estructurada va por la **Responses API** —`POST /v1/responses`—,
 *   que es la recomendada, con `text.format` de tipo `json_schema` y
 *   `strict: true`.
 * - El texto generado **no** está en un campo de primer nivel: hay que buscar el
 *   ítem de `output` con `type: "message"` y dentro el `content` con
 *   `type: "output_text"`. Los modelos que razonan meten otros ítems antes, así
 *   que tomar `output[0]` funciona hasta que deja de funcionar.
 * - Las imágenes van como `input_image` con la URL completa.
 */

const RAIZ = 'https://api.openai.com/v1';

/**
 * Tope de fotos por pedido.
 *
 * Cada imagen se paga en tokens y la tercera ya no agrega nada sobre una ficha
 * de producto: son ángulos del mismo objeto. El que paga es el comercio.
 */
const MAXIMO_DE_IMAGENES = 3;

/**
 * Techo de salida.
 *
 * Una ficha entra de sobra. Está para que un modelo que se enrede no facture un
 * contexto entero, y por eso el `status: "incomplete"` se trata como error: un
 * JSON cortado a la mitad no parsea, y el mensaje que saldría sería sobre
 * sintaxis en vez de sobre lo que pasó.
 */
const MAXIMO_DE_TOKENS = 2000;

interface ItemDeSalida {
  type?: string;
  content?: { type?: string; text?: string }[];
}

interface RespuestaDeOpenAI {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: ItemDeSalida[];
  error?: { message?: string };
}

/** El detalle del error va al mensaje: lo lee un log del servidor, nunca un comprador. */
async function fallo(respuesta: Response, quehacer: string): Promise<Error> {
  const detalle = await respuesta.text().catch(() => '');
  if (respuesta.status === 401) {
    return new Error('OpenAI rechazó la credencial (401). Revisá la key de la tienda.');
  }
  if (respuesta.status === 429) {
    return new Error('OpenAI respondió 429: la cuenta llegó a su límite de uso o de velocidad.');
  }
  return new Error(`${quehacer} (${respuesta.status}): ${detalle.slice(0, 300)}`);
}

export function proveedorOpenAI(): AIProvider {
  return {
    id: 'openai',

    /**
     * Listar modelos es la comprobación más barata que existe: no consume
     * tokens, así que probar la conexión no le cuesta nada al comercio.
     */
    async probar(apiKey: string): Promise<void> {
      const respuesta = await fetch(`${RAIZ}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!respuesta.ok) throw await fallo(respuesta, 'No se pudo verificar la credencial');
    },

    /*
     * La limpieza de fondo devuelve **la petición armada**, no el resultado.
     *
     * Quien la ejecuta es el Worker del Admin, que reenvía el cuerpo de OpenAI
     * al navegador sin decodificarlo: una imagen en base64 son megabytes, y
     * decodificarla ahí gastaría CPU del Worker para nada (ADR-130). Acá queda
     * lo que este paquete existe para saber: la URL, el modelo y el pedido.
     */
    peticionDeLimpiezaDeFondo({ apiKey, imagenUrl }: PeticionDeFondo): PeticionArmada {
      return {
        url: `${RAIZ}/images/edits`,
        init: {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: MODELO_DE_IMAGEN,
            prompt: INSTRUCCION_DE_FONDO,
            // La foto ya está publicada en Storage, así que viaja por URL y no
            // como archivo: no hay que subirla dos veces.
            images: [{ image_url: imagenUrl }],
            // Fondo opaco y WebP: la vitrina muestra las fotos sobre blanco, y un
            // PNG con transparencia pesa varias veces más por nada.
            background: 'opaque',
            output_format: 'webp',
            /*
             * Sin `input_fidelity`: la referencia de la API lo documenta, pero
             * **este modelo lo rechaza** —«the model 'gpt-image-2.5-sunburst'
             * does not support the 'input_fidelity' parameter», 400, medido
             * contra la API real—. Lo que cuida el parecido acá es el pedido, y
             * sobre todo que una persona compare las dos fotos antes de
             * publicar (ADR-130).
             */
          }),
        },
      };
    },

    async enriquecer(peticion: PeticionDeEnriquecimiento): Promise<PropuestaCruda> {
      const { apiKey, modelo, producto, categorias } = peticion;

      const bruto = await conEsquema({
        apiKey,
        modelo,
        instrucciones: INSTRUCCIONES,
        texto: entradaDelProducto(producto, categorias),
        imagenes: producto.imagenes,
        esquema: ESQUEMA_DE_PROPUESTA,
        nombre: 'propuesta_de_producto',
        quehacer: 'OpenAI no pudo generar la propuesta',
      });
      return soloCamposPermitidos(bruto);
    },

    /*
     * La ficha de un producto que todavía no existe (ADR-131).
     *
     * Mismo endpoint y mismo mecanismo que el enriquecimiento, con **otro
     * esquema**: éste sí declara lo que está impreso en la etiqueta. Son dos
     * esquemas y no uno ensanchado justamente para que la prohibición de
     * ADR-104 siga siendo estructural donde corresponde.
     */
    async ficha(peticion: PeticionDeFicha): Promise<FichaCruda> {
      const { apiKey, modelo, imagenes, categorias } = peticion;

      const bruto = await conEsquema({
        apiKey,
        modelo,
        instrucciones: INSTRUCCIONES_DE_FICHA,
        texto: entradaDeLaFicha(categorias),
        imagenes,
        esquema: ESQUEMA_DE_FICHA,
        nombre: 'ficha_de_producto',
        quehacer: 'OpenAI no pudo leer la ficha',
      });
      return soloCamposDeFicha(bruto);
    },

    /*
     * Los vectores del catálogo (ADR-132).
     *
     * Otro endpoint y otro modelo: `/v1/embeddings` no es la Responses API y no
     * tiene salida estructurada que valga. Lo único delicado es el orden.
     */
    async embeber({ apiKey, textos }: PeticionDeEmbeddings): Promise<Embeddings> {
      const respuesta = await fetch(`${RAIZ}/embeddings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELO_DE_EMBEDDINGS,
          input: textos,
          dimensions: DIMENSIONES_DE_EMBEDDING,
          encoding_format: 'float',
        }),
      });

      if (!respuesta.ok) throw await fallo(respuesta, 'OpenAI no pudo embeber el catálogo');

      const cuerpo = (await respuesta.json()) as {
        data?: { index?: number; embedding?: number[] }[];
        usage?: { total_tokens?: number };
      };

      /*
       * **Se ordena por `index`, no se confía en el orden de llegada.** La API
       * devuelve ese campo justamente porque no lo promete, y acá el orden es
       * todo: el vector en la posición 3 se guarda contra el producto 3. Un
       * desorden silencioso pondría el vector de una remera en una campera, y no
       * fallaría en ningún lado: se vería como un buscador que responde
       * cualquier cosa.
       */
      const filas = [...(cuerpo.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vectores = filas.map((f) => f.embedding ?? []);

      if (vectores.length !== textos.length || vectores.some((v) => v.length === 0)) {
        throw new Error(
          `OpenAI devolvió ${vectores.length} vectores para ${textos.length} textos.`,
        );
      }

      // Los tokens que **cobró**, no los estimados: es lo que se le muestra al
      // comercio y lo que descuenta de su techo.
      return { vectores, tokens: cuerpo.usage?.total_tokens ?? 0 };
    },
  };
}

/** Una respuesta con salida estructurada, que es lo único que este paquete pide. */
async function conEsquema(peticion: {
  apiKey: string;
  modelo: string;
  instrucciones: string;
  texto: string;
  imagenes: readonly string[];
  esquema: unknown;
  nombre: string;
  quehacer: string;
}): Promise<unknown> {
  const respuesta = await fetch(`${RAIZ}/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${peticion.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: peticion.modelo,
      max_output_tokens: MAXIMO_DE_TOKENS,
      input: [
        { role: 'system', content: peticion.instrucciones },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: peticion.texto },
            ...peticion.imagenes.slice(0, MAXIMO_DE_IMAGENES).map((url) => ({
              type: 'input_image',
              image_url: url,
              detail: 'auto',
            })),
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: peticion.nombre,
          strict: true,
          schema: peticion.esquema,
        },
      },
    }),
  });

  if (!respuesta.ok) throw await fallo(respuesta, peticion.quehacer);

  const cuerpo = (await respuesta.json()) as RespuestaDeOpenAI;
  return JSON.parse(textoDeLaRespuesta(cuerpo));
}

/**
 * Saca el texto de la respuesta, o explica por qué no hay.
 *
 * Separada y exportada porque es la parte frágil: depende de la forma exacta que
 * devuelve la API, y es lo que hay que corregir si esa forma cambia. Su test no
 * necesita red.
 */
export function textoDeLaRespuesta(cuerpo: RespuestaDeOpenAI): string {
  if (cuerpo.status === 'incomplete') {
    const motivo = cuerpo.incomplete_details?.reason ?? 'sin motivo declarado';
    throw new Error(`OpenAI cortó la respuesta antes de terminarla (${motivo}).`);
  }

  const mensaje = cuerpo.output?.find((item) => item.type === 'message');
  const texto = mensaje?.content?.find((parte) => parte.type === 'output_text')?.text;

  if (typeof texto !== 'string' || texto.trim() === '') {
    throw new Error('OpenAI respondió sin texto: no hay propuesta que mostrar.');
  }
  return texto;
}
