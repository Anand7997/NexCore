import { useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Play, RefreshCw, Search, Trash2, XCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExecutionLiveStream } from '@/hooks/useExecutionLiveStream';
import { useCancelExecution, useDeleteExecution, useExecution, useExecutions, useTriggerExecution, useTriggerTestCaseExecution } from '@/lib/advanced-api/executions';
import { useFixSuggestions, useImplementFixSuggestion } from '@/lib/advanced-api/intelligence';
import { useTestConfigurationTree } from '@/lib/advanced-api/testConfiguration';
import type { ExecutionDetail, ExecutionListItem, ExecutionNode, ExecutionStatus, TestCase, TestModule, TestProject, WorkflowListItem } from '@/lib/advanced-api/types';
import { useWorkflows } from '@/lib/advanced-api/workflows';
import { formatDuration, timeAgo } from '@/lib/utils';
import { EvidencePanel } from './EvidencePanel';
import { MetricCard, ProgressRing, SeverityPill, StatusPill, WorkspacePanel, type UiExecutionStatus } from './WorkspacePrimitives';

type TriggerMode = 'workflow' | 'testcase';

type FlatTestCase = {
  project: TestProject;
  module: TestModule;
  testCase: TestCase;
};

function mapExecutionStatus(status: ExecutionStatus): UiExecutionStatus {
  if (status === 'completed') return 'success';
  if (status === 'created') return 'queued';
  return status as UiExecutionStatus;
}

function mapNodeStatus(status: ExecutionNode['status']): UiExecutionStatus {
  if (status === 'completed') return 'success';
  if (status === 'created' || status === 'waiting') return 'queued';
  return status as UiExecutionStatus;
}

function durationMs(execution: Pick<ExecutionListItem, 'started_at' | 'completed_at'>): number {
  if (!execution.started_at) return 0;
  const end = execution.completed_at ? new Date(execution.completed_at).getTime() : Date.now();
  return end - new Date(execution.started_at).getTime();
}

function executionLabel(execution: ExecutionListItem): string {
  return (
    execution.display_name ||
    [execution.project_name, execution.module_name, execution.test_case_name].filter(Boolean).join(' / ') ||
    execution.workflow_name ||
    execution.id.slice(0, 8)
  );
}

function isLaunchableWorkflow(workflow: WorkflowListItem): boolean {
  const tags = new Set((workflow.tags ?? []).map((tag) => tag.toLowerCase()));
  return workflow.status === 'active' && !tags.has('auto-execution') && !workflow.name.toLowerCase().startsWith('execution -');
}

function parseVariables(input: string): Record<string, unknown> | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed) as Record<string, unknown>;
}

export default function AdvancedExecutionDashboard() {
  const { data: executions = [], refetch, isLoading } = useExecutions(undefined, undefined, 100);
  const { data: workflows = [] } = useWorkflows('active');
  const { data: tree } = useTestConfigurationTree();
  const triggerExecution = useTriggerExecution();
  const triggerTestCaseExecution = useTriggerTestCaseExecution();

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<TriggerMode>('workflow');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedFlatTestCaseId, setSelectedFlatTestCaseId] = useState('');
  const [environment, setEnvironment] = useState('qa');
  const [platform, setPlatform] = useState('web');
  const [variablesInput, setVariablesInput] = useState('{\n  "tenant_id": "default"\n}');
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const launchableWorkflows = useMemo(() => workflows.filter(isLaunchableWorkflow), [workflows]);
  const flatTestCases = useMemo<FlatTestCase[]>(() => {
    return (tree?.projects ?? []).flatMap((project) =>
      project.modules.flatMap((module) =>
        module.test_cases.map((testCase) => ({
          project,
          module,
          testCase,
        })),
      ),
    );
  }, [tree]);

  const selectedFlatTestCase = flatTestCases.find((entry) => entry.testCase.id === selectedFlatTestCaseId) ?? null;
  const selectedDetailExecutionId =
    executions.some((execution) => execution.id === selectedExecutionId) ? selectedExecutionId : executions[0]?.id ?? null;

  const filteredExecutions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return executions;
    return executions.filter((execution) =>
      [
        executionLabel(execution),
        execution.status,
        execution.platform,
        execution.environment,
        execution.workflow_name,
        execution.id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [executions, query]);

  const metrics = useMemo(() => {
    const running = executions.filter((execution) => execution.status === 'running').length;
    const failed = executions.filter((execution) => execution.status === 'failed').length;
    const completedDurations = executions
      .filter((execution) => execution.started_at)
      .map((execution) => durationMs(execution))
      .filter((value) => value > 0);

    return {
      running,
      failed,
      avgDuration: completedDurations.length
        ? formatDuration(Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length))
        : '0s',
    };
  }, [executions]);

  async function handleTrigger() {
    setTriggerError(null);

    try {
      const variables = parseVariables(variablesInput);

      if (mode === 'workflow') {
        if (!selectedWorkflowId) {
          setTriggerError('Select a workflow before launching.');
          return;
        }

        const result = await triggerExecution.mutateAsync({
          workflow_id: selectedWorkflowId,
          environment,
          platform,
          trigger: 'manual',
          variables,
        });

        setSelectedExecutionId(result.execution_id);
        return;
      }

      if (!selectedFlatTestCase) {
        setTriggerError('Select a test case before launching.');
        return;
      }

      const result = await triggerTestCaseExecution.mutateAsync({
        test_case_ids: [selectedFlatTestCase.testCase.id],
        project_id: selectedFlatTestCase.project.id,
        module_id: selectedFlatTestCase.module.id,
        environment,
        platform,
        trigger: 'manual',
        variables,
      });

      setSelectedExecutionId(result.execution_id);
    } catch (error) {
      setTriggerError(error instanceof Error ? error.message : 'Could not launch execution.');
    }
  }

  return (
    <div className="ai-workflow-scope relative overflow-hidden rounded-[28px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_28%),var(--color-bg-base)]" />
      <div className="relative space-y-6 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status="running" label="Execution Monitor" />
              <StatusPill status="queued" label={isLoading ? 'Loading' : `${executions.length} runs`} />
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-[var(--color-fg-default)] md:text-4xl">
              Advanced execution dashboard
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--color-fg-muted)]">
              Live execution results, launch controls, streamed browser evidence, and quick-heal suggestions from the advanced stack.
            </p>
          </div>
          <Button variant="ghost" className="border border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Running" value={String(metrics.running)} detail="Currently active executions" />
          <MetricCard label="Failed" value={String(metrics.failed)} detail="Failures available for AI inspection" />
          <MetricCard label="Average Duration" value={metrics.avgDuration} detail="Across fetched executions" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_480px]">
          <WorkspacePanel className="space-y-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Launch Control</div>
              <div className="mt-3 inline-flex rounded-full border border-white/10 bg-black/15 p-1">
                {(['workflow', 'testcase'] as TriggerMode[]).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setMode(entry)}
                    className={
                      mode === entry
                        ? 'rounded-full bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100'
                        : 'rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500'
                    }
                  >
                    {entry === 'workflow' ? 'Workflow' : 'Test Case'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'workflow' ? (
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-300">Workflow</span>
                <select
                  className="h-11 w-full rounded-2xl border border-white/10 bg-[var(--color-surface-1)] px-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                  value={selectedWorkflowId}
                  onChange={(event) => setSelectedWorkflowId(event.target.value)}
                >
                  <option value="">Select workflow</option>
                  {launchableWorkflows.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-300">Test Case</span>
                <select
                  className="h-11 w-full rounded-2xl border border-white/10 bg-[var(--color-surface-1)] px-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                  value={selectedFlatTestCaseId}
                  onChange={(event) => setSelectedFlatTestCaseId(event.target.value)}
                >
                  <option value="">Select test case</option>
                  {flatTestCases.map((entry) => (
                    <option key={entry.testCase.id} value={entry.testCase.id}>
                      {entry.project.name} / {entry.module.name} / {entry.testCase.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-300">Environment</span>
                <input
                  value={environment}
                  onChange={(event) => setEnvironment(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-[var(--color-surface-1)] px-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-300">Platform</span>
                <input
                  value={platform}
                  onChange={(event) => setPlatform(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-[var(--color-surface-1)] px-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                />
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-semibold text-slate-300">Variables JSON</span>
              <textarea
                value={variablesInput}
                onChange={(event) => setVariablesInput(event.target.value)}
                rows={8}
                className="w-full rounded-3xl border border-white/10 bg-[var(--color-surface-1)] px-3 py-3 font-mono text-xs text-white outline-none transition focus:border-cyan-300/40"
              />
            </label>

            {selectedFlatTestCase ? (
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/5 px-4 py-3 text-xs text-emerald-100">
                {selectedFlatTestCase.project.name} / {selectedFlatTestCase.module.name} / {selectedFlatTestCase.testCase.name}
              </div>
            ) : null}

            {triggerError ? (
              <div className="rounded-2xl border border-red-300/20 bg-red-300/5 px-4 py-3 text-sm text-red-100">{triggerError}</div>
            ) : null}

            <Button
              onClick={handleTrigger}
              disabled={triggerExecution.isPending || triggerTestCaseExecution.isPending}
              className="h-11 rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              <Play className="h-4 w-4" />
              {triggerExecution.isPending || triggerTestCaseExecution.isPending ? 'Launching...' : 'Launch Execution'}
            </Button>
          </WorkspacePanel>

          <WorkspacePanel className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/15 px-4 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by workflow, test case, status, platform, or id"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-3">
              {filteredExecutions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 px-4 py-14 text-center text-sm text-slate-500">
                  No executions matched the current filter.
                </div>
              ) : (
                filteredExecutions.map((execution) => (
                  <ExecutionRow
                    key={execution.id}
                    execution={execution}
                    selected={execution.id === selectedDetailExecutionId}
                    onClick={() => setSelectedExecutionId(execution.id)}
                  />
                ))
              )}
            </div>
          </WorkspacePanel>

          <ExecutionDetailPanel executionId={selectedDetailExecutionId} />
        </div>
      </div>
    </div>
  );
}

function ExecutionRow({
  execution,
  selected,
  onClick,
}: {
  execution: ExecutionListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const status = mapExecutionStatus(execution.status);

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? 'w-full rounded-3xl border border-cyan-300/20 bg-cyan-300/8 p-4 text-left'
          : 'w-full rounded-3xl border border-white/8 bg-white/[0.035] p-4 text-left transition hover:border-white/15 hover:bg-white/[0.05]'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{executionLabel(execution)}</div>
          <div className="mt-1 text-xs text-slate-400">
            {execution.platform} · {execution.environment} · {timeAgo(execution.created_at)}
          </div>
        </div>
        <StatusPill status={status} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nodes</div>
          <div className="mt-1 text-sm text-slate-200">
            {execution.completed_nodes}/{execution.node_count}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Duration</div>
          <div className="mt-1 text-sm text-slate-200">{execution.started_at ? formatDuration(durationMs(execution)) : 'pending'}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trigger</div>
          <div className="mt-1 text-sm text-slate-200">{execution.trigger}</div>
        </div>
      </div>
      {execution.error ? <div className="mt-3 text-sm text-red-100">{execution.error}</div> : null}
    </button>
  );
}

function ExecutionDetailPanel({ executionId }: { executionId: string | null }) {
  const { data: execution } = useExecution(executionId);
  const liveStream = useExecutionLiveStream(executionId);
  const { data: fixes = [] } = useFixSuggestions(executionId, Boolean(executionId));
  const implementFix = useImplementFixSuggestion();
  const cancelExecution = useCancelExecution();
  const deleteExecution = useDeleteExecution();

  if (!executionId) {
    return (
      <WorkspacePanel className="flex items-center justify-center">
        <div className="text-center text-sm text-slate-500">Select an execution to inspect details, evidence, and fixes.</div>
      </WorkspacePanel>
    );
  }

  if (!execution) {
    return (
      <WorkspacePanel className="flex items-center justify-center">
        <div className="text-center text-sm text-slate-500">Loading execution details...</div>
      </WorkspacePanel>
    );
  }

  const status = mapExecutionStatus(execution.status);
  const progress = execution.node_count > 0 ? execution.completed_nodes / execution.node_count : 0;
  const terminal = execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled';

  return (
    <WorkspacePanel className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            {liveStream.connected ? <StatusPill status="running" label="Live Socket" /> : null}
          </div>
          <h2 className="mt-3 truncate text-xl font-semibold text-white">{executionLabel(execution)}</h2>
          <p className="mt-1 text-sm text-slate-400">{execution.workflow_name || execution.workflow_id}</p>
        </div>
        <ProgressRing progress={progress} status={status} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Environment" value={execution.environment || 'n/a'} detail={execution.platform || 'n/a'} />
        <MetricCard label="Duration" value={execution.started_at ? formatDuration(durationMs(execution)) : 'pending'} detail={timeAgo(execution.created_at)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {!terminal ? (
          <Button
            variant="ghost"
            className="border border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15"
            onClick={() => cancelExecution.mutate(execution.id)}
          >
            <XCircle className="h-4 w-4" />
            Cancel
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="border border-red-300/20 bg-red-300/10 text-red-100 hover:bg-red-300/15"
          onClick={() => deleteExecution.mutate(execution.id)}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        {execution.error ? (
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-red-300/20 bg-red-300/5 px-3 py-2 text-xs text-red-100">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="truncate">{execution.error}</span>
          </div>
        ) : null}
      </div>

      <section className="space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Node Timeline</div>
        <div className="space-y-2">
          {execution.nodes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
              No node timeline has been recorded yet.
            </div>
          ) : (
            execution.nodes.map((node) => (
              <div
                key={node.id}
                className={
                  liveStream.activeNodeId === node.id || liveStream.activeNodeId === node.node_key
                    ? 'rounded-2xl border border-cyan-300/20 bg-cyan-300/8 px-4 py-3'
                    : 'rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3'
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{node.node_label || node.node_key}</div>
                    <div className="mt-1 text-xs text-slate-400">{node.node_type}</div>
                  </div>
                  <StatusPill status={mapNodeStatus(node.status)} label={node.status} />
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  attempt {node.attempt_count} · {node.duration_ms ? formatDuration(node.duration_ms) : 'pending'}
                </div>
                {node.error ? <div className="mt-2 text-sm text-red-100">{node.error}</div> : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Quick Heal Suggestions</div>
        {fixes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
            No automated fix suggestions are currently available.
          </div>
        ) : (
          <div className="space-y-3">
            {fixes.map((fix) => (
              <div key={fix.id} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">{fix.title}</div>
                    <div className="mt-1 text-xs text-slate-400">{fix.node_label}</div>
                  </div>
                  <SeverityPill severity={`${Math.round(fix.confidence * 100)}%`} />
                </div>
                <p className="mt-3 text-sm text-slate-300">{fix.rationale}</p>
                <div className="mt-3 text-xs text-slate-500">
                  {fix.field}: <span className="text-red-200">{fix.old_value || 'empty'}</span> →{' '}
                  <span className="text-emerald-200">{fix.new_value || 'empty'}</span>
                </div>
                {fix.can_implement ? (
                  <Button
                    variant="ghost"
                    className="mt-4 border border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
                    onClick={() => implementFix.mutate({ executionId: execution.id, nodeKey: fix.node_key })}
                  >
                    <Zap className="h-4 w-4" />
                    Apply fix
                  </Button>
                ) : (
                  <div className="mt-4 text-xs text-amber-100">{fix.blocked_reason || 'Suggestion available for manual review only.'}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Live Evidence</div>
        <EvidencePanel executionId={execution.id} bucket={liveStream.bucket} />
      </section>

      <section className="space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Recent Logs</div>
        {liveStream.logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
            No terminal logs have streamed for this execution yet.
          </div>
        ) : (
          <div className="space-y-2">
            {liveStream.logs.slice().reverse().slice(0, 8).map((log) => (
              <div key={log.id} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 font-mono text-xs text-slate-300">
                <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <span>{log.level}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="mt-2 break-words">{log.message}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </WorkspacePanel>
  );
}
