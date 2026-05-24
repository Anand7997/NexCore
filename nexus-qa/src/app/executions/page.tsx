'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Brain, Terminal, Download, ChevronRight, RefreshCw, Play,
  Square, Activity, CheckCircle2, XCircle, Clock, Filter, Zap,
  ArrowUpRight, Wrench, Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { NodeHealthIndicator } from '@/components/ui/NodeHealthIndicator';
import { ExecutionTimeline } from '@/components/ui/ExecutionTimeline';
import { Button } from '@/components/ui/Button';
import { EvidencePanel } from '@/components/execution/EvidencePanel';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useUIStore } from '@/lib/stores/uiStore';
import { useRealtimeStore } from '@/lib/stores/realtimeStore';
import { useExecutions, useExecution, useCancelExecution, useDeleteExecution, useTriggerExecution, useTriggerTestCaseExecution } from '@/lib/api/executions';
import { useFixSuggestions, useImplementFixSuggestion } from '@/lib/api/intelligence';
import { useTestConfigurationTree } from '@/lib/api/testConfiguration';
import { useWorkflows } from '@/lib/api/workflows';
import { formatDuration, timeAgo } from '@/lib/utils';
import type { ExecutionStatus, WorkflowNode } from '@/types';
import type { ExecutionListItem, ExecutionDetail } from '@/lib/api/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapStatus(s: string): ExecutionStatus {
  if (s === 'completed') return 'success';
  if (s === 'created')   return 'queued';
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

const STATUS_ICON: Record<ExecutionStatus, React.ElementType> = {
  running:   Activity,
  success:   CheckCircle2,
  failed:    XCircle,
  queued:    Clock,
  retrying:  RefreshCw,
  skipped:   ArrowUpRight,
  cancelled: Square,
};

const PLATFORM_LABEL: Record<string, string> = {
  web: 'Web', android: 'Android', ios: 'iOS', desktop: 'Desktop',
};

const TRIGGER_LABEL: Record<string, string> = {
  manual: 'Manual', scheduled: 'Scheduled', webhook: 'Webhook', api: 'API',
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: `${color}25`, background: `${color}0a` }}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div>
        <p className="font-mono text-lg font-semibold leading-none" style={{ color }}>{value}</p>
        <p className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">{label}</p>
      </div>
    </motion.div>
  );
}

// ── Execution Row ─────────────────────────────────────────────────────────────

function ExecutionRow({
  exec, selected, onClick, workflowName,
}: {
  exec: ExecutionListItem; selected: boolean; onClick: () => void; workflowName: string;
}) {
  const status   = mapStatus(exec.status);
  const progress = exec.node_count > 0 ? exec.completed_nodes / exec.node_count : 0;
  const StatusIcon = STATUS_ICON[status] ?? Activity;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={[
        'group flex cursor-pointer items-center gap-4 border-b px-5 py-3.5 transition-all',
        selected
          ? 'border-l-2 border-l-[var(--color-accent-default)] bg-[rgba(91,140,255,0.06)] border-b-[var(--color-line-subtle)]'
          : 'border-b-[var(--color-line-subtle)] hover:bg-[rgba(255,255,255,0.02)]',
      ].join(' ')}
    >
      <div className="shrink-0">
        <NodeHealthIndicator status={status} progress={progress} size={36} strokeWidth={2.5} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="truncate text-[12px] font-medium text-[var(--color-fg-default)]">
            {workflowName || exec.workflow_id.slice(0, 12) + '…'}
          </span>
          <span className="shrink-0 text-[10px] font-mono text-[var(--color-fg-subtle)]">
            {PLATFORM_LABEL[exec.platform] ?? exec.platform}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">
          <span>{exec.id.slice(0, 10)}…</span>
          <span className="opacity-40">·</span>
          <span>{exec.environment}</span>
          <span className="opacity-40">·</span>
          <span>{TRIGGER_LABEL[exec.trigger] ?? exec.trigger}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="hidden text-right lg:block">
          <div className="text-[11px] font-mono text-[var(--color-fg-muted)]">{exec.completed_nodes}/{exec.node_count} nodes</div>
          <div className="text-[10px] text-[var(--color-fg-subtle)]">{formatDuration(durationMs(exec))}</div>
        </div>
        <div className="hidden text-right lg:block">
          <div className="text-[10px] font-mono text-[var(--color-fg-subtle)]">{exec.started_at ? timeAgo(exec.started_at) : '—'}</div>
        </div>
        <Badge status={status} size="sm" glow={status === 'running' || status === 'failed'} />
        <ChevronRight size={12} className={`text-[var(--color-fg-subtle)] transition-transform ${selected ? 'rotate-90' : ''}`} />
      </div>
    </motion.div>
  );
}

// ── Execution Detail Panel ─────────────────────────────────────────────────────

function DetailPanel({ execId, workflowName, onDeleted }: { execId: string; workflowName: string; onDeleted: () => void }) {
  useWebSocket(execId);
  const { data: exec, isLoading } = useExecution(execId);
  const { data: fixSuggestions = [] } = useFixSuggestions(execId);
  const implementFix = useImplementFixSuggestion();
  const { openInspectorFor } = useUIStore();
  const activeNodeMap = useRealtimeStore((s) => s.activeNodeMap);
  const activeNode    = activeNodeMap[execId];
  const { mutate: cancel, isPending: cancelling } = useCancelExecution();
  const { mutate: deleteExecution, isPending: deleting } = useDeleteExecution();

  if (isLoading || !exec) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw size={16} className="animate-spin text-[var(--color-fg-subtle)]" />
      </div>
    );
  }

  const status   = mapStatus(exec.status);
  const progress = exec.node_count > 0 ? exec.completed_nodes / exec.node_count : 0;
  const failedNode = exec.nodes.find((n) => n.status === 'failed');
  const failedFix = failedNode ? fixSuggestions.find((fix) => fix.node_key === failedNode.node_key) : undefined;
  const liveNode = activeNode ? exec.nodes.find((n) => n.node_key === activeNode) : undefined;

  const tlExec = {
    id: exec.id, workflowId: exec.workflow_id,
    workflowName: workflowName || exec.workflow_id.slice(0, 8),
    status, startedAt: exec.started_at ?? exec.created_at,
    duration: durationMs(exec), platform: exec.platform as 'web',
    environment: exec.environment, triggeredBy: exec.trigger,
    correlationId: exec.id, nodeCount: exec.node_count,
    completedNodes: exec.completed_nodes,
    failedNode: failedNode?.node_label, tags: [],
  };
  const tlNodes: WorkflowNode[] = exec.nodes.map((n) => ({
    id: n.node_key, type: n.node_type as WorkflowNode['type'],
    label: n.node_label, status: mapNodeStatus(n.status),
    duration: n.duration_ms ?? undefined, retries: n.attempt_count,
  }));

  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--color-line-subtle)] p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-[var(--color-fg-default)] truncate">
              {workflowName || 'Execution'}
            </h2>
            <p className="mt-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">{exec.id.slice(0, 16)}… · {exec.trigger} · {exec.environment}</p>
          </div>
          <Badge status={status} size="md" glow />
        </div>

        <div className="flex items-center gap-4">
          <NodeHealthIndicator status={status} progress={progress} size={52} strokeWidth={3} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 flex-1">
            {[
              { label: 'Platform',    value: exec.platform },
              { label: 'Environment', value: exec.environment },
              { label: 'Trigger',     value: exec.trigger },
              { label: 'Duration',    value: formatDuration(durationMs(exec)) },
              { label: 'Nodes',       value: `${exec.completed_nodes}/${exec.node_count}` },
              { label: 'Started',     value: exec.started_at ? timeAgo(exec.started_at) : '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[9px] font-mono uppercase text-[var(--color-fg-subtle)]">{label}</p>
                <p className="text-[11px] font-mono text-[var(--color-fg-muted)]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Failed node alert */}
      {failedNode && (
        <div className="mx-4 mt-3 shrink-0 rounded-lg border border-red-500/20 bg-red-500/8 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs font-semibold text-red-400">Failed Node</span>
          </div>
          <p className="font-mono text-xs text-red-300/80">{failedNode.node_label}</p>
          {failedNode.error && <p className="mt-0.5 text-[10px] text-red-400/60">{failedNode.error}</p>}
        </div>
      )}
      {exec.error && !failedNode && (
        <div className="mx-4 mt-3 shrink-0 rounded-lg border border-red-500/20 bg-red-500/8 p-3">
          <p className="font-mono text-xs text-red-300/80">{exec.error}</p>
        </div>
      )}

      {['created', 'queued', 'running'].includes(exec.status) && (
        <div className="mx-4 mt-3 shrink-0 rounded-lg border border-blue-500/20 bg-blue-500/8 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-300 animate-pulse" />
              Live execution
            </span>
            <span className="font-mono text-[10px] text-blue-300/70">{exec.completed_nodes}/{exec.node_count}</span>
          </div>
          <p className="truncate text-[11px] text-blue-100/80">
            {liveNode?.node_label ?? activeNode ?? 'Waiting for next runtime event...'}
          </p>
        </div>
      )}

      {failedFix && (
        <div className="mx-4 mt-3 shrink-0 rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Wrench size={12} className="shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300">{failedFix.title}</p>
                <p className="truncate text-[10px] text-[var(--color-fg-subtle)]">
                  {failedFix.target_type === 'page_element' ? 'Page Repository' : 'Test Configuration'} · {failedFix.field} · {Math.round(failedFix.confidence * 100)}%
                </p>
              </div>
            </div>
            <Button
              variant="neon"
              size="xs"
              disabled={!failedFix.can_implement || implementFix.isPending}
              onClick={() => implementFix.mutate({ executionId: exec.id, nodeKey: failedFix.node_key })}
              title={failedFix.blocked_reason ?? 'Apply this fix to configuration'}
            >
              <CheckCircle2 size={10} />
              {implementFix.isPending ? 'Implementing...' : 'Implement'}
            </Button>
          </div>
          <p className="mb-2 text-[10px] leading-relaxed text-[var(--color-fg-muted)]">{failedFix.rationale}</p>
          <div className="grid gap-1.5 font-mono text-[10px]">
            <div className="min-w-0 rounded border border-red-500/15 bg-red-500/8 px-2 py-1">
              <span className="text-red-300/70">Old: </span>
              <span className="break-all text-red-200">{failedFix.old_value || 'not set'}</span>
            </div>
            <div className="min-w-0 rounded border border-emerald-500/15 bg-emerald-500/8 px-2 py-1">
              <span className="text-emerald-300/70">New: </span>
              <span className="break-all text-emerald-200">{failedFix.new_value || failedFix.blocked_reason || 'pending discovery'}</span>
            </div>
          </div>
          {implementFix.isSuccess && (
            <p className="mt-2 text-[10px] text-emerald-300">Fix implemented. Re-run the execution to verify.</p>
          )}
          {implementFix.isError && (
            <p className="mt-2 text-[10px] text-red-300">Could not implement this suggestion. Refresh and review the latest analysis.</p>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="shrink-0 overflow-y-auto border-b border-[var(--color-line-subtle)] p-4" style={{ maxHeight: '40%' }}>
        <p className="mb-3 text-[10px] font-mono uppercase tracking-widest text-[var(--color-fg-subtle)]">Execution Path</p>
        <ExecutionTimeline execution={tlExec} nodes={tlNodes} activeNodeId={activeNode} />
      </div>

      {/* Evidence */}
      <div className="flex-1 min-h-0 flex flex-col">
        <p className="shrink-0 px-4 pt-3 text-[10px] font-mono uppercase tracking-widest text-[var(--color-fg-subtle)]">Live Evidence</p>
        <div className="flex-1 min-h-0">
          <EvidencePanel executionId={exec.id} />
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex gap-2 border-t border-[var(--color-line-subtle)] p-3">
        <Button variant="neon" size="sm" className="flex-1 justify-center" onClick={() => openInspectorFor(exec.id)}>
          <Brain size={11} /> AI Inspector
        </Button>
        {['created', 'queued', 'running'].includes(exec.status) && (
          <Button variant="danger" size="sm" onClick={() => cancel(exec.id)} disabled={cancelling}>
            <Square size={11} />{cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
        <Button
          variant="danger"
          size="sm"
          disabled={deleting}
          title="Delete execution"
          onClick={() => {
            if (window.confirm('Delete this execution and its evidence records?')) {
              deleteExecution(exec.id, { onSuccess: onDeleted });
            }
          }}
        >
          <Trash2 size={11} />{deleting ? 'Deleting...' : 'Delete'}
        </Button>
        <Button variant="ghost" size="sm" title="Download report">
          <Download size={11} />
        </Button>
      </div>
    </motion.div>
  );
}

// ── Trigger Panel ─────────────────────────────────────────────────────────────

function TriggerPanel({ onClose }: { onClose: () => void }) {
  const { data: workflows = [] } = useWorkflows();
  const { mutate: trigger, isPending } = useTriggerExecution();
  const [wfId, setWfId]   = useState(workflows[0]?.id ?? '');
  const [env,  setEnv]    = useState('staging');
  const [plat, setPlat]   = useState('web');

  function fire() {
    if (!wfId) return;
    trigger({ workflow_id: wfId, trigger: 'manual', environment: env, platform: plat }, {
      onSuccess: () => onClose(),
    });
  }

  const INP = 'w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      className="absolute right-4 top-16 z-30 w-72 rounded-2xl border border-[var(--color-line-default)] bg-[rgba(13,13,24,0.95)] p-4 shadow-2xl backdrop-blur-xl"
    >
      <h3 className="mb-4 text-sm font-semibold text-[var(--color-fg-default)]">Trigger Execution</h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Workflow</label>
          <select value={wfId} onChange={(e) => setWfId(e.target.value)} className={INP}>
            {workflows.length === 0
              ? <option value="">No workflows available</option>
              : workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)
            }
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Environment</label>
            <select value={env} onChange={(e) => setEnv(e.target.value)} className={INP}>
              {['staging','production','dev','qa'].map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Platform</label>
            <select value={plat} onChange={(e) => setPlat(e.target.value)} className={INP}>
              {['web','android','ios','desktop','api'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="sm" className="flex-1 justify-center" onClick={onClose}>Cancel</Button>
          <Button variant="neon" size="sm" className="flex-1 justify-center" onClick={fire} disabled={isPending || !wfId}>
            <Play size={11} />{isPending ? 'Launching…' : 'Run'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

function ExecutionLaunchPanel({ onClose, onLaunched }: { onClose: () => void; onLaunched: (executionId: string) => void }) {
  const { data: workflows = [] } = useWorkflows();
  const { data: testTree, isLoading: loadingCatalog } = useTestConfigurationTree();
  const { mutate: trigger, isPending } = useTriggerExecution();
  const { mutate: triggerTestCase, isPending: isLaunchingTestCase } = useTriggerTestCaseExecution();
  const projects = testTree?.projects ?? [];
  const [mode, setMode] = useState<'testcase' | 'workflow'>('testcase');
  const [wfId, setWfId] = useState(workflows[0]?.id ?? '');
  const [projectId, setProjectId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [env, setEnv] = useState('staging');
  const [plat, setPlat] = useState('web');

  const selectedProject = projects.find((p) => p.id === projectId) ?? projects[0] ?? null;
  const modules = selectedProject?.modules ?? [];
  const selectedModule = modules.find((m) => m.id === moduleId) ?? modules[0] ?? null;
  const cases = selectedModule?.test_cases ?? [];
  const selectedCase = cases.find((c) => c.id === caseId) ?? cases[0] ?? null;
  const totalCases = projects.reduce((sum, p) => sum + p.modules.reduce((moduleSum, m) => moduleSum + m.test_cases.length, 0), 0);

  useEffect(() => {
    if (!wfId && workflows[0]?.id) setWfId(workflows[0].id);
  }, [wfId, workflows]);

  useEffect(() => {
    if (!selectedProject) return;
    if (projectId !== selectedProject.id) setProjectId(selectedProject.id);
    const nextModule = selectedProject.modules.find((m) => m.id === moduleId) ?? selectedProject.modules[0];
    if (nextModule && moduleId !== nextModule.id) setModuleId(nextModule.id);
    const nextCase = nextModule?.test_cases.find((c) => c.id === caseId) ?? nextModule?.test_cases[0];
    if (nextCase && caseId !== nextCase.id) setCaseId(nextCase.id);
  }, [caseId, moduleId, projectId, selectedProject]);

  function fire() {
    if (mode === 'workflow') {
      if (!wfId) return;
      trigger({ workflow_id: wfId, trigger: 'manual', environment: env, platform: plat }, {
        onSuccess: (res) => {
          onLaunched(res.execution_id);
          onClose();
        },
      });
      return;
    }
    if (!selectedCase || !selectedProject || !selectedModule) return;
    triggerTestCase({
      test_case_ids: [selectedCase.id],
      project_id: selectedProject.id,
      module_id: selectedModule.id,
      trigger: 'manual',
      environment: env,
      platform: plat,
      variables: selectedCase.default_variables ?? {},
    }, {
      onSuccess: (res) => {
        onLaunched(res.execution_id);
        onClose();
      },
    });
  }

  const INP = 'w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)] disabled:opacity-50';
  const launchDisabled = mode === 'workflow' ? !wfId || isPending : !selectedCase || isLaunchingTestCase;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      className="absolute right-4 top-16 z-30 w-80 rounded-2xl border border-[var(--color-line-default)] bg-[rgba(13,13,24,0.95)] p-4 shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-fg-default)]">Trigger Execution</h3>
        <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">{totalCases} cases</span>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--color-line-default)] bg-black/20 p-1">
          <button type="button" onClick={() => setMode('testcase')}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${mode === 'testcase' ? 'bg-[rgba(91,140,255,0.16)] text-[#9db8ff]' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)]'}`}>
            Test Case
          </button>
          <button type="button" onClick={() => setMode('workflow')}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${mode === 'workflow' ? 'bg-[rgba(91,140,255,0.16)] text-[#9db8ff]' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)]'}`}>
            Workflow
          </button>
        </div>

        {mode === 'testcase' ? (
          <>
            <div>
              <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Project</label>
              <select value={selectedProject?.id ?? ''} onChange={(e) => setProjectId(e.target.value)} className={INP}>
                {loadingCatalog
                  ? <option value="">Loading projects...</option>
                  : projects.length === 0
                    ? <option value="">No projects with test cases</option>
                    : projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)
                }
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Module</label>
              <select value={selectedModule?.id ?? ''} onChange={(e) => setModuleId(e.target.value)} className={INP} disabled={!selectedProject}>
                {modules.length === 0
                  ? <option value="">No modules available</option>
                  : modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)
                }
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Test Case</label>
              <select value={selectedCase?.id ?? ''} onChange={(e) => setCaseId(e.target.value)} className={INP} disabled={!selectedModule}>
                {cases.length === 0
                  ? <option value="">No test cases available</option>
                  : cases.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
                }
              </select>
              {selectedCase && (
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--color-fg-subtle)]">
                  <span>{selectedCase.test_steps.length} steps</span>
                  <span>{selectedCase.priority} / {selectedCase.test_type}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Workflow</label>
            <select value={wfId} onChange={(e) => setWfId(e.target.value)} className={INP}>
              {workflows.length === 0
                ? <option value="">No workflows available</option>
                : workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)
              }
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Environment</label>
            <select value={env} onChange={(e) => setEnv(e.target.value)} className={INP}>
              {['staging', 'production', 'dev', 'qa'].map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Platform</label>
            <select value={plat} onChange={(e) => setPlat(e.target.value)} className={INP}>
              {['web', 'android', 'ios', 'desktop', 'api'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="sm" className="flex-1 justify-center" onClick={onClose}>Cancel</Button>
          <Button variant="neon" size="sm" className="flex-1 justify-center" onClick={fire} disabled={launchDisabled}>
            <Play size={11} />{isPending || isLaunchingTestCase ? 'Launching...' : 'Run'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

const FILTERS = ['all', 'running', 'success', 'failed', 'queued'] as const;
type Filter = typeof FILTERS[number];

export default function ExecutionsPage() {
  const { data: executions = [], isLoading, refetch, isFetching } = useExecutions();
  const { data: workflows = [] } = useWorkflows();
  const [selected,    setSelected]    = useState<string | null>(null);
  const [filter,      setFilter]      = useState<Filter>('all');
  const [search,      setSearch]      = useState('');
  const [triggerOpen, setTriggerOpen] = useState(false);

  const wfNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const w of workflows) m[w.id] = w.name;
    return m;
  }, [workflows]);

  const filtered = useMemo(() => {
    let list = filter === 'all' ? executions : executions.filter((e) => mapStatus(e.status) === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.id.toLowerCase().includes(q) ||
        (wfNameMap[e.workflow_id] ?? '').toLowerCase().includes(q) ||
        e.environment.toLowerCase().includes(q)
      );
    }
    return list;
  }, [executions, filter, search, wfNameMap]);

  // Stats
  const running  = executions.filter((e) => e.status === 'running').length;
  const success  = executions.filter((e) => mapStatus(e.status) === 'success').length;
  const failed   = executions.filter((e) => e.status === 'failed').length;
  const queued   = executions.filter((e) => mapStatus(e.status) === 'queued').length;

  return (
    <div className="relative flex h-full overflow-hidden">

      {/* ── Left: list ─────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          className="shrink-0 border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-6 py-4"
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Mode 2 — Execution Engine</p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--color-fg-default)]">Run Executions</h1>
            </div>
            <div className="relative">
              <Button variant="neon" size="sm" onClick={() => setTriggerOpen((v) => !v)}>
                <Play size={11} /> New Execution
              </Button>
              <AnimatePresence>
                {triggerOpen && (
                  <ExecutionLaunchPanel
                    onClose={() => setTriggerOpen(false)}
                    onLaunched={(executionId) => setSelected(executionId)}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Running"  value={running}  icon={Activity}      color="#5b8cff" />
            <StatCard label="Passed"   value={success}  icon={CheckCircle2}  color="#45c08a" />
            <StatCard label="Failed"   value={failed}   icon={XCircle}       color="#f06262" />
            <StatCard label="Queued"   value={queued}   icon={Clock}         color="#f0b558" />
          </div>
        </motion.div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 shrink-0 border-b border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] px-5 py-2.5">
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, workflow, env…"
              className="w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] pl-8 pr-3 py-1.5 text-xs text-[var(--color-fg-default)] placeholder:text-[var(--color-fg-subtle)] outline-none transition-colors focus:border-[var(--color-accent-default)]"
            />
          </div>

          <div className="flex items-center gap-1">
            <Filter size={11} className="text-[var(--color-fg-subtle)]" />
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={[
                  'rounded-md px-2.5 py-1 text-[10px] font-mono capitalize transition-all',
                  filter === f
                    ? 'bg-[rgba(91,140,255,0.12)] text-[#5b8cff] border border-[rgba(91,140,255,0.3)]'
                    : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)] hover:bg-[var(--color-surface-2)]',
                ].join(' ')}>
                {f}
              </button>
            ))}
          </div>

          <button onClick={() => refetch()} title="Refresh" className="ml-auto text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg-default)]">
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Column headers */}
        <div className="flex shrink-0 items-center border-b border-[var(--color-line-subtle)] px-5 py-2 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
          <div className="mr-4 w-9 shrink-0" />
          <div className="flex-1">Workflow / ID</div>
          <div className="mr-4 hidden items-center gap-8 lg:flex shrink-0">
            <span>Nodes</span>
            <span>Started</span>
          </div>
          <span className="w-20 text-right">Status</span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-2">
              <RefreshCw size={14} className="animate-spin text-[var(--color-fg-subtle)]" />
              <span className="text-sm text-[var(--color-fg-subtle)]">Loading executions…</span>
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--color-fg-subtle)]">
              <Terminal size={28} className="mb-3 opacity-30" />
              <p className="text-sm">No executions{filter !== 'all' ? ` with status "${filter}"` : ''}</p>
              {executions.length === 0 && (
                <p className="mt-1 text-[11px]">Click "New Execution" to run a workflow</p>
              )}
            </div>
          )}
          {filtered.map((exec, i) => (
            <motion.div key={exec.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
              <ExecutionRow
                exec={exec}
                selected={selected === exec.id}
                workflowName={wfNameMap[exec.workflow_id] ?? ''}
                onClick={() => setSelected(selected === exec.id ? null : exec.id)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Right: detail panel ────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key="detail"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 460, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
            className="shrink-0 overflow-hidden border-l border-[var(--color-line-default)] bg-[var(--color-surface-1)]"
          >
            <DetailPanel
              execId={selected}
              workflowName={wfNameMap[executions.find((e) => e.id === selected)?.workflow_id ?? ''] ?? ''}
              onDeleted={() => setSelected(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
