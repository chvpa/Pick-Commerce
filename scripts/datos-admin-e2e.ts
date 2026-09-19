/**
 * Los datos que el smoke del Admin crea, usa y después borra.
 *
 * Viven en su propio módulo porque los comparten tres lados —el que los crea,
 * el test que entra con ellos y el que los limpia— y una credencial repetida en
 * tres archivos es una credencial que algún día va a dejar de coincidir en uno.
 */

/** Usuario del smoke. El dominio `@e2e.test` es el marcador que borra la limpieza. */
export const ADMIN_E2E = {
  email: 'admin@e2e.test',
  password: 'e2e-admin-2026-Pick!',
} as const;

/**
 * Segunda tienda de la organización de demostración.
 *
 * Existe sólo para que el selector de tiendas sea un menú: con una sola tienda
 * dibuja una variante inerte, y el test pasaría sin ejercitar el desplegable que
 * se rompió. El id es fijo para poder borrarla sin adivinar, y está fuera del
 * rango del seed (`5eed0000…`) para que `pnpm seed` no la toque.
 */
export const TIENDA_E2E = {
  id: '5eede2e0-0000-4000-8000-000000000001',
  slug: 'e2e-segunda',
  name: 'Sucursal de prueba e2e',
} as const;

/**
 * Un producto con stock y sin foto en la segunda tienda: el que el smoke
 * fotografía desde «Sin foto» (v2 Fase 5). Vive en la tienda de la corrida, así
 * que se va en cascada con ella y ninguna corrida hereda la foto de la anterior.
 */
export const PRODUCTO_SIN_FOTO_E2E = {
  id: '5eede2e0-0000-4000-8000-0000000000f1',
  varianteId: '5eede2e0-0000-4000-8000-0000000000f2',
  sucursalId: '5eede2e0-0000-4000-8000-0000000000f3',
  handle: 'sin-foto-del-smoke',
  title: 'Producto sin foto del smoke',
} as const;
