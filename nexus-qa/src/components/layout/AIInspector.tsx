'use client';

import { useUIStore } from '@/lib/stores/uiStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useExecution } from '@/lib/api/executions';
import {
  useFixSuggestions,
  useImplementFixSuggestion,
} from '@/lib/api/intelligence';
import { timeAgo } from '@/lib/utils';
import { CheckCircle2, RefreshCw, ShieldCheck, Wrench, X } from 'lucide-react';

function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function executionTitle(exec: NonNullable<ReturnType<typeof useExecution>['data']>): string {
  return exec.display_name
    || [exec.project_name, exec.module_name, exec.test_case_name].filter(Boolean).join('_')
    || exec.workflow_name?.replace(/^Execution -\s*/i, '')
    || 'execution';
}

export function AIInspector() {
  const { inspectorExecutionId, closeInspector } = useUIStore();
  const { data: exec, isLoading } = useExecution(inspectorExecutionId);
  const {
    data: fixes = [],
    isLoading: fixesLoading,
    refetch: refetchFixes,
  } = useFixSuggestions(inspectorExecutionId);
  const implementFix = useImplementFixSuggestion();

  if (!inspectorExecutionId) return null;

  if (isLoading || !exec) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw size={16} className="animate-spin text-slate-500" />
      </div>
    );
  }

  const failedNode = exec.nodes.find((node) => node.status === 'failed');
  const badgeStatus = exec.status === 'completed' ? 'success' : exec.status === 'created' ? 'queued' : exec.status;
  const title = executionTitle(exec);
  const primaryFix = failedNode
    ? fixes.find((item) => item.node_key === failedNode.node_key) ?? fixes[0]
    : fixes[0];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-start justify-between border-b border-white/6 p-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge status={badgeStatus} size="xs" glow />
            <span className="text-[10px] uppercase tracking-wider text-slate-600">Execution</span>
          </div>
          <p className="truncate text-sm font-medium text-white">{title}</p>
          <p className="text-[10px] text-slate-500">
            {exec.environment} / {exec.platform} / {timeAgo(exec.started_at ?? exec.created_at)}
          </p>
        </div>
        <Button variant="ghost" size="xs" onClick={closeInspector}>
          <X size={12} />
        </Button>
      </div>

      <div className="flex flex-1 flex-col divide-y divide-white/5 overflow-y-auto">
        <div className="p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
            <ShieldCheck size={10} className="text-cyan-400" />
            Execution Quick Heal
          </p>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/8 p-3">
            <p className="text-xs font-semibold text-cyan-200">Minor locator and element fixes only</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              This panel only promotes verified fallback locators or Page Repository alternatives into Test Configuration.
              Full root-cause, flaky, environment, and system-level analysis stays in the AI Inspect dashboard.
            </p>
          </div>
        </div>

        {failedNode && (
          <div className="p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-600">Failed Node</p>
            <div className="rounded-lg border border-red-500/20 bg-red-500/8 p-3">
              <p className="text-xs font-semibold text-red-300">{failedNode.node_label}</p>
              {failedNode.error && (
                <p className="mt-1 text-[10px] leading-relaxed text-red-300/70">{failedNode.error}</p>
              )}
            </div>
          </div>
        )}

        <div className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
              <Wrench size={10} className="text-emerald-400" />
              Suggested Minor Fixes
            </p>
            <Button
              variant="ghost"
              size="xs"
              disabled={fixesLoading}
              onClick={() => void refetchFixes()}
            >
              <RefreshCw size={10} className={fixesLoading ? 'animate-spin' : ''} />
              Scan
            </Button>
          </div>

          {fixesLoading && (
            <p className="text-[10px] text-slate-500">Scanning execution evidence for locator or element fixes...</p>
          )}

          {!fixesLoading && fixes.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold text-slate-300">No safe quick-heal fix found</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                The failure is either not a minor locator issue, or no verified fallback locator exists yet.
                Use Page Discovery to capture alternatives, or open AI Inspect for a deeper investigation.
              </p>
            </div>
          )}

          {!fixesLoading && primaryFix && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-300">{primaryFix.title}</p>
                  <p className="mt-1 text-[10px] text-emerald-300/70">
                    {primaryFix.target_type === 'page_element' ? 'Page Repository' : 'Test Step'} /
                    {' '}{confidenceLabel(primaryFix.confidence)} confidence
                  </p>
                </div>
                <span className="rounded-full border border-emerald-500/25 px-2 py-0.5 text-[9px] uppercase tracking-wider text-emerald-200">
                  Minor
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{primaryFix.rationale}</p>
              <div className="mt-2 space-y-1 font-mono text-[10px]">
                <p className="break-all text-red-300/80">Old: {primaryFix.old_value || 'not set'}</p>
                <p className="break-all text-emerald-300/80">
                  New: {primaryFix.new_value || primaryFix.blocked_reason || 'pending discovery'}
                </p>
              </div>
              <Button
                variant="neon"
                size="xs"
                className="mt-3 w-full justify-center"
                disabled={!primaryFix.can_implement || implementFix.isPending}
                onClick={() => implementFix.mutate({ executionId: exec.id, nodeKey: primaryFix.node_key })}
              >
                <CheckCircle2 size={10} />
                {implementFix.isPending ? 'Implementing...' : 'Implement in Config DB'}
              </Button>
              {!primaryFix.can_implement && primaryFix.blocked_reason && (
                <p className="mt-2 text-[10px] leading-relaxed text-amber-300/80">{primaryFix.blocked_reason}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
