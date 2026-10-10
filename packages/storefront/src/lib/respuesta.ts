/**
 * Respuestas JSON de los endpoints del storefront.
 *
 * Existe porque los endpoints de Fase 5 escriben pedidos y los que ya había no
 * son un buen molde para eso. Dos reglas que salieron de revisarlos:
 *
 * 1. **El mensaje del adapter nunca llega al cuerpo.** El adapter lanza
 *    `No se pudo consultar el carrito: <mensaje de Postgres>`, y el reflejo al
 *    escribir un endpoint es `catch (e) { return json({ error: e.message }) }`.
 *    Eso publica nombres de tablas, columnas y restricciones. Se registra en el
 *    log del Worker —que para eso está `observability`— y afuera va un texto
 *    fijo.
 *
 * 2. **`no-store` siempre.** Ninguna ruta on-demand emitía `Cache-Control`, y el
 *    sitemap enseña `public, max-age=3600` sobre datos de un tenant. Acá las
 *    respuestas son por cliente: un proxy que las cachee le muestra a alguien el
 *    carrito de otro.
 */

const CABECERAS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
} as const;

export function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: CABECERAS });
}

/**
 * Falla registrando el detalle y respondiendo lo justo.
 *
 * El `console.error` va a los logs del Worker; el cliente recibe una frase que
 * puede leer y un código que sirve para reportar.
 */
export function falla(donde: string, error: unknown, status = 500): Response {
  console.error(`[${donde}]`, error);
  return json(
    {
      error: 'server_error',
      message: 'No pudimos completar la operación. Probá de nuevo en unos segundos.',
    },
    status,
  );
}

/** Lee el cuerpo como JSON. Un cuerpo ilegible es un 400, no un 500. */
export async function cuerpoJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Líneas de carrito recibidas del browser.
 *
 * Devuelve las válidas **y cuántas se rechazaron**, porque las dos cosas
 * importan y confundirlas ya costó un rato: al principio esto sólo filtraba, y
 * un carrito con una cantidad fuera de rango llegaba como carrito vacío. El
 * endpoint respondía «tu carrito está vacío» sobre un carrito que tenía algo, y
 * el motivo real no aparecía en ningún lado. Descartar en silencio es
 * exactamente el modo de fallo que este repo se cansó de perseguir.
 *
 * El tope de líneas y de cantidad existe para que un payload absurdo no se
 * convierta en una consulta absurda; superarlo es una petición mal formada, no
 * un carrito vacío.
 */
export function lineasRecibidas(entrada: unknown): {
  readonly lines: readonly { variantId: string; quantity: number }[];
  readonly invalidas: number;
} {
  const crudas = (entrada as { lines?: unknown })?.lines;
  if (!Array.isArray(crudas)) return { lines: [], invalidas: 0 };

  const lines: { variantId: string; quantity: number }[] = [];
  let invalidas = 0;

  for (const cruda of crudas.slice(0, 100)) {
    const l = cruda as Record<string, unknown>;
    const ok =
      typeof l?.variantId === 'string' &&
      l.variantId.length > 0 &&
      typeof l.quantity === 'number' &&
      Number.isInteger(l.quantity) &&
      l.quantity > 0 &&
      l.quantity <= 999;

    if (ok) lines.push({ variantId: l.variantId as string, quantity: l.quantity as number });
    else invalidas += 1;
  }

  return { lines, invalidas: invalidas + Math.max(0, crudas.length - 100) };
}
