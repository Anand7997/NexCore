'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '@/lib/stores/uiStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useExecution } from '@/lib/api/executions';
import { type AssistantQueryResponse, useAskAIInspectAssistant, useFixSuggestions } from '@/lib/api/intelligence';
import { timeAgo } from '@/lib/utils';
import { Bot, FileSearch, RefreshCw, ShieldCheck, X } from 'lucide-react';

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
  const [scanRequested, setScanRequested] = useState(false);
  const [assistantResult, setAssistantResult] = useState<AssistantQueryResponse | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const { data: exec, isLoading } = useExecution(inspectorExecutionId);
  const askAssistant = useAskAIInspectAssistant();
  const {
    data: fixes = [],
    isLoading: fixesLoading,
    isFetching: fixesFetching,
    refetch: refetchFixes,
  } = useFixSuggestions(inspectorExecutionId, scanRequested);

  useEffect(() => {
    setScanRequested(false);
    setAssistantResult(null);
    setAssistantError(null);
  }, [inspectorExecutionId]);

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
  const scanning = fixesLoading || fixesFetching || askAssistant.isPending;
  const runScan = () => {
    if (!inspectorExecutionId) return;
    setAssistantResult(null);
    setAssistantError(null);
    if (!scanRequested) {
      setScanRequested(true);
    } else {
      void refetchFixes();
    }
    askAssistant.mutate(
      {
        executionId: inspectorExecutionId,
        question: 'Scan this execution and explain the most likely failure cause. Keep it short and do not implement changes.',
        preferredProvider: 'openai',
        preferredModel: 'gpt-5.5',
      },
      {
        onSuccess: setAssistantResult,
        onError: (error) => {
          setAssistantError(error instanceof Error ? error.message : 'Mini AI Bot could not reach OpenAI gpt-5.5.');
        },
      },
    );
  };

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
            Mini AI Bot
          </p>
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/8 p-3">
            <p className="text-xs font-semibold text-cyan-200">Scan-only diagnosis for this execution</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
              This panel explains the likely problem without changing workflow, page, or test-step configuration.
              Use AI Inspect Lab when you need full root cause analysis and implementation plans.
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
              <Bot size={10} className="text-emerald-400" />
              Diagnosis
            </p>
            <Button
              variant="ghost"
              size="xs"
              disabled={scanning}
              onClick={runScan}
            >
              <RefreshCw size={10} className={scanning ? 'animate-spin' : ''} />
              Scan
            </Button>
          </div>

          {!scanRequested && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <FileSearch size={12} className="text-cyan-300" />
                Ready to scan
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                Click Scan and Mini AI Bot will read the failed node, runtime error, and available quick-heal evidence to explain the problem.
              </p>
            </div>
          )}

          {scanRequested && scanning && (
            <p className="text-[10px] text-slate-500">Mini AI Bot is scanning execution evidence for the most likely problem...</p>
          )}

          {scanRequested && !scanning && assistantError && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3">
              <p className="text-xs font-semibold text-amber-200">OpenAI scan unavailable</p>
              <p className="mt-1 text-[10px] leading-relaxed text-amber-100/70">{assistantError}</p>
            </div>
          )}

          {scanRequested && !scanning && assistantResult && (
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/8 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-cyan-200">OpenAI diagnosis</p>
                <span className="shrink-0 rounded-full border border-cyan-500/25 px-2 py-0.5 text-[9px] uppercase tracking-wider text-cyan-100">
                  {assistantResult.model || 'gpt-5.5'}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-slate-300">{assistantResult.answer}</p>
            </div>
          )}

          {scanRequested && !scanning && fixes.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold text-slate-300">Problem summary</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                {failedNode?.error || exec.error || 'No failed-node error was captured. Run AI Inspect Lab for a deeper evidence scan.'}
              </p>
            </div>
          )}

          {scanRequested && !scanning && primaryFix && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-300">Problem found: {primaryFix.title}</p>
                  <p className="mt-1 text-[10px] text-emerald-300/70">
                    {primaryFix.target_type === 'page_element' ? 'Page Repository' : primaryFix.target_type === 'workflow_node' ? 'Workflow Node' : 'Test Step'} /
                    {' '}{confidenceLabel(primaryFix.confidence)} confidence
                  </p>
                </div>
                <span className="rounded-full border border-emerald-500/25 px-2 py-0.5 text-[9px] uppercase tracking-wider text-emerald-200">
                  {primaryFix.category === 'desktop_launch_config' ? 'Config' : 'Minor'}
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{primaryFix.rationale}</p>
              <div className="mt-2 space-y-1 font-mono text-[10px]">
                <p className="break-all text-red-300/80">Current: {primaryFix.old_value || failedNode?.error || 'not set'}</p>
                <p className="break-all text-emerald-300/80">
                  Suggested direction: {primaryFix.new_value || primaryFix.blocked_reason || 'needs deeper evidence'}
                </p>
              </div>
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
