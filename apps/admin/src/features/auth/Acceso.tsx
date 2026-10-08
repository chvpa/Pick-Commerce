import type { ReactNode } from 'react';
import { CameraOffIcon, MoneyIcon, PackageIcon } from '@/components/iconos';

/**
 * Lo que comparten entrar, recuperar la contraseña y elegir una nueva: son la
 * misma pantalla en tres estados (ADR-157).
 *
 * El panel de la derecha, sólo en la pantalla grande, cuenta qué hace el Admin
 * al abrirlo. Sin números: en una pantalla de antes de entrar no hay datos de
 * nadie, y unos de ejemplo se leerían como de la tienda.
 */
export function Acceso({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-white">
      <main className="flex flex-1 flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#3b5bdb] text-sm font-bold text-white">
            P
          </span>
          <span className="text-[15px] font-semibold">Pick</span>
        </div>

        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center gap-7 py-10">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em]">{titulo}</h1>
            <p className="text-ink-3 text-sm">{subtitulo}</p>
          </div>
          {children}
        </div>

        <p className="text-ink-faint text-center text-[12.5px]">
          {globalThis.location?.host} · ¿Problemas para entrar? Pedile acceso a quien administra la
          tienda.
        </p>
      </main>

      <aside className="hidden w-[44%] max-w-[640px] flex-col justify-center gap-8 bg-[#f4f6fb] px-14 lg:flex">
        <div className="flex max-w-md flex-col gap-2">
          <p className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">
            Abrís el Admin y sabés qué hacer primero.
          </p>
          <p className="text-ink-3 text-sm">
            Pedidos por cobrar, productos sin foto y reseñas por moderar, ordenados por urgencia.
          </p>
        </div>
        <div className="flex max-w-md flex-col rounded-2xl bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_0_0_1px_#e6e8ee]">
          <span className="text-ink-faint px-3 pt-2 pb-1 text-[11.5px] font-semibold tracking-[0.04em] uppercase">
            Para hacer
          </span>
          {[
            {
              icono: MoneyIcon,
              tono: 'bg-[#fdf4e3] text-[#9a5b0b]',
              titulo: 'Pedidos que esperan confirmar el pago',
              detalle: 'El más viejo, primero',
            },
            {
              icono: PackageIcon,
              tono: 'bg-[#edf1fe] text-[#2b47bd]',
              titulo: 'Pedidos pagos para preparar',
              detalle: 'Con lo que se retira en la sucursal',
            },
            {
              icono: CameraOffIcon,
              tono: 'bg-[#f1f2f5] text-ink-3',
              titulo: 'Productos sin foto',
              detalle: 'No se ven en la tienda',
            },
          ].map((t) => (
            <div key={t.titulo} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${t.tono}`}
              >
                <t.icono className="size-[18px]" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{t.titulo}</span>
                <span className="text-ink-3 text-[12.5px]">{t.detalle}</span>
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
