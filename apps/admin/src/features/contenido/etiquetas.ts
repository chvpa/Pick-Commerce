import type { TipoDeSeccion } from '@pick/commerce-core';

/**
 * Cómo se llaman las secciones para el comercio.
 *
 * El nombre técnico y el que ve el operador no son el mismo, y acá se traduce
 * una sola vez. «hero» no le dice nada a nadie fuera de esta pantalla; «banner
 * principal» sí, y es como lo pidió quien lo iba a usar.
 */
export const ETIQUETA_TIPO: Record<TipoDeSeccion, string> = {
  hero: 'Banner principal',
  tiles: 'Avisos',
  products: 'Carrusel de productos',
  categories: 'Categorías',
};

export const AYUDA_TIPO: Record<TipoDeSeccion, string> = {
  hero: 'La pieza grande de arriba, con título, bajada y botón. Con varias se pasan como slides',
  tiles: 'Avisos secundarios, más chicos, en grilla o en carrusel',
  products: 'Los productos de una colección',
  categories: 'La tira de categorías de la tienda',
};

/** El orden de una colección dinámica, en palabras. */
export const ETIQUETA_ORDEN: Partial<Record<string, string>> = {
  relevance: 'orden del catálogo',
  newest: 'novedades',
  'best-selling': 'más vendidos',
  'price-asc': 'precio, menor a mayor',
  'price-desc': 'precio, mayor a menor',
  'title-asc': 'título',
};
