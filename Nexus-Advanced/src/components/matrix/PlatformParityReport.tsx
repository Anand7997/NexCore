'use client';

import { motion } from 'framer-motion';
import {
  Globe,
  Smartphone,
  Monitor,
  Zap,
  Database,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import type { IntentParitySummary, PlatformCoverage, IntentPlatform } from '@/lib/api/intents';
import { useIntentParitySummary } from '@/lib/api/intents';

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PLATFORM_STYLE: Record<
  IntentPlatform,
  { label: string; Icon: React.ElementType; color: string; bg: string; bar: string }
> = {
  web: {
    label: 'Web',
    Icon: Globe,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    bar: 'from-blue-500/80 to-blue-400/50',
  },
  android: {
    label: 'Android',
    Icon: Smartphone,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    bar: 'from-emerald-500/80 to-emerald-400/50',
  },
  ios: {
    label: 'iOS',
    Icon: Smartphone,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
    bar: 'from-violet-500/80 to-violet-400/50',
  },
  desktop: {
    label: 'Desktop',
    Icon: Monitor,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
    bar: 'from-cyan-500/80 to-cyan-400/50',
  },
  api: {
    label: 'API',
    Icon: Zap,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
    bar: 'from-orange-500/80 to-orange-400/50',
  },
  db: {
    label: 'Database',
    Icon: Database,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
    bar: 'from-rose-500/80 to-rose-400/50',
  },
};

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CoverageBar({
  pct,
  barClass,
  delay,
}: {
  pct: number;
  barClass: string;
  delay: number;
}) {
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1, delay, ease: 'easeOut' }}
        className={`h-full rounded-full bg-linear-to-r ${barClass}`}
      />
    </div>
  );
}

function PlatformCoverageCard({
  coverage,
  index,
}: {
  coverage: PlatformCoverage;
  index: number;
}) {
  const style = PLATFORM_STYLE[coverage.platform] ?? PLATFORM_STYLE.web;
  const { Icon } = style;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.06 }}
      className="rounded-xl border border-border-default bg-surface-1 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg border ${style.bg}`}>
            <Icon size={12} className={style.color} />
          </div>
          <span className="text-sm font-semibold text-fg-default">{style.label}</span>
        </div>
        <span className={`text-sm font-mono font-bold ${style.color}`}>
          {coverage.coveragePct}%
        </span>
      </div>

      {/* Progress bar */}
      <CoverageBar pct={coverage.coveragePct} barClass={style.bar} delay={0.3 + index * 0.06} />

      {/* Stats row */}
      <div className="flex gap-3 text-[10px] font-mono">
        <span className="text-state-success">{coverage.supported} full</span>
        <span className="text-state-warning">{coverage.partial} partial</span>
        <span className="text-fg-subtle">{coverage.unsupported} none</span>
      </div>

      {/* Adapter badge */}
      <div className="pt-0.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-3 text-[10px] font-mono text-fg-muted border border-border-subtle">
          {coverage.adapter}
        </span>
      </div>
    </motion.div>
  );
}

function SummaryMetric({
  icon: Icon,
  iconClass,
  bg,
  value,
  label,
  delay,
}: {
  icon: React.ElementType;
  iconClass: string;
  bg: string;
  value: number;
  label: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, delay }}
      className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-1 px-4 py-3"
    >
      <div className={`p-2 rounded-lg border ${bg}`}>
        <Icon size={14} className={iconClass} />
      </div>
      <div>
        <p className="text-xl font-bold font-mono text-fg-default">{value}</p>
        <p className="text-[10px] text-fg-muted leading-tight">{label}</p>
      </div>
    </motion.div>
  );
}

// â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Props {
  /** If provided, renders inline data instead of fetching */
  data?: IntentParitySummary;
}

export default function PlatformParityReport({ data: propData }: Props) {
  const { data: fetchedData, isLoading, isError } = useIntentParitySummary();
  const summary = propData ?? fetchedData;

  if (isLoading && !summary) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-1 p-8 text-center">
        <p className="text-sm text-fg-muted animate-pulse">Loading parity reportâ€¦</p>
      </div>
    );
  }

  const isMalformed = !!summary && (!Array.isArray(summary.platformCoverage) || !Array.isArray(summary.universalIntents));

  if ((isError || !summary || isMalformed) && !propData) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-1 p-8 text-center space-y-2">
        <AlertTriangle size={20} className="text-state-warning mx-auto" />
        <p className="text-sm text-fg-muted">Parity report unavailable</p>
        <p className="text-[11px] font-mono text-fg-subtle">The nexus-dotnet-backend parity endpoint could not be reached.</p>
      </div>
    );
  }

  if (!summary) return null;

  const overallColor =
    summary.overallCoveragePct >= 80
      ? 'text-state-success'
      : summary.overallCoveragePct >= 50
        ? 'text-state-warning'
        : 'text-state-error';

  return (
    <div className="space-y-6">
      {/* â”€â”€ Headline metric â”€â”€ */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="flex items-center justify-between rounded-xl border border-border-default bg-surface-1 px-6 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg border bg-indigo-500/10 border-indigo-500/20">
            <TrendingUp size={14} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-fg-subtle">Overall coverage</p>
            <p className={`text-3xl font-bold font-mono leading-none mt-0.5 ${overallColor}`}>
              {summary.overallCoveragePct}%
            </p>
          </div>
        </div>
        <p className="text-[10px] font-mono text-fg-subtle">
          {new Date(summary.generatedAt).toLocaleString()}
        </p>
      </motion.div>

      {/* â”€â”€ Summary metrics â”€â”€ */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryMetric
          icon={CheckCircle2}
          iconClass="text-state-success"
          bg="bg-emerald-500/10 border-emerald-500/20"
          value={summary.universalIntents.length}
          label="Universal intents"
          delay={0.06}
        />
        <SummaryMetric
          icon={Layers}
          iconClass="text-state-warning"
          bg="bg-amber-500/10 border-amber-500/20"
          value={summary.gapIntents?.length ?? 0}
          label="Gap intents"
          delay={0.12}
        />
        <SummaryMetric
          icon={Zap}
          iconClass="text-orange-400"
          bg="bg-orange-500/10 border-orange-500/20"
          value={summary.webApiOnly?.length ?? 0}
          label="Web / API only"
          delay={0.18}
        />
      </div>

      {/* â”€â”€ Per-platform coverage cards â”€â”€ */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {summary.platformCoverage.map((cov, i) => (
          <PlatformCoverageCard key={cov.platform} coverage={cov} index={i} />
        ))}
      </div>
    </div>
  );
}

