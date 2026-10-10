/**
 * Lo que cada storefront le dice al paquete al declarar la integración (ADR-165).
 * El módulo lo arma `integration.ts`; esto es sólo su forma.
 */
declare module 'virtual:pick/storefront' {
  /** `stores.domain` de la tienda cuando no se declara `STOREFRONT_DOMAIN`. */
  export const DOMINIO_POR_DEFECTO: string;
}

/** Los estilos de la tienda —sus tokens y su preset—, para las páginas del paquete. */
declare module 'virtual:pick/estilos' {}
