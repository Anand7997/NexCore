'use client';

import { useMemo, useState } from 'react';
import { Copy, Database, Download, GitBranch, Keyboard, Monitor, Plus, Save, Server, Square, Terminal, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  downloadDesktopMcpPackage,
  downloadDesktopRecorderAgentPackage,
  useAddDesktopRecordedAction,
  useCompileDesktopRecording,
  useCreateDesktopRecorderSession,
  useDesktopMcpCommand,
  useDesktopRecorderAgentCommand,
  useDesktopRecorderSession,
  useDesktopRecorderSessions,
  useStopDesktopRecorderSession,
} from '@/lib/api/desktopRecorder';
import { useCreateWorkflow } from '@/lib/api/workflows';
import type { DesktopRecordedActionCreate, DesktopRecorderCompileResponse } from '@/lib/api/types';

const ACTIONS = [
  'click', 'double_click', 'right_click', 'type_text', 'select',
  'check', 'uncheck', 'hotkey', 'assert_text', 'extract_text',
];

const blankAction: DesktopRecordedActionCreate = {
  action_type: 'click',
  object_key: '',
  object_name: '',
  control_type: 'button',
  automation_id: '',
  name_text: '',
  class_name: '',
  uia_path: '',
  value: '',
  expected: '',
  variable: '',
  window_title: '',
  screen: '',
};

export default function DesktopRecorderPage() {
  const { data: sessions = [] } = useDesktopRecorderSessions();
  const createSession = useCreateDesktopRecorderSession();
  const stopSession = useStopDesktopRecorderSession();
  const saveWorkflow = useCreateWorkflow();
  const agentCommandMutation = useDesktopRecorderAgentCommand();
  const mcpCommandMutation = useDesktopMcpCommand();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftSession, setDraftSession] = useState({
    name: 'Desktop Recording',
    application: 'Desktop App',
    application_path: '',
    window_title: '',
    process_name: '',
  });
  const [action, setAction] = useState<DesktopRecordedActionCreate>(blankAction);
  const [compiled, setCompiled] = useState<DesktopRecorderCompileResponse | null>(null);
  const [agentCommand, setAgentCommand] = useState('');
  const [agentPackageStatus, setAgentPackageStatus] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpPackageStatus, setMcpPackageStatus] = useState('');

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null,
    [sessions, selectedId],
  );
  const sessionId = selected?.id ?? null;
  const detail = useDesktopRecorderSession(sessionId, selected?.status === 'recording' || selected?.status === 'paused');
  const addAction = useAddDesktopRecordedAction(sessionId);
  const compileRecording = useCompileDesktopRecording(sessionId);

  function create() {
    createSession.mutate(
      {
        ...draftSession,
        driver_type: 'uia3',
        metadata: { source: 'desktop_recorder_ui' },
      },
      {
        onSuccess: (session) => setSelectedId(session.id),
      },
    );
  }

  function addManualAction() {
    if (!sessionId) return;
    addAction.mutate(action, {
      onSuccess: () => setAction({ ...blankAction, action_type: action.action_type }),
    });
  }

  function compile() {
    if (!sessionId) return;
    compileRecording.mutate(undefined, {
      onSuccess: (result) => setCompiled(result),
    });
  }

  function buildAgentCommand() {
    agentCommandMutation.mutate(
      {
        api_url: 'http://localhost:8000/api',
        session_id: sessionId ?? '',
        name: selected?.name ?? draftSession.name,
        application: selected?.application || draftSession.application,
        application_path: selected?.application_path || draftSession.application_path,
        window_title: selected?.window_title || draftSession.window_title,
        process_name: selected?.process_name || draftSession.process_name,
        driver_type: selected?.driver_type || 'uia3',
      },
      {
        onSuccess: (result) => setAgentCommand(result.command),
      },
    );
  }

  function copyAgentCommand() {
    if (!agentCommand) return;
    navigator.clipboard?.writeText(agentCommand);
  }

  function buildMcpCommand() {
    mcpCommandMutation.mutate(
      {
        api_url: 'http://localhost:8000/api',
        session_id: sessionId ?? '',
        name: selected?.name ?? draftSession.name,
        application: selected?.application || draftSession.application,
        application_path: selected?.application_path || draftSession.application_path,
        window_title: selected?.window_title || draftSession.window_title,
        process_name: selected?.process_name || draftSession.process_name,
        driver_type: selected?.driver_type || 'uia3',
        mode: 'stdio',
      },
      {
        onSuccess: (result) => setMcpCommand(result.command),
      },
    );
  }

  function copyMcpCommand() {
    if (!mcpCommand) return;
    navigator.clipboard?.writeText(mcpCommand);
  }

  async function downloadAgentPackage() {
    setAgentPackageStatus('Packaging...');
    try {
      const result = await downloadDesktopRecorderAgentPackage({
        api_url: 'http://localhost:8000/api',
        session_id: sessionId ?? '',
        name: selected?.name ?? draftSession.name,
        application: selected?.application || draftSession.application,
        application_path: selected?.application_path || draftSession.application_path,
        window_title: selected?.window_title || draftSession.window_title,
        process_name: selected?.process_name || draftSession.process_name,
        driver_type: selected?.driver_type || 'uia3',
      });
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setAgentPackageStatus('Package downloaded');
    } catch (error) {
      setAgentPackageStatus(error instanceof Error ? error.message : 'Package download failed');
    }
  }

  async function downloadMcpPackage() {
    setMcpPackageStatus('Packaging...');
    try {
      const result = await downloadDesktopMcpPackage({
        api_url: 'http://localhost:8000/api',
        session_id: sessionId ?? '',
        name: selected?.name ?? draftSession.name,
        application: selected?.application || draftSession.application,
        application_path: selected?.application_path || draftSession.application_path,
        window_title: selected?.window_title || draftSession.window_title,
        process_name: selected?.process_name || draftSession.process_name,
        driver_type: selected?.driver_type || 'uia3',
        mode: 'stdio',
      });
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setMcpPackageStatus('MCP package downloaded');
    } catch (error) {
      setMcpPackageStatus(error instanceof Error ? error.message : 'MCP package download failed');
    }
  }

  function persistWorkflow() {
    if (!compiled) return;
    saveWorkflow.mutate({
      name: compiled.workflow.name,
      description: compiled.workflow.description,
      tags: ['desktop', 'recorded'],
      platforms: ['desktop'],
      variables: {},
      nodes: compiled.workflow.nodes,
      edges: compiled.workflow.edges,
    });
  }

  const input = 'rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-fg-default)] outline-none focus:border-[#5b8cff]/50 placeholder:text-[var(--color-fg-subtle)]/50';
  const label = 'text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-surface-1)]">
      <div className="shrink-0 border-b border-[var(--color-line-default)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">Desktop Automation</p>
            <h1 className="mt-0.5 text-xl font-semibold text-[var(--color-fg-default)]">Desktop Recorder</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="glass" size="sm" disabled={!sessionId || selected?.status === 'stopped'} onClick={() => sessionId && stopSession.mutate(sessionId)}>
              <Square size={11} /> Stop
            </Button>
            <Button variant="glass" size="sm" disabled={!sessionId} onClick={compile}>
              <Wand2 size={11} /> Compile
            </Button>
            <Button variant="glass" size="sm" disabled={agentCommandMutation.isPending} onClick={buildAgentCommand}>
              <Terminal size={11} /> Live Agent
            </Button>
            <Button variant="glass" size="sm" disabled={mcpCommandMutation.isPending} onClick={buildMcpCommand}>
              <Server size={11} /> MCP
            </Button>
            <Button variant="glass" size="sm" onClick={downloadAgentPackage}>
              <Download size={11} /> Download Agent
            </Button>
            <Button variant="glass" size="sm" onClick={downloadMcpPackage}>
              <Download size={11} /> Download MCP
            </Button>
            <Button variant="neon" size="sm" disabled={!compiled || saveWorkflow.isPending} onClick={persistWorkflow}>
              <Save size={11} /> Save Workflow
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_360px] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[var(--color-line-default)]">
          <div className="border-b border-[var(--color-line-subtle)] p-3">
            <div className="grid gap-2">
              <input className={input} value={draftSession.name} onChange={(e) => setDraftSession((d) => ({ ...d, name: e.target.value }))} placeholder="Recording name" />
              <input className={input} value={draftSession.application_path} onChange={(e) => setDraftSession((d) => ({ ...d, application_path: e.target.value }))} placeholder="Application path" />
              <input className={input} value={draftSession.window_title} onChange={(e) => setDraftSession((d) => ({ ...d, window_title: e.target.value }))} placeholder="Window title" />
              <Button variant="neon" size="sm" onClick={create} disabled={createSession.isPending}>
                <Plus size={11} /> New Session
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedId(session.id)}
                className={[
                  'mb-1.5 w-full rounded-md border px-3 py-2 text-left transition-colors',
                  session.id === sessionId
                    ? 'border-[#5b8cff]/40 bg-[#5b8cff]/10'
                    : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)]',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-[var(--color-fg-default)]">{session.name}</span>
                  <span className="rounded border border-[var(--color-line-default)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]">{session.status}</span>
                </div>
                <p className="mt-1 text-[10px] font-mono text-[var(--color-fg-subtle)]">{session.action_count} actions</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4">
          <div className="mb-3 flex items-center gap-2">
            <Keyboard size={14} className="text-[#45c08a]" />
            <span className={label}>Recorded Actions</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-[var(--color-line-default)]">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[var(--color-surface-2)] text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                <tr>
                  {['#', 'Operation', 'Object', 'Locator', 'Value', 'Window'].map((header) => (
                    <th key={header} className="border-r border-[var(--color-line-subtle)] px-2 py-2 text-left font-mono last:border-r-0">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(detail.data?.actions ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-[var(--color-line-subtle)]/60">
                    <td className="px-2 py-2 font-mono text-[var(--color-fg-subtle)]">{row.action_order}</td>
                    <td className="px-2 py-2 text-[var(--color-fg-default)]">{row.action_type}</td>
                    <td className="px-2 py-2 text-[var(--color-fg-default)]">{row.object_name || row.object_key}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-fg-subtle)]">{row.automation_id || row.name_text || row.uia_path}</td>
                    <td className="px-2 py-2 text-[var(--color-fg-default)]">{row.value || row.expected}</td>
                    <td className="px-2 py-2 text-[var(--color-fg-subtle)]">{row.window_title || row.screen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {compiled && (
            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2">
                <GitBranch size={14} className="text-[#a195ff]" />
                <span className={label}>Keyword View</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--color-line-default)]">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[var(--color-surface-2)] text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                    <tr>
                      {['Step', 'Object', 'Operation', 'Value', 'Assignment', 'Checkpoint'].map((header) => (
                        <th key={header} className="border-r border-[var(--color-line-subtle)] px-2 py-2 text-left font-mono last:border-r-0">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compiled.keyword_steps.map((row) => (
                      <tr key={row.step} className="border-t border-[var(--color-line-subtle)]/60">
                        <td className="px-2 py-2 font-mono text-[var(--color-fg-subtle)]">{row.step}</td>
                        <td className="px-2 py-2 text-[var(--color-fg-default)]">{row.object}</td>
                        <td className="px-2 py-2 text-[var(--color-fg-default)]">{row.operation}</td>
                        <td className="px-2 py-2 text-[var(--color-fg-default)]">{row.value}</td>
                        <td className="px-2 py-2 text-[var(--color-fg-subtle)]">{row.assignment}</td>
                        <td className="px-2 py-2 text-[var(--color-fg-subtle)]">{row.checkpoint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-[var(--color-line-default)] p-4">
          <div className="mb-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-[#f0b558]" />
                <span className={label}>Live Agent</span>
              </div>
              <Button variant="glass" size="sm" disabled={!agentCommand} onClick={copyAgentCommand}>
                <Copy size={11} /> Copy
              </Button>
            </div>
            <Button variant="glass" size="sm" className="w-full justify-center" disabled={agentCommandMutation.isPending} onClick={buildAgentCommand}>
              <Terminal size={11} /> Generate Agent Command
            </Button>
            <Button variant="neon" size="sm" className="mt-2 w-full justify-center" onClick={downloadAgentPackage}>
              <Download size={11} /> Download Agent Package
            </Button>
            {agentPackageStatus && (
              <p className="mt-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">{agentPackageStatus}</p>
            )}
            {agentCommand && (
              <div className="mt-2 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-5 text-[var(--color-fg-default)]">{agentCommand}</pre>
                <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
                  <span>Stop: ctrl+shift+q</span>
                  <span>Pause: ctrl+shift+p</span>
                </div>
              </div>
            )}
          </div>

          <div className="mb-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-[#5b8cff]" />
                <span className={label}>Desktop MCP</span>
              </div>
              <Button variant="glass" size="sm" disabled={!mcpCommand} onClick={copyMcpCommand}>
                <Copy size={11} /> Copy
              </Button>
            </div>
            <Button variant="glass" size="sm" className="w-full justify-center" disabled={mcpCommandMutation.isPending} onClick={buildMcpCommand}>
              <Server size={11} /> Generate MCP Command
            </Button>
            <Button variant="neon" size="sm" className="mt-2 w-full justify-center" onClick={downloadMcpPackage}>
              <Download size={11} /> Download MCP Package
            </Button>
            {mcpPackageStatus && (
              <p className="mt-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">{mcpPackageStatus}</p>
            )}
            {mcpCommand && (
              <div className="mt-2 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3">
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-5 text-[var(--color-fg-default)]">{mcpCommand}</pre>
                <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
                  <span>Tools: snapshot</span>
                  <span>capture</span>
                  <span>record</span>
                </div>
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Monitor size={14} className="text-[#5b8cff]" />
            <span className={label}>Add Action</span>
          </div>
          <div className="grid gap-2">
            <select className={input} value={action.action_type} onChange={(e) => setAction((d) => ({ ...d, action_type: e.target.value }))}>
              {ACTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input className={input} value={action.object_name ?? ''} onChange={(e) => setAction((d) => ({ ...d, object_name: e.target.value }))} placeholder="Object name" />
            <input className={input} value={action.object_key ?? ''} onChange={(e) => setAction((d) => ({ ...d, object_key: e.target.value }))} placeholder="Object key" />
            <input className={input} value={action.automation_id ?? ''} onChange={(e) => setAction((d) => ({ ...d, automation_id: e.target.value }))} placeholder="Automation ID" />
            <input className={input} value={action.name_text ?? ''} onChange={(e) => setAction((d) => ({ ...d, name_text: e.target.value }))} placeholder="Name/Text" />
            <input className={input} value={action.uia_path ?? ''} onChange={(e) => setAction((d) => ({ ...d, uia_path: e.target.value }))} placeholder="UIA path" />
            <input className={input} value={action.value ?? ''} onChange={(e) => setAction((d) => ({ ...d, value: e.target.value }))} placeholder="Value" />
            <input className={input} value={action.expected ?? ''} onChange={(e) => setAction((d) => ({ ...d, expected: e.target.value }))} placeholder="Expected" />
            <input className={input} value={action.variable ?? ''} onChange={(e) => setAction((d) => ({ ...d, variable: e.target.value }))} placeholder="Output variable" />
            <Button variant="neon" size="sm" disabled={!sessionId || addAction.isPending} onClick={addManualAction}>
              <Plus size={11} /> Add Action
            </Button>
          </div>

          {compiled && (
            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2">
                <Wand2 size={14} className="text-[#45c08a]" />
                <span className={label}>Component Suggestions</span>
              </div>
              <div className="space-y-2">
                {(compiled.component_suggestions ?? []).map((item) => (
                  <div key={`${item.component_key}-${item.start_step}-${item.end_step}`} className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[var(--color-fg-default)]">{item.name}</p>
                        <p className="mt-1 text-[10px] leading-4 text-[var(--color-fg-subtle)]">{item.reason}</p>
                      </div>
                      <span className="shrink-0 rounded border border-[#45c08a]/30 bg-[#45c08a]/10 px-1.5 py-0.5 text-[9px] font-mono text-[#45c08a]">
                        {Math.round((item.confidence ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded border border-[var(--color-line-default)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]">
                        Steps {item.start_step}-{item.end_step}
                      </span>
                      <span className="rounded border border-[var(--color-line-default)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]">
                        {item.action_count} actions
                      </span>
                      <span className="rounded border border-[var(--color-line-default)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]">
                        {item.component_type}
                      </span>
                    </div>
                    {(item.suggested_parameters?.length || item.suggested_outputs?.length) ? (
                      <p className="mt-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">
                        {item.suggested_parameters?.length ?? 0} inputs / {item.suggested_outputs?.length ?? 0} outputs
                      </p>
                    ) : null}
                  </div>
                ))}
                {!compiled.component_suggestions?.length && (
                  <div className="rounded-md border border-dashed border-[var(--color-line-default)] px-3 py-4 text-center text-[10px] text-[var(--color-fg-subtle)]">
                    No reusable groups detected yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {compiled && (
            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2">
                <Database size={14} className="text-[#f0b558]" />
                <span className={label}>Repository Suggestions</span>
              </div>
              <div className="space-y-2">
                {compiled.repository_suggestions.map((item) => (
                  <div key={item.object_key} className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
                    <p className="truncate text-xs font-medium text-[var(--color-fg-default)]">{item.name}</p>
                    <p className="mt-1 truncate text-[10px] font-mono text-[var(--color-fg-subtle)]">{item.locator_strategy}: {item.primary_locator}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
