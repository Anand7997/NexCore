'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Cpu,
  Lightbulb,
  TrendingUp,
  Zap,
} from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { useExecutions } from '@/lib/api/executions';
import { useExecutionAnalysis } from '@/lib/api/intelligence';
import { timeAgo } from '@/lib/utils';
import type { AIInsight } from '@/types';

const SEVERITY_CONFIG = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/25', label: 'CRITICAL' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/25', label: 'HIGH' },
  medium: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25', label: 'MEDIUM' },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/25', label: 'LOW' },
  info: { color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/25', label: 'INFO' },
};

const TYPE_ICON = {
  root_cause: AlertTriangle,
  anomaly: TrendingUp,
  suggestion: Lightbulb,
  pattern: Cpu,
};

function InsightCard({ insight, selected, onClick }: {
  insight: AIInsight;
  selected: boolean;
  onClick: () => void;
}) {
  const sev = SEVERITY_CONFIG[insight.severity];
  const Icon = TYPE_ICON[insight.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={`cursor-pointer rounded-lg border p-4 transition-all duration-200 ${
        selected
          ? 'bg-violet-500/10 border-violet-500/30'
          : 'glass hover:bg-white/4 hover:border-white/15'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 rounded-lg border p-2 ${sev.bg}`}>
          <Icon size={14} className={sev.color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={`text-[9px] font-mono font-bold ${sev.color}`}>{sev.label}</span>
            <span className="text-[9px] font-mono text-slate-600">{insight.type.replace('_', ' ')}</span>
          </div>
          <h3 className="mb-1 text-sm font-semibold leading-snug text-white">{insight.title}</h3>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500">{insight.description}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-1 w-20 overflow-hidden rounded-full bg-white/6">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${insight.confidence}%` }}
                  transition={{ duration: 1, delay: 0.3 }}
                  className="h-full rounded-full bg-linear-to-r from-violet-500 to-indigo-500"
                />
              </div>
              <span className="text-[9px] font-mono text-violet-400">{insight.confidence.toFixed(0)}%</span>
            </div>
            <span className="text-[9px] font-mono text-slate-600">{timeAgo(insight.timestamp)}</span>
            <ChevronRight size={10} className={`ml-auto text-slate-600 transition-transform ${selected ? 'rotate-90' : ''}`} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function InsightDetail({ insight }: { insight: AIInsight }) {
  const sev = SEVERITY_CONFIG[insight.severity];
  const Icon = TYPE_ICON[insight.type];

  return (
    <motion.div
      key={insight.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="glass flex items-start gap-3 rounded-lg p-4">
        <div className={`rounded-lg border p-2.5 ${sev.bg}`}>
          <Icon size={18} className={sev.color} />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold ${sev.bg} ${sev.color}`}>
              {sev.label}
            </span>
            <span className="text-[10px] font-mono text-slate-500">{insight.type.replace('_', ' ')}</span>
          </div>
          <h2 className="text-base font-bold leading-snug text-white">{insight.title}</h2>
        </div>
      </div>

      <GlassCard className="p-4" animate={false}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">Confidence Score</span>
          <span className="font-mono text-lg font-bold text-violet-400">{insight.confidence.toFixed(1)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/6">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${insight.confidence}%` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="h-full rounded-full bg-linear-to-r from-violet-500 via-indigo-500 to-cyan-500"
          />
        </div>
      </GlassCard>

      <GlassCard className="p-4" animate={false}>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
          <Brain size={10} className="text-violet-400" />
          Analysis
        </h3>
        <p className="text-sm leading-relaxed text-slate-300">{insight.description}</p>
      </GlassCard>

      <GlassCard className="p-4" animate={false}>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
          <Zap size={10} className="text-cyan-400" />
          Evidence Chain
        </h3>
        <div className="space-y-2">
          {insight.evidence.map((ev, i) => (
            <motion.div
              key={`${insight.id}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-2 rounded-lg border border-white/4 bg-white/2 px-2 py-1.5"
            >
              <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/20">
                <span className="text-[8px] font-mono text-cyan-400">{i + 1}</span>
              </div>
              <span className="text-xs font-mono text-slate-400">{ev}</span>
            </motion.div>
          ))}
        </div>
      </GlassCard>

      {insight.suggestedFix && (
        <GlassCard className="p-4 border-emerald-500/20" animate={false}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
            <Lightbulb size={10} />
            Recommendation
          </h3>
          <p className="text-sm leading-relaxed text-slate-300">{insight.suggestedFix}</p>
        </GlassCard>
      )}

      <GlassCard className="p-4" animate={false}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Affected Nodes
        </h3>
        <div className="flex flex-wrap gap-2">
          {insight.affectedNodes.map((node) => (
            <span key={node} className="rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-mono text-red-300">
              {node}
            </span>
          ))}
        </div>
      </GlassCard>
    </motion.div>
  );
}

export default function AIAnalysisPage() {
  const { data: executions = [] } = useExecutions();
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const { data: analysis } = useExecutionAnalysis(selectedExecution);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (!selectedExecution && executions.length > 0) {
      const failed = executions.find((execution) => execution.status === 'failed');
      setSelectedExecution((failed ?? executions[0]).id);
    }
  }, [executions, selectedExecution]);

  const activeInsights = useMemo<AIInsight[]>(() => {
    if (!analysis?.insights?.length) return [];
    return analysis.insights.map((insight) => ({
      id: insight.id,
      executionId: analysis.execution_id,
      type: insight.type,
      title: insight.title,
      description: insight.description,
      confidence: insight.confidence * 100,
      severity: insight.severity,
      evidence: insight.evidence,
      suggestedFix: insight.recommendation ?? undefined,
      affectedNodes: insight.affected_nodes,
      timestamp: analysis.generated_at,
    }));
  }, [analysis]);

  useEffect(() => {
    if (activeInsights.length > 0 && !activeInsights.some((insight) => insight.id === selected)) {
      setSelected(activeInsights[0].id);
    }
  }, [activeInsights, selected]);

  const selectedInsight = activeInsights.find((i) => i.id === selected);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex w-90 shrink-0 flex-col border-r border-border-default bg-surface-1">
        <div className="shrink-0 border-b border-border-default px-5 py-5">
          <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.16em] text-fg-subtle">
            Mode 3
          </p>
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-accent-default" />
            <h1 className="text-lg font-bold text-fg-default">AI Investigation</h1>
          </div>
          <p className="mt-1 text-[11px] font-mono text-fg-subtle">
            {activeInsights.length} active insights
          </p>
          {executions.length > 0 && (
            <select
              value={selectedExecution ?? ''}
              onChange={(event) => setSelectedExecution(event.target.value || null)}
              className="mt-3 w-full rounded-md border border-border-default bg-surface-2 px-2 py-1.5 text-xs text-fg-muted outline-none focus:border-accent-default"
            >
              {executions.map((execution) => (
                <option key={execution.id} value={execution.id}>
                  {execution.workflow_id.slice(0, 8)} - {execution.status} - {execution.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-border-subtle p-4">
          {[
            { label: 'Critical', count: activeInsights.filter(i => i.severity === 'critical').length, color: 'text-state-error' },
            { label: 'High', count: activeInsights.filter(i => i.severity === 'high').length, color: 'text-state-warning' },
            { label: 'Medium', count: activeInsights.filter(i => i.severity === 'medium').length, color: 'text-amber-400' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border-default bg-surface-2 p-2 text-center">
              <div className={`font-mono text-lg font-bold ${item.color}`}>{item.count}</div>
              <div className="text-[9px] font-mono text-fg-subtle">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {activeInsights.length === 0 && (
            <div className="rounded-lg border border-border-default bg-surface-2 p-4 text-center">
              <p className="text-xs text-fg-muted">No analysis available</p>
              <p className="mt-1 text-[10px] font-mono text-fg-subtle">Run an execution to generate evidence.</p>
            </div>
          )}
          {activeInsights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              selected={selected === insight.id}
              onClick={() => setSelected(insight.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-7">
        {selectedInsight ? (
          <InsightDetail insight={selectedInsight} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-fg-subtle">
            <Brain size={28} className="mb-3 opacity-40" />
            <p className="text-sm">No insight selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
