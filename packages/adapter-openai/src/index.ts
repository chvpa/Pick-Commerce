import {
  ESQUEMA_DE_PROPUESTA,
  INSTRUCCIONES,
  INSTRUCCION_DE_FONDO,
  MODELO_DE_IMAGEN,
  entradaDelProducto,
  soloCamposPermitidos,
  type AIProvider,
  type PeticionArmada,
  type PeticionDeEnriquecimiento,
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

      const respuesta = await fetch(`${RAIZ}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: modelo,
          max_output_tokens: MAXIMO_DE_TOKENS,
          input: [
            { role: 'system', content: INSTRUCCIONES },
            {
              role: 'user',
              content: [
                { type: 'input_text', text: entradaDelProducto(producto, categorias) },
                ...producto.imagenes.slice(0, MAXIMO_DE_IMAGENES).map((url) => ({
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
              name: 'propuesta_de_producto',
              strict: true,
              schema: ESQUEMA_DE_PROPUESTA,
            },
          },
        }),
      });

      if (!respuesta.ok) throw await fallo(respuesta, 'OpenAI no pudo generar la propuesta');

      const cuerpo = (await respuesta.json()) as RespuestaDeOpenAI;
      return soloCamposPermitidos(JSON.parse(textoDeLaRespuesta(cuerpo)));
    },
  };
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
