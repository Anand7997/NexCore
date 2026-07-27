'use client';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn, getStatusColor } from '@/lib/utils';
import type { ExecutionStatus } from '@/types';

const badgeVariants = cva(
  'inline-flex items-center font-mono font-medium tracking-wider rounded uppercase',
  {
    variants: {
      size: {
        xs: 'text-[9px] px-1.5 py-0.5 gap-0.5',
        sm: 'text-[10px] px-2 py-0.5 gap-1',
        md: 'text-[11px] px-2.5 py-1 gap-1',
        lg: 'text-xs px-3 py-1 gap-1.5',
      },
    },
    defaultVariants: { size: 'sm' },
  },
);

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  status: ExecutionStatus;
  glow?: boolean;
  className?: string;
  label?: string;
}

const STATUS_CONFIG: Record<ExecutionStatus, { bg: string; text: string; dot: string }> = {
  running:   { bg: 'bg-blue-500/15',    text: 'text-blue-400',   dot: 'bg-blue-400' },
  success:   { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  failed:    { bg: 'bg-red-500/15',     text: 'text-red-400',    dot: 'bg-red-400' },
  queued:    { bg: 'bg-amber-500/15',   text: 'text-amber-400',  dot: 'bg-amber-400' },
  retrying:  { bg: 'bg-violet-500/15',  text: 'text-violet-400', dot: 'bg-violet-400' },
  skipped:   { bg: 'bg-slate-500/15',   text: 'text-slate-400',  dot: 'bg-slate-500' },
  cancelled: { bg: 'bg-slate-500/15',   text: 'text-slate-500',  dot: 'bg-slate-600' },
};

export function Badge({ status, glow, size, className, label }: BadgeProps) {
  const cfg = STATUS_CONFIG[status];
  const glowStyle = glow ? { boxShadow: `0 0 8px ${getStatusColor(status)}40` } : undefined;

  return (
    <span
      className={cn(badgeVariants({ size }), cfg.bg, cfg.text, className)}
      style={glowStyle}
    >
      <span className={cn('rounded-full shrink-0', cfg.dot, size === 'xs' ? 'w-1 h-1' : 'w-1.5 h-1.5')} />
      {label ?? status}
    </span>
  );
}
