'use client';

import { useMemo, useState } from 'react';
import { Copy, Database, Download, GitBranch, Keyboard, Monitor, Pencil, Plus, Save, Server, Square, Terminal, Trash2, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  downloadDesktopMcpPackage,
  downloadDesktopRecorderAgentPackage,
  useAddDesktopRecordedAction,
  useCompileDesktopRecording,
  useCreateDesktopRecorderSession,
  useDeleteDesktopRecordedAction,
  useDeleteDesktopRecorderSession,
  useDesktopMcpCommand,
  useDesktopRecorderAgentCommand,
  useDesktopRecorderSession,
  useDesktopRecorderSessions,
  useStopDesktopRecorderSession,
  useUpdateDesktopRecordedAction,
} from '@/lib/api/desktopRecorder';
import { useCreateWorkflow, useUpdateWorkflow, useWorkflows } from '@/lib/api/workflows';
import type { DesktopRecordedAction, DesktopRecordedActionCreate, DesktopRecorderCompileResponse } from '@/lib/api/types';

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

const blankSessionDraft = {
  name: '',
  application: '',
  application_path: '',
  window_title: '',
  process_name: '',
};

function stripWrappingQuotes(value: string): string {
  const text = value.trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function filenameFromPath(value: string): string {
  const cleaned = stripWrappingQuotes(value).replace(/\\/g, '/');
  return cleaned.split('/').filter(Boolean).pop() ?? '';
}

function applicationNameFromPath(value: string): string {
  return filenameFromPath(value).replace(/\.[^.]+$/, '');
}

export default function DesktopRecorderPage() {
  const { data: sessions = [] } = useDesktopRecorderSessions();
  const createSession = useCreateDesktopRecorderSession();
  const deleteSession = useDeleteDesktopRecorderSession();
  const stopSession = useStopDesktopRecorderSession();
  const saveWorkflow = useCreateWorkflow();
  const { data: savedWorkflows = [] } = useWorkflows('active');
  const agentCommandMutation = useDesktopRecorderAgentCommand();
  const mcpCommandMutation = useDesktopMcpCommand();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftSession, setDraftSession] = useState(blankSessionDraft);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [action, setAction] = useState<DesktopRecordedActionCreate>(blankAction);
  const [compiled, setCompiled] = useState<DesktopRecorderCompileResponse | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<DesktopRecordedActionCreate>(blankAction);
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
  const updateAction = useUpdateDesktopRecordedAction(sessionId);
  const deleteAction = useDeleteDesktopRecordedAction(sessionId);
  const compileRecording = useCompileDesktopRecording(sessionId);
  const existingWorkflow = useMemo(() => {
    if (!compiled) return null;
    const compiledName = compiled.workflow.name.trim().toLowerCase();
    return savedWorkflows
      .filter((workflow) => {
        const tags = new Set((workflow.tags ?? []).map((tag) => tag.toLowerCase()));
        return workflow.name.trim().toLowerCase() === compiledName && tags.has('desktop') && tags.has('recorded');
      })
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0] ?? null;
  }, [compiled, savedWorkflows]);
  const updateWorkflow = useUpdateWorkflow(existingWorkflow?.id ?? '');
  const workflowSaving = saveWorkflow.isPending || updateWorkflow.isPending;
  const canCreateSession =
    draftSession.name.trim().length > 0 &&
    draftSession.application_path.trim().length > 0 &&
    draftSession.window_title.trim().length > 0;

  function openSessionDialog() {
    setDraftSession(blankSessionDraft);
    setSessionDialogOpen(true);
  }

  function closeSessionDialog() {
    if (createSession.isPending) return;
    setSessionDialogOpen(false);
    setDraftSession(blankSessionDraft);
  }

  function create() {
    if (!canCreateSession) return;
    const applicationPath = stripWrappingQuotes(draftSession.application_path);
    const processName = draftSession.process_name.trim() || filenameFromPath(applicationPath);
    createSession.mutate(
      {
        name: draftSession.name.trim(),
        application: draftSession.application.trim() || applicationNameFromPath(applicationPath),
        application_path: applicationPath,
        window_title: draftSession.window_title.trim(),
        process_name: processName,
        driver_type: 'uia3',
        metadata: { source: 'desktop_recorder_ui' },
      },
      {
        onSuccess: (session) => {
          setSelectedId(session.id);
          setSessionDialogOpen(false);
          setDraftSession(blankSessionDraft);
          clearSessionOutputs();
        },
      },
    );
  }

  function addManualAction() {
    if (!sessionId) return;
    addAction.mutate(action, {
      onSuccess: () => setAction({ ...blankAction, action_type: action.action_type }),
    });
  }

  function startEditAction(row: DesktopRecordedAction) {
    setEditingActionId(row.id);
    setEditingAction({
      action_type: row.action_type,
      object_key: row.object_key ?? '',
      object_name: row.object_name ?? '',
      control_type: row.control_type ?? '',
      automation_id: row.automation_id ?? '',
      name_text: row.name_text ?? '',
      class_name: row.class_name ?? '',
      uia_path: row.uia_path ?? '',
      locator_strategy: row.locator_strategy ?? '',
      value: row.value ?? '',
      expected: row.expected ?? '',
      property_name: row.property_name ?? '',
      variable: row.variable ?? '',
      window_title: row.window_title ?? '',
      screen: row.screen ?? '',
      x: row.x ?? null,
      y: row.y ?? null,
      duration_ms: row.duration_ms ?? null,
      locators: row.locators ?? [],
      screenshot_artifact_id: row.screenshot_artifact_id ?? '',
      ui_tree_artifact_id: row.ui_tree_artifact_id ?? '',
      metadata: row.metadata ?? {},
    });
  }

  function cancelEditAction() {
    setEditingActionId(null);
    setEditingAction(blankAction);
  }

  function saveEditAction() {
    if (!editingActionId) return;
    updateAction.mutate(
      { actionId: editingActionId, input: editingAction },
      {
        onSuccess: () => {
          cancelEditAction();
          setCompiled(null);
        },
      },
    );
  }

  function deleteRecordedAction(row: DesktopRecordedAction) {
    const labelText = row.object_name || row.object_key || `step ${row.action_order}`;
    if (!window.confirm(`Delete recorded step "${labelText}"?`)) return;
    deleteAction.mutate(row.id, {
      onSuccess: () => {
        if (editingActionId === row.id) cancelEditAction();
        setCompiled(null);
      },
    });
  }

  function compile() {
    if (!sessionId) return;
    compileRecording.mutate(undefined, {
      onSuccess: (result) => setCompiled(result),
    });
  }

  function clearSessionOutputs() {
    setCompiled(null);
    setAgentCommand('');
    setAgentPackageStatus('');
    setMcpCommand('');
    setMcpPackageStatus('');
  }

  function deleteSelectedSession() {
    if (!sessionId || !selected) return;
    if (!window.confirm(`Delete recording session "${selected.name}"? This cannot be undone.`)) return;
    const nextSessionId = sessions.find((session) => session.id !== sessionId)?.id ?? null;
    deleteSession.mutate(sessionId, {
      onSuccess: () => {
        setSelectedId(nextSessionId);
        clearSessionOutputs();
      },
    });
  }

  function buildAgentCommand() {
    if (!sessionId) {
      setAgentPackageStatus('Create or select a recording session first.');
      return;
    }
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
    if (!sessionId) {
      setMcpPackageStatus('Create or select a recording session first.');
      return;
    }
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
    if (!sessionId) {
      setAgentPackageStatus('Create or select a recording session first.');
      return;
    }
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
    if (!sessionId) {
      setMcpPackageStatus('Create or select a recording session first.');
      return;
    }
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
    const input = {
      name: compiled.workflow.name,
      description: compiled.workflow.description,
      tags: ['desktop', 'recorded'],
      platforms: ['desktop'],
      variables: {
        source: 'desktop_recorder',
        desktop_recorder_session_id: sessionId ?? compiled.session_id,
        desktop_recorder_session_name: selected?.name ?? compiled.name,
        application_path: selected?.application_path ?? '',
        window_title: selected?.window_title ?? '',
        process_name: selected?.process_name ?? '',
      },
      nodes: compiled.workflow.nodes,
      edges: compiled.workflow.edges,
    };
    if (existingWorkflow) {
      updateWorkflow.mutate(input);
      return;
    }
    saveWorkflow.mutate(input);
  }

  const input = 'rounded-md border border-(--color-line-default) bg-(--color-surface-2) px-3 py-2 text-xs text-(--color-fg-default) outline-none focus:border-[#5b8cff]/50 placeholder:text-(--color-fg-subtle)/50';
  const label = 'text-[10px] font-mono uppercase tracking-[0.14em] text-(--color-fg-subtle)';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-(--color-surface-1)">
      <div className="shrink-0 border-b border-(--color-line-default) px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-(--color-fg-subtle)">Desktop Automation</p>
            <h1 className="mt-0.5 text-xl font-semibold text-(--color-fg-default)">Desktop Recorder</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="glass" size="sm" disabled={!sessionId || selected?.status === 'stopped'} onClick={() => sessionId && stopSession.mutate(sessionId)}>
              <Square size={11} /> Stop
            </Button>
            <Button variant="danger" size="sm" disabled={!sessionId || deleteSession.isPending} onClick={deleteSelectedSession}>
              <Trash2 size={11} /> Delete
            </Button>
            <Button variant="glass" size="sm" disabled={!sessionId} onClick={compile}>
              <Wand2 size={11} /> Compile
            </Button>
            <Button variant="glass" size="sm" disabled={!sessionId || agentCommandMutation.isPending} onClick={buildAgentCommand}>
              <Terminal size={11} /> Live Agent
            </Button>
            <Button variant="glass" size="sm" disabled={!sessionId || mcpCommandMutation.isPending} onClick={buildMcpCommand}>
              <Server size={11} /> MCP
            </Button>
            <Button variant="glass" size="sm" disabled={!sessionId} onClick={downloadAgentPackage}>
              <Download size={11} /> Download Agent
            </Button>
            <Button variant="glass" size="sm" disabled={!sessionId} onClick={downloadMcpPackage}>
              <Download size={11} /> Download MCP
            </Button>
            <Button variant="neon" size="sm" disabled={!compiled || workflowSaving} onClick={persistWorkflow}>
              <Save size={11} /> {existingWorkflow ? 'Update Workflow' : 'Save Workflow'}
            </Button>
          </div>
        </div>
      </div>

      {sessionDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="new-session-title">
          <form
            className="w-full max-w-md rounded-lg border border-(--color-line-default) bg-(--color-surface-1) p-4 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className={label}>New Session</p>
                <h2 id="new-session-title" className="mt-1 text-lg font-semibold text-(--color-fg-default)">Desktop Recording Setup</h2>
              </div>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-md border border-(--color-line-default) text-(--color-fg-subtle) transition-colors hover:border-(--color-line-strong) hover:text-(--color-fg-default)"
                onClick={closeSessionDialog}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className={label}>Name</span>
                <input
                  autoFocus
                  className={input}
                  value={draftSession.name}
                  onChange={(event) => setDraftSession((draft) => ({ ...draft, name: event.target.value }))}
                  placeholder="Desktop Recording"
                />
              </label>
              <label className="grid gap-1.5">
                <span className={label}>Application Path</span>
                <input
                  className={input}
                  value={draftSession.application_path}
                  onChange={(event) => setDraftSession((draft) => ({ ...draft, application_path: event.target.value }))}
                  placeholder="C:\Program Files\App\App.exe"
                />
              </label>
              <label className="grid gap-1.5">
                <span className={label}>Window Title</span>
                <input
                  className={input}
                  value={draftSession.window_title}
                  onChange={(event) => setDraftSession((draft) => ({ ...draft, window_title: event.target.value }))}
                  placeholder="Application window title"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="glass" size="sm" onClick={closeSessionDialog}>
                Cancel
              </Button>
              <Button type="submit" variant="neon" size="sm" disabled={!canCreateSession || createSession.isPending}>
                <Plus size={11} /> Create Session
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_360px] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-(--color-line-default)">
          <div className="border-b border-(--color-line-subtle) p-3">
            <Button className="w-full" variant="neon" size="sm" onClick={openSessionDialog} disabled={createSession.isPending}>
              <Plus size={11} /> New Session
            </Button>
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
                    : 'border-(--color-line-default) bg-(--color-surface-2) hover:border-line-strong',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-(--color-fg-default)">{session.name}</span>
                  <span className="rounded border border-(--color-line-default) px-1.5 py-0.5 text-[9px] font-mono text-(--color-fg-subtle)">{session.status}</span>
                </div>
                <p className="mt-1 text-[10px] font-mono text-(--color-fg-subtle)">{session.action_count} actions</p>
                {(session.application_path || session.window_title || session.process_name) && (
                  <p className="mt-1 truncate text-[9px] font-mono text-(--color-fg-subtle)" title={stripWrappingQuotes(session.application_path) || session.window_title || session.process_name}>
                    {stripWrappingQuotes(session.application_path) || session.window_title || session.process_name}
                  </p>
                )}
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Keyboard size={14} className="text-[#45c08a]" />
              <span className={label}>Recorded Steps</span>
            </div>
            <span className="rounded border border-(--color-line-default) px-2 py-1 text-[10px] font-mono text-(--color-fg-subtle)">
              {(detail.data?.actions ?? []).length} step{(detail.data?.actions ?? []).length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-(--color-line-default)">
            <table className="min-w-[980px] w-full border-collapse text-xs">
              <thead className="bg-(--color-surface-2) text-[9px] uppercase tracking-[0.14em] text-(--color-fg-subtle)">
                <tr>
                  {['#', 'Operation', 'Object', 'Locator', 'Value', 'Window'].map((header) => (
                    <th key={header} className="border-r border-(--color-line-subtle) px-2 py-2 text-left font-mono">{header}</th>
                  ))}
                  <th className="sticky right-0 z-10 border-l border-(--color-line-subtle) bg-(--color-surface-2) px-2 py-2 text-left font-mono">
                    CRUD
                  </th>
                </tr>
              </thead>
              <tbody>
                {(detail.data?.actions ?? []).map((row) => {
                  const isEditing = editingActionId === row.id;
                  return (
                    <tr key={row.id} className="border-t border-(--color-line-subtle)/60">
                      <td className="px-2 py-2 font-mono text-(--color-fg-subtle)">{row.action_order}</td>
                      <td className="px-2 py-2 text-(--color-fg-default)">
                        {isEditing ? (
                          <select className={`${input} w-32`} value={editingAction.action_type} onChange={(e) => setEditingAction((d) => ({ ...d, action_type: e.target.value }))}>
                            {ACTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                        ) : row.action_type}
                      </td>
                      <td className="px-2 py-2 text-(--color-fg-default)">
                        {isEditing ? (
                          <input className={`${input} w-40`} value={editingAction.object_name ?? ''} onChange={(e) => setEditingAction((d) => ({ ...d, object_name: e.target.value }))} />
                        ) : row.object_name || row.object_key}
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-(--color-fg-subtle)">
                        {isEditing ? (
                          <input className={`${input} w-48 font-mono`} value={editingAction.automation_id || editingAction.name_text || editingAction.uia_path || ''} onChange={(e) => setEditingAction((d) => ({ ...d, automation_id: e.target.value }))} />
                        ) : row.automation_id || row.name_text || row.uia_path}
                      </td>
                      <td className="px-2 py-2 text-(--color-fg-default)">
                        {isEditing ? (
                          <input className={`${input} w-36`} value={editingAction.value || editingAction.expected || ''} onChange={(e) => setEditingAction((d) => ({ ...d, value: e.target.value }))} />
                        ) : row.value || row.expected}
                      </td>
                      <td className="px-2 py-2 text-(--color-fg-subtle)">
                        {isEditing ? (
                          <input className={`${input} w-36`} value={editingAction.window_title || editingAction.screen || ''} onChange={(e) => setEditingAction((d) => ({ ...d, window_title: e.target.value }))} />
                        ) : row.window_title || row.screen}
                      </td>
                      <td className="sticky right-0 border-l border-(--color-line-subtle) bg-(--color-surface-1) px-2 py-2">
                        <div className="flex min-w-[132px] items-center gap-1.5">
                          {isEditing ? (
                            <>
                              <Button variant="glass" size="xs" disabled={updateAction.isPending} onClick={saveEditAction} title="Save step">
                                <Save size={11} /> Save
                              </Button>
                              <Button variant="glass" size="xs" onClick={cancelEditAction} title="Cancel edit">
                                <X size={11} />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="glass" size="xs" onClick={() => startEditAction(row)} title="Update step">
                                <Pencil size={11} /> Edit
                              </Button>
                              <Button variant="danger" size="xs" disabled={deleteAction.isPending} onClick={() => deleteRecordedAction(row)} title="Delete step">
                                <Trash2 size={11} />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(detail.data?.actions ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-xs text-(--color-fg-subtle)">
                      No recorded steps yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {compiled && (
            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2">
                <GitBranch size={14} className="text-[#a195ff]" />
                <span className={label}>Keyword View</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-(--color-line-default)">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-(--color-surface-2) text-[9px] uppercase tracking-[0.14em] text-(--color-fg-subtle)">
                    <tr>
                      {['Step', 'Object', 'Operation', 'Value', 'Assignment', 'Checkpoint'].map((header) => (
                        <th key={header} className="border-r border-(--color-line-subtle) px-2 py-2 text-left font-mono last:border-r-0">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compiled.keyword_steps.map((row) => (
                      <tr key={row.step} className="border-t border-(--color-line-subtle)/60">
                        <td className="px-2 py-2 font-mono text-(--color-fg-subtle)">{row.step}</td>
                        <td className="px-2 py-2 text-(--color-fg-default)">{row.object}</td>
                        <td className="px-2 py-2 text-(--color-fg-default)">{row.operation}</td>
                        <td className="px-2 py-2 text-(--color-fg-default)">{row.value}</td>
                        <td className="px-2 py-2 text-(--color-fg-subtle)">{row.assignment}</td>
                        <td className="px-2 py-2 text-(--color-fg-subtle)">{row.checkpoint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-(--color-line-default) p-4">
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
            <Button variant="glass" size="sm" className="w-full justify-center" disabled={!sessionId || agentCommandMutation.isPending} onClick={buildAgentCommand}>
              <Terminal size={11} /> Generate Agent Command
            </Button>
            <Button variant="neon" size="sm" className="mt-2 w-full justify-center" disabled={!sessionId} onClick={downloadAgentPackage}>
              <Download size={11} /> Download Agent Package
            </Button>
            {agentPackageStatus && (
              <p className="mt-2 text-[10px] font-mono text-(--color-fg-subtle)">{agentPackageStatus}</p>
            )}
            {agentCommand && (
              <div className="mt-2 rounded-md border border-(--color-line-default) bg-(--color-surface-2) p-3">
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-5 text-(--color-fg-default)">{agentCommand}</pre>
                <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-mono uppercase tracking-[0.12em] text-(--color-fg-subtle)">
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
            <Button variant="glass" size="sm" className="w-full justify-center" disabled={!sessionId || mcpCommandMutation.isPending} onClick={buildMcpCommand}>
              <Server size={11} /> Generate MCP Command
            </Button>
            <Button variant="neon" size="sm" className="mt-2 w-full justify-center" disabled={!sessionId} onClick={downloadMcpPackage}>
              <Download size={11} /> Download MCP Package
            </Button>
            {mcpPackageStatus && (
              <p className="mt-2 text-[10px] font-mono text-(--color-fg-subtle)">{mcpPackageStatus}</p>
            )}
            {mcpCommand && (
              <div className="mt-2 rounded-md border border-(--color-line-default) bg-(--color-surface-2) p-3">
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-5 text-(--color-fg-default)">{mcpCommand}</pre>
                <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-mono uppercase tracking-[0.12em] text-(--color-fg-subtle)">
                  <span>Tools: snapshot</span>
                  <span>capture</span>
                  <span>record</span>
                </div>
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Monitor size={14} className="text-[#5b8cff]" />
            <span className={label}>Create Step</span>
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
              <Plus size={11} /> Create Step
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
                  <div key={`${item.component_key}-${item.start_step}-${item.end_step}`} className="rounded-md border border-(--color-line-default) bg-(--color-surface-2) px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-(--color-fg-default)">{item.name}</p>
                        <p className="mt-1 text-[10px] leading-4 text-(--color-fg-subtle)">{item.reason}</p>
                      </div>
                      <span className="shrink-0 rounded border border-[#45c08a]/30 bg-[#45c08a]/10 px-1.5 py-0.5 text-[9px] font-mono text-[#45c08a]">
                        {Math.round((item.confidence ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded border border-(--color-line-default) px-1.5 py-0.5 text-[9px] font-mono text-(--color-fg-subtle)">
                        Steps {item.start_step}-{item.end_step}
                      </span>
                      <span className="rounded border border-(--color-line-default) px-1.5 py-0.5 text-[9px] font-mono text-(--color-fg-subtle)">
                        {item.action_count} actions
                      </span>
                      <span className="rounded border border-(--color-line-default) px-1.5 py-0.5 text-[9px] font-mono text-(--color-fg-subtle)">
                        {item.component_type}
                      </span>
                    </div>
                    {(item.suggested_parameters?.length || item.suggested_outputs?.length) ? (
                      <p className="mt-2 text-[10px] font-mono text-(--color-fg-subtle)">
                        {item.suggested_parameters?.length ?? 0} inputs / {item.suggested_outputs?.length ?? 0} outputs
                      </p>
                    ) : null}
                  </div>
                ))}
                {!compiled.component_suggestions?.length && (
                  <div className="rounded-md border border-dashed border-(--color-line-default) px-3 py-4 text-center text-[10px] text-(--color-fg-subtle)">
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
                  <div key={item.object_key} className="rounded-md border border-(--color-line-default) bg-(--color-surface-2) px-3 py-2">
                    <p className="truncate text-xs font-medium text-(--color-fg-default)">{item.name}</p>
                    <p className="mt-1 truncate text-[10px] font-mono text-(--color-fg-subtle)">{item.locator_strategy}: {item.primary_locator}</p>
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
