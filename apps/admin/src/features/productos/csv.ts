import { z } from 'zod';
import { money, slugify, toMajorUnits } from '@pick/commerce-core';
import type { ProductoEditable, VarianteEditable } from '@pick/commerce-core';
import type { ProductStatus } from '@pick/commerce-types';

/**
 * Traducción entre el CSV y el catálogo.
 *
 * **Una fila es una variante**, agrupadas por handle: es la forma que usan las
 * plataformas de comercio y la única que permite representar un producto con
 * varias combinaciones en un archivo plano.
 *
 * Vive en el Admin y no en el Core porque es una función del Admin, y porque el
 * Core no depende de Zod. Reusa las mismas reglas que el formulario: si las
 * validaciones vivieran en dos lados, el CSV aceptaría lo que el formulario
 * rechaza y el catálogo terminaría con datos que nadie revisó.
 */

export const COLUMNAS = [
  'handle',
  'titulo',
  'descripcion',
  'marca',
  'categoria',
  'estado',
  'sku',
  'variante',
  'precio',
  'precio_anterior',
  'costo',
  'stock',
  'atributos',
  'codigo_barras',
] as const;

export type Fila = Record<(typeof COLUMNAS)[number], string>;

/**
 * El archivo no lleva imágenes.
 *
 * Un medio necesita ancho y alto —son obligatorios contra CLS, ADR-034— y quien
 * escribe una planilla no los tiene. Importar sin la clave `media` deja las
 * imágenes existentes intactas; se cargan desde el formulario.
 */
const ESTADOS: Record<string, ProductStatus> = {
  borrador: 'draft',
  publicado: 'active',
  pausado: 'inactive',
  archivado: 'archived',
  draft: 'draft',
  active: 'active',
  inactive: 'inactive',
  archived: 'archived',
};

const ETIQUETA_CSV: Record<ProductStatus, string> = {
  draft: 'borrador',
  active: 'publicado',
  inactive: 'pausado',
  archived: 'archivado',
};

/** `color: Azul | talle: M`. Con barra y no con salto de línea: en un CSV el salto obliga a comillas. */
export function parsearAtributosCsv(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const par of texto.split('|')) {
    const corte = par.indexOf(':');
    if (corte === -1) continue;
    const clave = par.slice(0, corte).trim();
    const valor = par.slice(corte + 1).trim();
    if (clave !== '' && valor !== '') salida[clave] = valor;
  }
  return salida;
}

function formatearAtributosCsv(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ');
}

const numero = (nombre: string) =>
  z
    .string()
    .trim()
    .min(1, `${nombre} es obligatorio`)
    .transform((v) => Number(v.replace(/\./g, '').replace(',', '.')))
    .refine((v) => Number.isFinite(v) && v >= 0, `${nombre} tiene que ser un número`);

const numeroOpcional = (nombre: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : Number(v.replace(/\./g, '').replace(',', '.'))))
    .refine(
      (v) => v === undefined || (Number.isFinite(v) && v >= 0),
      `${nombre} tiene que ser un número`,
    );

const filaSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(1, 'handle es obligatorio')
    .refine((v) => v === slugify(v), 'handle sólo admite minúsculas, números y guiones'),
  titulo: z.string().trim().min(1, 'titulo es obligatorio'),
  descripcion: z.string().trim().optional(),
  marca: z.string().trim().optional(),
  categoria: z.string().trim().optional(),
  estado: z
    .string()
    .trim()
    .transform((v) => (v === '' ? 'draft' : ESTADOS[v.toLowerCase()]))
    .refine((v): v is ProductStatus => v !== undefined, 'estado desconocido'),
  sku: z.string().trim().min(1, 'sku es obligatorio'),
  variante: z.string().trim().min(1, 'variante es obligatoria'),
  precio: numero('precio'),
  precio_anterior: numeroOpcional('precio_anterior'),
  costo: numeroOpcional('costo'),
  stock: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : Number(v)))
    // Sin mínimo: el stock es un espejo del ERP y puede venir negativo (ADR-056).
    .refine((v) => v === undefined || Number.isInteger(v), 'stock tiene que ser un número entero'),
  atributos: z.string().optional(),
  codigo_barras: z.string().trim().optional(),
});

export interface ErrorFila {
  /** Número de línea del archivo, contando el encabezado. Es lo que el operador ve en su planilla. */
  readonly linea: number;
  readonly handle: string;
  readonly motivo: string;
}

export interface Preparado {
  readonly productos: readonly ProductoEditable[];
  readonly errores: readonly ErrorFila[];
  /** Cuántos productos se crearían y cuántos se actualizarían. */
  readonly nuevos: number;
  readonly existentes: number;
}

/**
 * Valida y agrupa las filas.
 *
 * **No escribe nada**: devuelve lo que se importaría y lo que se rechazaría, que
 * es lo que el preview muestra. Una fila inválida no tumba el archivo — se
 * descarta esa fila y el resto sigue.
 */
export function prepararImport(
  filas: readonly Partial<Fila>[],
  opciones: {
    /** slug → id. Una categoría desconocida es un error de la fila, no un silencio. */
    readonly categorias: ReadonlyMap<string, string>;
    /** Handles que ya existen en la tienda, para decir qué se crea y qué se actualiza. */
    readonly existentes: ReadonlySet<string>;
    readonly moneda: string;
  },
): Preparado {
  const errores: ErrorFila[] = [];
  const porHandle = new Map<
    string,
    { producto: ProductoEditable; variantes: VarianteEditable[] }
  >();

  filas.forEach((cruda, i) => {
    // +2: la línea 1 es el encabezado y las planillas cuentan desde 1.
    const linea = i + 2;
    const handle = (cruda.handle ?? '').trim();

    // Una fila totalmente vacía es el final del archivo, no un error.
    if (Object.values(cruda).every((v) => (v ?? '').trim() === '')) return;

    const parseada = filaSchema.safeParse({
      handle: cruda.handle ?? '',
      titulo: cruda.titulo ?? '',
      descripcion: cruda.descripcion ?? '',
      marca: cruda.marca ?? '',
      categoria: cruda.categoria ?? '',
      estado: cruda.estado ?? '',
      sku: cruda.sku ?? '',
      variante: cruda.variante ?? '',
      precio: cruda.precio ?? '',
      precio_anterior: cruda.precio_anterior ?? '',
      costo: cruda.costo ?? '',
      stock: cruda.stock ?? '',
      atributos: cruda.atributos ?? '',
      codigo_barras: cruda.codigo_barras ?? '',
    });

    if (!parseada.success) {
      for (const problema of parseada.error.issues) {
        errores.push({ linea, handle, motivo: problema.message });
      }
      return;
    }

    const f = parseada.data;

    let categoryId: string | undefined;
    if (f.categoria) {
      categoryId = opciones.categorias.get(f.categoria);
      if (!categoryId) {
        errores.push({ linea, handle, motivo: `la categoría «${f.categoria}» no existe` });
        return;
      }
    }

    const variante: VarianteEditable = {
      sku: f.sku,
      title: f.variante,
      ...(f.codigo_barras ? { barcode: f.codigo_barras } : {}),
      price: money(f.precio, opciones.moneda as 'PYG').amount,
      currency: opciones.moneda,
      ...(f.precio_anterior === undefined
        ? {}
        : { compareAtPrice: money(f.precio_anterior, opciones.moneda as 'PYG').amount }),
      ...(f.costo === undefined ? {} : { cost: money(f.costo, opciones.moneda as 'PYG').amount }),
      attributes: parsearAtributosCsv(f.atributos ?? ''),
      ...(f.stock === undefined ? {} : { stock: f.stock }),
    };

    const existente = porHandle.get(f.handle);
    if (existente) {
      // Los datos del producto los fija la primera fila de su handle: repetirlos
      // en cada fila es inevitable en un archivo plano, y hacer ganar a la última
      // dejaría el resultado dependiendo del orden.
      if (existente.variantes.some((v) => v.sku === f.sku)) {
        errores.push({ linea, handle, motivo: `el SKU ${f.sku} está repetido en el archivo` });
        return;
      }
      existente.variantes.push(variante);
      return;
    }

    porHandle.set(f.handle, {
      producto: {
        handle: f.handle,
        title: f.titulo,
        ...(f.descripcion ? { description: f.descripcion } : {}),
        ...(f.marca ? { brand: f.marca } : {}),
        ...(categoryId ? { categoryId } : {}),
        status: f.estado,
        variants: [],
        // Sin la clave `media`: importar no toca las imágenes que ya tenga.
      },
      variantes: [variante],
    });
  });

  const productos = [...porHandle.values()].map(({ producto, variantes }): ProductoEditable => ({
    ...producto,
    variants: variantes,
  }));

  return {
    productos,
    errores,
    nuevos: productos.filter((p) => !opciones.existentes.has(p.handle)).length,
    existentes: productos.filter((p) => opciones.existentes.has(p.handle)).length,
  };
}

/** Filas de export: una por variante, con los datos del producto repetidos. */
export function filasDe(
  productos: readonly ProductoEditable[],
  categorias: ReadonlyMap<string, string>,
): Fila[] {
  return productos.flatMap((p) =>
    p.variants.map((v) => ({
      handle: p.handle,
      titulo: p.title,
      descripcion: p.description ?? '',
      marca: p.brand ?? '',
      categoria: p.categoryId ? (categorias.get(p.categoryId) ?? '') : '',
      estado: ETIQUETA_CSV[p.status],
      sku: v.sku,
      variante: v.title,
      precio: String(toMajorUnits({ amount: v.price, currency: v.currency as 'PYG' })),
      precio_anterior:
        v.compareAtPrice === undefined
          ? ''
          : String(toMajorUnits({ amount: v.compareAtPrice, currency: v.currency as 'PYG' })),
      costo:
        v.cost === undefined
          ? ''
          : String(toMajorUnits({ amount: v.cost, currency: v.currency as 'PYG' })),
      stock: v.stock === undefined ? '' : String(v.stock),
      atributos: formatearAtributosCsv(v.attributes),
      codigo_barras: v.barcode ?? '',
    })),
  );
}

/** Plantilla con una fila de ejemplo por cada forma que hay que saber escribir. */
export const FILAS_PLANTILLA: Fila[] = [
  {
    handle: 'campera-cortaviento',
    titulo: 'Campera cortaviento',
    descripcion: 'Liviana y resistente al viento.',
    marca: 'Norte',
    categoria: 'camperas',
    estado: 'publicado',
    sku: 'NRT-CAM-001-AZ-M',
    variante: 'Azul / M',
    precio: '389000',
    precio_anterior: '550000',
    costo: '',
    stock: '4',
    atributos: 'color: Azul | size: M',
    codigo_barras: '',
  },
  {
    // Misma fila de producto, otra variante: así se cargan las combinaciones.
    handle: 'campera-cortaviento',
    titulo: 'Campera cortaviento',
    descripcion: 'Liviana y resistente al viento.',
    marca: 'Norte',
    categoria: 'camperas',
    estado: 'publicado',
    sku: 'NRT-CAM-001-NE-M',
    variante: 'Negro / M',
    precio: '410000',
    precio_anterior: '',
    costo: '',
    stock: '2',
    atributos: 'color: Negro | size: M',
    codigo_barras: '',
  },
];
