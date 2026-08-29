import {
  agregarPorVariante,
  type ERPAdapter,
  type ERPCapabilities,
  type ERPItem,
} from '@pick/commerce-core';

/**
 * Adapter del ERP de Estilo Sport: un Oracle ORDS detrás de un proxy Node.
 *
 * El proxy vive en la red del cliente y expone tres rutas con `x-api-key`
 * (`/health`, `/stock`, `/pedido`). Este adapter habla con el proxy, nunca con
 * Oracle: la IP del ORDS no es alcanzable desde afuera.
 *
 * **No corre dentro de un Worker de Cloudflare.** El proxy está publicado en
 * una IP cruda y un puerto no estándar, y el `fetch()` de Workers descarta el
 * puerto en producción (iría a :80) además de bloquear IPs crudas por las
 * protecciones anti-SSRF. En local con Miniflare funciona, así que el fallo
 * aparece recién al desplegar. Hoy este adapter se usa desde Node — el
 * importador— y para subirlo al Worker hay que publicar el proxy en un hostname
 * con TLS sobre 443. Ver ADR-085.
 *
 * Todo lo que sigue está verificado el 29/08/2026 contra las 9032 filas reales
 * del catálogo, no contra la documentación: donde las dos difieren, gana el
 * cable y queda anotado.
 */

/** Lo que el ORDS manda por cada fila. Once campos, no los ocho documentados. */
interface FilaORDS {
  readonly codigo: string;
  readonly cod_origen: string;
  readonly cod_barra: string;
  readonly articulo: string;
  readonly rubro: string;
  /** No documentado, y es la única pista de categoría que sirve. */
  readonly familia: string;
  /** No documentado. Constante en 'GENERICO': no aporta nada. */
  readonly linea: string;
  /** No documentado. Marca real en el 94 % de las filas. */
  readonly marca: string;
  readonly cod_talla: string;
  /** Número en el cable, aunque la documentación lo describa como string. */
  readonly cant_dispon: number | string;
  readonly precio_vta: number | string;
}

/**
 * Lo que este ERP sabe hacer.
 *
 * Las cuatro primeras en `false` no son una limitación de esta implementación:
 * el ORDS no ofrece reservas, ni consultas por fecha de cambio, ni avisos, ni
 * un campo que diga en qué depósito está cada unidad. Declararlo es lo que
 * impide que el checkout prometa algo que el ERP no puede cumplir (PROJECT.md
 * §12).
 */
export const CAPACIDADES_ESTILOSPORT: ERPCapabilities = {
  supportsReservations: false,
  supportsDeltaSync: false,
  supportsWebhooks: false,
  supportsLocationBreakdown: false,
  supportsLiveStock: true,
  supportsOrderPush: true,
};

/**
 * Deshace las dos rarezas del ORDS.
 *
 * 1. Doble codificación: lo que llega es un **string** que contiene el array.
 * 2. Saltos de línea literales en medio del JSON, porque la salida es de ancho
 *    fijo. Van dentro del string externo, así que el `JSON.parse` de afuera los
 *    acepta y el de adentro los rechaza.
 *
 * No se limpian los saltos antes del primer parse: dentro de un valor de texto
 * son legítimos y borrarlos rompería un nombre de artículo con salto.
 */
export function parseOracleJson(texto: string): readonly FilaORDS[] {
  let valor: unknown = JSON.parse(texto.trim());
  if (typeof valor === 'string') valor = JSON.parse(valor.replace(/\r?\n/g, ''));
  if (!Array.isArray(valor)) {
    throw new TypeError('El ORDS no devolvió un array de artículos');
  }
  return valor as readonly FilaORDS[];
}

/**
 * Talla del ORDS a la de Pick: `"105"` → `"10.5"`.
 *
 * La regla no es «sacarle el punto», y esa confusión es exactamente la que el
 * sistema actual documenta como fuente de errores. El campo del ORDS tiene
 * **tres caracteres de ancho**: `"8.5"` entra y viaja con el punto, `"10.5"` no
 * entra y viaja como `"105"`. Por eso sólo los valores de tres dígitos llevan
 * punto insertado.
 *
 * Comprobado contra los 70 valores distintos del catálogo real: los once de tres
 * dígitos terminan todos en 5 (105 115 125 135 275 335 375 385 405 425 445), los
 * nueve con punto tienen parte entera de un dígito (1.5 … 9.5), y ninguno de dos
 * dígitos es ambiguo. Las letras (XS…XXL) pasan sin tocar.
 */
export function normalizarTalla(codTalla: string): string {
  const t = codTalla.trim();
  return /^\d{3}$/.test(t) ? `${t.slice(0, 2)}.${t.slice(2)}` : t;
}

/**
 * La vuelta: `"10.5"` → `"105"`, pero `"8.5"` se queda en `"8.5"`.
 *
 * Sólo para variantes que nunca se sincronizaron. Cuando el sync guardó
 * `erp_size`, se usa ese valor y no esta función: convertir de vuelta es
 * adivinar el ancho del campo, y una talla mal escrita factura mal.
 */
export function aTallaDelERP(talla: string): string {
  const t = talla.trim();
  return /^\d{2}\.\d$/.test(t) ? t.replace('.', '') : t;
}

/** El ORDS manda 'GENERICA' cuando no hay marca cargada. */
function marcaReal(marca: string): string | undefined {
  const m = marca?.trim();
  return !m || m.toUpperCase() === 'GENERICA' ? undefined : m;
}

/**
 * Una fila del cable a una variante normalizada.
 *
 * `rubro` y `linea` se descartan: los dos valen 'GENERICO' en las 9032 filas.
 * La documentación dice que `rubro` es la pista de categoría; hoy no lo es, y
 * la que sirve es `familia`, con 147 valores.
 */
function aItem(fila: FilaORDS): ERPItem {
  const disponible = Number(fila.cant_dispon);
  const precio = Number(fila.precio_vta);
  if (!Number.isFinite(disponible) || !Number.isFinite(precio)) {
    throw new TypeError(`El artículo ${fila.cod_barra} trae stock o precio ilegibles`);
  }

  return {
    internalCode: String(fila.codigo).trim(),
    barcode: String(fila.cod_barra).trim(),
    title: String(fila.articulo).trim(),
    size: normalizarTalla(String(fila.cod_talla)),
    erpSize: String(fila.cod_talla).trim(),
    available: disponible,
    // PYG no tiene decimales: el entero del ERP ya es la unidad mínima.
    price: { amount: Math.round(precio), currency: 'PYG' },
    family: String(fila.familia ?? '').trim() || undefined,
    brand: marcaReal(String(fila.marca ?? '')),
    externalCode: String(fila.cod_origen ?? '').trim() || undefined,
  };
}

/** Convierte y agrega en un paso, que es como se consume siempre. */
export function normalizarRespuesta(texto: string): readonly ERPItem[] {
  return agregarPorVariante(parseOracleJson(texto).map(aItem));
}

export interface OpcionesEstiloSport {
  /** URL del proxy, sin barra final. */
  readonly url: string;
  /** El `x-api-key` que el proxy compara contra su propio `API_SECRET`. */
  readonly secret: string;
  /** Inyectable para los tests; por defecto el `fetch` del entorno. */
  readonly fetch?: typeof globalThis.fetch;
}

/** El bulk trae 9000 filas y tarda; una consulta puntual no debería. */
const TIMEOUT_BULK_MS = 180_000;
const TIMEOUT_ITEM_MS = 15_000;

export function proveedorEstiloSport(opciones: OpcionesEstiloSport): ERPAdapter {
  const base = opciones.url.replace(/\/+$/, '');
  const hacerFetch = opciones.fetch ?? globalThis.fetch;

  async function pedir(ruta: string, timeoutMs: number): Promise<string> {
    const respuesta = await hacerFetch(`${base}${ruta}`, {
      headers: { 'x-api-key': opciones.secret },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const cuerpo = await respuesta.text();
    if (!respuesta.ok) {
      /*
       * El proxy distingue las dos capas y hay que conservarlo: un 503 es que no
       * alcanzó a Oracle —red del cliente o servicio caído— y se reintenta;
       * cualquier otro es Oracle rechazando, y reintentar no lo arregla.
       */
      const capa = respuesta.status === 503 ? 'el proxy no alcanzó a Oracle' : 'Oracle rechazó';
      throw new Error(`${capa} (HTTP ${respuesta.status}): ${cuerpo.slice(0, 500)}`);
    }
    return cuerpo;
  }

  return {
    id: 'estilosport-ords',
    capabilities: CAPACIDADES_ESTILOSPORT,

    async fetchInventory() {
      return normalizarRespuesta(await pedir('/stock', TIMEOUT_BULK_MS));
    },

    async fetchItem(internalCode) {
      const ruta = `/stock?articulo=${encodeURIComponent(internalCode)}`;
      return normalizarRespuesta(await pedir(ruta, TIMEOUT_ITEM_MS));
    },

    async healthCheck() {
      try {
        // `/health` es la única ruta sin auth del proxy.
        const respuesta = await hacerFetch(`${base}/health`, {
          signal: AbortSignal.timeout(10_000),
        });
        return respuesta.ok;
      } catch {
        return false;
      }
    },
  };
}
