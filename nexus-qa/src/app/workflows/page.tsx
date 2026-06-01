'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState,
  BackgroundVariant, type Connection, type Edge, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Shield, Database, Smartphone, Monitor, Brain, GitBranch, RefreshCw, Timer,
  Save, Play, Layers, X, FolderOpen, Plus, Tag, Calendar, Activity, Cpu,
  ChevronRight, Pencil, Check,
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface NexusNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  config?: Record<string, unknown>;
  status?: ExecutionStatus;
  duration?: number;
}

type NexusNode = Node<NexusNodeData, 'nexusNode'>;

// ── Palette ────────────────────────────────────────────────────────────────────

const PALETTE_GROUPS = [
  {
    label: 'Web & Browser',
    color: '#5b8cff',
    items: [
      { type: 'webAction',   label: 'Web Action',   icon: Globe },
      { type: 'desktopAction', label: 'Desktop',    icon: Monitor },
      { type: 'mobileAction',  label: 'Mobile',     icon: Smartphone },
    ],
  },
  {
    label: 'Validation',
    color: '#45c08a',
    items: [
      { type: 'apiValidation', label: 'API Check',  icon: Shield },
      { type: 'dbValidation',  label: 'DB Check',   icon: Database },
    ],
  },
  {
    label: 'Control Flow',
    color: '#a195ff',
    items: [
      { type: 'aiAnalysis',       label: 'AI Analysis', icon: Brain },
      { type: 'conditionalBranch', label: 'Condition',  icon: GitBranch },
      { type: 'retryNode',         label: 'Retry',      icon: RefreshCw },
      { type: 'delayNode',         label: 'Delay',      icon: Timer },
    ],
  },
];

const EDGE_STYLE = { stroke: 'url(#edgeGradient)', strokeWidth: 1.5 };
const MARKER = { type: MarkerType.ArrowClosed, color: '#6366f1' };
const OPEN_METEO_SAMPLE_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=12.9716&longitude=77.5946&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=Asia%2FKolkata';
const API_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

let nodeId = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nodeConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isApiNodeType(type: string): boolean {
  return type.startsWith('api.');
}

function fixedApiMethod(type: string): string | null {
  if (type === 'api.get') return 'GET';
  if (type === 'api.post') return 'POST';
  if (type === 'api.put') return 'PUT';
  if (type === 'api.delete') return 'DELETE';
  return null;
}

function apiNodeTypeForMethod(method: string): string {
  const normalized = method.toUpperCase();
  if (normalized === 'POST') return 'api.post';
  if (normalized === 'PUT') return 'api.put';
  if (normalized === 'DELETE') return 'api.delete';
  if (normalized === 'PATCH') return 'api.request';
  return 'api.get';
}

function apiNodeLabelForMethod(method: string): string {
  return `${method.toUpperCase()} Request`;
}

function defaultConfigForType(type: string): Record<string, unknown> {
  if (!isApiNodeType(type)) return {};
  const config: Record<string, unknown> = { timeout_seconds: 30, verify_ssl: true, trust_env: false };
  const fixedMethod = fixedApiMethod(type);
  if (fixedMethod) config.method = fixedMethod;
  if (['api.assert_status', 'api.assert_json_path', 'api.extract', 'api.assert_headers', 'api.assert_response_time', 'api.request'].includes(type)) {
    config.method = 'GET';
  }
  if (type === 'api.assert_status') config.expected_status = 200;
  if (type === 'api.assert_json_path') config.operator = 'exists';
  if (type === 'api.assert_response_time') config.max_ms = 2000;
  return config;
}

function inferWorkflowPlatforms(nodes: NexusNode[]): string[] {
  const platforms = new Set<string>();
  for (const node of nodes) {
    const type = String(node.data.nodeType || '');
    if (type.startsWith('api.')) platforms.add('api');
    else if (type.startsWith('desktop.') || type === 'desktopAction') platforms.add('desktop');
    else if (type.startsWith('mobile.') || type === 'mobileAction') platforms.add('android');
    else if (type.startsWith('web.') || type === 'webAction') platforms.add('web');
  }
  return platforms.size ? Array.from(platforms) : ['web'];
}

// ── Converters ─────────────────────────────────────────────────────────────────

function workflowToNodes(wf: WorkflowDetail): NexusNode[] {
  return wf.nodes.map((n) => ({
    id: n.node_key, type: 'nexusNode',
    position: { x: n.position_x, y: n.position_y },
    data: { label: n.label, nodeType: n.type, config: n.config || {} },
  }));
}

function workflowToEdges(wf: WorkflowDetail): Edge[] {
  return wf.edges.map((e) => ({
    id: `${e.source_key}-${e.target_key}`,
    source: e.source_key, target: e.target_key,
    animated: true, style: EDGE_STYLE, markerEnd: MARKER,
    data: { condition: e.condition },
  }));
}

function toInput(name: string, nodes: NexusNode[], edges: Edge[]): WorkflowCreateInput {
  return {
    name: name.trim() || 'Untitled Workflow',
    description: 'Authored in NEXUS QA workflow canvas.',
    tags: ['canvas'],
    platforms: inferWorkflowPlatforms(nodes),
    variables: {},
    nodes: nodes.map((n) => ({
      node_key: n.id,
      type: String(n.data.nodeType || 'webAction'),
      label: String(n.data.label || n.id),
      description: '',
      config: nodeConfig(n.data.config),
      position: { x: n.position.x, y: n.position.y },
      timeout_seconds: 60,
      retry_policy: { max_attempts: 3 },
    })),
    edges: edges.map((e) => ({
      source_key: e.source,
      target_key: e.target,
      condition: typeof e.data?.condition === 'string' ? e.data.condition : undefined,
    })),
  };
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatConfigValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function ConfigTextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--color-fg-default)] outline-none transition-colors placeholder:text-[var(--color-fg-subtle)]/45 focus:border-[var(--color-accent-default)]"
      />
    </div>
  );
}

function ConfigJsonField({
  label,
  value,
  onChange,
  placeholder = '{}',
  objectOnly = true,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
  objectOnly?: boolean;
}) {
  const [text, setText] = useState(formatConfigValue(value));
  const [error, setError] = useState('');

  useEffect(() => {
    setText(formatConfigValue(value));
    setError('');
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange(undefined);
      setError('');
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (objectOnly && !isRecord(parsed)) {
        setError('Must be a JSON object');
        return;
      }
      onChange(parsed);
      setError('');
    } catch {
      setError('Invalid JSON');
    }
  }

  return (
    <div>
      <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">{label}</label>
      <textarea
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        rows={3}
        className="mt-1.5 w-full resize-y rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--color-fg-default)] outline-none transition-colors placeholder:text-[var(--color-fg-subtle)]/45 focus:border-[var(--color-accent-default)]"
      />
      {error && <p className="mt-1 text-[10px] text-[var(--color-state-error)]">{error}</p>}
    </div>
  );
}

function ApiConfigEditor({
  nodeType,
  config,
  onChange,
}: {
  nodeType: string;
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const fixedMethod = fixedApiMethod(nodeType);
  const method = String(config.method ?? fixedMethod ?? 'GET').toUpperCase();
  const showMethodSelect = !fixedMethod && [
    'api.request',
    'api.assert_status',
    'api.assert_json_path',
    'api.extract',
    'api.assert_headers',
    'api.assert_response_time',
  ].includes(nodeType);
  const showBody = ['api.post', 'api.put', 'api.request'].includes(nodeType);

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-line-default)] bg-[rgba(91,140,255,0.05)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-accent-default)]">API Config</span>
        <span className="rounded-md border border-[rgba(91,140,255,0.25)] bg-[rgba(91,140,255,0.08)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-accent-default)]">
          {fixedMethod ?? method}
        </span>
      </div>

      {showMethodSelect && (
        <div>
          <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Method</label>
          <select
            value={method}
            onChange={(e) => onChange('method', e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]"
          >
            {API_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      )}

      <ConfigTextField
        label="URL"
        value={formatConfigValue(config.url)}
        placeholder={OPEN_METEO_SAMPLE_URL}
        onChange={(value) => onChange('url', value)}
      />

      <ConfigTextField
        label="Timeout Seconds"
        type="number"
        value={formatConfigValue(config.timeout_seconds ?? 30)}
        onChange={(value) => onChange('timeout_seconds', Number(value || 30))}
      />

      <label className="flex items-center justify-between rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Verify SSL</span>
        <input
          type="checkbox"
          checked={config.verify_ssl !== false}
          onChange={(event) => onChange('verify_ssl', event.target.checked)}
          className="h-4 w-4 accent-[var(--color-accent-default)]"
        />
      </label>

      <label className="flex items-center justify-between rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Use Env Proxy</span>
        <input
          type="checkbox"
          checked={config.trust_env === true}
          onChange={(event) => onChange('trust_env', event.target.checked)}
          className="h-4 w-4 accent-[var(--color-accent-default)]"
        />
      </label>

      {nodeType === 'api.assert_status' && (
        <ConfigTextField
          label="Expected Status"
          type="number"
          value={formatConfigValue(config.expected_status ?? 200)}
          onChange={(value) => onChange('expected_status', Number(value || 200))}
        />
      )}

      {['api.assert_json_path', 'api.extract'].includes(nodeType) && (
        <ConfigTextField
          label="JSON Path"
          value={formatConfigValue(config.path)}
          placeholder="$.current.temperature_2m"
          onChange={(value) => onChange('path', value)}
        />
      )}

      {nodeType === 'api.assert_json_path' && (
        <>
          <div>
            <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Operator</label>
            <select
              value={String(config.operator ?? 'exists')}
              onChange={(e) => onChange('operator', e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]"
            >
              {['exists', 'eq', 'ne', 'contains'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <ConfigTextField
            label="Expected"
            value={formatConfigValue(config.expected)}
            placeholder="Optional unless using eq/ne/contains"
            onChange={(value) => onChange('expected', value || undefined)}
          />
        </>
      )}

      {nodeType === 'api.extract' && (
        <ConfigTextField
          label="Variable"
          value={formatConfigValue(config.variable)}
          placeholder="current_temperature"
          onChange={(value) => onChange('variable', value)}
        />
      )}

      {nodeType === 'api.assert_headers' && (
        <ConfigJsonField
          label="Expected Headers JSON"
          value={config.expected_headers}
          placeholder={'{"content-type":"application/json"}'}
          onChange={(value) => onChange('expected_headers', value)}
        />
      )}

      {nodeType === 'api.assert_response_time' && (
        <ConfigTextField
          label="Max MS"
          type="number"
          value={formatConfigValue(config.max_ms ?? 2000)}
          onChange={(value) => onChange('max_ms', Number(value || 2000))}
        />
      )}

      <ConfigJsonField
        label="Headers JSON"
        value={config.headers}
        placeholder={'{"accept":"application/json"}'}
        onChange={(value) => onChange('headers', value)}
      />

      <ConfigJsonField
        label="Params JSON"
        value={config.params}
        placeholder={'{"timezone":"Asia/Kolkata"}'}
        onChange={(value) => onChange('params', value)}
      />

      {showBody && (
        <ConfigJsonField
          label="Body JSON"
          value={config.body}
          placeholder={'{"name":"sample"}'}
          objectOnly={false}
          onChange={(value) => onChange('body', value)}
        />
      )}
    </div>
  );
}

// ── Workflow card ──────────────────────────────────────────────────────────────

function WorkflowCard({
  wf, selected, onClick,
}: {
  wf: { id: string; name: string; status: string; node_count: number; updated_at: string };
  selected: boolean;
  onClick: () => void;
}) {
  const statusColor = wf.status === 'active' ? '#45c08a' : '#f0b558';
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 2 }}
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border px-3 py-3 transition-all',
        selected
          ? 'border-[rgba(91,140,255,0.5)] bg-[rgba(91,140,255,0.08)] shadow-[0_0_12px_rgba(91,140,255,0.07)]'
          : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:border-[var(--color-line-strong)] hover:bg-[rgba(255,255,255,0.02)]',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[12px] font-medium text-[var(--color-fg-default)] leading-snug line-clamp-1">{wf.name}</p>
        <span className="shrink-0 h-1.5 w-1.5 rounded-full mt-1.5" style={{ background: statusColor }} />
      </div>
      <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--color-fg-subtle)]">
        <span className="flex items-center gap-1"><Cpu size={9} />{wf.node_count} nodes</span>
        <span className="flex items-center gap-1"><Calendar size={9} />{timeAgo(wf.updated_at)}</span>
      </div>
    </motion.button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<NexusNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode]       = useState<string | null>(null);
  const [selectedWfId, setSelectedWfId]       = useState<string | null>(null);
  const [workflowName, setWorkflowName]       = useState('Untitled Workflow');
  const [editingName, setEditingName]         = useState(false);
  const [nameInput,   setNameInput]           = useState('Untitled Workflow');
  const [draftMode, setDraftMode]             = useState(false);
  const [apiDialogOpen, setApiDialogOpen]     = useState(false);
  const [apiDraftName, setApiDraftName]       = useState('Open-Meteo API Test');
  const [apiDraftMethod, setApiDraftMethod]   = useState('GET');
  const [apiDraftUrl, setApiDraftUrl]         = useState(OPEN_METEO_SAMPLE_URL);
  const [apiDraftStatus, setApiDraftStatus]   = useState('200');
  const [apiDraftVerifySsl, setApiDraftVerifySsl] = useState(true);
  const [apiDraftTrustEnv, setApiDraftTrustEnv] = useState(false);
  const [apiDraftError, setApiDraftError]     = useState('');
  const loadedRef = useRef<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { data: apiWorkflows = [] }     = useWorkflows('active');
  const { data: selectedWorkflow }      = useWorkflow(selectedWfId);
  const { mutate: triggerExec, isPending: launching } = useTriggerExecution();
  const { mutate: createWf, isPending: creating }     = useCreateWorkflow();
  const { mutate: updateWf, isPending: updating }     = useUpdateWorkflow(selectedWfId ?? '');
  const { openInspectorFor }            = useUIStore();
  const { data: pluginsData }           = usePlugins();
  const saving = creating || updating;

  useEffect(() => {
    if (!draftMode && !selectedWfId && apiWorkflows.length > 0) setSelectedWfId(apiWorkflows[0].id);
  }, [apiWorkflows, draftMode, selectedWfId]);

  useEffect(() => {
    if (!selectedWorkflow || loadedRef.current === selectedWorkflow.id) return;
    setWorkflowName(selectedWorkflow.name);
    setNameInput(selectedWorkflow.name);
    setNodes(workflowToNodes(selectedWorkflow));
    setEdges(workflowToEdges(selectedWorkflow));
    nodeId = Math.max(nodeId, ...selectedWorkflow.nodes.map((n) => {
      const m = n.node_key.match(/^n?(\d+)$/);
      return m ? Number(m[1]) : 0;
    }));
    setSelectedNode(null);
    loadedRef.current = selectedWorkflow.id;
  }, [selectedWorkflow, setEdges, setNodes]);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus();
  }, [editingName]);

  const onConnect = useCallback(
    (p: Connection) => setEdges((eds) => addEdge({ ...p, animated: true, style: EDGE_STYLE, markerEnd: MARKER }, eds)),
    [setEdges],
  );

  function addNode(type: string, label: string) {
    const id = `n${++nodeId}`;
    setNodes((ns) => [...ns, { id, type: 'nexusNode', position: { x: 220 + Math.random() * 220, y: 180 + Math.random() * 220 }, data: { label, nodeType: type, config: defaultConfigForType(type) } } as NexusNode]);
  }

  function openApiWorkflowDialog() {
    setApiDraftName('Open-Meteo API Test');
    setApiDraftMethod('GET');
    setApiDraftUrl(OPEN_METEO_SAMPLE_URL);
    setApiDraftStatus('200');
    setApiDraftVerifySsl(true);
    setApiDraftTrustEnv(false);
    setApiDraftError('');
    setApiDialogOpen(true);
  }

  function createApiWorkflowDraft() {
    const url = apiDraftUrl.trim();
    if (!url) {
      setApiDraftError('URL is required');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setApiDraftError('Enter a valid http or https URL');
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      setApiDraftError('URL must start with http or https');
      return;
    }

    const method = apiDraftMethod.toUpperCase();
    const expectedStatus = Number(apiDraftStatus || 200);
    const requestId = `n${++nodeId}`;
    const assertId = `n${++nodeId}`;
    const timingId = `n${++nodeId}`;
    const requestType = apiNodeTypeForMethod(method);
    const baseConfig = { url, method, timeout_seconds: 30, verify_ssl: apiDraftVerifySsl, trust_env: apiDraftTrustEnv };

    loadedRef.current = null;
    setDraftMode(true);
    setSelectedWfId(null);
    setWorkflowName(apiDraftName.trim() || 'API Workflow');
    setNameInput(apiDraftName.trim() || 'API Workflow');
    setSelectedNode(requestId);
    setNodes([
      {
        id: requestId,
        type: 'nexusNode',
        position: { x: 180, y: 180 },
        data: { label: apiNodeLabelForMethod(method), nodeType: requestType, config: baseConfig },
      },
      {
        id: assertId,
        type: 'nexusNode',
        position: { x: 470, y: 180 },
        data: {
          label: 'Assert Status',
          nodeType: 'api.assert_status',
          config: { ...baseConfig, expected_status: Number.isFinite(expectedStatus) ? expectedStatus : 200 },
        },
      },
      {
        id: timingId,
        type: 'nexusNode',
        position: { x: 760, y: 180 },
        data: {
          label: 'Response Time Validation',
          nodeType: 'api.assert_response_time',
          config: { ...baseConfig, max_ms: 2000 },
        },
      },
    ] as NexusNode[]);
    setEdges([
      { id: `${requestId}-${assertId}`, source: requestId, target: assertId, animated: true, style: EDGE_STYLE, markerEnd: MARKER },
      { id: `${assertId}-${timingId}`, source: assertId, target: timingId, animated: true, style: EDGE_STYLE, markerEnd: MARKER },
    ]);
    setApiDialogOpen(false);
  }

  function save() {
    const input = toInput(workflowName, nodes, edges);
    if (selectedWfId) { updateWf(input); return; }
    createWf(input, {
      onSuccess: (wf) => {
        setDraftMode(false);
        loadedRef.current = wf.id;
        setSelectedWfId(wf.id);
        setWorkflowName(wf.name);
        setNameInput(wf.name);
      },
    });
  }

  function commitName() {
    const trimmed = nameInput.trim() || 'Untitled Workflow';
    setWorkflowName(trimmed);
    setNameInput(trimmed);
    setEditingName(false);
  }

  function run() {
    const wfId = selectedWfId ?? apiWorkflows[0]?.id;
    if (!wfId) return;
    const [platform] = inferWorkflowPlatforms(nodes);
    triggerExec({ workflow_id: wfId, trigger: 'manual', environment: 'staging', platform }, {
      onSuccess: (res) => openInspectorFor(res.execution_id),
    });
  }

  const selectedNodeData = nodes.find((n) => n.id === selectedNode);

  function updateSelectedNodeConfig(key: string, value: unknown) {
    if (!selectedNode) return;
    setNodes((ns) => ns.map((n) => {
      if (n.id !== selectedNode) return n;
      const current = nodeConfig(n.data.config);
      return { ...n, data: { ...n.data, config: { ...current, [key]: value } } };
    }));
  }

  return (
    <div className="flex h-full overflow-hidden">
      <AnimatePresence>
        {apiDialogOpen && (
          <motion.div
            key="api-workflow-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setApiDialogOpen(false);
            }}
          >
            <motion.form
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onSubmit={(event) => {
                event.preventDefault();
                createApiWorkflowDraft();
              }}
              className="w-full max-w-xl rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-fg-default)]">Create API Workflow</p>
                  <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">Start with a request, status check, and response-time check.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setApiDialogOpen(false)}
                  className="rounded-md p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                <ConfigTextField
                  label="Workflow Name"
                  value={apiDraftName}
                  onChange={setApiDraftName}
                  placeholder="Open-Meteo API Test"
                />

                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <div>
                    <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Method</label>
                    <select
                      value={apiDraftMethod}
                      onChange={(event) => setApiDraftMethod(event.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]"
                    >
                      {API_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                    </select>
                  </div>

                  <ConfigTextField
                    label="Expected Status"
                    type="number"
                    value={apiDraftStatus}
                    onChange={setApiDraftStatus}
                    placeholder="200"
                  />
                </div>

                <ConfigTextField
                  label="Request URL"
                  value={apiDraftUrl}
                  onChange={(value) => {
                    setApiDraftUrl(value);
                    if (apiDraftError) setApiDraftError('');
                  }}
                  placeholder={OPEN_METEO_SAMPLE_URL}
                />

                <label className="flex items-center justify-between rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
                  <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Verify SSL</span>
                  <input
                    type="checkbox"
                    checked={apiDraftVerifySsl}
                    onChange={(event) => setApiDraftVerifySsl(event.target.checked)}
                    className="h-4 w-4 accent-[var(--color-accent-default)]"
                  />
                </label>

                <label className="flex items-center justify-between rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
                  <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Use Env Proxy</span>
                  <input
                    type="checkbox"
                    checked={apiDraftTrustEnv}
                    onChange={(event) => setApiDraftTrustEnv(event.target.checked)}
                    className="h-4 w-4 accent-[var(--color-accent-default)]"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setApiDraftUrl(OPEN_METEO_SAMPLE_URL)}
                  className="rounded-lg border border-[var(--color-line-default)] px-3 py-2 text-[11px] font-mono text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]"
                >
                  Use Open-Meteo sample URL
                </button>

                {apiDraftError && (
                  <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {apiDraftError}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--color-line-subtle)] px-5 py-4">
                <Button type="button" variant="ghost" size="sm" onClick={() => setApiDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="neon" size="sm">
                  <Plus size={12} /> Create
                </Button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Left sidebar: Workflow library ─────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)] xl:flex">
        <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={13} className="text-[var(--color-accent-default)]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Workflows</span>
          </div>
          <button onClick={openApiWorkflowDialog} title="New API workflow"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-fg-subtle)] transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]">
            <Plus size={12} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {apiWorkflows.length === 0
            ? (
              <div className="rounded-lg border border-dashed border-[var(--color-line-default)] p-4 text-center">
                <p className="text-xs text-[var(--color-fg-subtle)]">No workflows yet</p>
                <p className="mt-1 text-[10px] text-[var(--color-fg-subtle)]/60">Build a graph and save it</p>
              </div>
            )
            : apiWorkflows.map((wf) => (
              <WorkflowCard
                key={wf.id} wf={wf} selected={wf.id === selectedWfId}
                onClick={() => { setDraftMode(false); loadedRef.current = null; setSelectedWfId(wf.id); }}
              />
            ))
          }
        </div>

        {/* Canvas stats */}
        <div className="shrink-0 border-t border-[var(--color-line-subtle)] px-4 py-3">
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-fg-subtle)]">
            <span className="flex items-center gap-1"><Activity size={9} />{nodes.length} nodes</span>
            <span className="flex items-center gap-1"><ChevronRight size={9} />{edges.length} edges</span>
          </div>
        </div>
      </aside>

      {/* ── Icon palette ───────────────────────────────────────────────────── */}
      <div className="flex w-14 shrink-0 flex-col border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
        <div className="flex h-11 items-center justify-center border-b border-[var(--color-line-subtle)] shrink-0">
          <Layers size={14} className="text-[var(--color-fg-subtle)]" />
        </div>

        <div className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-0.5">
          {PALETTE_GROUPS.map((group) => (
            <div key={group.label} className="w-full flex flex-col items-center gap-0.5 py-1 border-b border-[var(--color-line-subtle)]/50 last:border-b-0">
              {group.items.map((item) => (
                <button key={item.type} onClick={() => addNode(item.type, item.label)} title={item.label}
                  className="group relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-all hover:border-[var(--color-line-default)]"
                  style={{ background: `${group.color}15` }}>
                  <item.icon size={13} style={{ color: group.color }} />
                  <span className="pointer-events-none absolute left-full ml-2.5 whitespace-nowrap rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-fg-default)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {/* Plugin nodes */}
          {pluginsData?.plugins?.flatMap((plugin) =>
            plugin.node_types.map((spec) => (
              <button key={spec.type} onClick={() => addNode(spec.type, spec.label)} title={spec.label}
                className="group relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-all hover:border-[var(--color-line-default)]"
                style={{ background: `${spec.color}15` }}>
                <span className="h-2 w-2 rounded-full" style={{ background: spec.color }} />
                <span className="pointer-events-none absolute left-full ml-2.5 whitespace-nowrap rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-[var(--color-fg-default)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                  {spec.label}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--color-line-subtle)] p-2 flex flex-col items-center gap-1">
          <button onClick={save} disabled={saving || nodes.length === 0} title="Save workflow"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--color-fg-subtle)] transition-all hover:border-[var(--color-line-default)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)] disabled:pointer-events-none disabled:opacity-40">
            <Save size={13} className={saving ? 'animate-pulse text-[var(--color-accent-default)]' : ''} />
          </button>
        </div>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        <svg className="absolute inset-0 h-0 w-0 overflow-hidden">
          <defs>
            <linearGradient id="edgeGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-accent-default)" />
              <stop offset="100%" stopColor="var(--color-state-running)" />
            </linearGradient>
          </defs>
        </svg>

        {/* Top toolbar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between border-b border-[var(--color-line-default)] bg-[rgba(13,13,24,0.85)] px-4 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameInput(workflowName); setEditingName(false); } }}
                  className="rounded-md border border-[var(--color-accent-default)] bg-[var(--color-surface-2)] px-2 py-1 text-sm font-medium text-[var(--color-fg-default)] outline-none"
                />
                <button onClick={commitName} className="p-1 rounded hover:bg-[var(--color-surface-2)]">
                  <Check size={12} className="text-[#45c08a]" />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingName(true)}
                className="group flex items-center gap-2 rounded-md px-2 py-1 transition-all hover:bg-[var(--color-surface-2)]">
                <span className="text-sm font-medium text-[var(--color-fg-default)]">{workflowName}</span>
                <Pencil size={11} className="text-[var(--color-fg-subtle)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">
              {selectedWfId ? 'persisted' : 'draft'} · {nodes.length}n {edges.length}e
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={openApiWorkflowDialog}><Plus size={11} /> New</Button>
            <Button variant="glass" size="sm" onClick={save} disabled={saving || nodes.length === 0}>
              <Save size={11} className={saving ? 'animate-pulse' : ''} />
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {apiWorkflows.length > 0 && (
              <Button variant="neon" size="sm" onClick={run} disabled={launching}>
                <Play size={11} />
                {launching ? 'Launching…' : 'Run'}
              </Button>
            )}
          </div>
        </div>

        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNode(node.id === selectedNode ? null : node.id)}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent', paddingTop: 44 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(139,121,255,0.05)" />
          <Controls position="bottom-left" style={{ bottom: 12, left: 12 }} />
          <MiniMap
            position="bottom-right"
            style={{ bottom: 12, right: 12, background: 'rgba(13,13,24,0.8)', border: '1px solid rgba(255,255,255,0.05)' }}
            nodeColor={(n) => {
              const d = n.data as { status?: string };
              if (d.status === 'running') return 'var(--color-state-running)';
              if (d.status === 'success') return 'var(--color-state-success)';
              if (d.status === 'failed')  return 'var(--color-state-error)';
              return 'var(--color-accent-default)';
            }}
          />
        </ReactFlow>

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 44 }}>
            <div className="rounded-2xl border border-[var(--color-line-default)] bg-[rgba(13,13,24,0.7)] px-10 py-8 text-center backdrop-blur-sm">
              <Layers size={28} className="mx-auto mb-3 text-[var(--color-fg-subtle)]/40" />
              <p className="text-sm font-medium text-[var(--color-fg-muted)]">Canvas is empty</p>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">Click node icons on the left to add them</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Node inspector panel ───────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedNode && selectedNodeData && (
          <motion.aside
            key="inspector"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className="shrink-0 overflow-hidden border-l border-[var(--color-line-default)] bg-[var(--color-surface-1)]"
          >
            <div className="flex h-full w-70 flex-col" style={{ width: 280 }}>
              <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Cpu size={13} className="text-[var(--color-accent-default)]" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Node Inspector</span>
                </div>
                <button onClick={() => setSelectedNode(null)}
                  className="rounded-md p-1 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-default)]">
                  <X size={12} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Node ID */}
                <div>
                  <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Node ID</label>
                  <p className="mt-1 font-mono text-[11px] text-[var(--color-fg-muted)]">{selectedNodeData.id}</p>
                </div>

                {/* Label */}
                <div>
                  <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Label</label>
                  <input
                    value={String(selectedNodeData.data.label)}
                    onChange={(e) => {
                      const next = e.target.value;
                      setNodes((ns) => ns.map((n) => n.id === selectedNode ? { ...n, data: { ...n.data, label: next } } : n));
                    }}
                    className="mt-1.5 w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Type</label>
                  <div className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-[rgba(91,140,255,0.3)] bg-[rgba(91,140,255,0.08)] px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#5b8cff]" />
                    <span className="font-mono text-[11px] text-[#5b8cff]">{String(selectedNodeData.data.nodeType)}</span>
                  </div>
                </div>

                {isApiNodeType(String(selectedNodeData.data.nodeType)) && (
                  <ApiConfigEditor
                    nodeType={String(selectedNodeData.data.nodeType)}
                    config={nodeConfig(selectedNodeData.data.config)}
                    onChange={updateSelectedNodeConfig}
                  />
                )}

                {/* Status if present */}
                {selectedNodeData.data.status && (() => {
                  const sc: Record<string, string> = { success:'#45c08a', running:'#5b8cff', failed:'#f06262', queued:'#f0b558' };
                  const c = sc[selectedNodeData.data.status as string] ?? '#8b8c97';
                  return (
                    <div>
                      <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Status</label>
                      <p className="mt-1 font-mono text-[12px] font-semibold" style={{ color: c }}>{String(selectedNodeData.data.status).toUpperCase()}</p>
                    </div>
                  );
                })()}

                {/* Duration if present */}
                {selectedNodeData.data.duration != null && (
                  <div>
                    <label className="text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">Duration</label>
                    <p className="mt-1 font-mono text-[11px] text-[var(--color-fg-muted)]">{selectedNodeData.data.duration} ms</p>
                  </div>
                )}

                {/* Delete node */}
                <div className="border-t border-[var(--color-line-subtle)] pt-3">
                  <Button variant="danger" size="sm" className="w-full justify-center"
                    onClick={() => { setNodes((ns) => ns.filter((n) => n.id !== selectedNode)); setEdges((es) => es.filter((e) => e.source !== selectedNode && e.target !== selectedNode)); setSelectedNode(null); }}>
                    <Trash2Icon size={11} /> Remove node
                  </Button>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function Trash2Icon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
