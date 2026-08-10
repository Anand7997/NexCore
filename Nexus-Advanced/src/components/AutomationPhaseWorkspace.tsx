'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  Boxes,
  CheckCircle2,
  ChevronRight,
  FolderPlus,
  Layers3,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Target,
  type LucideIcon,
} from 'lucide-react';
import IntentStudioPage from '@/app/intent-studio/page';
import ExecutionsPage from '@/app/executions/page';
import ReportsPage from '@/app/reports/page';
import ExecutionControlPage from '@/app/execution-control/page';
import AIWorkflowPage from '@/app/ai-workflow/page';
import { Button } from '@/components/ui/Button';
import { automations, phases, type PhaseId } from '@/components/MainDashboard';
import {
  useCreateTestCase,
  useCreateTestModule,
  useCreateTestProject,
  useTestConfigurationTree,
} from '@/lib/api/testConfiguration';
import type { TestCase, TestModule, TestProject } from '@/lib/api/types';

type PlanningCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  step: string;
  disabled: boolean;
  disabledHint?: string;
  onClick: () => void;
};

type PlanningView = 'overview' | 'projects' | 'modules' | 'testcases';

function PlanningStepCard({ card }: { card: PlanningCard }) {
  const Icon = card.icon;

  return (
    <button
      type="button"
      disabled={card.disabled}
      onClick={card.onClick}
      className="group h-full rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-5 text-left transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--color-line-strong)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${card.accent}1f` }}>
          <Icon className="h-5 w-5" style={{ color: card.accent }} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--color-fg-default)]">{card.title}</h3>
            <span className="rounded-full px-2 py-0.5 font-mono text-[10px]" style={{ backgroundColor: `${card.accent}1a`, color: card.accent }}>
              {card.step}
            </span>
          </div>
          <p className="mt-2 text-sm leading-5 text-[var(--color-fg-muted)]">{card.description}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between text-sm font-semibold" style={{ color: card.disabled ? 'var(--color-fg-subtle)' : card.accent }}>
        <span>{card.disabled ? card.disabledHint : 'Open inside planning'}</span>
        <ArrowRight className="h-4 w-4 transition-transform group-enabled:group-hover:translate-x-1" />
      </div>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-4 py-10 text-center text-sm text-[var(--color-fg-subtle)]">
      {message}
    </div>
  );
}

function automationPlatforms(automationId: string) {
  if (automationId === 'unified') return ['web', 'desktop', 'mobile', 'api'];
  return [automationId];
}

function PlanningWorkspace({ automationId }: { automationId: string }) {
  const [view, setView] = useState<PlanningView>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch, isFetching } = useTestConfigurationTree(automationId);
  const createProject = useCreateTestProject();
  const createModule = useCreateTestModule(selectedProjectId ?? '');
  const createCase = useCreateTestCase(selectedModuleId ?? '');

  const projects = data?.projects ?? [];
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedModule = selectedProject?.modules.find((module) => module.id === selectedModuleId) ?? null;
  const totalModules = projects.reduce((sum, project) => sum + project.modules.length, 0);
  const totalCases = projects.reduce((sum, project) => sum + project.modules.reduce((moduleSum, module) => moduleSum + module.test_cases.length, 0), 0);

  const cards: PlanningCard[] = useMemo(
    () => [
      {
        title: 'Projects',
        description: 'Create and manage automation projects. Organize test automation work by project.',
        icon: FolderPlus,
        accent: '#5b8cff',
        step: 'Step 1',
        disabled: false,
        onClick: () => setView('projects'),
      },
      {
        title: 'Modules',
        description: 'Organize test cases into logical modules within the selected project.',
        icon: Layers3,
        accent: '#16a34a',
        step: 'Step 2',
        disabled: !selectedProject,
        disabledHint: 'Select a project first',
        onClick: () => setView('modules'),
      },
      {
        title: 'Test Cases',
        description: 'Review and plan test cases created for the selected module.',
        icon: BookOpenCheck,
        accent: '#a78bfa',
        step: 'Step 3',
        disabled: !selectedModule,
        disabledHint: 'Select a module first',
        onClick: () => setView('testcases'),
      },
    ],
    [selectedProject, selectedModule],
  );

  const selectProject = (project: TestProject) => {
    setSelectedProjectId(project.id);
    setSelectedModuleId(project.modules[0]?.id ?? null);
    setView('modules');
  };

  const selectModule = (module: TestModule) => {
    setSelectedModuleId(module.id);
    setView('testcases');
  };

  const addProject = () => {
    createProject.mutate(
      {
        name: `${automationId.toUpperCase()} Project ${projects.length + 1}`,
        description: `Execution-ready ${automationId} automation planning project.`,
        status: 'active',
        automation_space: automationId,
        tags: ['planning', automationId],
      },
      {
        onSuccess: (project) => {
          setSelectedProjectId(project.id);
          setSelectedModuleId(project.modules[0]?.id ?? null);
          setView('modules');
        },
      },
    );
  };

  const addModule = () => {
    if (!selectedProject) return;
    createModule.mutate(
      {
        name: `Module ${selectedProject.modules.length + 1}`,
        description: `Planned ${automationId} automation module.`,
        status: 'active',
        automation_space: automationId,
        tags: ['planning', automationId],
      },
      {
        onSuccess: (module) => {
          setSelectedModuleId(module.id);
          setView('testcases');
        },
      },
    );
  };

  const addCase = () => {
    if (!selectedModule) return;
    createCase.mutate({
      name: `Test Case ${selectedModule.test_cases.length + 1}`,
      description: 'Planned automation test case.',
      status: 'draft',
      automation_space: automationId,
      test_type: 'functional',
      priority: 'p2',
      execution_mode: 'automated',
      platforms: automationPlatforms(automationId),
      tags: ['planning', automationId],
      default_variables: {},
    });
  };

  const renderBreadcrumb = () => (
    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-fg-muted)]">
      <button type="button" onClick={() => setView('overview')} className="hover:text-[var(--color-accent-default)]">
        {automationId.toUpperCase()} Automation Planning
      </button>
      {(view === 'projects' || selectedProject) && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
          <button type="button" onClick={() => setView('projects')} className="hover:text-[var(--color-accent-default)]">
            Projects
          </button>
        </>
      )}
      {selectedProject && (view === 'modules' || selectedModule) && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
          <button type="button" onClick={() => setView('modules')} className="hover:text-[var(--color-accent-default)]">
            {selectedProject.name}
          </button>
        </>
      )}
      {selectedModule && view === 'testcases' && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
          <span className="text-[var(--color-fg-default)]">{selectedModule.name}</span>
        </>
      )}
    </div>
  );

  const renderProjects = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-[var(--color-fg-default)]">Projects</h3>
        <Button variant="neon" size="sm" onClick={addProject} disabled={createProject.isPending}>
          {createProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Project
        </Button>
      </div>
      {projects.length === 0 ? (
        <EmptyState message="No projects yet. Create a project to unlock modules." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => selectProject(project)}
              className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-4 text-left transition-all hover:border-[rgba(91,140,255,0.45)] hover:bg-[rgba(91,140,255,0.06)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-[var(--color-fg-default)]">{project.name}</h4>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-fg-muted)]">{project.description || 'No description'}</p>
                </div>
                <span className="rounded-full bg-[rgba(91,140,255,0.12)] px-2 py-1 font-mono text-[10px] text-[#5b8cff]">{project.status}</span>
              </div>
              <div className="mt-4 flex gap-2 text-[11px] text-[var(--color-fg-subtle)]">
                <span>{project.modules.length} modules</span>
                <span>{project.modules.reduce((sum, module) => sum + module.test_cases.length, 0)} cases</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderModules = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-fg-default)]">Modules</h3>
          <p className="text-sm text-[var(--color-fg-muted)]">{selectedProject ? selectedProject.name : 'Select a project to continue'}</p>
        </div>
        <Button variant="neon" size="sm" onClick={addModule} disabled={!selectedProject || createModule.isPending}>
          {createModule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Module
        </Button>
      </div>
      {!selectedProject ? (
        <EmptyState message="Select a project from Step 1 before creating modules." />
      ) : selectedProject.modules.length === 0 ? (
        <EmptyState message="No modules yet. Create a module to unlock test cases." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {selectedProject.modules.map((module) => (
            <button
              key={module.id}
              type="button"
              onClick={() => selectModule(module)}
              className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-4 text-left transition-all hover:border-[rgba(22,163,74,0.45)] hover:bg-[rgba(22,163,74,0.06)]"
            >
              <h4 className="font-semibold text-[var(--color-fg-default)]">{module.name}</h4>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--color-fg-muted)]">{module.description || 'No description'}</p>
              <div className="mt-4 flex gap-2 text-[11px] text-[var(--color-fg-subtle)]">
                <span>{module.test_cases.length} cases</span>
                <span>{module.status}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderTestCases = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-fg-default)]">Test Cases</h3>
          <p className="text-sm text-[var(--color-fg-muted)]">{selectedModule ? selectedModule.name : 'Select a module to continue'}</p>
        </div>
        <Button variant="neon" size="sm" onClick={addCase} disabled={!selectedModule || createCase.isPending}>
          {createCase.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Case
        </Button>
      </div>
      {!selectedModule ? (
        <EmptyState message="Select a module from Step 2 before creating test cases." />
      ) : selectedModule.test_cases.length === 0 ? (
        <EmptyState message="No test cases yet. Create or sync cases from Automation Development." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {selectedModule.test_cases.map((testCase: TestCase) => (
            <div key={testCase.id} className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-[var(--color-fg-default)]">{testCase.name}</h4>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-fg-muted)]">{testCase.description || 'No description'}</p>
                </div>
                <span className="rounded-full bg-[rgba(161,149,255,0.12)] px-2 py-1 font-mono text-[10px] text-[#a195ff]">{testCase.priority}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[var(--color-fg-subtle)]">
                <span>{testCase.status}</span>
                <span>{testCase.test_type}</span>
                <span>{testCase.test_steps.length} steps</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-8 text-center text-[var(--color-fg-muted)]">
        <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-[var(--color-accent-default)]" />
        Loading planning workspace...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span>Planning data could not be loaded.</span>
          <Button variant="glass" size="sm" onClick={() => refetch()} disabled={isFetching}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[rgba(22,163,74,0.18)]">
                <Lightbulb className="h-6 w-6 text-[#16a34a]" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-[var(--color-fg-default)]">{automationId.toUpperCase()} Automation Planning</h2>
                <p className="text-sm text-[var(--color-fg-muted)]">Organize isolated {automationId} projects, modules, and test cases without leaving this phase.</p>
              </div>
            </div>
            <div className="mt-5">{renderBreadcrumb()}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Projects', value: projects.length, color: '#5b8cff' },
              { label: 'Modules', value: totalModules, color: '#16a34a' },
              { label: 'Cases', value: totalCases, color: '#a195ff' },
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg border border-[var(--color-line-default)] px-3 py-2">
                <div className="font-mono text-lg font-semibold" style={{ color: metric.color }}>{metric.value}</div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {view === 'overview' && <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">{cards.map((card) => <PlanningStepCard key={card.title} card={card} />)}</div>}
      {view === 'projects' && renderProjects()}
      {view === 'modules' && renderModules()}
      {view === 'testcases' && renderTestCases()}
    </div>
  );
}

function RequirementsWorkspace() {
  return <IntentStudioPage />;
}

function PhaseBody({ phaseId, automationId }: { phaseId: PhaseId; automationId: string }) {
  if (phaseId === 'requirements') return <RequirementsWorkspace />;
  if (phaseId === 'planning') return <PlanningWorkspace automationId={automationId} />;
  if (phaseId === 'development') return null;
  if (phaseId === 'execution') return <ExecutionsPage />;
  if (phaseId === 'reporting') return <ReportsPage />;
  if (phaseId === 'cicd') return <ExecutionControlPage />;
  return <AIWorkflowPage />;
}

export function AutomationPhaseWorkspace({
  automationId,
  phaseId,
}: {
  automationId: string;
  phaseId: string;
}) {
  const automation = automations.find((item) => item.id === automationId);
  const phase = phases.find((item) => item.id === phaseId);

  if (!automation || !phase) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <div className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-6 text-center">
          <p className="text-sm text-[var(--color-fg-muted)]">Automation phase not found.</p>
          <Link href="/main-dashboard" className="mt-3 inline-flex text-sm font-semibold text-[var(--color-accent-default)]">
            Back to MainDashboard
          </Link>
        </div>
      </main>
    );
  }

  const AutomationIcon = automation.icon;
  const PhaseIcon = phase.icon;

  return (
    <main className="flex min-h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-7">
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)]" href={`/main-dashboard/automation/${automation.id}`}>
          <ArrowRight className="h-4 w-4 rotate-180" />
          Back to Phases
        </Link>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: automation.glow }}>
              <AutomationIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg-default)] md:text-4xl">{automation.title}</h1>
              <p className="text-base text-[var(--color-fg-muted)] md:text-lg">{automation.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: phase.color }}>
              <PhaseIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--color-fg-default)]">{phase.title}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: phase.color }}>
                {phase.phase}
              </div>
            </div>
          </div>
        </div>

        <PhaseBody phaseId={phase.id} automationId={automation.id} />
      </div>
    </main>
  );
}
