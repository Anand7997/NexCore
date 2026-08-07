import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Bot, Brain, CheckCircle2, Cpu, Database, Loader2, Send, Sparkles, Wand2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExecutions } from '@/lib/advanced-api/executions';
import {
  useAIJobs,
  useAIProviderStatus,
  useAskAIInspectAssistant,
  useExecutionAnalysis,
  useFixSuggestions,
  useImplementAllFixSuggestions,
  useImplementFixSuggestion,
  useTriggerAIAnalysis,
} from '@/lib/advanced-api/intelligence';
import type { AIJobType, ExecutionListItem, FixSuggestion } from '@/lib/advanced-api/types';
import { timeAgo } from '@/lib/utils';
import { MetricCard, SeverityPill, StatusPill, WorkspacePanel } from './WorkspacePrimitives';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
};

const JOB_TYPE_LABELS: Record<AIJobType, string> = {
  root_cause_analysis: 'Root Cause',
  flaky_detection: 'Flaky Detection',
  locator_healing: 'Locator Healing',
  anomaly_analysis: 'Anomaly Analysis',
};

function executionLabel(execution: ExecutionListItem): string {
  return (
    execution.display_name ||
    [execution.project_name, execution.module_name, execution.test_case_name].filter(Boolean).join(' / ') ||
    execution.workflow_name ||
    execution.id.slice(0, 8)
  );
}

function recommendedFix(fixes: FixSuggestion[]): FixSuggestion | null {
  return [...fixes].sort((left, right) => right.confidence - left.confidence)[0] ?? null;
}

export default function AIInspectLabPage() {
  const { data: executions = [] } = useExecutions(undefined, undefined, 100);
  const { data: providers = [] } = useAIProviderStatus();
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [jobType, setJobType] = useState<AIJobType>('root_cause_analysis');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const failedExecutions = useMemo(() => executions.filter((execution) => execution.status === 'failed'), [executions]);
  const fallbackExecutionId = failedExecutions[0]?.id ?? executions[0]?.id ?? null;

  useEffect(() => {
    setSelectedExecutionId((current) =>
      executions.some((execution) => execution.id === current) ? current : fallbackExecutionId,
    );
  }, [executions, fallbackExecutionId]);

  const selectedExecution = executions.find((execution) => execution.id === selectedExecutionId) ?? null;
  const { data: analysis } = useExecutionAnalysis(selectedExecutionId);
  const { data: aiJobs = [] } = useAIJobs(selectedExecutionId);
  const { data: fixes = [] } = useFixSuggestions(selectedExecutionId);
  const triggerAnalysis = useTriggerAIAnalysis();
  const implementFix = useImplementFixSuggestion();
  const implementAllFixes = useImplementAllFixSuggestions();
  const askAssistant = useAskAIInspectAssistant();

  const topFix = recommendedFix(fixes);

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !selectedExecutionId) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion('');

    try {
      const response = await askAssistant.mutateAsync({ executionId: selectedExecutionId, question: trimmed });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: response.answer,
          meta: `${response.provider ?? response.answer_source ?? 'assistant'} · ${Math.round(response.confidence * 100)}% confidence`,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: error instanceof Error ? error.message : 'The assistant request failed.',
          meta: 'fallback',
        },
      ]);
    }
  }

  return (
    <div className="ai-workflow-scope relative overflow-hidden rounded-[28px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(167,139,250,0.18),transparent_26%),linear-gradient(180deg,var(--color-surface-1),var(--color-bg-base))]" />
      <div className="relative space-y-6 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status="running" label="AI Inspect Lab" />
              <StatusPill status={failedExecutions.length > 0 ? 'failed' : 'queued'} label={`${failedExecutions.length} failed executions`} />
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] text-[var(--color-fg-default)] md:text-5xl">
              Deep failure diagnosis and guided repair
            </h1>
            <p className="mt-2 max-w-4xl text-sm text-[var(--color-fg-muted)]">
              Inspect execution evidence, trigger targeted AI analysis jobs, compare recommended fixes, and ask the retrieval-backed assistant for repair guidance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <div key={provider.provider} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300">
                {provider.label}: {provider.status}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Selected Execution" value={selectedExecution ? executionLabel(selectedExecution) : 'None'} detail={selectedExecution?.platform ?? 'Pick an execution'} />
          <MetricCard label="Insights" value={String(analysis?.summary.insight_count ?? 0)} detail={`${analysis?.summary.highest_severity ?? 'none'} severity`} />
          <MetricCard label="Artifacts" value={String(analysis?.summary.artifact_count ?? 0)} detail={`${analysis?.evidence_counts.events ?? 0} streamed events`} />
          <MetricCard label="Recommended Fix" value={topFix ? `${Math.round(topFix.confidence * 100)}%` : 'n/a'} detail={topFix?.title ?? 'No suggested patch'} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
          <WorkspacePanel className="space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-200" />
              <div className="text-sm font-semibold text-white">Execution Focus</div>
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-semibold text-slate-300">Execution</span>
              <select
                className="h-11 w-full rounded-2xl border border-white/10 bg-[var(--color-surface-1)] px-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                value={selectedExecutionId ?? ''}
                onChange={(event) => setSelectedExecutionId(event.target.value || null)}
              >
                {executions.length === 0 ? <option value="">No executions</option> : null}
                {executions.map((execution) => (
                  <option key={execution.id} value={execution.id}>
                    {executionLabel(execution)} | {execution.status}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">Inspect Mode</div>
              <div className="grid gap-2">
                {(Object.keys(JOB_TYPE_LABELS) as AIJobType[]).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setJobType(entry)}
                    className={
                      jobType === entry
                        ? 'rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-left text-sm font-semibold text-cyan-100'
                        : 'rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-left text-sm font-semibold text-slate-300'
                    }
                  >
                    {JOB_TYPE_LABELS[entry]}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={() => selectedExecutionId && triggerAnalysis.mutate({ executionId: selectedExecutionId, jobType })}
              disabled={!selectedExecutionId || triggerAnalysis.isPending}
              className="h-11 rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              {triggerAnalysis.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Run {JOB_TYPE_LABELS[jobType]}
            </Button>

            <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-sm text-slate-300">
              {selectedExecution
                ? `Current focus: ${executionLabel(selectedExecution)} on ${selectedExecution.platform}.`
                : 'Select an execution to start diagnosis.'}
            </div>
          </WorkspacePanel>

          <div className="space-y-6">
            <WorkspacePanel className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-200" />
                <div className="text-lg font-semibold text-white">Diagnosis Summary</div>
              </div>

              {analysis ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard label="Failed Nodes" value={String(analysis.summary.failed_nodes)} detail={`${analysis.summary.completed_nodes}/${analysis.summary.node_count} completed`} />
                    <MetricCard label="Artifacts" value={String(analysis.summary.artifact_count)} detail={`${analysis.evidence_counts.timeline_entries} timeline entries`} />
                    <MetricCard label="Status" value={analysis.summary.status} detail={timeAgo(analysis.generated_at)} />
                  </div>

                  <div className="space-y-3">
                    {analysis.insights.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                        Findings will appear here once evidence is available.
                      </div>
                    ) : (
                      analysis.insights.map((insight) => (
                        <div key={insight.id} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">{insight.title}</div>
                              <div className="mt-1 text-xs text-slate-400">{insight.type}</div>
                            </div>
                            <SeverityPill severity={insight.severity} />
                          </div>
                          <p className="mt-3 text-sm text-slate-300">{insight.description}</p>
                          {insight.recommendation ? (
                            <div className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/5 px-4 py-3 text-sm text-emerald-100">
                              {insight.recommendation}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                  Select an execution to load current findings.
                </div>
              )}
            </WorkspacePanel>

            <WorkspacePanel className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-amber-200" />
                  <div className="text-lg font-semibold text-white">Repair Plan</div>
                </div>
                {fixes.some((fix) => fix.can_implement) ? (
                  <Button
                    variant="ghost"
                    className="border border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
                    onClick={() => selectedExecutionId && implementAllFixes.mutate({ executionId: selectedExecutionId, fixes })}
                  >
                    <Wand2 className="h-4 w-4" />
                    Apply all
                  </Button>
                ) : null}
              </div>

              {fixes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                  No fix suggestions are currently available.
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
                          className="mt-4 border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15"
                          onClick={() => selectedExecutionId && implementFix.mutate({ executionId: selectedExecutionId, nodeKey: fix.node_key })}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Apply fix
                        </Button>
                      ) : (
                        <div className="mt-4 text-xs text-amber-100">{fix.blocked_reason || 'Manual review required.'}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </WorkspacePanel>
          </div>

          <div className="space-y-6">
            <WorkspacePanel className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-200" />
                <div className="text-lg font-semibold text-white">AI Assistant</div>
              </div>

              <div className="max-h-[28rem] space-y-3 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                    Ask a question to retrieve execution evidence and recommended patch paths.
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.role === 'user'
                          ? 'rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100'
                          : 'rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm text-slate-200'
                      }
                    >
                      <div>{message.text}</div>
                      {message.meta ? <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">{message.meta}</div> : null}
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAsk} className="space-y-3">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  placeholder="Explain the likely root cause, patch blast radius, and safest validation plan."
                  className="w-full rounded-3xl border border-white/10 bg-[var(--color-surface-1)] px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                />
                <Button
                  type="submit"
                  disabled={!selectedExecutionId || askAssistant.isPending || !question.trim()}
                  className="h-11 w-full rounded-2xl bg-violet-300 text-slate-950 hover:bg-violet-200"
                >
                  {askAssistant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Ask assistant
                </Button>
              </form>
            </WorkspacePanel>

            <WorkspacePanel className="space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-200" />
                <div className="text-lg font-semibold text-white">Recent Jobs</div>
              </div>

              <div className="space-y-3">
                {aiJobs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                    No investigation jobs have been queued yet.
                  </div>
                ) : (
                  aiJobs.slice(0, 5).map((job) => (
                    <div key={job.id} className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</div>
                        <StatusPill status={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'failed' : 'running'} label={job.status} />
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${Math.round(job.progress * 100)}%` }} />
                      </div>
                      <div className="mt-2 text-xs text-slate-400">{job.current_step || 'Awaiting result'}</div>
                    </div>
                  ))
                )}
              </div>
            </WorkspacePanel>
          </div>
        </div>
      </div>
    </div>
  );
}
