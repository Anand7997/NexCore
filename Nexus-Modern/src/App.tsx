import React from 'react';
import { Link, Navigate, Route, BrowserRouter as Router, Routes, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  ClipboardList,
  Code2,
  Globe,
  Layers3,
  Lightbulb,
  Monitor,
  Play,
  Server,
  ServerCog,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RequirementsAnalysisDashboard from '@/components/RequirementsAnalysisDashboard';
import AutomationPlanningDashboard from '@/components/AutomationPlanningDashboard';
import AutomationDevelopmentDashboard from '@/components/AutomationDevelopmentDashboard';
import TestExecutionDashboard from '@/components/TestExecutionDashboard';
import ReportingDashboard from '@/components/ReportingDashboard';
import CicdPipelineDashboard from '@/components/CicdPipelineDashboard';
import AIWorkflowPage from '@/components/ai-workflow';
import BackendControlPlane, { backendBlocks, type BackendBlockId } from '@/components/BackendControlPlane';
import { GlassPanel } from '@/components/backend/GlassPanel';
import AdvancedExecutionDashboard from '@/components/advanced/AdvancedExecutionDashboard';
import AIInspectLabPage from '@/components/advanced/AIInspectLabPage';
import AgentsPage from '@/components/advanced/AgentsPage';
import AIInvestigationPage from '@/components/advanced/AIInvestigationPage';

type PhaseId =
  | 'requirements'
  | 'planning'
  | 'development'
  | 'execution'
  | 'reporting'
  | 'cicd'
  | 'ai-workflow';

interface AutomationBlock {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  glow: string;
}

interface DashboardBlock {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  glow: string;
  badgeText: string;
  href: string;
}


const advancedDashboardBlocks: DashboardBlock[] = [
  {
    id: 'advanced-executions',
    title: 'Execution Monitor',
    description: 'Advanced live execution results, evidence streaming, and quick-heal actions.',
    icon: Play,
    glow: '#22d3ee',
    badgeText: 'Advanced dashboard',
    href: '/executions',
  },
  {
    id: 'advanced-ai-inspect',
    title: 'AI Inspect Lab',
    description: 'Failed execution diagnosis, provider status, repair plans, and assistant guidance.',
    icon: Sparkles,
    glow: '#a78bfa',
    badgeText: 'Advanced dashboard',
    href: '/ai-analysis',
  },
  {
    id: 'advanced-agents',
    title: 'Agent Fleet',
    description: 'Runtime agents, capacity, capabilities, and heartbeat status in one grid.',
    icon: Bot,
    glow: '#22d3ee',
    badgeText: 'Advanced dashboard',
    href: '/agents',
  },
  {
    id: 'advanced-ai-investigation',
    title: 'AI Investigation',
    description: 'Live failure stream, confidence analysis, root-cause intelligence, and patch terminal.',
    icon: Brain,
    glow: '#f59e0b',
    badgeText: 'Advanced dashboard',
    href: '/ai-investigation',
  },
];
interface PhaseBlock {
  id: PhaseId;
  title: string;
  phase: string;
  description: string;
  icon: LucideIcon;
  border: string;
  hoverBorder: string;
  tile: string;
  badge: string;
  arrow: string;
}

const automations: AutomationBlock[] = [
  {
    id: 'web',
    title: 'Web Automation',
    description: 'Browser pages, UI flows, locators, test cases, and execution.',
    icon: Globe,
    glow: '#60a5fa',
  },
  {
    id: 'desktop',
    title: 'Desktop Automation',
    description: 'Native desktop workflows, modules, screens, and execution.',
    icon: Monitor,
    glow: '#94a3b8',
  },
  {
    id: 'mobile',
    title: 'Mobile Automation',
    description: 'Android and iOS pages, gestures, cases, and device runs.',
    icon: Smartphone,
    glow: '#34d399',
  },
  {
    id: 'api',
    title: 'API Automation',
    description: 'Services, endpoints, validations, payload cases, and runs.',
    icon: Server,
    glow: '#fbbf24',
  },
  {
    id: 'unified',
    title: 'Unified Automation',
    description: 'Web, Desktop, Mobile, and API workflows in one suite.',
    icon: Layers3,
    glow: '#a78bfa',
  },
];

const dashboardBlocks: DashboardBlock[] = [
  ...automations.map((automation) => ({
    id: automation.id,
    title: automation.title,
    description: automation.description,
    icon: automation.icon,
    glow: automation.glow,
    badgeText: 'Open phases',
    href: `/automation/${automation.id}`,
  })),
  ...backendBlocks.map((block) => ({
    id: block.id,
    title: block.title,
    description: block.description,
    icon: block.icon,
    glow: block.glow,
    badgeText: 'Backend dashboard',
    href: `/backend/${block.id}`,
  })),
  ...advancedDashboardBlocks,
];

const phases: PhaseBlock[] = [
  {
    id: 'requirements',
    title: 'Requirements & Feasibility Analysis',
    phase: 'Phase 1',
    description: 'Define requirements, assess feasibility, and validate automation scope',
    icon: ClipboardList,
    border: 'border-l-blue-600',
    hoverBorder: 'hover:border-blue-300',
    tile: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    arrow: 'text-blue-500',
  },
  {
    id: 'planning',
    title: 'Automation Planning',
    phase: 'Phase 2',
    description: 'Create projects, define modules, and organize test cases structure',
    icon: Lightbulb,
    border: 'border-l-emerald-600',
    hoverBorder: 'hover:border-emerald-300',
    tile: 'bg-green-500',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    arrow: 'text-green-500',
  },
  {
    id: 'development',
    title: 'Automation Development',
    phase: 'Phase 3',
    description: 'Build test steps, create automation scripts, and develop test cases',
    icon: Code2,
    border: 'border-l-violet-600',
    hoverBorder: 'hover:border-violet-300',
    tile: 'bg-purple-500',
    badge: 'bg-violet-100 text-violet-800 border-violet-200',
    arrow: 'text-purple-500',
  },
  {
    id: 'execution',
    title: 'Test Lab',
    phase: 'Phase 4',
    description: 'Execute test suites, run automation scripts, and monitor test runs',
    icon: Play,
    border: 'border-l-amber-600',
    hoverBorder: 'hover:border-amber-300',
    tile: 'bg-orange-500',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    arrow: 'text-orange-500',
  },
  {
    id: 'reporting',
    title: 'Reporting',
    phase: 'Phase 5',
    description: 'View execution results, generate reports, and analyze test outcomes',
    icon: BarChart3,
    border: 'border-l-cyan-600',
    hoverBorder: 'hover:border-cyan-300',
    tile: 'bg-cyan-600',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    arrow: 'text-cyan-600',
  },
  {
    id: 'cicd',
    title: 'CI-CD Pipeline',
    phase: 'DevOps',
    description: 'Trigger Jenkins builds and pass Git branch parameters from EC2',
    icon: ServerCog,
    border: 'border-l-teal-600',
    hoverBorder: 'hover:border-teal-300',
    tile: 'bg-teal-600',
    badge: 'bg-teal-100 text-teal-800 border-teal-200',
    arrow: 'text-teal-600',
  },
  {
    id: 'ai-workflow',
    title: 'AI Workflow',
    phase: 'AI',
    description: 'Generate scenarios, test cases, and executable steps from a BRD with AI',
    icon: Sparkles,
    border: 'border-l-violet-600',
    hoverBorder: 'hover:border-violet-300',
    tile: 'bg-violet-500',
    badge: 'bg-violet-100 text-violet-800 border-violet-200',
    arrow: 'text-violet-500',
  },
];

const Dashboard = () => (
  <main className="control-plane-scope min-h-screen p-6 md:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: 'var(--cp-fg)' }}>
          Automation Dashboard
        </h1>
        <p className="text-base md:text-lg" style={{ color: 'var(--cp-fg-muted)' }}>
          Platform automation and backend control surfaces in a single block grid
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {dashboardBlocks.map((block, index) => {
          const BlockIcon = block.icon;

          return (
            <Link className="block" key={block.id} to={block.href}>
              <GlassPanel glow={block.glow} delay={index * 0.04} className="h-full min-h-[158px] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: `${block.glow}1f` }}>
                    <BlockIcon className="h-6 w-6" style={{ color: block.glow }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--cp-fg)' }}>
                      {block.title}
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: 'var(--cp-fg-muted)' }}>
                      {block.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span
                    className="cp-mono rounded-full px-2 py-1 text-[11px]"
                    style={{ backgroundColor: `${block.glow}1a`, color: block.glow }}
                  >
                    {block.badgeText}
                  </span>
                  <ArrowRight className="h-4 w-4" style={{ color: 'var(--cp-fg-subtle)' }} />
                </div>
              </GlassPanel>
            </Link>
          );
        })}
      </div>
    </div>
  </main>
);

const BackendBlockPage = () => {
  const { backendBlockId } = useParams();
  const block = backendBlocks.find((item) => item.id === backendBlockId);

  if (!block) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="control-plane-scope min-h-screen p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
          style={{ color: 'var(--cp-fg-muted)' }}
          to="/"
        >
          <ArrowLeft className="h-4 w-4" />
          Main Dashboard
        </Link>

        <BackendControlPlane blockId={block.id as BackendBlockId} />
      </div>
    </main>
  );
};

const PhaseContent = ({ phaseId, automationId }: { phaseId: PhaseId; automationId?: string }) => {
  if (phaseId === 'ai-workflow') {
    const platform =
      automationId === 'desktop' || automationId === 'mobile' || automationId === 'api'
        ? automationId
        : 'web';
    return <AIWorkflowPage initialPlatform={platform} backHref={`/automation/${automationId ?? 'web'}`} />;
  }

  if (phaseId === 'requirements') {
    return <RequirementsAnalysisDashboard initialPage="blocks" />;
  }

  if (phaseId === 'planning') {
    return <AutomationPlanningDashboard />;
  }

  if (phaseId === 'development') {
    return <AutomationDevelopmentDashboard />;
  }

  if (phaseId === 'execution') {
    return <TestExecutionDashboard />;
  }

  if (phaseId === 'reporting') {
    return <ReportingDashboard />;
  }

  return <CicdPipelineDashboard />;
};

const AutomationPhasesPage = () => {
  const { automationId } = useParams();
  const automation = automations.find((item) => item.id === automationId);

  if (!automation) {
    return <Navigate to="/" replace />;
  }

  const AutomationIcon = automation.icon;

  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground" to="/">
          <ArrowLeft className="h-4 w-4" />
          Main Dashboard
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <AutomationIcon className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{automation.title}</h1>
            <p className="text-base text-muted-foreground md:text-lg">{automation.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {phases.map((phase) => {
            const PhaseIcon = phase.icon;

            return (
              <Link key={phase.id} to={`/automation/${automation.id}/${phase.id}`} className="block text-left">
                <Card className={`h-full rounded-xl border-l-4 ${phase.border} ${phase.hoverBorder} bg-card cursor-pointer transition-all duration-200 hover:shadow-md`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${phase.tile}`}>
                        <PhaseIcon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-foreground">{phase.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4 text-sm text-muted-foreground">{phase.description}</p>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className={phase.badge}>
                        {phase.phase}
                      </Badge>
                      <ArrowRight className={`h-4 w-4 ${phase.arrow}`} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
};

const AutomationPhasePage = () => {
  const { automationId, phaseId } = useParams();
  const automation = automations.find((item) => item.id === automationId);
  const phase = phases.find((item) => item.id === phaseId);

  if (!automation || !phase) {
    return <Navigate to="/" replace />;
  }

  const AutomationIcon = automation.icon;
  const PhaseIcon = phase.icon;

  if (phase.id === 'ai-workflow') {
    return (
      <div className="h-screen w-full overflow-hidden">
        <PhaseContent phaseId={phase.id} automationId={automation.id} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground" to={`/automation/${automation.id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to Phases
        </Link>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <AutomationIcon className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{automation.title}</h1>
              <p className="text-base text-muted-foreground md:text-lg">{automation.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${phase.tile}`}>
              <PhaseIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{phase.title}</div>
              <Badge variant="secondary" className={phase.badge}>{phase.phase}</Badge>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <PhaseContent phaseId={phase.id} automationId={automation.id} />
        </div>
      </div>
    </main>
  );
};

const AutomationRoute = () => {
  const { automationId } = useParams();
  return <AutomationPhasesPage key={automationId ?? 'automation'} />;
};

const AutomationPhaseRoute = () => {
  const { automationId, phaseId } = useParams();
  return <AutomationPhasePage key={`${automationId ?? 'automation'}-${phaseId ?? 'phase'}`} />;
};

const App = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/executions" element={<AdvancedExecutionDashboard />} />
      <Route path="/agents" element={<AgentsPage />} />
      <Route path="/ai-analysis" element={<AIInspectLabPage />} />
      <Route path="/ai-investigation" element={<AIInvestigationPage />} />
      <Route path="/backend/:backendBlockId" element={<BackendBlockPage />} />
      <Route path="/automation/:automationId" element={<AutomationRoute />} />
      <Route path="/automation/:automationId/:phaseId" element={<AutomationPhaseRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Router>
);

export default App;


