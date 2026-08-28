import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositorioConfiguracion } from '@pick/adapter-supabase';
import {
  actualizarTasa,
  configuracionDeMoneda,
  configuracionDePagos,
  type CurrencyConfig,
  type EntradaDeAuditoria,
} from '@pick/commerce-core';
import type { TiendaResumen } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSesion } from '@/features/auth/SesionContext';
import { useTiendaActiva } from '@/features/tienda/TiendaContext';
import { db } from '@/lib/supabase';

type Settings = Readonly<Record<string, unknown>>;

interface Guardado {
  guardar: (parcial: Record<string, unknown>, auditoria?: EntradaDeAuditoria) => void;
  guardando: boolean;
}

/**
 * Configuración de la tienda.
 *
 * Cada tarjeta guarda **sólo su sección** —`payments` o `currency`— y el RPC
 * mergea por clave de primer nivel. Es lo que permite que editar los medios de
 * pago no toque la moneda: un guardado único de todo el formulario reenviaría
 * también lo que no se miró, y bastaría un render con datos viejos para pisarlo.
 *
 * Los formularios viven en componentes aparte y se montan cuando la
 * configuración ya llegó, así que arrancan de ella sin ningún efecto que
 * re-siembre campos. Sembrar en un efecto es lo que hace que lo que alguien está
 * escribiendo desaparezca cuando vuelve una consulta de fondo.
 */
export function Configuracion() {
  const tienda = useTiendaActiva();
  const cliente = useQueryClient();

  const consulta = useQuery({
    queryKey: ['configuracion', tienda.id],
    queryFn: () => repositorioConfiguracion(db).leer(tienda.id),
  });

  const mutacion = useMutation({
    mutationFn: ({
      parcial,
      auditoria,
    }: {
      parcial: Record<string, unknown>;
      auditoria?: EntradaDeAuditoria;
    }) => repositorioConfiguracion(db).guardar(tienda.id, parcial, auditoria),
    onSuccess: (settings) => {
      cliente.setQueryData(['configuracion', tienda.id], settings);
    },
  });

  if (consulta.isPending) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (consulta.isError) {
    return (
      <div className="border-destructive/40 flex flex-col items-start gap-3 rounded-lg border p-6">
        <p className="text-sm">No se pudo cargar la configuración.</p>
        <p className="text-muted-foreground text-xs">{(consulta.error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => void consulta.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const guardado: Guardado = {
    guardar: (parcial, auditoria) =>
      mutacion.mutate({ parcial, ...(auditoria ? { auditoria } : {}) }),
    guardando: mutacion.isPending,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-sm">
          Cómo cobra y en qué moneda opera {tienda.name}.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Pagos settings={consulta.data} guardado={guardado} />
        <Moneda settings={consulta.data} tienda={tienda} guardado={guardado} />
      </div>

      {mutacion.isError && (
        <p className="text-destructive text-sm" role="alert">
          {(mutacion.error as Error).message}
        </p>
      )}
    </div>
  );
}

function Pagos({ settings, guardado }: { settings: Settings; guardado: Guardado }) {
  const inicial = configuracionDePagos(settings);
  const [habilitada, setHabilitada] = useState(inicial.enabled.includes('bank_transfer'));
  const [instrucciones, setInstrucciones] = useState(inicial.bankTransfer?.instructions ?? '');
  const [listo, setListo] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Medios de pago</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setListo(false);
            guardado.guardar({
              payments: {
                enabled: habilitada ? ['bank_transfer'] : [],
                default: 'bank_transfer',
                ...(instrucciones.trim()
                  ? { bankTransfer: { instructions: instrucciones.trim() } }
                  : {}),
              },
            });
            setListo(true);
          }}
        >
          <div className="flex items-start gap-3">
            <Checkbox
              id="transferencia"
              checked={habilitada}
              onCheckedChange={(v) => setHabilitada(v === true)}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="transferencia" className="cursor-pointer">
                Transferencia bancaria
              </Label>
              <p className="text-muted-foreground text-xs">
                El pedido queda pendiente de pago hasta que confirmes el comprobante.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="instrucciones">Instrucciones para el cliente</Label>
            <Textarea
              id="instrucciones"
              rows={4}
              value={instrucciones}
              disabled={!habilitada}
              onChange={(e) => setInstrucciones(e.currentTarget.value)}
              placeholder="Número de cuenta, banco, titular y a dónde enviar el comprobante."
            />
            <p className="text-muted-foreground text-xs">
              Se muestran en el checkout y en la confirmación del pedido.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={guardado.guardando}>
              {guardado.guardando ? 'Guardando…' : 'Guardar'}
            </Button>
            {listo && !guardado.guardando && (
              <span className="text-muted-foreground text-sm" role="status">
                Guardado.
              </span>
            )}
          </div>

          {!habilitada && (
            <p className="text-muted-foreground text-xs">
              Sin ningún medio habilitado el checkout vuelve a transferencia bancaria: una tienda
              que no puede cobrar no puede vender.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Moneda({
  settings,
  tienda,
  guardado,
}: {
  settings: Settings;
  tienda: TiendaResumen;
  guardado: Guardado;
}) {
  const { sesion } = useSesion();
  const config: CurrencyConfig = configuracionDeMoneda(settings, tienda.currency as 'PYG');
  const [tasa, setTasa] = useState(config.exchangeRate?.value?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const actual = config.exchangeRate;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Moneda</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setListo(false);
            setError(null);
            try {
              // `actualizarTasa` devuelve la configuración y su auditoría juntas:
              // con esta firma no se puede guardar la tasa sin registrar quién la
              // cambió, que es lo que pide PROJECT.md §33. Validar acá con un
              // esquema propio daría dos reglas capaces de divergir.
              const r = actualizarTasa(
                config,
                Number(tasa.replace(',', '.')),
                sesion?.userId ?? '',
                new Date().toISOString(),
              );
              guardado.guardar({ currency: r.config }, r.auditoria);
              setListo(true);
            } catch (fallo) {
              setError((fallo as Error).message);
            }
          }}
        >
          <dl className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Moneda base</dt>
              <dd className="text-sm">{config.base}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Se cobra en</dt>
              <dd className="text-sm">{config.checkoutCurrency}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tasa">Tipo de cambio manual</Label>
            <Input
              id="tasa"
              inputMode="decimal"
              value={tasa}
              onChange={(e) => setTasa(e.currentTarget.value)}
              placeholder="7300"
              aria-describedby="tasa-nota"
              aria-invalid={error ? true : undefined}
            />
            <p id="tasa-nota" className="text-muted-foreground text-xs">
              Cuántos {config.base} equivalen a una unidad de la moneda mostrada. Mostrar otra
              moneda no cambia en cuál se cobra.
            </p>
          </div>

          {actual ? (
            <p className="text-muted-foreground text-xs">
              Última actualización: {new Date(actual.updatedAt).toLocaleString(tienda.locale)}
              {actual.updatedBy === sesion?.userId ? ' · por vos' : ''}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">Todavía no se cargó ningún cambio.</p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={guardado.guardando}>
              {guardado.guardando ? 'Guardando…' : 'Guardar'}
            </Button>
            {listo && !guardado.guardando && (
              <span className="text-muted-foreground text-sm" role="status">
                Guardado y auditado.
              </span>
            )}
          </div>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
