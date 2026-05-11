'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Brain, Terminal, Download, ChevronRight, RefreshCw, Play, Square,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { NodeHealthIndicator } from '@/components/ui/NodeHealthIndicator';
import { ExecutionTimeline } from '@/components/ui/ExecutionTimeline';
import { Button } from '@/components/ui/Button';
import { EvidencePanel } from '@/components/execution/EvidencePanel';
import { useUIStore } from '@/lib/stores/uiStore';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { useExecutions, useExecution, useCancelExecution } from '@/lib/api/executions';
import { useWorkflows } from '@/lib/api/workflows';
import { useTriggerExecution } from '@/lib/api/executions';
import { formatDuration, timeAgo } from '@/lib/utils';
import type { ExecutionStatus, WorkflowNode } from '@/types';
import type { ExecutionListItem, ExecutionDetail } from '@/lib/api/types';

// Map backend statuses to frontend display status
function mapStatus(s: string): ExecutionStatus {
  if (s === 'completed') return 'success';
  if (s === 'created') return 'queued';
  return s as ExecutionStatus;
}

function mapNodeStatus(s: string): WorkflowNode['status'] {
  if (s === 'completed') return 'success';
  if (s === 'created' || s === 'waiting') return 'queued';
  return s as WorkflowNode['status'];
}

function durationMs(item: ExecutionListItem | ExecutionDetail): number {
  if (!item.started_at) return 0;
  const end = item.completed_at ? new Date(item.completed_at).getTime() : Date.now();
  return end - new Date(item.started_at).getTime();
}

const PLATFORM_LABEL: Record<string, string> = {
  web: 'Web', android: 'Android', ios: 'iOS', desktop: 'Desktop',
};

function ExecutionRow({ exec, selected, onClick }: {
  exec: ExecutionListItem; selected: boolean; onClick: () => void;
}) {
  const status = mapStatus(exec.status);
  const progress = exec.node_count > 0 ? exec.completed_nodes / exec.node_count : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={`group flex items-center gap-4 px-5 py-3.5 border-b border-border-subtle cursor-pointer transition-all ${
        selected
          ? 'bg-accent-soft border-l-2 border-l-accent-default'
          : 'hover:bg-surface-2'
      }`}
    >
      <div className="shrink-0">
        <NodeHealthIndicator status={status} progress={progress} size={34} strokeWidth={2.5} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-fg-default truncate">
            {exec.workflow_id.slice(0, 8)}…
          </span>
          <span className="text-[10px] text-fg-subtle font-mono">{PLATFORM_LABEL[exec.platform] ?? exec.platform}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-fg-subtle">
          <span>{exec.id.slice(0, 12)}…</span>
          <span className="text-line-strong">·</span>
          <span>{exec.environment}</span>
          <span className="text-line-strong">·</span>
          <span>{exec.trigger}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right hidden lg:block">
          <div className="text-xs font-mono text-fg-muted">{exec.completed_nodes}/{exec.node_count} nodes</div>
          <div className="text-[10px] text-fg-subtle">{formatDuration(durationMs(exec))}</div>
        </div>
        <div className="text-right hidden lg:block">
          <div className="text-[10px] font-mono text-fg-subtle">{exec.started_at ? timeAgo(exec.started_at) : '—'}</div>
        </div>
        <Badge status={status} size="sm" glow={status === 'running' || status === 'failed'} />
        <ChevronRight size={12} className={`text-fg-subtle transition-transform ${selected ? 'rotate-90' : ''}`} />
      </div>
    </motion.div>
  );
}

function ExecutionDetailPanel({ execId }: { execId: string }) {
  const { data: exec, isLoading } = useExecution(execId);
  const { openInspectorFor } = useUIStore();
  const activeNodeMap = useRealtimeStore((s) => s.activeNodeMap);
  const activeNode = activeNodeMap[execId];
  const { mutate: cancel, isPending: cancelling } = useCancelExecution();

  if (isLoading || !exec) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw size={16} className="text-slate-600 animate-spin" />
      </div>
    );
  }

  const status = mapStatus(exec.status);
  const progress = exec.node_count > 0 ? exec.completed_nodes / exec.node_count : 0;
  const failedNode = exec.nodes.find((n) => n.status === 'failed');

  const timelineExecution = {
    id: exec.id,
    workflowId: exec.workflow_id,
    workflowName: exec.workflow_id.slice(0, 8),
    status,
    startedAt: exec.started_at ?? exec.created_at,
    duration: durationMs(exec),
    platform: exec.platform as 'web',
    environment: exec.environment,
    triggeredBy: exec.trigger,
    correlationId: exec.id,
    nodeCount: exec.node_count,
    completedNodes: exec.completed_nodes,
    failedNode: failedNode?.node_label,
    tags: [],
  };
  const timelineNodes: WorkflowNode[] = exec.nodes.map((node) => ({
    id: node.node_key,
    type: node.node_type as WorkflowNode['type'],
    label: node.node_label,
    status: mapNodeStatus(node.status),
    duration: node.duration_ms ?? undefined,
    retries: node.attempt_count,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="h-full flex flex-col"
    >
      <div className="p-4 border-b border-white/5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white font-mono">{exec.id.slice(0, 16)}…</h2>
            <p className="text-xs font-mono text-slate-500 mt-0.5">{exec.trigger} · {exec.environment}</p>
          </div>
          <Badge status={status} size="md" glow />
        </div>

        <div className="flex items-center gap-4">
          <NodeHealthIndicator status={status} progress={progress} size={52} strokeWidth={3} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 flex-1">
            {[
              { label: 'Platform', value: exec.platform },
              { label: 'Environment', value: exec.environment },
              { label: 'Trigger', value: exec.trigger },
              { label: 'Duration', value: formatDuration(durationMs(exec)) },
              { label: 'Nodes', value: `${exec.completed_nodes}/${exec.node_count}` },
              { label: 'Started', value: exec.started_at ? timeAgo(exec.started_at) : '—' },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[9px] font-mono text-slate-600 uppercase">{item.label}</p>
                <p className="text-[11px] text-slate-300 font-mono">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {failedNode && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-red-500/8 border border-red-500/20">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs font-semibold text-red-400">Failed Node</span>
          </div>
          <p className="text-xs font-mono text-red-300/80">{failedNode.node_label}</p>
          {failedNode.error && <p className="text-[10px] text-red-400/60 mt-0.5">{failedNode.error}</p>}
        </div>
      )}

      {exec.error && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-red-500/8 border border-red-500/20">
          <p className="text-xs font-mono text-red-300/80">{exec.error}</p>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="overflow-y-auto p-4 border-b border-white/5">
          <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-3">Execution Path</p>
          <ExecutionTimeline execution={timelineExecution} nodes={timelineNodes} activeNodeId={activeNode} />
        </div>
        <div className="flex-1 min-h-0">
          <p className="px-4 pt-3 text-[10px] font-mono text-slate-600 uppercase tracking-widest">Live Evidence</p>
          <div className="h-65">
            <EvidencePanel executionId={exec.id} />
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-white/5 flex gap-2">
        <Button variant="neon" size="sm" className="flex-1" onClick={() => openInspectorFor(exec.id)}>
          <Brain size={11} />
          AI Inspector
        </Button>
        {['created', 'queued', 'running'].includes(exec.status) && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => cancel(exec.id)}
            disabled={cancelling}
          >
            <Square size={11} />
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
        <Button variant="ghost" size="sm">
          <Download size={11} />
        </Button>
      </div>
    </motion.div>
  );
}

function TriggerButton() {
  const { data: workflows } = useWorkflows();
  const { mutate: trigger, isPending } = useTriggerExecution();

  if (!workflows?.length) return null;

  return (
    <Button
      variant="neon"
      size="sm"
      onClick={() => trigger({ workflow_id: workflows[0].id, trigger: 'manual', environment: 'staging', platform: 'web' })}
      disabled={isPending}
    >
      <Play size={11} />
      {isPending ? 'Launching…' : 'Run Workflow'}
    </Button>
  );
}

export default function ExecutionsPage() {
  const { data: executions = [], isLoading, refetch, isFetching } = useExecutions();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all'
    ? executions
    : executions.filter((e) => mapStatus(e.status) === filter);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default shrink-0">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-fg-subtle">
              Mode 2
            </p>
            <h1 className="text-lg font-bold tracking-tight text-fg-default mt-0.5">
              Executions
            </h1>
          </div>
          <TriggerButton />
        </div>

        {/* ── Toolbar ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-default bg-surface-1 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              placeholder="Search executions…"
              className="w-full bg-surface-2 border border-border-default rounded-lg pl-8 pr-3 py-1.5 text-xs text-fg-muted placeholder:text-fg-subtle focus:outline-none focus:border-accent-default transition-colors"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'running', 'success', 'failed', 'queued'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono capitalize transition-all ${
                  filter === f
                    ? 'bg-accent-soft text-accent-default border border-border-emphasis'
                    : 'text-fg-subtle hover:text-fg-default hover:bg-surface-2'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="text-fg-subtle hover:text-fg-default transition-colors ml-auto"
            title="Refresh"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Column headers ───────────────────────────────────────────── */}
        <div className="flex items-center px-5 py-2 border-b border-border-subtle text-[9px] font-mono text-fg-subtle uppercase tracking-[0.14em]">
          <div className="w-9 shrink-0 mr-4" />
          <div className="flex-1">Workflow / ID</div>
          <div className="hidden lg:flex items-center gap-8 shrink-0 mr-4">
            <span>Nodes</span>
            <span>Started</span>
          </div>
          <span className="w-20 text-right">Status</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={16} className="text-fg-subtle animate-spin mr-2" />
              <span className="text-sm text-fg-subtle">Loading executions…</span>
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-fg-subtle">
              <Terminal size={24} className="mb-2 opacity-40" />
              <p className="text-sm">No executions yet</p>
              <p className="text-[11px] mt-1">Run a workflow to see executions here</p>
            </div>
          )}
          {filtered.map((exec) => (
            <ExecutionRow
              key={exec.id}
              exec={exec}
              selected={selected === exec.id}
              onClick={() => setSelected(selected === exec.id ? null : exec.id)}
            />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 460, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
            className="bg-surface-1 border-l border-border-default shrink-0 overflow-hidden"
          >
            <ExecutionDetailPanel execId={selected} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
