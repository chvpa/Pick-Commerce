import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { repositorioPromociones } from '@pick/adapter-supabase';
import { esDeCatalogo, formatMoney, type Promotion } from '@pick/commerce-core';
import { PercentIcon } from '@/components/iconos';
import {
  Esqueleto,
  EstadoDeError,
  EstadoVacio,
  Paginacion,
  PaginaAdmin,
  Tarjeta,
} from '@/components/pagina';
import { Switch } from '@/components/ui/switch';
import { BorrarConConfirmacion, EnlaceDeEdicion } from '@/components/acciones';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePuede } from '@/features/auth/usePuede';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

const POR_PAGINA = 20;

function descuento(p: Promotion, locale: string): string {
  return p.discountType === 'percentage'
    ? `${p.discountValue / 100} %`
    : formatMoney({ amount: p.discountValue, currency: 'PYG' }, locale);
}

function alcance(p: Promotion): string {
  switch (p.target.kind) {
    case 'all':
      return 'Todo el catálogo';
    case 'category':
      return `${p.target.ids.length} categoría${p.target.ids.length === 1 ? '' : 's'}`;
    case 'collection':
      return `${p.target.ids.length} colección${p.target.ids.length === 1 ? '' : 'es'}`;
    case 'product':
      return `${p.target.ids.length} producto${p.target.ids.length === 1 ? '' : 's'}`;
  }
}

function vigencia(p: Promotion, locale: string): string {
  const corta = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });

  if (p.startsAt && p.endsAt) return `${corta(p.startsAt)} – ${corta(p.endsAt)}`;
  if (p.endsAt) return `hasta ${corta(p.endsAt)}`;
  if (p.startsAt) return `desde ${corta(p.startsAt)}`;
  return 'Sin límite';
}

/**
 * Las campañas de descuento de la tienda.
 *
 * La columna «Dónde se ve» no es decorativa: una promoción con mínimo de compra
 * o con cupón **no aparece en el catálogo**, porque sin carrito no hay subtotal
 * contra el que evaluarla. Decirlo acá evita la pregunta de por qué la promo que
 * acaban de crear no se ve en la vidriera.
 */
export function ListaPromociones() {
  const tienda = useTiendaActiva();
  const puede = usePuede();
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: ['promociones', tienda.id, page],
    queryFn: () => repositorioPromociones(db).listar(tienda.id, { page, perPage: POR_PAGINA }),
    placeholderData: keepPreviousData,
  });

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['promociones', tienda.id] });

  const estado = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Promotion['status'] }) =>
      repositorioPromociones(db).cambiarEstado(tienda.id, id, status),
    onSuccess: refrescar,
  });

  const borrar = useMutation({
    mutationFn: (id: string) => repositorioPromociones(db).borrar(tienda.id, id),
    onSuccess: refrescar,
  });

  const datos = consulta.data;

  return (
    <PaginaAdmin
      titulo="Promociones"
      icono={PercentIcon}
      descripcion="Bajan el precio sin tocar el catálogo. El descuento se calcula en el servidor."
      acciones={
        puede('promotion.write') && (
          <Link to="/promociones/nueva" className={buttonVariants({ size: 'lg' })}>
            Nueva promoción
          </Link>
        )
      }
    >
      {/*
        Un fallo del interruptor o del tacho no puede quedar en silencio: la
        lista se refresca sola y parecería que no pasó nada.
      */}
      {(estado.error ?? borrar.error) && (
        <p className="text-destructive text-sm" role="alert">
          {((estado.error ?? borrar.error) as Error).message}
        </p>
      )}

      <Tarjeta sinRelleno>
        {consulta.isError ? (
          <EstadoDeError
            titulo="No se pudieron cargar las promociones"
            error={consulta.error as Error}
            onReintentar={() => void consulta.refetch()}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promoción</TableHead>
                  <TableHead className="w-28 text-right">Descuento</TableHead>
                  <TableHead className="w-44">Alcance</TableHead>
                  <TableHead className="w-36">Dónde se ve</TableHead>
                  <TableHead className="w-44">Vigencia</TableHead>
                  <TableHead className="w-20 text-right">Usos</TableHead>
                  {/*
                  El interruptor y las acciones al final, juntos: es donde el ojo
                  termina de leer la fila y donde se actúa sobre ella. El estado
                  ya no lleva además una etiqueta — el interruptor **es** el
                  estado, y repetirlo al lado era decir dos veces lo mismo
                  ocupando la columna más ancha de la tabla.
                */}
                  <TableHead className="w-24 text-right">Activa</TableHead>
                  <TableHead className="w-28 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.isPending ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <Esqueleto />
                    </TableCell>
                  </TableRow>
                ) : datos && datos.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <EstadoVacio
                        titulo="Todavía no hay promociones"
                        accion={
                          puede('promotion.write') && (
                            <Link
                              to="/promociones/nueva"
                              className={buttonVariants({ size: 'lg' })}
                            >
                              Nueva promoción
                            </Link>
                          )
                        }
                      >
                        {puede('promotion.write')
                          ? 'Una campaña baja el precio de lo que elijas sin tocar el catálogo, y se puede apagar cuando quieras.'
                          : 'Tu rol no incluye crearlas.'}
                      </EstadoVacio>
                    </TableCell>
                  </TableRow>
                ) : (
                  datos?.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          to="/promociones/$id"
                          params={{ id: p.id }}
                          className="flex flex-col gap-0.5 hover:underline"
                        >
                          <span className="font-medium">{p.title}</span>
                          {p.code ? (
                            <span className="text-muted-foreground font-mono text-xs">
                              {p.code}
                            </span>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {descuento(p, tienda.locale)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{alcance(p)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {esDeCatalogo(p) ? 'Catálogo y carrito' : 'Sólo en el carrito'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {vigencia(p, tienda.locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.usageCount}
                        {p.usageLimit !== undefined ? ` / ${p.usageLimit}` : ''}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {/*
                          Prende y apaga sin abrir el formulario, que es lo que se
                          hace todo el tiempo con una campaña. Apagar la deja en
                          borrador y no archivada: archivar es «esto ya no va más»
                          y se elige a propósito, no de un clic al pasar.

                          Una archivada se ve apagada, y prenderla la activa. Que
                          el interruptor no distinga borrador de archivada es a
                          propósito: para el comercio las dos son «no está
                          corriendo», y la diferencia se lee en el formulario.
                        */}
                          <Switch
                            checked={p.status === 'active'}
                            disabled={estado.isPending || !puede('promotion.write')}
                            onCheckedChange={(activa) =>
                              estado.mutate({ id: p.id, status: activa ? 'active' : 'draft' })
                            }
                            aria-label={`${p.status === 'active' ? 'Desactivar' : 'Activar'} ${p.title}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {puede('promotion.write') && (
                          <div className="flex justify-end">
                            <EnlaceDeEdicion
                              etiqueta={`Editar ${p.title}`}
                              to="/promociones/$id"
                              params={{ id: p.id }}
                            />
                            <BorrarConConfirmacion
                              nombre={p.title}
                              etiqueta={`Borrar ${p.title}`}
                              pendiente={borrar.isPending}
                              que={
                                <>
                                  Se borra para siempre. Los pedidos que ya la usaron{' '}
                                  <strong>conservan su descuento</strong>: guardan una copia de lo
                                  que se les aplicó, no una referencia a esta campaña.
                                </>
                              }
                              onConfirmar={() => borrar.mutate(p.id)}
                            />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* La paginación va **dentro** de la tarjeta, pegada a lo que pagina. */}
        {datos && (
          <Paginacion
            datos={datos}
            sustantivo="promociones"
            cargando={consulta.isFetching}
            onPagina={setPage}
          />
        )}
      </Tarjeta>
    </PaginaAdmin>
  );
}
