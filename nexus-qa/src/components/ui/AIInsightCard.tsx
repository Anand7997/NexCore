'use client';
import { motion } from 'framer-motion';
import { cardReveal } from '@/lib/motion/variants';
import { Badge } from './Badge';
import { cn } from '@/lib/utils';
import type { AIInsight } from '@/types';

interface AIInsightCardProps {
  insight: AIInsight;
  compact?: boolean;
  className?: string;
}

const TYPE_LABEL: Record<AIInsight['type'], string> = {
  root_cause: 'Root Cause',
  anomaly: 'Anomaly',
  suggestion: 'Suggestion',
  pattern: 'Pattern',
};

export function AIInsightCard({ insight, compact, className }: AIInsightCardProps) {
  const confidencePct = Math.round(insight.confidence);

  return (
    <motion.div
      variants={cardReveal}
      initial="hidden"
      animate="visible"
      className={cn(
        'glass rounded-lg p-3 flex flex-col gap-2',
        compact ? 'gap-1.5' : 'gap-2.5',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-slate-500 font-mono shrink-0">
            {TYPE_LABEL[insight.type]}
          </span>
          <span className="text-xs text-white font-medium truncate">{insight.title}</span>
        </div>
        <Badge status={insight.severity === 'critical' ? 'failed' : insight.severity === 'high' ? 'retrying' : insight.severity === 'medium' ? 'queued' : 'running'} size="xs" label={insight.severity} />
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-indigo-500 rounded-full"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: confidencePct / 100 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ transformOrigin: 'left' }}
          />
        </div>
        <span className="text-[10px] font-mono text-slate-500 shrink-0">{confidencePct}%</span>
      </div>

      {!compact && (
        <>
          <p className="text-[11px] text-slate-400 leading-relaxed">{insight.description}</p>

          {/* Evidence */}
          <div className="flex flex-col gap-0.5">
            {insight.evidence.map((e) => (
              <div key={e} className="flex items-start gap-1.5 text-[10px] text-slate-500">
                <span className="text-indigo-600 mt-0.5">·</span>
                <span>{e}</span>
              </div>
            ))}
          </div>

          {insight.suggestedFix && (
            <div className="bg-emerald-500/8 border border-emerald-500/15 rounded px-2 py-1.5 text-[10px] text-emerald-400">
              <span className="text-emerald-600 font-mono">FIX:</span> {insight.suggestedFix}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
