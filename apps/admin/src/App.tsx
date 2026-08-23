import { formatMoney, money } from '@pick/commerce-core';

/**
 * Shell mínimo de Fase 0: sólo verifica que el workspace, Tailwind y el core
 * compartido estén correctamente cableados. Los módulos reales del Admin
 * (productos, pedidos, clientes…) llegan en Fase 6.
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="text-sm font-medium text-neutral-500">Pick Commerce</p>
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Admin</h1>
      <p className="text-neutral-600">
        Shell de Fase 0. El core compartido responde:{' '}
        <span className="font-medium text-neutral-900">{formatMoney(money(89900, 'PYG'))}</span>
      </p>
    </main>
  );
}
