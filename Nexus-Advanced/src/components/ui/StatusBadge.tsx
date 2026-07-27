'use client';
import { cn } from '@/lib/utils';
import type { ExecutionStatus } from '@/types';

const STATUS_CONFIG: Record<ExecutionStatus, {
  label: string;
  bg: string;
  text: string;
  dot: string;
  pulse?: string;
}> = {
  running: {
    label: 'RUNNING',
    bg: 'bg-blue-500/10 border border-blue-500/30',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
    pulse: 'animate-pulse',
  },
  success: {
    label: 'SUCCESS',
    bg: 'bg-emerald-500/10 border border-emerald-500/30',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
  failed: {
    label: 'FAILED',
    bg: 'bg-red-500/10 border border-red-500/30',
    text: 'text-red-400',
    dot: 'bg-red-400',
    pulse: 'animate-pulse',
  },
  queued: {
    label: 'QUEUED',
    bg: 'bg-amber-500/10 border border-amber-500/30',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
  },
  retrying: {
    label: 'RETRYING',
    bg: 'bg-violet-500/10 border border-violet-500/30',
    text: 'text-violet-400',
    dot: 'bg-violet-400',
    pulse: 'animate-pulse',
  },
  skipped: {
    label: 'SKIPPED',
    bg: 'bg-slate-500/10 border border-slate-500/30',
    text: 'text-slate-400',
    dot: 'bg-slate-400',
  },
  cancelled: {
    label: 'CANCELLED',
    bg: 'bg-slate-500/10 border border-slate-500/30',
    text: 'text-slate-400',
    dot: 'bg-slate-400',
  },
};

interface StatusBadgeProps {
  status: ExecutionStatus;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export default function StatusBadge({ status, size = 'sm', showDot = true }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-mono font-semibold tracking-wider',
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
      config.bg, config.text,
    )}>
      {showDot && (
        <span className={cn('rounded-full', size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2', config.dot, config.pulse)} />
      )}
      {config.label}
    </span>
  );
}
