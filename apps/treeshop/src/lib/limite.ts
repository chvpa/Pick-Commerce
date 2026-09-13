import { env } from 'cloudflare:workers';

/**
 * Freno de abuso en las rutas POST públicas.
 *
 * Va en el binding de rate limiting de Workers y no en una regla del panel de
 * Cloudflare, y el motivo es el producto: una regla de panel se crea a mano, por
 * zona, y habría que recrearla en la cuenta de **cada comercio** —además de que
 * no se ve desde el repo, así que nadie sabe que existe hasta que bloquea algo—.
 * El binding se declara en `wrangler.jsonc`, se versiona, y todo storefront que
 * se despliegue después lo tiene sin que nadie se acuerde.
 *
 * Lo que el binding **no** es, según su propia documentación: un contador
 * exacto. Cuenta por centro de datos de Cloudflare y no globalmente, y se
 * actualiza de forma diferida. Para frenar un script alcanza; para cobrar por
 * uso, no serviría.
 *
 * Los dos límites tienen que ser **generosos**, y no por prudencia abstracta: la
 * llave es la IP, y detrás de una IP puede haber una oficina entera o el NAT de
 * una operadora móvil. Un límite ajustado no frena a un atacante —que rota
 * IPs— y sí le corta la compra a la segunda persona del mismo edificio.
 *
 * El período que admite el binding es 10 o 60 segundos, nada más.
 */

interface Limitador {
  limit(opciones: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Sin binding declarado, no frena nada.
 *
 * Es a propósito y es lo que hace seguro desplegar esto: `astro dev`, el
 * preview del e2e y cualquier despliegue que todavía no declare el binding
 * siguen funcionando igual. Un freno que falla cerrado en desarrollo se termina
 * comentando, y comentado no protege nada.
 */
function limitador(nombre: string): Limitador | undefined {
  return env[nombre] as Limitador | undefined;
}

/**
 * La llave con la que se cuenta.
 *
 * `CF-Connecting-IP` la pone Cloudflare y no se puede falsificar desde afuera:
 * un `X-Forwarded-For` en el pedido sí, y por eso no se usa. Sin ella —en local,
 * o en el e2e— todas las peticiones comparten llave, que es exactamente lo que
 * se quiere cuando no hay binding.
 */
function llave(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'sin-ip';
}

/**
 * `true` si la petición puede seguir.
 *
 * Un fallo del limitador **deja pasar**. Que Cloudflare no pueda contar no es
 * motivo para que un comercio deje de vender.
 */
export async function dentroDelLimite(request: Request, nombre: string): Promise<boolean> {
  const freno = limitador(nombre);
  if (!freno) return true;

  try {
    const { success } = await freno.limit({ key: llave(request) });
    return success;
  } catch (error) {
    console.error('[rate-limit]', error);
    return true;
  }
}

/** Lo que se le contesta a quien pasó el límite. */
export function demasiadasPeticiones(): Response {
  return new Response(
    JSON.stringify({
      error: 'rate_limited',
      message: 'Demasiados intentos seguidos. Esperá unos segundos y probá de nuevo.',
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        // Con el período de 60 s del binding, un minuto es la espera correcta.
        'retry-after': '60',
      },
    },
  );
}
