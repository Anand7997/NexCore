'use client';

import { useState } from 'react';
import { useUIStore } from '@/lib/stores/uiStore';
import { Badge } from '@/components/ui/Badge';
import { AIInsightCard } from '@/components/ui/AIInsightCard';
import { Button } from '@/components/ui/Button';
import { useExecution } from '@/lib/api/executions';
import {
  useAIJobs,
  useExecutionAnalysis,
  useFixSuggestions,
  useImplementFixSuggestion,
  useTriggerAIAnalysis,
} from '@/lib/api/intelligence';
import { timeAgo } from '@/lib/utils';
import { X, RefreshCw, Bug, CheckCircle2, Wrench } from 'lucide-react';

type AnalysisTab = 'rootCause' | 'details';

function readableValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(readableValue).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key.replaceAll('_', ' ')}: ${readableValue(item)}`)
      .filter((line) => !line.endsWith(': '))
      .join('\n');
  }
  return value == null ? '' : String(value);
}

function cleanAnalysisText(value: string): string {
  return value
    .replace(/^\s*\[[^\]]+\]\s*/i, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'this execution')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(value: string, limit = 520): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trimEnd()}...`;
}

function resultText(result: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!result) return '';
  for (const key of keys) {
    const value = readableValue(result[key]);
    if (value) return cleanAnalysisText(value);
  }
  return '';
}

export function AIInspector() {
  const { inspectorExecutionId, closeInspector } = useUIStore();
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('rootCause');
  const { data: exec, isLoading } = useExecution(inspectorExecutionId);
  const { data: analysis, isLoading: analysisLoading, refetch } = useExecutionAnalysis(inspectorExecutionId);
  const { data: jobs = [] } = useAIJobs(inspectorExecutionId);
  const { data: fixes = [] } = useFixSuggestions(inspectorExecutionId);
  const triggerAIAnalysis = useTriggerAIAnalysis();
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
  const fix = failedNode ? fixes.find((item) => item.node_key === failedNode.node_key) : undefined;
  const execInsights = analysis?.insights.slice(0, 4) ?? [];
  const badgeStatus = exec.status === 'completed' ? 'success' : exec.status === 'created' ? 'queued' : exec.status;
  const latestJob = jobs[0];
  const aiJobActive = triggerAIAnalysis.isPending || latestJob?.status === 'queued' || latestJob?.status === 'running';
  const aiResult = latestJob?.result;
  const executionName = exec.display_name
    || [exec.project_name, exec.module_name, exec.test_case_name].filter(Boolean).join('_')
    || exec.workflow_name?.replace(/^Execution -\s*/i, '')
    || failedNode?.node_label
    || 'execution';
  const rootCauseText = resultText(aiResult, ['root_cause', 'rootCause', 'root_cause_analysis'])
    || resultText(aiResult, ['summary', 'analysis']);
  const detailSections = [
    ['Summary', resultText(aiResult, ['summary'])],
    ['Root Cause', resultText(aiResult, ['root_cause', 'rootCause', 'root_cause_analysis'])],
    ['Findings', resultText(aiResult, ['findings'])],
    ['Recommendations', resultText(aiResult, ['recommendations', 'recommendation'])],
  ].filter(([, value]) => value);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/6 p-3 flex items-start justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge status={badgeStatus} size="xs" glow />
            <span className="text-[10px] uppercase tracking-wider text-slate-600">Execution</span>
          </div>
          <p className="truncate text-sm font-medium text-white">
            {executionName}
          </p>
          <p className="text-[10px] text-slate-500">
            {exec.environment} · {exec.platform} · {timeAgo(exec.started_at ?? exec.created_at)}
          </p>
        </div>
        <Button variant="ghost" size="xs" onClick={closeInspector}>
          <X size={12} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-white/5">
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

        <div className="p-3 flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
            <Bug size={10} className="text-violet-500" />
            AI Insights
          </p>
          {analysisLoading && (
            <p className="text-[10px] text-slate-500">Analyzing persisted execution evidence...</p>
          )}
          {!analysisLoading && execInsights.length === 0 && (
            <p className="text-[10px] text-slate-500">No evidence-backed insights yet.</p>
          )}
          {execInsights.map((ins) => (
            <AIInsightCard
              key={ins.id}
              insight={{
                ...ins,
                executionId: exec.id,
                confidence: Math.round(ins.confidence * 100),
                affectedNodes: ins.affected_nodes,
                timestamp: analysis?.generated_at ?? new Date().toISOString(),
                suggestedFix: ins.recommendation ?? undefined,
              }}
              compact
            />
          ))}
        </div>

        <div className="p-3 flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
            <Bug size={10} className="text-violet-500" />
            Error Analysis
          </p>
          {!latestJob && (
            <p className="text-[10px] leading-relaxed text-slate-500">
              Run analysis to inspect persisted execution evidence.
            </p>
          )}
          {latestJob && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/8 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase text-violet-300">{latestJob.status}</span>
                <span className="text-[10px] text-slate-500">{Math.round(latestJob.progress * 100)}%</span>
              </div>
              <div className="mt-3 grid grid-cols-2 rounded-md border border-white/10 bg-black/20 p-0.5">
                <button
                  type="button"
                  className={`h-6 rounded-[5px] text-[10px] font-medium transition ${
                    analysisTab === 'rootCause' ? 'bg-violet-500/20 text-violet-200' : 'text-slate-500 hover:text-slate-300'
                  }`}
                  onClick={() => setAnalysisTab('rootCause')}
                >
                  Root Cause
                </button>
                <button
                  type="button"
                  className={`h-6 rounded-[5px] text-[10px] font-medium transition ${
                    analysisTab === 'details' ? 'bg-violet-500/20 text-violet-200' : 'text-slate-500 hover:text-slate-300'
                  }`}
                  onClick={() => setAnalysisTab('details')}
                >
                  AI Analysis
                </button>
              </div>
              {latestJob.current_step && (
                <p className="mt-1 text-[10px] text-slate-400">{latestJob.current_step.replaceAll('_', ' ')}</p>
              )}
              {latestJob.error && (
                <p className="mt-2 text-[10px] leading-relaxed text-red-300/80">{latestJob.error}</p>
              )}
              {analysisTab === 'rootCause' && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wider text-violet-300/80">Root Cause</p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-slate-200">
                    {rootCauseText ? shorten(rootCauseText) : latestJob.status === 'completed' ? 'No root cause was returned for this run.' : 'Analysis is still running.'}
                  </p>
                </div>
              )}
              {analysisTab === 'details' && (
                <div className="mt-3 space-y-3">
                  {detailSections.length === 0 && (
                    <p className="text-xs leading-relaxed text-slate-400">Detailed analysis will appear here after the run completes.</p>
                  )}
                  {detailSections.map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] uppercase tracking-wider text-violet-300/80">{label}</p>
                      <p className="mt-1 break-words text-[10px] leading-relaxed text-slate-400">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {fix && (
          <div className="p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
              <Wrench size={10} className="text-emerald-400" />
              Suggested Fix
            </p>
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3">
              <p className="text-xs font-semibold text-emerald-300">{fix.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{fix.rationale}</p>
              <div className="mt-2 space-y-1 font-mono text-[10px]">
                <p className="break-all text-red-300/80">Old: {fix.old_value || 'not set'}</p>
                <p className="break-all text-emerald-300/80">
                  New: {fix.new_value || fix.blocked_reason || 'pending discovery'}
                </p>
              </div>
              <Button
                variant="neon"
                size="xs"
                className="mt-3 w-full justify-center"
                disabled={!fix.can_implement || implementFix.isPending}
                onClick={() => implementFix.mutate({ executionId: exec.id, nodeKey: fix.node_key })}
              >
                <CheckCircle2 size={10} />
                {implementFix.isPending ? 'Implementing...' : 'Implement'}
              </Button>
            </div>
          </div>
        )}

        <div className="p-3">
          <Button
            variant="glass"
            size="xs"
            className="w-full justify-center"
            disabled={aiJobActive}
            onClick={() => {
              if (exec.id) {
                triggerAIAnalysis.mutate({ executionId: exec.id });
              }
              void refetch();
            }}
          >
            <RefreshCw size={10} />
            {aiJobActive ? 'Analysing errors...' : 'Analyse errors'}
          </Button>
        </div>
      </div>
    </div>
  );
}
