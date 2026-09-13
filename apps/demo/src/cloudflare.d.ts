/**
 * Lo mínimo de `cloudflare:workers` que este storefront usa.
 *
 * Es el módulo virtual del runtime de Workers, y sus tipos vienen en
 * `@cloudflare/workers-types`, que este repo no tiene. Agregar el paquete
 * entero para importar un símbolo que se usa como un diccionario opaco es peor
 * negocio que estas cuatro líneas: `env` acá sólo sirve para buscar un binding
 * por nombre, y quien lo busca ya castea al tipo que espera.
 *
 * Si algún día hace falta más de la superficie de Workers —Durable Objects,
 * `cache`, el resto—, ahí sí entra el paquete y esto se borra.
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
