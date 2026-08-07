import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type UiExecutionStatus = 'running' | 'success' | 'failed' | 'queued' | 'retrying' | 'skipped' | 'cancelled';

const STATUS_STYLES: Record<UiExecutionStatus, string> = {
  running: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
  success: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  failed: 'border-red-300/35 bg-red-300/10 text-red-100',
  queued: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  retrying: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
  skipped: 'border-slate-300/20 bg-slate-300/10 text-slate-200',
  cancelled: 'border-slate-300/20 bg-slate-300/10 text-slate-300',
};

const STATUS_DOTS: Record<UiExecutionStatus, string> = {
  running: 'bg-cyan-300',
  success: 'bg-emerald-300',
  failed: 'bg-red-300',
  queued: 'bg-amber-300',
  retrying: 'bg-violet-300',
  skipped: 'bg-slate-300',
  cancelled: 'bg-slate-400',
};

export function WorkspacePanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'rounded-3xl border border-white/8 bg-[rgba(7,26,32,0.82)] p-5 shadow-[0_22px_70px_rgba(3,17,24,0.45)] backdrop-blur-xl',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function StatusPill({
  status,
  label,
  className,
}: {
  status: UiExecutionStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]',
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOTS[status])} />
      {label ?? status}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: string }) {
  const lower = severity.toLowerCase();
  const tone =
    lower === 'critical' || lower === 'high'
      ? 'border-red-300/30 bg-red-300/10 text-red-100'
      : lower === 'medium'
        ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
        : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100';

  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone}`}>
      {severity}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-400">{detail}</div> : null}
    </div>
  );
}

export function ProgressRing({
  progress,
  status,
}: {
  progress: number;
  status: UiExecutionStatus;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const stroke =
    status === 'failed'
      ? '#fca5a5'
      : status === 'success'
        ? '#6ee7b7'
        : status === 'running'
          ? '#67e8f9'
          : '#fcd34d';

  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28">
      <circle cx="60" cy="60" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        stroke={stroke}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        fill="none"
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="54" textAnchor="middle" className="fill-white text-[16px] font-semibold">
        {Math.round(clamped * 100)}%
      </text>
      <text x="60" y="72" textAnchor="middle" className="fill-slate-400 text-[10px] uppercase tracking-[0.16em]">
        complete
      </text>
    </svg>
  );
}

