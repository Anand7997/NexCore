'use client';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { formatDuration, timeAgo } from '@/lib/utils';

const PLATFORM_ICON: Record<string, string> = {
  web: '🌐', android: '🤖', ios: '', desktop: '🖥️',
};

export default function ActiveExecutions() {
  const { executions } = useExecutionStore();
  const active = executions
    .filter((e) => ['running', 'retrying', 'queued'].includes(e.status))
    .slice(0, 5);

  return (
    <div className="space-y-2">
      {active.map((exec, i) => (
        <motion.div
          key={exec.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className="group flex items-center gap-3 p-3 rounded-lg bg-white/2 border border-white/4 hover:bg-white/4 hover:border-white/10 transition-all"
        >
          {/* Progress arc */}
          <div className="relative w-9 h-9 shrink-0">
            <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke={exec.status === 'running' ? '#3b82f6' : exec.status === 'retrying' ? '#8b5cf6' : '#f59e0b'}
                strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 15 * (exec.completedNodes / exec.nodeCount)} ${2 * Math.PI * 15}`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono text-slate-300">
              {exec.nodeCount > 0 ? Math.round((exec.completedNodes / exec.nodeCount) * 100) : 0}%
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-slate-200 truncate">{exec.workflowName}</span>
              <span className="text-sm">{PLATFORM_ICON[exec.platform]}</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
              <span>{exec.id}</span>
              <span>{timeAgo(exec.startedAt)}</span>
              <span className="text-slate-600">{exec.environment}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="text-[10px] font-mono text-slate-400">{exec.completedNodes}/{exec.nodeCount} nodes</div>
              <div className="text-[9px] font-mono text-slate-600">{formatDuration(exec.duration)}</div>
            </div>
            <StatusBadge status={exec.status} />
            <Link href="/executions">
              <ExternalLink size={11} className="text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100" />
            </Link>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
