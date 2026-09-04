import type { EventoDeTienda } from '@pick/commerce-core';

/**
 * Lo que el storefront agrega a `Astro.locals`.
 *
 * `cfContext` y compañía los declara el adapter de Cloudflare; esto es sólo lo
 * nuestro. Los dos campos son de analytics y los dos son opcionales a propósito:
 * una respuesta que no sea HTML —el sitemap, `/api/*`, `llms.txt`— no abre
 * sesión, y una petición de un bot o una precarga tampoco. Que falten es el modo
 * de decir «esto no se cuenta».
 */
// `declare global` y no `declare namespace` a secas: este archivo tiene un
// `import`, así que es un módulo, y dentro de un módulo la declaración sería
// local. Sin `global` el tipo compila y no aumenta nada.
declare global {
  namespace App {
    interface Locals {
      /** La sesión anónima de quien navega. Ausente si esta petición no cuenta. */
      sessionId?: string;
      /** Lo que la petición juntó, hasta que el middleware lo vuelca. */
      eventos?: EventoDeTienda[];
    }
  }
}

export {};
