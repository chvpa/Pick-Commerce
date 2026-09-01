import { useQuery } from '@tanstack/react-query';
import { repositorioCatalogo } from '@pick/adapter-supabase';
import { Selector } from '@/components/pagina';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';

/** Lo único que no sale de los datos: la vitrina entera. */
const CATALOGO = '/catalogo';

/** Rótulos de las facetas que el catálogo expone por nombre técnico. */
const NOMBRE_DE_FACETA: Readonly<Record<string, string>> = {
  categoria: 'Categorías',
  brand: 'Marcas',
};

/**
 * A dónde lleva un slide o un aviso.
 *
 * Antes era un campo de texto libre con `/catalogo?categoria=calzado` de
 * ejemplo: había que conocer la forma de la URL, escribirla sin equivocarse y
 * acordarse del slug exacto. Un destino mal escrito no falla —lleva a un
 * catálogo vacío— así que el error se descubre navegando.
 *
 * **Los destinos salen de las facetas reales del catálogo**, que es lo mismo que
 * la tienda ofrece para filtrar: categorías, marcas y los atributos que el
 * comercio declaró filtrables —color, talle, género, lo que tenga—. No hay una
 * lista inventada de «presets»: si una tienda no vende por género, no aparece la
 * opción, y si mañana declara uno nuevo aparece solo.
 *
 * Queda el texto libre para lo que no sea eso —una promoción, una página—,
 * porque la lista cubre lo habitual y no todo.
 */
export function SelectorDeDestino({
  id,
  valor,
  onChange,
}: {
  id: string;
  valor: string;
  onChange: (href: string) => void;
}) {
  const tienda = useTiendaActiva();

  /*
   * Una sola fila: lo que interesa son las facetas, que el RPC calcula sobre el
   * catálogo entero y no sobre la página. Pedir productos sería traer datos para
   * tirarlos.
   */
  const facetas = useQuery({
    queryKey: ['facetas-destino', tienda.id],
    queryFn: () => repositorioCatalogo(db).buscar(tienda.id, { perPage: 1 }),
    staleTime: 5 * 60_000,
  });

  const opciones = (facetas.data?.facets ?? []).flatMap((f) =>
    f.values.map((v) => ({
      grupo: NOMBRE_DE_FACETA[f.name] ?? f.name,
      etiqueta: v.value,
      href: `${CATALOGO}?${encodeURIComponent(f.name)}=${encodeURIComponent(v.value)}`,
    })),
  );

  const porGrupo = new Map<string, typeof opciones>();
  for (const o of opciones) porGrupo.set(o.grupo, [...(porGrupo.get(o.grupo) ?? []), o]);

  const conocido = valor === '' || valor === CATALOGO || opciones.some((o) => o.href === valor);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>A dónde lleva</Label>
      <Selector
        id={id}
        // Un destino que no está en la lista selecciona «otra dirección» y deja
        // el campo de texto a la vista con lo que ya tenía: editar algo escrito
        // a mano no puede borrarlo.
        value={conocido ? valor : 'otra'}
        onValueChange={(elegido) => onChange(elegido === 'otra' ? valor || '/' : elegido)}
      >
        <SelectItem value="">A ningún lado</SelectItem>
        <SelectItem value={CATALOGO}>Catálogo completo</SelectItem>
        {[...porGrupo].map(([grupo, items]) => (
          <SelectGroup key={grupo}>
            <SelectLabel>{grupo}</SelectLabel>
            {items.map((o) => (
              <SelectItem key={o.href} value={o.href}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        <SelectItem value="otra">Otra dirección…</SelectItem>
      </Selector>

      {!conocido && (
        <Input
          value={valor}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder="/catalogo?color=Negro"
          aria-label="Dirección"
        />
      )}

      <span className="text-muted-foreground text-xs">
        {facetas.isPending
          ? 'Buscando las categorías y marcas de la tienda…'
          : 'Las opciones salen de lo que el catálogo puede filtrar. Sin destino, el bloque no es un enlace.'}
      </span>
    </div>
  );
}
