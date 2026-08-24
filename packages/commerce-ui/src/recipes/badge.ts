import { cn } from '../lib/cn.ts';

export type BadgeTone = 'neutral' | 'sale' | 'success' | 'danger';

const TONE: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surface text-fg-muted',
  sale: 'border-transparent bg-sale text-white',
  success: 'border-transparent bg-success text-white',
  danger: 'border-transparent bg-danger text-white',
};

export interface BadgeVariantsOptions {
  tone?: BadgeTone;
  className?: string;
}

export function badgeVariants({ tone = 'neutral', className }: BadgeVariantsOptions = {}): string {
  return cn(
    'inline-flex items-center rounded-xs border px-2 py-1 text-2xs font-medium',
    TONE[tone],
    className,
  );
}
