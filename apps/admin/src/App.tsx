import { formatMoney, money } from '@pick/commerce-core';
import { Button } from '@/components/ui/button';

/**
 * Shell mínimo de Fase 0/1: verifica que el workspace, Tailwind, el core
 * compartido y shadcn sobre Base UI estén cableados. Los módulos reales del
 * Admin (productos, pedidos, clientes…) llegan en Fase 6.
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="text-muted-foreground text-sm font-medium">Pick Commerce</p>
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
      <p className="text-muted-foreground">
        El core compartido responde:{' '}
        <span className="text-foreground font-medium">{formatMoney(money(89900, 'PYG'))}</span>
      </p>
      <div className="flex gap-2">
        <Button>Acción principal</Button>
        <Button variant="outline">Secundaria</Button>
      </div>
    </main>
  );
}
