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

/**
 * Una descripción propuesta por la IA, esperando revisión (v2 Fase 8).
 *
 * Cuelga del mismo producto que la propuesta de foto: son tablas distintas y no
 * se estorban, y sembrar un producto más sería sembrar por sembrar. El texto se
 * siembra en vez de pedírselo a OpenAI por el mismo motivo que la foto: llamar
 * en cada corrida gastaría la clave del comercio y mediría que su API contesta,
 * que no es lo que este smoke cuida.
 */
export const DESCRIPCION_E2E = {
  propuestaId: '5eede2e0-0000-4000-8000-0000000000f7',
  texto: 'Zapatilla urbana de caña baja, liviana y con suela de goma. Del smoke.',
} as const;

/**
 * Un producto **con** foto y una propuesta de la IA esperando revisión, para el
 * smoke de «Fotos con fondo limpio» (v2 Fase 5). Las dos URLs son fotos reales
 * del seed: la pantalla las muestra lado a lado y tienen que cargar.
 */
export const PROPUESTA_E2E = {
  productoId: '5eede2e0-0000-4000-8000-0000000000f4',
  varianteId: '5eede2e0-0000-4000-8000-0000000000f5',
  propuestaId: '5eede2e0-0000-4000-8000-0000000000f6',
  handle: 'con-propuesta-del-smoke',
  title: 'Producto con propuesta del smoke',
  original:
    'https://snnbkqesjiooejaccqhg.supabase.co/storage/v1/object/public/product-media/5eed0000-0000-4000-8000-000000000001/seed/zapatilla.jpg',
  propuesta:
    'https://snnbkqesjiooejaccqhg.supabase.co/storage/v1/object/public/product-media/5eed0000-0000-4000-8000-000000000001/seed/campera.jpg',
} as const;
