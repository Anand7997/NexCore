import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  Clock,
  ClipboardList,
  Gauge,
  Layers,
  ListChecks,
  Play,
  Radio,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { buildApiUrl } from '@/config/api';
import { formatExecutionDate } from '@/lib/utils';
import { StatusPulse } from '@/components/backend/StatusPulse';
import { GlassPanel } from '@/components/backend/GlassPanel';
import { MetricTile } from '@/components/backend/MetricTile';
import { EmptyState } from '@/components/backend/EmptyState';

export type BackendBlockId = 'health' | 'ai' | 'intent' | 'orchestration' | 'runtime' | 'test-management';

export interface BackendBlockDefinition {
  id: BackendBlockId;
  title: string;
  description: string;
  icon: LucideIcon;
  glow: string;
  endpoints: string[];
}

interface BackendControlPlaneProps {
  blockId: BackendBlockId;
}

type ControlPlaneState = {
  health: any | null;
  ai: any[];
  intent: any | null;
  orchestration: any[];
  runtime: { agents: any[]; queue: any[] };
  testManagement: { projects: any[]; executions: any[] };
};

export const backendBlocks: BackendBlockDefinition[] = [
  {
    id: 'health',
    title: 'Health & Readiness',
    description: 'Live health, dependency readiness, and enterprise readiness signals.',
    icon: Activity,
    glow: '#34d399',
    endpoints: ['/api/health/live', '/api/health', '/api/health/ready', '/api/enterprise/readiness'],
  },
  {
    id: 'ai',
    title: 'AI Gateway',
    description: 'AI job queue visibility and worker result ingestion from the .NET backend.',
    icon: Sparkles,
    glow: '#a78bfa',
    endpoints: ['/api/ai/jobs', '/api/ai/results'],
  },
  {
    id: 'intent',
    title: 'Intent Control Plane',
    description: 'Intent catalog, capability matrix, parity summary, and runtime validation.',
    icon: ClipboardList,
    glow: '#60a5fa',
    endpoints: ['/api/intent/catalog', '/api/intent/capability-matrix', '/api/intent/parity-report/summary', '/api/intent/runtime/validate'],
  },
  {
    id: 'orchestration',
    title: 'Execution Orchestration',
    description: 'Execution lifecycle, progress tracking, and orchestration status.',
    icon: Play,
    glow: '#fbbf24',
    endpoints: ['/api/orchestration/executions', '/api/orchestration/executions/{id}/status'],
  },
  {
    id: 'runtime',
    title: 'Runtime Fleet',
    description: 'Registered agents, lease state, and runtime queue inventory.',
    icon: Bot,
    glow: '#22d3ee',
    endpoints: ['/api/runtime/agents', '/api/runtime/queue'],
  },
  {
    id: 'test-management',
    title: 'Test Management',
    description: 'Modern project and execution records from the current backend contract.',
    icon: ServerCog,
    glow: '#fb7185',
    endpoints: ['/api/test-management/projects', '/api/test-management/executions'],
  },
];

const emptyState: ControlPlaneState = {
  health: null,
  ai: [],
  intent: null,
  orchestration: [],
  runtime: { agents: [], queue: [] },
  testManagement: { projects: [], executions: [] },
};

const fetchJson = async (endpoint: string) => {
  const response = await fetch(buildApiUrl(endpoint), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
};

const StatusCell = ({ status }: { status: string }) => <StatusPulse status={status} label={status} size="sm" />;

const getPrimarySignal = (blockId: BackendBlockId, data: ControlPlaneState): string => {
  if (blockId === 'health') return data.health?.live?.status ?? 'unavailable';

  if (blockId === 'ai') {
    const active = data.ai.some((job) => job.status === 'queued' || job.status === 'running');
    return active ? 'running' : 'success';
  }

  if (blockId === 'intent') {
    const platforms = Object.values(data.intent?.validation?.platforms ?? {});
    const allReady = platforms.length > 0 && platforms.every((platform: any) => platform.ready);
    return allReady ? 'success' : 'degraded';
  }

  if (blockId === 'orchestration') {
    const running = data.orchestration.some((item) => item.status === 'running');
    return running ? 'running' : 'success';
  }

  if (blockId === 'runtime') {
    const unhealthy = data.runtime.agents.some((agent) => agent.status === 'error' || agent.status === 'offline');
    return unhealthy ? 'error' : 'success';
  }

  return data.testManagement.executions.length > 0 ? 'success' : 'skipped';
};

const BackendControlPlane: React.FC<BackendControlPlaneProps> = ({ blockId }) => {
  const [data, setData] = useState<ControlPlaneState>(emptyState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const block = backendBlocks.find((item) => item.id === blockId) ?? backendBlocks[0];
  const BlockIcon = block.icon;

  const load = async () => {
    setRefreshing(true);
    setError(null);

    try {
      if (blockId === 'health') {
        const [live, health, ready, enterprise] = await Promise.all([
          fetchJson('/api/health/live'),
          fetchJson('/api/health'),
          fetchJson('/api/health/ready'),
          fetchJson('/api/enterprise/readiness'),
        ]);
        setData({ ...emptyState, health: { live, health, ready, enterprise } });
      } else if (blockId === 'ai') {
        setData({ ...emptyState, ai: await fetchJson('/api/ai/jobs') });
      } else if (blockId === 'intent') {
        const [catalog, capabilityMatrix, paritySummary, validation] = await Promise.all([
          fetchJson('/api/intent/catalog'),
          fetchJson('/api/intent/capability-matrix'),
          fetchJson('/api/intent/parity-report/summary'),
          fetchJson('/api/intent/runtime/validate'),
        ]);
        setData({ ...emptyState, intent: { catalog, capabilityMatrix, paritySummary, validation } });
      } else if (blockId === 'orchestration') {
        setData({ ...emptyState, orchestration: await fetchJson('/api/orchestration/executions') });
      } else if (blockId === 'runtime') {
        const [agents, queue] = await Promise.all([
          fetchJson('/api/runtime/agents'),
          fetchJson('/api/runtime/queue'),
        ]);
        setData({ ...emptyState, runtime: { agents, queue } });
      } else {
        const [projects, executions] = await Promise.all([
          fetchJson('/api/test-management/projects'),
          fetchJson('/api/test-management/executions'),
        ]);
        setData({ ...emptyState, testManagement: { projects, executions } });
      }

      setUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      setData(emptyState);
      setError(loadError instanceof Error ? loadError.message : 'Request failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
  }, [blockId]);

  const renderTable = (headers: string[], rows: Array<Array<React.ReactNode>>, empty: string) =>
    rows.length === 0 ? (
      <EmptyState message={empty} />
    ) : (
      <div className="cp-surface rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--cp-border)' }}>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--cp-fg-subtle)' }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b transition-colors hover:bg-white/[0.03]" style={{ borderColor: 'var(--cp-border)' }}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    className={`px-4 py-3 ${cellIndex === 0 ? 'cp-mono font-medium' : ''}`}
                    style={{ color: 'var(--cp-fg)' }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const renderMetrics = (): Array<{ label: string; value: string; icon: LucideIcon }> => {
    if (blockId === 'health') {
      return [
        { label: 'Live', value: data.health?.live?.status ?? 'unavailable', icon: Radio },
        { label: 'Dependencies', value: String(Object.keys(data.health?.health?.details ?? {}).length), icon: Layers },
        { label: 'Enterprise', value: String(Object.keys(data.health?.enterprise ?? {}).length), icon: ShieldCheck },
      ];
    }

    if (blockId === 'ai') {
      return [
        { label: 'Jobs', value: String(data.ai.length), icon: ListChecks },
        { label: 'Active', value: String(data.ai.filter((job) => job.status === 'queued' || job.status === 'running').length), icon: Clock },
        { label: 'Latest', value: data.ai[0]?.status ?? 'empty', icon: AlertCircle },
      ];
    }

    if (blockId === 'intent') {
      return [
        { label: 'Intents', value: String(data.intent?.paritySummary?.totalIntents ?? 0), icon: ListChecks },
        { label: 'Platforms', value: String(data.intent?.paritySummary?.supportedPlatforms ?? 0), icon: Layers },
        { label: 'Coverage', value: `${data.intent?.paritySummary?.coveragePercent ?? 0}%`, icon: Gauge },
      ];
    }

    if (blockId === 'orchestration') {
      return [
        { label: 'Executions', value: String(data.orchestration.length), icon: ListChecks },
        { label: 'Running', value: String(data.orchestration.filter((item) => item.status === 'running').length), icon: Clock },
        { label: 'Latest', value: data.orchestration[0]?.status ?? 'empty', icon: AlertCircle },
      ];
    }

    if (blockId === 'runtime') {
      return [
        { label: 'Agents', value: String(data.runtime.agents.length), icon: Bot },
        { label: 'Online', value: String(data.runtime.agents.filter((agent) => agent.status === 'online').length), icon: Radio },
        { label: 'Queue', value: String(data.runtime.queue.length), icon: ListChecks },
      ];
    }

    return [
      { label: 'Projects', value: String(data.testManagement.projects.length), icon: Layers },
      { label: 'Executions', value: String(data.testManagement.executions.length), icon: ListChecks },
      { label: 'Latest', value: data.testManagement.executions[0]?.status ?? 'empty', icon: AlertCircle },
    ];
  };

  const renderContent = () => {
    if (blockId === 'health') {
      if (!data.health) return <EmptyState message="Health data is not available." />;
      const dependencyKeys = Array.from(
        new Set([...Object.keys(data.health.health.details ?? {}), ...Object.keys(data.health.ready.details ?? {})]),
      );
      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <StatusPulse status={data.health.live.status} label={`Live: ${data.health.live.status}`} />
            <StatusPulse status={data.health.health.status} label={`Health: ${data.health.health.status}`} />
            <StatusPulse status={data.health.ready.status} label={`Ready: ${data.health.ready.status}`} />
            <span className="cp-mono text-xs" style={{ color: 'var(--cp-fg-subtle)' }}>
              Signal: {formatExecutionDate(data.health.ready.timestamp)}
            </span>
          </div>
          {renderTable(
            ['Capability', 'Status'],
            Object.entries(data.health.enterprise ?? {}).map(([key, value]) => [key, String(value)]),
            'No enterprise readiness signals available.',
          )}
          {renderTable(
            ['Dependency', 'Health', 'Ready'],
            dependencyKeys.map((key) => [
              key,
              <StatusCell key="h" status={String(data.health.health.details?.[key] ?? 'n/a')} />,
              <StatusCell key="r" status={String(data.health.ready.details?.[key] ?? 'n/a')} />,
            ]),
            'No dependency checks available.',
          )}
        </div>
      );
    }

    if (blockId === 'ai') {
      return renderTable(
        ['Job', 'Type', 'Status', 'Updated'],
        data.ai.map((job) => [job.id, job.type, <StatusCell key="s" status={job.status} />, formatExecutionDate(job.updatedAt)]),
        'No AI jobs are stored yet.',
      );
    }

    if (blockId === 'intent') {
      const platforms = Object.values(data.intent?.validation?.platforms ?? {});
      return (
        <div className="space-y-6">
          {renderTable(
            ['Intent', 'Schema', 'Platforms'],
            (data.intent?.catalog?.intents ?? []).map((intent: any) => [intent.name, intent.schemaVersion, intent.platforms.join(', ')]),
            'No intents returned by the backend.',
          )}
          {renderTable(
            ['Platform', 'Ready', 'Missing Capabilities'],
            platforms.map((platform: any) => [
              platform.platform,
              <StatusCell key="s" status={platform.ready ? 'ready' : 'blocked'} />,
              platform.missingCapabilities?.length ? platform.missingCapabilities.join(', ') : 'none',
            ]),
            'No runtime validation results available.',
          )}
        </div>
      );
    }

    if (blockId === 'orchestration') {
      return renderTable(
        ['Execution', 'Platform', 'Status', 'Progress', 'Updated'],
        data.orchestration.map((item) => [
          item.id,
          item.platform ?? 'n/a',
          <StatusCell key="s" status={item.status} />,
          `${item.progress}%`,
          formatExecutionDate(item.updatedAt),
        ]),
        'No orchestration executions have been started yet.',
      );
    }

    if (blockId === 'runtime') {
      return (
        <div className="space-y-6">
          {renderTable(
            ['Agent', 'Platforms', 'Status', 'Lease'],
            data.runtime.agents.map((agent) => [
              agent.name,
              agent.platforms.join(', '),
              <StatusCell key="s" status={agent.status} />,
              formatExecutionDate(agent.leaseExpiresAt),
            ]),
            'No runtime agents are currently registered.',
          )}
          {renderTable(
            ['Queue Item', 'Platform', 'Status', 'Capabilities'],
            data.runtime.queue.map((item) => [
              item.id,
              item.platform,
              <StatusCell key="s" status={item.status} />,
              item.requiredCapabilities?.join(', ') || 'none',
            ]),
            'The runtime queue is currently empty.',
          )}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {renderTable(
          ['Project', 'Description', 'Updated'],
          data.testManagement.projects.map((project) => [project.name, project.description ?? 'n/a', formatExecutionDate(project.updatedAt)]),
          'No test-management projects are stored yet.',
        )}
        {renderTable(
          ['Execution', 'Status', 'Project', 'Updated'],
          data.testManagement.executions.map((execution) => [
            execution.id,
            <StatusCell key="s" status={execution.status} />,
            execution.projectId ?? 'n/a',
            formatExecutionDate(execution.updatedAt),
          ]),
          'No test-management executions have been started yet.',
        )}
      </div>
    );
  };

  const primarySignal = getPrimarySignal(blockId, data);

  return (
    <div className="space-y-6">
      <GlassPanel glow={block.glow} className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
              style={{ backgroundColor: `${block.glow}1f` }}
            >
              <BlockIcon size={22} style={{ color: block.glow }} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--cp-fg)' }}>
                  {block.title}
                </h1>
                <StatusPulse status={primarySignal} label={primarySignal} />
              </div>
              <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--cp-fg-muted)' }}>
                {block.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="cp-mono text-right text-xs" style={{ color: 'var(--cp-fg-subtle)' }}>
              <div>API BASE</div>
              <div className="font-medium" style={{ color: 'var(--cp-fg)' }}>
                {buildApiUrl('')}
              </div>
            </div>
            <button
              onClick={() => void load()}
              className="cp-glass flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-white/[0.04]"
              style={{ color: 'var(--cp-fg)' }}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs cp-mono" style={{ color: 'var(--cp-fg-subtle)' }}>
          <span>{loading ? 'LOADING…' : 'LIVE'}</span>
          <span>·</span>
          <span>Last updated: {updatedAt ? formatExecutionDate(updatedAt) : 'not yet loaded'}</span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          {renderMetrics().map((metric, index) => (
            <MetricTile key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} glow={block.glow} delay={0.05 * index} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {block.endpoints.map((endpoint) => (
            <span key={endpoint} className="cp-mono cp-surface rounded-md px-2 py-1 text-[11px]" style={{ color: 'var(--cp-fg-subtle)' }}>
              {endpoint}
            </span>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel glow={block.glow} delay={0.1} className="p-6">
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--cp-fg)' }}>
          {block.title} Data
        </h2>
        {error ? (
          <div className="cp-surface rounded-lg border p-4 text-sm" style={{ borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>
            This dashboard could not be loaded from the backend: {error}
          </div>
        ) : (
          renderContent()
        )}
      </GlassPanel>
    </div>
  );
};

export default BackendControlPlane;
