'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Grid3X3, CheckCircle, XCircle, MinusCircle, Globe, Smartphone, Monitor, Zap, Database } from 'lucide-react';
import { useIntentCapabilityMatrix, type IntentCapabilityRow, type IntentSupportStatus } from '@/lib/api/intents';
import PlatformParityReport from '@/components/matrix/PlatformParityReport';
import type { PlatformCapability } from '@/types';

const PLATFORM_CONFIG = [
  { key: 'web', label: 'Web', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', glow: 'rgba(59,130,246,0.1)' },
  { key: 'android', label: 'Android', icon: Smartphone, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', glow: 'rgba(16,185,129,0.1)' },
  { key: 'ios', label: 'iOS', icon: Smartphone, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', glow: 'rgba(139,92,246,0.1)' },
  { key: 'desktop', label: 'Desktop', icon: Monitor, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20', glow: 'rgba(6,182,212,0.1)' },
  { key: 'api', label: 'API', icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', glow: 'rgba(249,115,22,0.1)' },
  { key: 'db', label: 'DB', icon: Database, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', glow: 'rgba(244,63,94,0.1)' },
] as const;

function CapabilityCell({ value }: { value: boolean | 'partial' }) {
  if (value === true) {
    return (
      <motion.div
        whileHover={{ scale: 1.2 }}
        className="flex items-center justify-center"
      >
        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center glow-green">
          <CheckCircle size={13} className="text-emerald-400" />
        </div>
      </motion.div>
    );
  }
  if (value === 'partial') {
    return (
      <motion.div whileHover={{ scale: 1.2 }} className="flex items-center justify-center">
        <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
          <MinusCircle size={13} className="text-amber-400" />
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div whileHover={{ scale: 1.2 }} className="flex items-center justify-center">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/6 bg-white/3">
        <XCircle size={13} className="text-slate-700" />
      </div>
    </motion.div>
  );
}

function PlatformStats({ capabilities }: { capabilities: PlatformCapability[] }) {
  const stats = PLATFORM_CONFIG.map((p) => {
    const key = p.key as keyof Omit<PlatformCapability, 'feature'>;
    const supported = capabilities.filter((c) => c[key] === true).length;
    const partial = capabilities.filter((c) => c[key] === 'partial').length;
    const total = capabilities.length;
    const pct = Math.round(((supported + partial * 0.5) / total) * 100);
    return { ...p, supported, partial, total, pct };
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: i * 0.06 }}
          className="rounded-xl border border-border-default bg-surface-1 p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-1.5 rounded-lg border ${s.bg}`}>
              <s.icon size={13} className={s.color} />
            </div>
            <span className="text-sm font-semibold text-fg-default">{s.label}</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-fg-muted">Coverage</span>
              <span className={`font-mono font-bold ${s.color}`}>{s.pct}%</span>
            </div>
            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${s.pct}%` }}
                transition={{ duration: 1, delay: 0.3 + i * 0.06 }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${s.glow.replace('0.1', '0.8')}, ${s.glow.replace('0.1', '0.5')})` }}
              />
            </div>
            <div className="flex gap-3 text-[10px] font-mono">
              <span className="text-state-success">{s.supported} full</span>
              <span className="text-state-warning">{s.partial} partial</span>
              <span className="text-fg-subtle">{s.total - s.supported - s.partial} none</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function supportToCell(status: IntentSupportStatus): boolean | 'partial' {
  if (status === 'supported') return true;
  if (status === 'partial') return 'partial';
  return false;
}

function matrixToCapabilities(rows: IntentCapabilityRow[]): PlatformCapability[] {
  return rows.map((row) => ({
    feature: row.feature,
    web: supportToCell(row.web),
    android: supportToCell(row.android),
    ios: supportToCell(row.ios),
    desktop: supportToCell(row.desktop),
    api: supportToCell(row.api),
    db: supportToCell(row.db),
  }));
}

export default function MatrixPage() {
  const { data: intentMatrix } = useIntentCapabilityMatrix();
  const capabilities = useMemo(
    () => (intentMatrix?.capabilities?.length ? matrixToCapabilities(intentMatrix.capabilities) : []),
    [intentMatrix],
  );
  const sourceLabel = intentMatrix?.capabilities?.length ? 'Intent registry' : 'No capabilities registered';

  return (
    <div className="mx-auto max-w-350 space-y-8 p-8">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-fg-subtle">
          Mode 4
        </p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight gradient-text leading-none">
              Platform Matrix
            </h1>
            <p className="mt-2 text-[11px] font-mono text-fg-subtle">
              {sourceLabel} - Web · Android · iOS · Desktop · API · DB
            </p>
          </div>
          <Grid3X3 size={18} className="text-fg-subtle" />
        </div>
      </motion.div>

      <PlatformStats capabilities={capabilities} />

      {/* ── Capability matrix table ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        className="overflow-hidden rounded-xl border border-border-default bg-surface-1"
      >
        {/* Column headers */}
        <div className="flex items-center border-b border-border-default">
          <div className="w-60 shrink-0 px-5 py-3.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-fg-subtle">Feature</span>
          </div>
          {PLATFORM_CONFIG.map((p) => (
            <div key={p.key} className="flex flex-1 flex-col items-center border-l border-border-default py-3.5">
              <div className={`p-1.5 rounded-lg border mb-1.5 ${p.bg}`}>
                <p.icon size={12} className={p.color} />
              </div>
              <span className={`text-[10px] font-mono font-semibold ${p.color}`}>{p.label}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {capabilities.length === 0 && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-fg-muted">No platform capabilities available</p>
            <p className="mt-1 text-[11px] font-mono text-fg-subtle">Capabilities from the intent registry will appear here.</p>
          </div>
        )}
        {capabilities.map((cap, i) => (
          <motion.div
            key={cap.feature}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.03 }}
            className="group flex items-center border-b border-border-subtle transition-colors hover:bg-surface-2"
          >
            <div className="w-60 shrink-0 px-5 py-3">
              <span className="text-xs text-fg-muted transition-colors group-hover:text-fg-default">
                {cap.feature}
              </span>
            </div>
            {PLATFORM_CONFIG.map((p) => (
              <div key={p.key} className="flex flex-1 items-center justify-center border-l border-border-subtle py-3">
                <CapabilityCell value={cap[p.key as keyof typeof cap] as boolean | 'partial'} />
              </div>
            ))}
          </motion.div>
        ))}
      </motion.div>

      {/* Legend */}
      <div className="flex items-center gap-6">
        {[
          { icon: CheckCircle, color: 'text-state-success', label: 'Fully supported' },
          { icon: MinusCircle, color: 'text-state-warning', label: 'Partial support' },
          { icon: XCircle, color: 'text-fg-subtle', label: 'Not supported' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <item.icon size={13} className={item.color} />
            <span className="text-xs text-fg-muted">{item.label}</span>
          </div>
        ))}
      </div>

      {/* ── Platform Parity Analysis ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-bold tracking-tight gradient-text leading-none">
            Platform Parity Analysis
          </h2>
          <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-fg-subtle">
            Intent coverage by adapter
          </p>
        </div>
        <PlatformParityReport />
      </motion.div>
    </div>
  );
}
