'use client';
import { cn, getStatusColor } from '@/lib/utils';
import type { ExecutionStatus } from '@/types';

interface StatusPulseProps {
  status: ExecutionStatus;
  size?: 'sm' | 'md' | 'lg';
  showRing?: boolean;
  label?: string;
  className?: string;
}

const SIZE = {
  sm: { dot: 'w-1.5 h-1.5', ring: 'w-3.5 h-3.5', outer: 'w-5 h-5' },
  md: { dot: 'w-2 h-2',     ring: 'w-4 h-4',     outer: 'w-6 h-6' },
  lg: { dot: 'w-2.5 h-2.5', ring: 'w-5 h-5',     outer: 'w-7 h-7' },
};

const ANIMATED_STATUSES: ExecutionStatus[] = ['running', 'retrying', 'queued'];

export function StatusPulse({ status, size = 'md', showRing = true, label, className }: StatusPulseProps) {
  const color = getStatusColor(status);
  const s = SIZE[size];
  const isAnimated = ANIMATED_STATUSES.includes(status);

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('relative flex items-center justify-center shrink-0', s.outer)}>
        {showRing && isAnimated && (
          <span
            className={cn('absolute rounded-full animate-ring-pulse', s.outer)}
            style={{ backgroundColor: color, opacity: 0.25 }}
          />
        )}
        {showRing && (
          <span
            className={cn('absolute rounded-full border', s.ring)}
            style={{ borderColor: `${color}50` }}
          />
        )}
        <span
          className={cn('rounded-full shrink-0 relative z-10', s.dot)}
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
        />
      </span>
      {label && <span className="text-slate-400 text-xs">{label}</span>}
    </span>
  );
}
