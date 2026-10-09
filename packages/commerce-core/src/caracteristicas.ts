import { slugify } from './admin-catalog.ts';

/**
 * Las características de los productos (ADR-161): lo que los describe, filtra el
 * catálogo y arma las variantes.
 */

export type TipoDeCaracteristica = 'options' | 'color' | 'text';

export const TIPOS_DE_CARACTERISTICA: readonly TipoDeCaracteristica[] = [
  'options',
  'color',
  'text',
];

export const ETIQUETA_TIPO_DE_CARACTERISTICA: Readonly<Record<TipoDeCaracteristica, string>> = {
  options: 'Opciones',
  color: 'Color',
  text: 'Texto',
};

export interface Caracteristica {
  readonly id: string;
  /** La clave en `product_variants.attributes` y en la URL. No cambia. */
  readonly name: string;
  readonly label: string;
  readonly kind: TipoDeCaracteristica;
  readonly options: readonly string[];
  readonly filterable: boolean;
  readonly forVariants: boolean;
  readonly required: boolean;
  readonly position: number;
}

/**
 * Lo que se escribió o se pegó, como opciones nuevas: separadas por coma o por
 * renglón, sin espacios de más y sin repetir lo que ya está —sin distinguir
 * mayúsculas: «azul» y «Azul» son la misma opción para quien filtra—.
 */
export function agregarOpciones(actuales: readonly string[], texto: string): string[] {
  const vistas = new Set(actuales.map((o) => o.toLocaleLowerCase('es')));
  const nuevas: string[] = [];
  for (const crudo of texto.split(/[,\n]/)) {
    const opcion = crudo.trim();
    const clave = opcion.toLocaleLowerCase('es');
    if (opcion === '' || vistas.has(clave)) continue;
    vistas.add(clave);
    nuevas.push(opcion);
  }
  return [...actuales, ...nuevas];
}

/** La clave de una característica nueva: el nombre en minúsculas, y única en la tienda. */
export function claveDeCaracteristica(label: string, existentes: readonly string[]): string {
  const base = slugify(label).replace(/-/g, '_') || 'caracteristica';
  if (!existentes.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidata = `${base}_${n}`;
    if (!existentes.includes(candidata)) return candidata;
  }
}
