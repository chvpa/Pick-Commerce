import type { APIRoute } from 'astro';
import { recomendadosParaVariantes } from '../../lib/db.ts';
import { demasiadasPeticiones, dentroDelLimite } from '../../lib/limite.ts';

export const prerender = false;

/** Un carrito con más de veinte líneas no es un carrito: es un pegado. */
const MAXIMO_DE_VARIANTES = 20;

/**
 * Lo que suele mirarse junto con lo que hay en el carrito.
 *
 * **GET y no POST** porque la respuesta no depende de quién mira sino de qué hay
 * en el carrito, y eso lo hace cacheable: es el único lugar de la Fase 4 donde
 * `cache-control: public` es legítimo. Cinco minutos alcanzan para que dos
 * personas con el mismo carrito no paguen dos consultas, y son menos de lo que
 * tarda el recálculo en cambiar de opinión.
 *
 * El carrito vive en `localStorage`, así que el servidor no sabe qué hay adentro
 * hasta que el navegador se lo dice; lo que llega son ids de variante, que es lo
 * que el carrito guarda, y el mapeo a producto lo hace el SQL.
 *
 * **No anota ningún evento**: mirar el carrito ya se anota en otro lado, y esto
 * puede llamarse dos veces por la misma vista —el drawer y la página—.
 */
export const GET: APIRoute = async ({ request, url }) => {
  if (!(await dentroDelLimite(request, 'CARRITO_LIMITE'))) return demasiadasPeticiones();

  const variantes = (url.searchParams.get('v') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .slice(0, MAXIMO_DE_VARIANTES);

  const limite = Number.parseInt(url.searchParams.get('limite') ?? '3', 10) || 3;

  /*
   * Se recorta a lo que la tira dibuja. El documento completo trae descripción,
   * todas las variantes y todas las fotos: son kilobytes por producto que el
   * navegador descarga para tirar.
   */
  const productos = (await recomendadosParaVariantes(variantes, limite)).map((p) => ({
    handle: p.handle,
    title: p.title,
    ...(p.brand ? { brand: p.brand } : {}),
    ...(p.images[0] ? { image: { url: p.images[0].url, alt: p.images[0].alt } } : {}),
    ...(p.variants[0] ? { price: p.variants[0].price } : {}),
  }));

  /*
   * Arma su propia respuesta en vez de usar `json()`, que impone `no-store` a
   * todas las rutas del storefront porque son por cliente —un proxy que cachee
   * el carrito le muestra a alguien el de otro—. Ésta es la excepción, y por eso
   * se escribe acá en vez de aflojar la regla para todas.
   */
  return new Response(JSON.stringify({ productos }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
