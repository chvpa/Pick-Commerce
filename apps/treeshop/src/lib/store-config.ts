/**
 * Configuración **del despliegue**, no del comercio.
 *
 * Lo que queda acá es lo que depende de dónde y cómo corre este storefront. Lo
 * que es del comercio —su nombre, su anuncio, su envío— sale de la base: ver
 * `contextoSeo` en `db.ts`.
 */
/*
 * La dirección pública. De acá salen el canonical, el `og:url` y el sitemap.
 *
 * El fallback es el Worker de la demo, que es lo que sirve el sitio cuando nadie
 * declara `SITE_URL`. Antes era `pick-demo.pages.dev`, un dominio que no existe:
 * sin la variable, el sitio funcionaba perfecto y anunciaba a los buscadores una
 * dirección inexistente. Ya pasó una vez (INFRAESTRUCTURA §5).
 */
export const SITE_URL =
  import.meta.env.SITE ?? 'https://sontres.shop';

export const features = {
  /**
   * Dejar entrar a los crawlers de IA. Por defecto sí: que los productos
   * aparezcan en respuestas de IA vale más que el riesgo de scraping, y el
   * comercio que no lo quiera lo apaga acá. Ver ADR-046.
   */
  allowAiCrawlers: true,
} as const;

/*
 * Acá vivían `storeName`, la barra de anuncio y `COLECCION_DESTACADA`.
 *
 * Los tres eran decisiones del comercio guardadas en el código del despliegue, y
 * el diagnóstico ya estaba escrito para el último de ellos. El nombre ahora sale
 * de `stores.name`; el anuncio se deriva del envío configurado, así que no puede
 * prometer un envío gratis que la caja no dé.
 *
 * Lo que sigue es el comentario original, que valía para los tres.
 *
 * ---
 *
 * Acá vivía `COLECCION_DESTACADA = 'ofertas'`.
 *
 * El comentario decía que era «una decisión del comercio, no del Core», y tenía
 * razón en el diagnóstico y no en el remedio: era una decisión del comercio
 * guardada en el código, así que cambiarla exigía desplegar y toda tienda tenía
 * que llamar igual a su colección destacada. Ahora las secciones de la home son
 * colecciones con `home_position`, y se administran.
 */

/**
 * Rutas que no aportan a la indexación y sí dispersan autoridad.
 *
 * `/api` no es una página: son endpoints que sólo responden a POST, así que un
 * crawler sólo puede gastar presupuesto ahí para recibir un 405.
 */
export const RUTAS_PRIVADAS = ['/carrito', '/checkout', '/cuenta', '/api'] as const;
