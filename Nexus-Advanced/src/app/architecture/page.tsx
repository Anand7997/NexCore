'use client';

import { useCallback, useMemo, memo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Handle,
  Position,
  type Connection,
  type Edge,
  type NodeProps,
  MarkerType,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Calendar,
  CreditCard,
  FileText,
  Zap,
  Database,
  Bell,
  CheckCircle,
  Brain,
  Sparkles,
  Plus,
  Layout,
  Download,
  X,
  ChevronRight,
  ExternalLink,
  Layers,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ── Types ────────────────────────────────────────────────────────────────────

type ModuleColor = 'blue' | 'violet' | 'green' | 'amber' | 'cyan' | 'orange' | 'pink' | 'emerald';
type ModuleStatus = 'active' | 'running' | 'idle';

interface ModuleNodeData extends Record<string, unknown> {
  label: string;
  icon: string;
  color: ModuleColor;
  status: ModuleStatus;
  testCount: number;
}

type ModuleNode = Node<ModuleNodeData, 'moduleNode'>;

// ── Color config ─────────────────────────────────────────────────────────────

const COLOR_MAP: Record<ModuleColor, {
  border: string;
  icon: string;
  iconBg: string;
  glow: string;
  dot: string;
  statusText: string;
  ring: string;
}> = {
  blue:    { border: 'border-blue-500/40',    icon: 'text-blue-400',    iconBg: 'bg-blue-500/15',    glow: 'rgba(59,130,246,0.25)',   dot: 'bg-blue-400',    statusText: 'text-blue-400',    ring: 'ring-blue-500/50'    },
  violet:  { border: 'border-violet-500/40',  icon: 'text-violet-400',  iconBg: 'bg-violet-500/15',  glow: 'rgba(139,92,246,0.25)',   dot: 'bg-violet-400',  statusText: 'text-violet-400',  ring: 'ring-violet-500/50'  },
  green:   { border: 'border-emerald-500/40', icon: 'text-emerald-400', iconBg: 'bg-emerald-500/15', glow: 'rgba(16,185,129,0.25)',   dot: 'bg-emerald-400', statusText: 'text-emerald-400', ring: 'ring-emerald-500/50' },
  amber:   { border: 'border-amber-500/40',   icon: 'text-amber-400',   iconBg: 'bg-amber-500/15',   glow: 'rgba(245,158,11,0.25)',   dot: 'bg-amber-400',   statusText: 'text-amber-400',   ring: 'ring-amber-500/50'   },
  cyan:    { border: 'border-cyan-500/40',    icon: 'text-cyan-400',    iconBg: 'bg-cyan-500/15',    glow: 'rgba(6,182,212,0.25)',    dot: 'bg-cyan-400',    statusText: 'text-cyan-400',    ring: 'ring-cyan-500/50'    },
  orange:  { border: 'border-orange-500/40',  icon: 'text-orange-400',  iconBg: 'bg-orange-500/15',  glow: 'rgba(249,115,22,0.25)',   dot: 'bg-orange-400',  statusText: 'text-orange-400',  ring: 'ring-orange-500/50'  },
  pink:    { border: 'border-pink-500/40',    icon: 'text-pink-400',    iconBg: 'bg-pink-500/15',    glow: 'rgba(236,72,153,0.25)',   dot: 'bg-pink-400',    statusText: 'text-pink-400',    ring: 'ring-pink-500/50'    },
  emerald: { border: 'border-teal-500/40',    icon: 'text-teal-400',    iconBg: 'bg-teal-500/15',    glow: 'rgba(20,184,166,0.25)',   dot: 'bg-teal-400',    statusText: 'text-teal-400',    ring: 'ring-teal-500/50'    },
};

const STATUS_LABEL: Record<ModuleStatus, string> = {
  active:  'Active',
  running: 'Running',
  idle:    'Idle',
};

// ── Icon resolver ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Shield, Calendar, CreditCard, FileText, Zap, Database, Bell, CheckCircle,
};

function resolveIcon(name: string): React.ElementType {
  return ICON_MAP[name] ?? Layers;
}

// ── Initial data ─────────────────────────────────────────────────────────────

const initialNodes: ModuleNode[] = [
  { id: '1', type: 'moduleNode', position: { x: 100, y: 150 }, data: { label: 'Authentication',      icon: 'Shield',      color: 'blue',    status: 'active',  testCount: 12 } },
  { id: '2', type: 'moduleNode', position: { x: 350, y: 80  }, data: { label: 'Booking Engine',      icon: 'Calendar',    color: 'violet',  status: 'active',  testCount: 28 } },
  { id: '3', type: 'moduleNode', position: { x: 350, y: 220 }, data: { label: 'API Gateway',         icon: 'Zap',         color: 'cyan',    status: 'running', testCount: 45 } },
  { id: '4', type: 'moduleNode', position: { x: 600, y: 80  }, data: { label: 'Payment Processing',  icon: 'CreditCard',  color: 'green',   status: 'active',  testCount: 19 } },
  { id: '5', type: 'moduleNode', position: { x: 600, y: 220 }, data: { label: 'Invoice Generation',  icon: 'FileText',    color: 'amber',   status: 'idle',    testCount: 8  } },
  { id: '6', type: 'moduleNode', position: { x: 850, y: 150 }, data: { label: 'Validation Layer',    icon: 'CheckCircle', color: 'emerald', status: 'active',  testCount: 34 } },
];

const initialEdges: Edge[] = [
  { id: 'e1-3', source: '1', target: '3', animated: true },
  { id: 'e3-2', source: '3', target: '2', animated: true },
  { id: 'e2-4', source: '2', target: '4', animated: false },
  { id: 'e4-5', source: '4', target: '5', animated: false },
  { id: 'e5-6', source: '5', target: '6', animated: true },
  { id: 'e3-6', source: '3', target: '6', animated: false },
];

// ── Palette definitions ───────────────────────────────────────────────────────

const PALETTE_ITEMS: Array<{ icon: string; label: string; color: ModuleColor; hint: string }> = [
  { icon: 'Shield',      label: 'Auth Module',          color: 'blue',    hint: 'JWT / OAuth / session handling' },
  { icon: 'Calendar',    label: 'Booking Module',        color: 'violet',  hint: 'Reservation & scheduling flows' },
  { icon: 'CreditCard',  label: 'Payment Module',        color: 'green',   hint: 'Stripe / gateway integration'  },
  { icon: 'FileText',    label: 'Invoice Module',        color: 'amber',   hint: 'PDF generation & tax handling'  },
  { icon: 'Zap',         label: 'API Gateway',           color: 'cyan',    hint: 'Route & proxy layer'            },
  { icon: 'Database',    label: 'Database Layer',        color: 'orange',  hint: 'Persistence & migration logic'  },
  { icon: 'Bell',        label: 'Notification Service',  color: 'pink',    hint: 'Email / SMS / push triggers'    },
  { icon: 'CheckCircle', label: 'Validation Engine',     color: 'emerald', hint: 'Schema & business rule checks'  },
];

// ── AI suggestions ────────────────────────────────────────────────────────────

interface AISuggestion {
  id: string;
  text: string;
  action: string;
  icon: string;
  color: ModuleColor;
  priority: 'high' | 'medium' | 'low';
}

const AI_SUGGESTIONS: AISuggestion[] = [
  {
    id: 'sug1',
    text: 'Add Notification Service — payments flow lacks confirmation messaging',
    action: 'Add Notification',
    icon: 'Bell',
    color: 'pink',
    priority: 'high',
  },
  {
    id: 'sug2',
    text: 'Database Layer missing — invoice persistence is unvalidated',
    action: 'Add Database Layer',
    icon: 'Database',
    color: 'orange',
    priority: 'high',
  },
  {
    id: 'sug3',
    text: 'Consider an API Monitor node between Gateway and Payment for latency checks',
    action: 'Add API Monitor',
    icon: 'Zap',
    color: 'cyan',
    priority: 'medium',
  },
  {
    id: 'sug4',
    text: 'Auth Module lacks a rate-limiter — add Validation Engine upstream',
    action: 'Add Rate Limiter',
    icon: 'CheckCircle',
    color: 'emerald',
    priority: 'low',
  },
];

const PRIORITY_STYLE: Record<AISuggestion['priority'], string> = {
  high:   'text-red-400 bg-red-500/10 border-red-500/25',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  low:    'text-slate-400 bg-slate-500/10 border-slate-500/20',
};

// ── Custom Node ───────────────────────────────────────────────────────────────

const ModuleNodeComponent = memo(function ModuleNodeComponent({
  data,
  selected,
}: NodeProps & { data: ModuleNodeData }) {
  const cfg = COLOR_MAP[data.color];
  const Icon = resolveIcon(data.icon);

  return (
    <div
      className={cn(
        'relative w-[180px] rounded-xl border transition-all duration-200',
        'bg-[var(--color-surface-1)] backdrop-blur-md',
        cfg.border,
        selected && `ring-2 ${cfg.ring} shadow-[var(--shadow-pop)]`,
      )}
      style={{
        boxShadow: selected
          ? undefined
          : `0 0 14px ${cfg.glow}, var(--shadow-card)`,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border-2 !border-[var(--color-line-strong)] !bg-[var(--color-surface-1)]"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', cfg.iconBg)}>
          <Icon size={13} className={cfg.icon} />
        </div>
        <span className="truncate text-[11px] font-semibold leading-tight text-[var(--color-fg-default)]">
          {data.label}
        </span>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-[var(--color-line-subtle)]" />

      {/* Status row */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            cfg.dot,
            data.status === 'running' && 'animate-pulse',
          )}
        />
        <span className={cn('text-[10px] font-mono', cfg.statusText)}>
          {STATUS_LABEL[data.status]}
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 pb-2.5">
        <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">
          {data.testCount} tests
        </span>
        <button className="flex items-center gap-0.5 font-mono text-[10px] text-[var(--color-accent-default)] transition-opacity hover:opacity-70">
          Edit
          <ExternalLink size={9} />
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border-2 !border-[var(--color-line-strong)] !bg-[var(--color-surface-1)]"
      />
    </div>
  );
});

const nodeTypes = { moduleNode: ModuleNodeComponent };

// ── Edge style ────────────────────────────────────────────────────────────────

const EDGE_STYLE_DEFAULT: React.CSSProperties = {
  stroke: 'rgba(255,255,255,0.12)',
  strokeWidth: 1.5,
  strokeDasharray: '5 4',
};

const EDGE_STYLE_ANIMATED: React.CSSProperties = {
  stroke: 'url(#archEdgeGradient)',
  strokeWidth: 1.5,
};

let nodeCounter = 100;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<ModuleNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialEdges.map((e) => ({
      ...e,
      style: e.animated ? EDGE_STYLE_ANIMATED : EDGE_STYLE_DEFAULT,
      markerEnd: { type: MarkerType.ArrowClosed, color: e.animated ? '#8b79ff' : 'rgba(255,255,255,0.2)' },
    })),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<'ai' | 'node'>('ai');
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: EDGE_STYLE_ANIMATED,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#8b79ff' },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const addModuleToCanvas = useCallback(
    (item: (typeof PALETTE_ITEMS)[number]) => {
      const id = `palette-${++nodeCounter}`;
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: 'moduleNode',
          position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 300 },
          data: {
            label: item.label,
            icon: item.icon,
            color: item.color,
            status: 'idle' as ModuleStatus,
            testCount: 0,
          },
        },
      ]);
    },
    [setEdges, setNodes],
  );

  const addFromSuggestion = useCallback(
    (sug: AISuggestion) => {
      const id = `sug-${++nodeCounter}`;
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: 'moduleNode',
          position: { x: 200 + Math.random() * 500, y: 100 + Math.random() * 280 },
          data: {
            label: sug.action,
            icon: sug.icon,
            color: sug.color,
            status: 'idle' as ModuleStatus,
            testCount: 0,
          },
        },
      ]);
      setDismissedSuggestions((prev) => new Set([...prev, sug.id]));
    },
    [setNodes],
  );

  const autoLayout = useCallback(() => {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    setNodes((nds) =>
      nds.map((n, i) => ({
        ...n,
        position: {
          x: 80 + (i % cols) * 240,
          y: 80 + Math.floor(i / cols) * 180,
        },
      })),
    );
  }, [nodes.length, setNodes]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: ModuleNode) => {
      setSelectedNodeId(node.id);
      setRightPanelMode('node');
    },
    [],
  );

  const handleNodeLabelChange = useCallback(
    (value: string) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? { ...n, data: { ...n.data, label: value } } : n,
        ),
      );
    },
    [selectedNodeId, setNodes],
  );

  const activeSuggestions = AI_SUGGESTIONS.filter((s) => !dismissedSuggestions.has(s.id));

  return (
    <div className="flex h-full flex-col">
      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
              Project /
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-accent-default)]">
              Architecture Builder
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={autoLayout}>
            <Layout size={11} />
            Auto-Layout
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightPanelMode('ai')}
            className={rightPanelMode === 'ai' ? 'text-[var(--color-accent-default)]' : ''}
          >
            <Sparkles size={11} />
            AI Suggest
          </Button>
          <Button variant="ghost" size="sm">
            <Download size={11} />
            Export
          </Button>
          <Button
            variant="neon"
            size="sm"
            onClick={() => addModuleToCanvas(PALETTE_ITEMS[0])}
          >
            <Plus size={11} />
            Add Module
          </Button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* ── Left Palette ──────────────────────────────────────────────────── */}
        <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          <div className="flex h-9 items-center border-b border-[var(--color-line-subtle)] px-4">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
              Module Palette
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {PALETTE_ITEMS.map((item) => {
              const cfg = COLOR_MAP[item.color];
              const Icon = resolveIcon(item.icon);
              return (
                <button
                  key={item.label}
                  onClick={() => addModuleToCanvas(item)}
                  className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-all hover:border-[var(--color-line-default)] hover:bg-[var(--color-surface-2)]"
                >
                  <GripVertical size={10} className="shrink-0 text-[var(--color-fg-subtle)] opacity-40 group-hover:opacity-70" />
                  <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', cfg.iconBg)}>
                    <Icon size={11} className={cfg.icon} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-[var(--color-fg-default)]">
                      {item.label}
                    </p>
                    <p className="truncate text-[9px] text-[var(--color-fg-subtle)]">
                      {item.hint}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Stats footer */}
          <div className="border-t border-[var(--color-line-subtle)] px-4 py-3">
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--color-fg-subtle)]">
              <span>{nodes.length} modules</span>
              <span>{edges.length} connections</span>
            </div>
          </div>
        </aside>

        {/* ── Canvas ────────────────────────────────────────────────────────── */}
        <div className="relative min-w-0 flex-1">
          {/* SVG defs for gradient edges */}
          <svg className="absolute inset-0 h-0 w-0 overflow-hidden">
            <defs>
              <linearGradient id="archEdgeGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8b79ff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#4dd1e1" stopOpacity="0.6" />
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
            onNodeClick={handleNodeClick as never}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setRightPanelMode('ai');
            }}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            deleteKeyCode="Delete"
            proOptions={{ hideAttribution: true }}
            style={{ background: 'transparent' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(139,121,255,0.05)"
            />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const d = n.data as ModuleNodeData;
                return COLOR_MAP[d.color]?.glow ?? '#8b79ff';
              }}
              maskColor="var(--color-surface-overlay)"
            />
          </ReactFlow>

          {/* Canvas label */}
          <div className="pointer-events-none absolute left-4 top-4 z-10">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
              Execution Architecture Canvas
            </span>
          </div>
        </div>

        {/* ── Right Panel ──────────────────────────────────────────────────── */}
        <aside className="flex w-64 shrink-0 flex-col border-l border-[var(--color-line-default)] bg-[var(--color-surface-1)]">
          {/* Panel header */}
          <div className="flex h-9 items-center justify-between border-b border-[var(--color-line-subtle)] px-4">
            <div className="flex items-center gap-1.5">
              {rightPanelMode === 'ai' ? (
                <>
                  <Brain size={12} className="text-[var(--color-accent-default)]" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                    AI Architecture
                  </span>
                </>
              ) : (
                <>
                  <ChevronRight size={12} className="text-[var(--color-accent-default)]" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                    Module Inspector
                  </span>
                </>
              )}
            </div>
            {rightPanelMode === 'node' && (
              <button
                onClick={() => setRightPanelMode('ai')}
                className="text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg-default)]"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Panel body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {rightPanelMode === 'ai' ? (
                <motion.div
                  key="ai-panel"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.18 }}
                  className="p-3 space-y-2"
                >
                  {/* AI intro */}
                  <div className="rounded-lg border border-[var(--color-line-subtle)] bg-[var(--color-accent-soft)] p-3">
                    <p className="text-[10px] leading-relaxed text-[var(--color-fg-muted)]">
                      AI has analysed your current architecture and found{' '}
                      <span className="font-semibold text-[var(--color-accent-default)]">
                        {activeSuggestions.length} suggestions
                      </span>{' '}
                      to improve coverage.
                    </p>
                  </div>

                  {activeSuggestions.length === 0 ? (
                    <div className="rounded-lg border border-[var(--color-line-subtle)] p-3 text-center">
                      <Sparkles size={16} className="mx-auto mb-1 text-[var(--color-accent-default)]" />
                      <p className="text-[10px] text-[var(--color-fg-subtle)]">
                        All suggestions applied. Architecture looks complete.
                      </p>
                    </div>
                  ) : (
                    activeSuggestions.map((sug) => {
                      const Icon = resolveIcon(sug.icon);
                      const cfg = COLOR_MAP[sug.color];
                      return (
                        <motion.div
                          key={sug.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] p-2.5 transition-colors hover:border-[var(--color-line-strong)]"
                        >
                          <div className="flex items-start gap-2">
                            <div className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md', cfg.iconBg)}>
                              <Icon size={10} className={cfg.icon} />
                            </div>
                            <p className="flex-1 text-[10px] leading-relaxed text-[var(--color-fg-muted)]">
                              {sug.text}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[9px]', PRIORITY_STYLE[sug.priority])}>
                              {sug.priority}
                            </span>
                            <button
                              onClick={() => addFromSuggestion(sug)}
                              className="ml-auto flex items-center gap-1 rounded-md border border-[var(--color-line-default)] bg-[var(--color-surface-3)] px-2 py-0.5 font-mono text-[9px] text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-accent-default)] hover:text-[var(--color-accent-default)]"
                            >
                              <Plus size={8} />
                              Add
                            </button>
                            <button
                              onClick={() => setDismissedSuggestions((prev) => new Set([...prev, sug.id]))}
                              className="text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg-muted)]"
                              title="Dismiss"
                            >
                              <X size={9} />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="node-panel"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.18 }}
                  className="p-3 space-y-4"
                >
                  {selectedNode ? (
                    <>
                      {/* Node preview */}
                      {(() => {
                        const cfg = COLOR_MAP[selectedNode.data.color];
                        const Icon = resolveIcon(selectedNode.data.icon);
                        return (
                          <div
                            className={cn(
                              'rounded-xl border p-3',
                              cfg.border,
                              'bg-[var(--color-surface-2)]',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', cfg.iconBg)}>
                                <Icon size={14} className={cfg.icon} />
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-[var(--color-fg-default)]">
                                  {selectedNode.data.label}
                                </p>
                                <p className={cn('font-mono text-[10px]', cfg.statusText)}>
                                  {STATUS_LABEL[selectedNode.data.status]}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Editable label */}
                      <div>
                        <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                          Module Name
                        </label>
                        <input
                          value={selectedNode.data.label}
                          onChange={(e) => handleNodeLabelChange(e.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-3 py-2 text-xs text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]"
                        />
                      </div>

                      {/* Test count */}
                      <div>
                        <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                          Test Coverage
                        </label>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                            <div
                              className={cn('h-full rounded-full transition-all', COLOR_MAP[selectedNode.data.color].dot)}
                              style={{ width: `${Math.min(100, (selectedNode.data.testCount / 50) * 100)}%` }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono text-[10px] text-[var(--color-fg-muted)]">
                            {selectedNode.data.testCount} tests
                          </span>
                        </div>
                      </div>

                      {/* Connection info */}
                      <div>
                        <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                          Connections
                        </label>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          {[
                            {
                              label: 'Incoming',
                              count: edges.filter((e) => e.target === selectedNode.id).length,
                            },
                            {
                              label: 'Outgoing',
                              count: edges.filter((e) => e.source === selectedNode.id).length,
                            },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="rounded-lg border border-[var(--color-line-subtle)] bg-[var(--color-surface-2)] p-2 text-center"
                            >
                              <p className="font-mono text-base font-bold text-[var(--color-fg-default)]">
                                {item.count}
                              </p>
                              <p className="font-mono text-[9px] text-[var(--color-fg-subtle)]">
                                {item.label}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Node ID */}
                      <div>
                        <label className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
                          Node ID
                        </label>
                        <p className="mt-1 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                          {selectedNode.id}
                        </p>
                      </div>

                      <Button
                        variant="neon"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          /* navigate to intent studio for this module */
                        }}
                      >
                        <ExternalLink size={10} />
                        Open in Intent Studio
                      </Button>
                    </>
                  ) : (
                    <p className="text-center font-mono text-[10px] text-[var(--color-fg-subtle)]">
                      Click a module node to inspect it.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Auto-complete footer */}
          {rightPanelMode === 'ai' && (
            <div className="border-t border-[var(--color-line-subtle)] p-3">
              <button
                onClick={() => {
                  AI_SUGGESTIONS.forEach((sug) => addFromSuggestion(sug));
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-accent-default)]/30 bg-[var(--color-accent-soft)] px-3 py-2 font-mono text-[10px] text-[var(--color-accent-default)] transition-colors hover:bg-[var(--color-accent-soft)]/60"
              >
                <Sparkles size={11} />
                Auto-complete architecture
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
