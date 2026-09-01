import { useQuery } from '@tanstack/react-query';
import { repositorioContenido } from '@pick/adapter-supabase';
import { Selector } from '@/components/pagina';
import { Label } from '@/components/ui/label';
import { BotonDeIcono, ControlDeOrden } from '@/components/acciones';
import { XIcon } from '@/components/iconos';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';
import { SelectItem } from '@/components/ui/select';

/**
 * Qué categorías muestra la sección, y en qué orden.
 *
 * Antes no se elegía: la tira mostraba **todas**, así que una tienda con
 * cuarenta categorías —las que trae un ERP— publicaba las cuarenta en la
 * portada. Y el orden salía de un número que se escribía en cada categoría, lo
 * que obligaba a abrirlas de a una para reordenar la portada.
 *
 * Las dos decisiones son de la sección y viven acá: la lista elegida, en su
 * orden, se guarda en `settings.categoryIds`.
 *
 * **Vacío significa todas.** No es un descuido: es lo que hace que las secciones
 * que ya existían sigan mostrando lo mismo, y una tira vacía no sería un estado
 * que alguien quiera guardar.
 */
export function SelectorDeCategorias({
  seleccion,
  onChange,
}: {
  seleccion: readonly string[];
  onChange: (ids: readonly string[]) => void;
}) {
  const tienda = useTiendaActiva();

  const todas = useQuery({
    queryKey: ['categorias', tienda.id],
    queryFn: () => repositorioContenido(db).categorias(tienda.id),
  });

  const catalogo = todas.data ?? [];
  const nombreDe = new Map(catalogo.map((c) => [c.id, c.name]));

  // Los ids que quedaron apuntando a una categoría borrada no se muestran, y al
  // guardar se van: la sección no arrastra restos.
  const elegidas = seleccion.filter((id) => nombreDe.has(id));
  const disponibles = catalogo.filter((c) => !elegidas.includes(c.id));

  function mover(desde: number, hacia: number): void {
    const copia = [...elegidas];
    const [x] = copia.splice(desde, 1);
    if (x) copia.splice(hacia, 0, x);
    onChange(copia);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="agregar-categoria">Categorías que muestra</Label>

      {elegidas.length === 0 ? (
        <p className="bg-muted/40 border-border text-muted-foreground rounded-lg border p-3 text-sm">
          Sin elegir ninguna, la portada muestra <strong>todas</strong> las categorías
          {catalogo.length > 0 && ` (${catalogo.length})`}. Elegí las que quieras destacar.
        </p>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {elegidas.map((id, i) => (
            <li key={id} className="flex items-center gap-2 px-3 py-2">
              <ControlDeOrden
                nombre={nombreDe.get(id) ?? ''}
                primero={i === 0}
                ultimo={i === elegidas.length - 1}
                onSubir={() => mover(i, i - 1)}
                onBajar={() => mover(i, i + 1)}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{nombreDe.get(id)}</span>
              <BotonDeIcono
                etiqueta={`Quitar ${nombreDe.get(id) ?? ''}`}
                icono={XIcon}
                onClick={() => onChange(elegidas.filter((x) => x !== id))}
              />
            </li>
          ))}
        </ul>
      )}

      <Selector
        id="agregar-categoria"
        value=""
        disabled={disponibles.length === 0}
        onValueChange={(id) => {
          if (id) onChange([...elegidas, id]);
        }}
      >
        <SelectItem value="">
          {disponibles.length === 0 ? 'Ya están todas' : 'Agregar una categoría…'}
        </SelectItem>
        {disponibles.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </Selector>
    </div>
  );
}
