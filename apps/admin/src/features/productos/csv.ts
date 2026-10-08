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

/** Las columnas sin las que una fila no se puede leer. La pantalla las marca. */
export const OBLIGATORIAS: readonly (typeof COLUMNAS)[number][] = [
  'handle',
  'titulo',
  'sku',
  'variante',
  'precio',
];

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

/** Una fila del archivo como la ve la revisión: lo que dice y si entra. */
export interface FilaRevisada {
  readonly linea: number;
  readonly handle: string;
  readonly sku: string;
  readonly titulo: string;
  readonly precio: string;
  readonly stock: string;
  /** Por qué no entra. Sin motivo, la fila se importa. */
  readonly motivo?: string;
}

export interface Preparado {
  readonly productos: readonly ProductoEditable[];
  readonly errores: readonly ErrorFila[];
  /** Cada fila con contenido, en el orden del archivo. */
  readonly filas: readonly FilaRevisada[];
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
    /**
     * La sucursal a la que va la columna `stock`. Un archivo plano no puede
     * traerla: tiene una columna de stock y punto, así que la elige la pantalla.
     */
    readonly sucursalId?: string;
  },
): Preparado {
  const errores: ErrorFila[] = [];
  const porHandle = new Map<
    string,
    { producto: ProductoEditable; variantes: VarianteEditable[]; lineas: number[] }
  >();

  // Una fila totalmente vacía es el final del archivo, no un error.
  const vacia = (cruda: Partial<Fila>) =>
    Object.values(cruda).every((v) => (v ?? '').trim() === '');

  filas.forEach((cruda, i) => {
    // +2: la línea 1 es el encabezado y las planillas cuentan desde 1.
    const linea = i + 2;
    const handle = (cruda.handle ?? '').trim();

    if (vacia(cruda)) return;

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
      ...(f.stock === undefined
        ? {}
        : opciones.sucursalId
          ? { stockPorSucursal: { [opciones.sucursalId]: f.stock } }
          : { stock: f.stock }),
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
      existente.lineas.push(linea);
      return;
    }

    porHandle.set(f.handle, {
      lineas: [linea],
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

  /*
   * Un producto con una fila rechazada no entra entero, ni siquiera con sus
   * filas buenas. Para uno que ya existe el archivo manda: `admin_save_product`
   * borra las variantes que no vienen, así que importar las buenas y saltear la
   * mala borraba la variante de la fila mala por un error de tipeo (ADR-154).
   */
  const primeraMala = new Map<string, number>();
  for (const e of errores) {
    if (!primeraMala.has(e.handle)) primeraMala.set(e.handle, e.linea);
  }
  for (const [handle, mala] of primeraMala) {
    const grupo = porHandle.get(handle);
    if (!grupo) continue;
    for (const linea of grupo.lineas) {
      errores.push({
        linea,
        handle,
        motivo: `no se importa: la línea ${mala} de este producto tiene errores`,
      });
    }
    porHandle.delete(handle);
  }
  errores.sort((a, b) => a.linea - b.linea);

  const productos = [...porHandle.values()].map(({ producto, variantes }): ProductoEditable => ({
    ...producto,
    variants: variantes,
  }));

  const motivos = new Map<number, string[]>();
  for (const e of errores) motivos.set(e.linea, [...(motivos.get(e.linea) ?? []), e.motivo]);

  const revisadas = filas.flatMap((cruda, i): FilaRevisada[] => {
    if (vacia(cruda)) return [];
    const linea = i + 2;
    const motivo = motivos.get(linea);
    return [
      {
        linea,
        handle: (cruda.handle ?? '').trim(),
        sku: (cruda.sku ?? '').trim(),
        titulo: (cruda.titulo ?? '').trim(),
        precio: (cruda.precio ?? '').trim(),
        stock: (cruda.stock ?? '').trim(),
        ...(motivo ? { motivo: motivo.join('; ') } : {}),
      },
    ];
  });

  return {
    productos,
    errores,
    filas: revisadas,
    nuevos: productos.filter((p) => !opciones.existentes.has(p.handle)).length,
    existentes: productos.filter((p) => opciones.existentes.has(p.handle)).length,
  };
}

/**
 * El stock de la sucursal elegida, o el total si no se eligió ninguna.
 *
 * Una variante sin fila en esa sucursal exporta `0` y no vacío: vacío significa
 * «no digo nada del stock» y dejaría el número anterior al reimportar, que no es
 * lo que muestra la pantalla.
 */
function stockExportado(v: VarianteEditable, sucursalId?: string): string {
  if (sucursalId) return String(v.stockPorSucursal?.[sucursalId] ?? 0);
  return v.stock === undefined ? '' : String(v.stock);
}

/**
 * Filas de export: una por variante, con los datos del producto repetidos.
 *
 * `sucursalId` es la misma que elige el import, y por eso hace falta: sin ella la
 * columna `stock` sería la suma de las sucursales, y reimportar ese archivo
 * metería la suma en una sola. El archivo que sale y el que entra tienen que
 * hablar de lo mismo.
 */
export function filasDe(
  productos: readonly ProductoEditable[],
  categorias: ReadonlyMap<string, string>,
  sucursalId?: string,
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
      stock: stockExportado(v, sucursalId),
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
