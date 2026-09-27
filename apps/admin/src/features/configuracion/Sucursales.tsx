import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioTiendas } from '@pick/adapter-supabase';
import type { Sucursal, TiendaResumen } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EstadoDeError } from '@/components/pagina';
import { usePuede } from '@/features/auth/usePuede';
import { db } from '@/lib/supabase';

/**
 * Las sucursales de la tienda, con lo que hay guardado en cada una.
 *
 * Existe porque el stock **vive en una sucursal** y hasta hoy el Admin no tenía
 * dónde verlas: `admin_save_product` elegía la primera y el formulario leía la
 * suma de todas, así que con dos depósitos el ajuste iba al que no era y cada
 * guardado inflaba el total. Tres hallazgos del backlog, el más viejo de
 * 2026-08-26.
 *
 * `negativos` está a la vista por el tercero: en la suma, un -2 en una sucursal
 * y un 5 en otra son 3, y el descuadre —que es justo lo que el espejo del ERP
 * existe para mostrar (ADR-009)— desaparecía.
 *
 * **Borrar no está**, y no es un olvido: `inventory_levels` cuelga de la
 * sucursal con `on delete cascade`, así que borrarla se llevaría su stock sin
 * decirlo, y a dónde va ese stock no lo contesta una pantalla.
 */
export function Sucursales({ tienda }: { tienda: TiendaResumen }) {
  const cliente = useQueryClient();
  const puede = usePuede();
  const [nueva, setNueva] = useState('');

  const clave = ['sucursales', tienda.id];

  const consulta = useQuery({
    queryKey: clave,
    queryFn: () => repositorioTiendas(db).sucursales(tienda.id),
  });

  const refrescar = async () => {
    await cliente.invalidateQueries({ queryKey: clave });
    // El stock por sucursal viaja con el producto: una sucursal nueva cambia lo
    // que las tres pantallas de carga tienen que preguntar.
    await cliente.invalidateQueries({ queryKey: ['producto', tienda.id] });
  };

  const crear = useMutation({
    mutationFn: (nombre: string) =>
      repositorioTiendas(db).crearSucursal(tienda.tenantId, tienda.id, nombre),
    onSuccess: async () => {
      setNueva('');
      await refrescar();
    },
  });

  const renombrar = useMutation({
    mutationFn: ({ id, nombre }: { id: string; nombre: string }) =>
      repositorioTiendas(db).renombrarSucursal(tienda.id, id, nombre),
    onSuccess: refrescar,
  });

  const administra = puede('store.manage');
  const fallo = (crear.error ?? renombrar.error) as Error | null;

  if (consulta.isError) {
    return (
      <EstadoDeError
        titulo="No se pudieron leer las sucursales"
        error={consulta.error as Error}
        onReintentar={() => void consulta.refetch()}
      />
    );
  }

  const sucursales = consulta.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {consulta.isPending ? (
        <div className="bg-muted h-16 animate-pulse rounded-lg" />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Sucursales">
          {sucursales.map((s) => (
            <Fila
              key={s.id}
              sucursal={s}
              editable={administra}
              pendiente={renombrar.isPending}
              onRenombrar={(nombre) => renombrar.mutate({ id: s.id, nombre })}
            />
          ))}
        </ul>
      )}

      {administra && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const nombre = nueva.trim();
            if (nombre !== '') crear.mutate(nombre);
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">Nueva sucursal</span>
            <Input
              value={nueva}
              placeholder="Depósito, Local del centro…"
              onChange={(e) => setNueva(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={crear.isPending || nueva.trim() === ''}>
            {crear.isPending ? 'Creando…' : 'Agregar'}
          </Button>
        </form>
      )}

      <p className="text-muted-foreground text-sm">
        El stock se carga por sucursal. Con más de una, la ficha del producto, el alta con la cámara
        y el import de CSV preguntan a cuál va.
      </p>

      {fallo && (
        <p className="text-destructive text-sm" role="alert">
          {fallo.message}
        </p>
      )}
    </div>
  );
}

/** Una sucursal: el nombre se edita en el lugar, el stock se mira. */
function Fila({
  sucursal,
  editable,
  pendiente,
  onRenombrar,
}: {
  sucursal: Sucursal;
  editable: boolean;
  pendiente: boolean;
  onRenombrar: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(sucursal.name);
  const cambiado = nombre.trim() !== '' && nombre.trim() !== sucursal.name;

  return (
    <li className="border-border flex flex-wrap items-center gap-3 rounded-lg border p-3">
      {editable ? (
        <Input
          className="min-w-40 flex-1"
          value={nombre}
          aria-label={`Nombre de ${sucursal.name}`}
          onChange={(e) => setNombre(e.target.value)}
        />
      ) : (
        <span className="min-w-40 flex-1 text-sm font-medium">{sucursal.name}</span>
      )}

      <span className="text-muted-foreground text-sm tabular-nums">
        {sucursal.unidades} {sucursal.unidades === 1 ? 'unidad' : 'unidades'}
      </span>

      {/*
        El negativo no se puede sumar con el positivo de otra sucursal: ahí es
        donde se esconde un descuadre del espejo del ERP.
      */}
      {sucursal.negativos > 0 && (
        <span className="text-destructive text-sm">{sucursal.negativos} en negativo</span>
      )}

      {editable && cambiado && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendiente}
          onClick={() => onRenombrar(nombre.trim())}
        >
          Guardar nombre
        </Button>
      )}
    </li>
  );
}
