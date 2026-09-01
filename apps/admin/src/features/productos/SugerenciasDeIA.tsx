import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { SparklesIcon } from '@/components/iconos';
import { esEditable, type FieldSources } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import { Selector, Tarjeta, TituloDeTarjeta } from '@/components/pagina';
import { ErrorDeIA, enriquecerProducto, type PropuestaDeIA } from '@/lib/ia';
import { formatearAtributos, parsearAtributos } from './esquema';
import { SelectItem } from '@/components/ui/select';

/** El borrador que hay en pantalla, incluidos los cambios sin guardar. */
export interface BorradorParaIA {
  title: string;
  description?: string;
  brand?: string;
  categoria?: string;
  variantes: { title: string; atributos: Record<string, string> }[];
  imagenes: string[];
}

export type CampoAplicable = 'title' | 'description' | 'brand' | 'categoryId';

interface VarianteEnPantalla {
  titulo: string;
  atributos: string;
}

/**
 * Lo que la IA propone para un producto.
 *
 * **No escribe nada.** Devuelve una propuesta y cada campo tiene su «Usar», que
 * es un `setValue` sobre el formulario que ya existe; guardar sigue siendo el
 * botón de siempre, con el `admin_save_product` de siempre. La revisión humana
 * que pide el ROADMAP sale de ahí y no de una pantalla de aprobación: no hay
 * ningún camino por el que un dato propuesto llegue a la base sin que alguien lo
 * haya mirado y apretado.
 *
 * Lo que **no** se ofrece aplicar: nada que administre el ERP. Esos campos están
 * deshabilitados en el formulario, pero un `setValue` los cambiaría igual y el
 * producto se guardaría con un valor que nadie escribió y que el próximo sync
 * pisa sin avisar. El ERP conserva autoridad también frente a la IA.
 *
 * Precio, stock, SKU y código de barras no aparecen porque **no se piden**: el
 * esquema estricto de la respuesta no los declara, así que la API no puede
 * devolverlos.
 */
export function SugerenciasDeIA({
  storeId,
  fuentes,
  leer,
  categorias,
  variantes,
  aplicar,
  aplicarAtributos,
}: {
  storeId: string;
  fuentes: FieldSources;
  leer: () => BorradorParaIA;
  categorias: { id: string; nombre: string }[];
  variantes: VarianteEnPantalla[];
  aplicar: (campo: CampoAplicable, valor: string) => void;
  aplicarAtributos: (indice: number, texto: string) => void;
}) {
  const [propuesta, setPropuesta] = useState<PropuestaDeIA | null>(null);

  const pedir = useMutation({
    mutationFn: async () => (await enriquecerProducto(storeId, leer(), categorias)).propuesta,
    onSuccess: setPropuesta,
  });

  const error = pedir.error as ErrorDeIA | null;

  return (
    <Tarjeta sinRelleno>
      <TituloDeTarjeta
        accion={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pedir.isPending}
            onClick={() => pedir.mutate()}
          >
            <SparklesIcon aria-hidden="true" />
            {pedir.isPending ? 'Pensando…' : 'Sugerir con IA'}
          </Button>
        }
      >
        Sugerencias
      </TituloDeTarjeta>

      <div className="flex flex-col gap-4 p-4">
        {error?.codigo === 'sin_credencial' ? (
          <p className="text-muted-foreground text-sm" role="alert">
            Esta tienda todavía no tiene una clave de OpenAI.{' '}
            <Link to="/configuracion" className="underline underline-offset-4">
              Cargala en Configuración
            </Link>{' '}
            para que el Admin pueda proponer fichas.
          </p>
        ) : (
          error && (
            <p className="text-destructive text-sm" role="alert">
              {error.message}
            </p>
          )
        )}

        {!propuesta && !error && (
          <p className="text-muted-foreground text-sm">
            Mira las fotos y los datos cargados, y propone título, descripción, marca, categoría y
            atributos. No propone precio, stock, SKU ni código de barras: esos no los puede saber, y
            un número inventado se descubre cuando alguien compra.
          </p>
        )}

        {propuesta && (
          <Propuesta
            propuesta={propuesta}
            fuentes={fuentes}
            variantes={variantes}
            aplicar={aplicar}
            aplicarAtributos={aplicarAtributos}
          />
        )}
      </div>
    </Tarjeta>
  );
}

function Propuesta({
  propuesta,
  fuentes,
  variantes,
  aplicar,
  aplicarAtributos,
}: {
  propuesta: PropuestaDeIA;
  fuentes: FieldSources;
  variantes: VarianteEnPantalla[];
  aplicar: (campo: CampoAplicable, valor: string) => void;
  aplicarAtributos: (indice: number, texto: string) => void;
}) {
  /*
   * `origen` es el nombre del campo en `field_sources`, que es el de la columna
   * de la base y no el del formulario. Con el del formulario, `categoryId` nunca
   * coincidiría y una categoría del ERP se dejaría pisar.
   */
  const campos = [
    { campo: 'title', origen: 'title', etiqueta: 'Título', valor: propuesta.title },
    {
      campo: 'description',
      origen: 'description',
      etiqueta: 'Descripción',
      valor: propuesta.description,
    },
    { campo: 'brand', origen: 'brand', etiqueta: 'Marca', valor: propuesta.brand },
    {
      campo: 'categoryId',
      origen: 'category_id',
      etiqueta: 'Categoría',
      valor: propuesta.category,
      // La categoría se muestra por nombre y se aplica por id, que es lo que
      // guarda el formulario. Sólo llega si el servidor la encontró entre las de
      // la tienda.
      aplicado: propuesta.categoryId,
    },
  ] as const;

  const ofrecidos = campos.filter((c) => c.valor !== undefined && c.valor !== '');
  const atributos = propuesta.attributes;

  if (ofrecidos.length === 0 && !atributos) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        No propuso ningún cambio: con lo que hay cargado, la ficha ya está bien.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {ofrecidos.map((c) => {
          const aplicable =
            esEditable(fuentes, c.origen) && ('aplicado' in c ? Boolean(c.aplicado) : true);

          return (
            <li key={c.campo} className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">{c.etiqueta}</span>
                <span className="text-sm">{c.valor}</span>
              </span>
              {aplicable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    aplicar(c.campo, 'aplicado' in c && c.aplicado ? c.aplicado : c.valor!)
                  }
                >
                  Usar
                </Button>
              ) : (
                <span className="text-muted-foreground shrink-0 text-xs">Lo administra el ERP</span>
              )}
            </li>
          );
        })}
      </ul>

      {atributos && (
        <AtributosPropuestos
          atributos={atributos}
          variantes={variantes}
          onAplicar={aplicarAtributos}
        />
      )}
    </div>
  );
}

/**
 * Los atributos propuestos, y a qué variante van.
 *
 * Las fotos son del producto y los atributos son de la variante, así que la
 * correspondencia no es automática: la elige quien mira. Con un producto de una
 * sola variante —el caso común de un comercio chico— no hay nada que elegir y el
 * selector no aparece.
 *
 * Se **suman** a lo que la variante ya tiene en vez de reemplazarlo: la IA mira
 * una foto y no sabe el talle.
 */
function AtributosPropuestos({
  atributos,
  variantes,
  onAplicar,
}: {
  atributos: Record<string, string>;
  variantes: VarianteEnPantalla[];
  onAplicar: (indice: number, texto: string) => void;
}) {
  const [destino, setDestino] = useState(0);

  const fusionado = formatearAtributos({
    ...parsearAtributos(variantes[destino]?.atributos ?? ''),
    ...atributos,
  });

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <span className="text-muted-foreground text-xs">Atributos</span>
      <ul className="text-sm">
        {Object.entries(atributos).map(([clave, valor]) => (
          <li key={clave}>
            <span className="text-muted-foreground">{clave}:</span> {valor}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {variantes.length > 1 && (
          <Selector
            value={String(destino)}
            aria-label="A qué variante se aplican"
            onValueChange={(valor) => setDestino(Number(valor))}
          >
            {variantes.map((v, i) => (
              <SelectItem key={i} value={String(i)}>
                {v.titulo || `Variante ${i + 1}`}
              </SelectItem>
            ))}
          </Selector>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onAplicar(destino, fusionado)}
        >
          Usar
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Se suman a los que la variante ya tiene; los repetidos se reemplazan.
      </p>
    </div>
  );
}
