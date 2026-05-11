'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  BackgroundVariant, type Connection, type Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Shield, Database, Smartphone, Monitor,
  Brain, GitBranch, RefreshCw, Timer,
  Save, Play, Layers, ChevronRight,
  X, FolderOpen, Plus,
} from 'lucide-react';
import { nodeTypes } from '@/components/workflows/CustomNodes';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { ExecutionStatus } from '@/types';
import type { Node } from '@xyflow/react';
import { useCreateWorkflow, useUpdateWorkflow, useWorkflow, useWorkflows } from '@/lib/api/workflows';
import { useTriggerExecution } from '@/lib/api/executions';
import { useUIStore } from '@/lib/stores/uiStore';
import { usePlugins } from '@/lib/api/plugins';
import type { WorkflowCreateInput, WorkflowDetail } from '@/lib/api/types';

interface NexusNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  status?: ExecutionStatus;
  duration?: number;
  traversalCount?: number;
}

type NexusNode = Node<NexusNodeData, 'nexusNode'>;

const NODE_PALETTE = [
  { type: 'webAction',       label: 'Web Action',     icon: Globe,       color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  { type: 'apiValidation',   label: 'API Validation', icon: Shield,      color: 'text-cyan-400',    bg: 'bg-cyan-500/10' },
  { type: 'dbValidation',    label: 'DB Validation',  icon: Database,    color: 'text-violet-400',  bg: 'bg-violet-500/10' },
  { type: 'mobileAction',    label: 'Mobile Action',  icon: Smartphone,  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { type: 'desktopAction',   label: 'Desktop Action', icon: Monitor,     color: 'text-indigo-400',  bg: 'bg-indigo-500/10' },
  { type: 'aiAnalysis',      label: 'AI Analysis',    icon: Brain,       color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  { type: 'conditionalBranch', label: 'Condition',    icon: GitBranch,   color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  { type: 'retryNode',       label: 'Retry Node',     icon: RefreshCw,   color: 'text-orange-400',  bg: 'bg-orange-500/10' },
  { type: 'delayNode',       label: 'Delay Node',     icon: Timer,       color: 'text-slate-400',   bg: 'bg-slate-500/10' },
];

const EDGE_STYLE = { stroke: 'url(#edgeGradient)', strokeWidth: 1.5 };
const MARKER = { type: MarkerType.ArrowClosed, color: '#6366f1' };

let nodeId = 0;

function workflowToNodes(workflow: WorkflowDetail): NexusNode[] {
  return workflow.nodes.map((node) => ({
    id: node.node_key,
    type: 'nexusNode',
    position: { x: node.position_x, y: node.position_y },
    data: {
      label: node.label,
      nodeType: node.type,
    },
  }));
}

function workflowToEdges(workflow: WorkflowDetail): Edge[] {
  return workflow.edges.map((edge) => ({
    id: `${edge.source_key}-${edge.target_key}`,
    source: edge.source_key,
    target: edge.target_key,
    animated: true,
    style: EDGE_STYLE,
    markerEnd: MARKER,
    data: { condition: edge.condition },
  }));
}

function flowToWorkflowInput(
  name: string,
  nodes: NexusNode[],
  edges: Edge[],
): WorkflowCreateInput {
  return {
    name: name.trim() || 'Untitled Workflow',
    description: 'Authored in the NEXUS QA workflow workspace.',
    tags: ['workspace-authored'],
    platforms: ['web'],
    variables: {},
    nodes: nodes.map((node) => ({
      node_key: node.id,
      type: String(node.data.nodeType || 'webAction'),
      label: String(node.data.label || node.id),
      description: '',
      config: {},
      position: { x: node.position.x, y: node.position.y },
      timeout_seconds: 60,
      retry_policy: { max_attempts: 3 },
    })),
    edges: edges.map((edge) => ({
      source_key: edge.source,
      target_key: edge.target,
      condition: typeof edge.data?.condition === 'string' ? edge.data.condition : undefined,
    })),
  };
}

export default function WorkflowsPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<NexusNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedApiWorkflow, setSelectedApiWorkflow] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const loadedWorkflowRef = useRef<string | null>(null);

  const { data: apiWorkflows = [] } = useWorkflows();
  const { data: selectedWorkflow } = useWorkflow(selectedApiWorkflow);
  const { mutate: triggerExecution, isPending: launching } = useTriggerExecution();
  const { mutate: createWorkflow, isPending: creating } = useCreateWorkflow();
  const { mutate: updateWorkflow, isPending: updating } = useUpdateWorkflow(selectedApiWorkflow ?? '');
  const { openInspectorFor } = useUIStore();
  const { data: pluginsData } = usePlugins();
  const saving = creating || updating;

  useEffect(() => {
    if (!selectedApiWorkflow && apiWorkflows.length > 0) {
      setSelectedApiWorkflow(apiWorkflows[0].id);
    }
  }, [apiWorkflows, selectedApiWorkflow]);

  useEffect(() => {
    if (!selectedWorkflow || loadedWorkflowRef.current === selectedWorkflow.id) return;
    setWorkflowName(selectedWorkflow.name);
    setNodes(workflowToNodes(selectedWorkflow));
    setEdges(workflowToEdges(selectedWorkflow));
    nodeId = Math.max(
      nodeId,
      ...selectedWorkflow.nodes.map((node) => {
        const match = node.node_key.match(/^n?(\d+)$/);
        return match ? Number(match[1]) : 0;
      }),
    );
    setSelectedNode(null);
    loadedWorkflowRef.current = selectedWorkflow.id;
  }, [selectedWorkflow, setEdges, setNodes]);

  const handleRunWorkflow = () => {
    const wfId = selectedApiWorkflow ?? apiWorkflows[0]?.id;
    if (!wfId) return;
    triggerExecution(
      { workflow_id: wfId, trigger: 'manual', environment: 'staging', platform: 'web' },
      { onSuccess: (res) => openInspectorFor(res.execution_id) },
    );
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: EDGE_STYLE, markerEnd: MARKER }, eds)),
    [setEdges],
  );

  const addNode = (nodeType: string, label: string) => {
    const id = `n${++nodeId}`;
    setNodes((nds) => [...nds, {
      id, type: 'nexusNode',
      position: { x: 250 + Math.random() * 200, y: 250 + Math.random() * 200 },
      data: { label, nodeType },
    } as NexusNode]);
  };

  const createNewDraft = () => {
    loadedWorkflowRef.current = null;
    setSelectedApiWorkflow(null);
    setSelectedNode(null);
    setWorkflowName('Untitled Workflow');
    setNodes([]);
    setEdges([]);
  };

  const saveWorkflow = () => {
    const input = flowToWorkflowInput(workflowName, nodes, edges);
    if (selectedApiWorkflow) {
      updateWorkflow(input);
      return;
    }

    createWorkflow(input, {
      onSuccess: (workflow) => {
        loadedWorkflowRef.current = workflow.id;
        setSelectedApiWorkflow(workflow.id);
        setWorkflowName(workflow.name);
      },
    });
  };

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)] xl:flex">
        <div className="flex h-11 items-center justify-between border-b border-[var(--color-line-subtle)] px-4">
          <div className="flex items-center gap-2">
            <FolderOpen size={13} className="text-[var(--color-accent-default)]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
              Workflow Explorer
            </span>
          </div>
          <button
            onClick={createNewDraft}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]"
            title="New workflow"
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="border-b border-[var(--color-line-subtle)] p-3">
          <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Active Workflow
          </label>
          <input
            value={workflowName}
            onChange={(event) => setWorkflowName(event.target.value)}
            className="mt-2 w-full rounded-md border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-3 py-2 text-xs text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]"
          />
          <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[var(--color-fg-subtle)]">
            <span>{nodes.length} nodes</span>
            <span>{edges.length} edges</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {apiWorkflows.length === 0 ? (
            <div className="rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-3 text-[11px] leading-5 text-[var(--color-fg-subtle)]">
              No backend workflows found. Build a graph and save it to create the first workflow.
            </div>
          ) : (
            <div className="space-y-1">
              {apiWorkflows.map((workflow) => {
                const selected = workflow.id === selectedApiWorkflow;
                return (
                  <button
                    key={workflow.id}
                    onClick={() => {
                      loadedWorkflowRef.current = null;
                      setSelectedApiWorkflow(workflow.id);
                    }}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      selected
                        ? 'border-[var(--color-line-active)] bg-[var(--color-accent-soft)]'
                        : 'border-transparent hover:border-[var(--color-line-default)] hover:bg-[var(--color-surface-2)]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          workflow.status === 'active'
                            ? 'bg-[var(--color-state-success)]'
                            : 'bg-[var(--color-state-warning)]',
                        )}
                      />
                      <span className="truncate text-xs font-medium text-[var(--color-fg-default)]">
                        {workflow.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-[var(--color-fg-subtle)]">
                      <span>{workflow.node_count} nodes</span>
                      <span>{workflow.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
      {/* ── Icon-strip Node Palette ──────────────────────────────────────── */}
      <div className="relative shrink-0 group/palette">
        {/* Collapsed: 56px icon strip */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-14 h-full flex flex-col bg-(--color-surface-1) border-r border-(--color-line-default) z-10 relative"
        >
          {/* Header icon */}
          <div className="h-11 flex items-center justify-center border-b border-(--color-line-subtle) shrink-0">
            <Layers size={14} className="text-(--color-fg-subtle)" />
          </div>

          {/* Node icon buttons */}
          <div className="flex-1 flex flex-col items-center gap-1 py-3 overflow-y-auto">
            {NODE_PALETTE.map((item) => (
              <button
                key={item.type}
                onClick={() => addNode(item.type, item.label)}
                title={item.label}
                className={cn(
                  'group relative w-9 h-9 rounded-lg flex items-center justify-center transition-all',
                  'hover:bg-surface-3 border border-transparent hover:border-(--color-line-default)',
                  item.bg,
                )}
              >
                <item.icon size={13} className={item.color} />
                {/* Tooltip */}
                <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 rounded-md text-[11px] whitespace-nowrap bg-surface-3 border border-(--color-line-default) shadow-(--shadow-pop) opacity-0 group-hover:opacity-100 transition-opacity z-50 text-(--color-fg-default)">
                  {item.label}
                </span>
              </button>
            ))}

            {/* Plugin types */}
            {pluginsData?.plugins?.flatMap((plugin) =>
              plugin.node_types.map((spec) => (
                <button
                  key={spec.type}
                  onClick={() => addNode(spec.type, spec.label)}
                  title={spec.label}
                  className="group relative w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-surface-3 border border-transparent hover:border-(--color-line-default)"
                  style={{ backgroundColor: `${spec.color}1a` }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: spec.color }} />
                  <span className="pointer-events-none absolute left-full ml-2.5 px-2 py-1 rounded-md text-[11px] whitespace-nowrap bg-surface-3 border border-(--color-line-default) shadow-(--shadow-pop) opacity-0 group-hover:opacity-100 transition-opacity z-50 text-(--color-fg-default)">
                    {spec.label}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Save button */}
          <div className="shrink-0 p-2 border-t border-(--color-line-subtle)">
            <button
              onClick={saveWorkflow}
              disabled={saving || nodes.length === 0}
              title="Save Workflow"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-(--color-fg-muted) hover:text-(--color-fg-default) hover:bg-surface-3 transition-all border border-transparent hover:border-(--color-line-default) disabled:opacity-40 disabled:pointer-events-none"
            >
              <Save size={13} className={saving ? 'animate-pulse' : ''} />
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        <svg className="absolute inset-0 w-0 h-0 overflow-hidden">
          <defs>
            <linearGradient id="edgeGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-accent-default)" />
              <stop offset="100%" stopColor="var(--color-state-running)" />
            </linearGradient>
          </defs>
        </svg>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNode(node.id === selectedNode ? null : node.id)}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(139,121,255,0.06)" />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as { status?: string };
              if (d.status === 'running') return 'var(--color-state-running)';
              if (d.status === 'success') return 'var(--color-state-success)';
              if (d.status === 'failed')  return 'var(--color-state-error)';
              return 'var(--color-accent-default)';
            }}
          />
        </ReactFlow>

        {/* ── Floating sim controls bar ─────────────────────────────────── */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-(--color-surface-2) border border-(--color-line-default) shadow-(--shadow-pop) backdrop-blur-sm z-20">
          {apiWorkflows.length > 0 && (
            <Button
              variant="glass"
              size="sm"
              onClick={handleRunWorkflow}
              disabled={launching}
            >
              <Play size={11} />
              {launching ? 'Launching…' : 'Run on Backend'}
            </Button>
          )}
        </div>

        {/* ── Canvas workspace label ─────────────────────────────────────── */}
        <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none z-10">
          <span className="text-[10px] font-mono text-(--color-fg-subtle) uppercase tracking-[0.16em]">
            {selectedApiWorkflow ? 'Persisted Workflow Canvas' : 'Draft Workflow Canvas'}
          </span>
        </div>
      </div>

      {/* ── Node Inspector — slides in from right ────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key="node-inspector"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className="shrink-0 overflow-hidden bg-(--color-surface-1) border-l border-(--color-line-default)"
          >
            <div className="w-65 h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between h-11 px-4 border-b border-(--color-line-subtle) shrink-0">
                <div className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-(--color-accent-default)" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-(--color-fg-subtle)">
                    Node Inspector
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-md text-(--color-fg-subtle) hover:text-(--color-fg-default) hover:bg-surface-3 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>

              {/* Properties */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {(() => {
                  const node = nodes.find((n) => n.id === selectedNode);
                  if (!node) return null;
                  const d = node.data as { label: string; nodeType: string; status?: string; duration?: number };
                  return (
                    <>
                      <div>
                        <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-(--color-fg-subtle)">
                          Node ID
                        </label>
                        <p className="text-[11px] font-mono text-(--color-fg-muted) mt-1">{node.id}</p>
                      </div>

                      <div>
                        <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-(--color-fg-subtle)">
                          Label
                        </label>
                        <input
                          value={d.label}
                          onChange={(event) => {
                            const nextLabel = event.target.value;
                            setNodes((current) => current.map((candidate) => (
                              candidate.id === node.id
                                ? { ...candidate, data: { ...candidate.data, label: nextLabel } }
                                : candidate
                            )));
                          }}
                          className="w-full mt-1.5 bg-(--color-surface-2) border border-(--color-line-default) rounded-md px-3 py-2 text-xs text-(--color-fg-default) focus:outline-none focus:border-(--color-accent-default) transition-colors font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-(--color-fg-subtle)">
                          Type
                        </label>
                        <p className="text-[11px] font-mono text-(--color-accent-default) mt-1">{d.nodeType}</p>
                      </div>

                      {d.status && (
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-(--color-fg-subtle)">
                            Status
                          </label>
                          <p className={cn(
                            'text-[11px] font-mono font-semibold mt-1',
                            d.status === 'success' ? 'text-state-success' :
                            d.status === 'running'  ? 'text-(--color-state-running)' :
                            d.status === 'failed'   ? 'text-state-error' :
                            'text-(--color-fg-muted)',
                          )}>
                            {d.status}
                          </p>
                        </div>
                      )}

                      {d.duration != null && (
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-(--color-fg-subtle)">
                            Duration
                          </label>
                          <p className="text-[11px] font-mono text-(--color-fg-muted) mt-1">{d.duration} ms</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
