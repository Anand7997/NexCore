'use client';
import { useExecutionStore } from '@/lib/stores/executionStore';
import { useUIStore } from '@/lib/stores/uiStore';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { Badge } from '@/components/ui/Badge';
import { NodeHealthIndicator } from '@/components/ui/NodeHealthIndicator';
import { ExecutionTimeline } from '@/components/ui/ExecutionTimeline';
import { AIInsightCard } from '@/components/ui/AIInsightCard';
import { Button } from '@/components/ui/Button';
import { formatDuration, timeAgo } from '@/lib/utils';
import { X, RefreshCw, Terminal, Bug } from 'lucide-react';

export function AIInspector() {
  const { inspectorExecutionId, closeInspector } = useUIStore();
  const executions = useExecutionStore((s) => s.executions);
  const insights = useExecutionStore((s) => s.insights);
  const logs = useExecutionStore((s) => s.logs);
  const activeNodeMap = useRealtimeStore((s) => s.activeNodeMap);

  const exec = executions.find((e) => e.id === inspectorExecutionId) ?? executions[0];
  if (!exec) return null;

  const execInsights = insights.filter((i) => i.executionId === exec.id).slice(0, 3);
  const execLogs = logs.filter((l) => l.executionId === exec.id).slice(0, 10);
  const activeNode = activeNodeMap[exec.id];
  const progress = exec.nodeCount > 0 ? exec.completedNodes / exec.nodeCount : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-white/6 p-3 flex items-start justify-between">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge status={exec.status} size="xs" glow />
            <span className="text-xs font-mono text-slate-600">{exec.id}</span>
          </div>
          <p className="text-sm font-medium text-white truncate">{exec.workflowName}</p>
          <p className="text-[10px] text-slate-500">
            {exec.environment} · {exec.platform} · {timeAgo(exec.startedAt)}
          </p>
        </div>
        <Button variant="ghost" size="xs" onClick={closeInspector}>
          <X size={12} />
        </Button>
      </div>

      {/* Metrics row */}
      <div className="shrink-0 border-b border-white/6 px-3 py-2.5 flex items-center gap-3">
        <NodeHealthIndicator status={exec.status} progress={progress} size={44} />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Progress</span>
            <span className="text-slate-300 font-mono">{exec.completedNodes}/{exec.nodeCount}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Duration</span>
            <span className="text-slate-300 font-mono">{formatDuration(exec.duration ?? 0)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Triggered by</span>
            <span className="text-slate-300 font-mono">{exec.triggeredBy}</span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-white/5">
        {/* Timeline */}
        <div className="p-3">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Execution Path</p>
          <ExecutionTimeline execution={exec} activeNodeId={activeNode} />
        </div>

        {/* AI Insights */}
        {execInsights.length > 0 && (
          <div className="p-3 flex flex-col gap-2">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Bug size={10} className="text-violet-500" />
              AI Insights
            </p>
            {execInsights.map((ins) => (
              <AIInsightCard key={ins.id} insight={ins} compact />
            ))}
          </div>
        )}

        {/* Log tail */}
        {execLogs.length > 0 && (
          <div className="p-3">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Terminal size={10} className="text-blue-500" />
              Recent Logs
            </p>
            <div className="flex flex-col gap-0.5">
              {execLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-1.5 text-[10px] font-mono">
                  <span className={
                    log.level === 'error' ? 'text-red-500' :
                    log.level === 'warn' ? 'text-amber-500' :
                    log.level === 'success' ? 'text-emerald-500' :
                    'text-slate-600'
                  }>[{log.level.slice(0, 3).toUpperCase()}]</span>
                  <span className="text-slate-400 truncate">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-3 flex gap-2">
          <Button variant="glass" size="xs" className="flex-1">
            <RefreshCw size={10} />
            Re-run
          </Button>
          <Button variant="neon" size="xs" className="flex-1">
            <Bug size={10} />
            Analyze
          </Button>
        </div>
      </div>
    </div>
  );
}
