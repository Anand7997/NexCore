'use client';

import { ReactNode } from 'react';
import { StatusDot } from './StatusDot';
import type { StatusKind } from '../tokens';

interface PillProps {
  label: ReactNode;
  status?: StatusKind;
  tone?: 'violet' | 'green' | 'amber' | 'red' | 'cyan';
  className?: string;
}

const TONES: Record<NonNullable<PillProps['tone']>, { bg: string; border: string; fg: string }> = {
  violet: { bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.22)', fg: '#c4b5fd' },
  green:  { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.25)', fg: '#6ee7b7' },
  amber:  { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.30)', fg: '#fcd34d' },
  red:    { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.30)',  fg: '#fca5a5' },
  cyan:   { bg: 'rgba(6,182,212,0.06)',  border: 'rgba(6,182,212,0.25)',  fg: '#67e8f9' },
};

export function Pill({ label, status, tone = 'violet', className }: PillProps) {
  const t = TONES[tone];
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 999,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.06em',
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.fg,
      }}
    >
      {status ? <StatusDot status={status} /> : null}
      {label}
    </span>
  );
}
