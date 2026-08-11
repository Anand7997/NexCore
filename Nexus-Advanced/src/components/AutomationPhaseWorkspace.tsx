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
  Edit3,
  FolderPlus,
  Layers3,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Target,
  Trash2,
  X,
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
  useDeleteTestCase,
  useDeleteTestModule,
  useDeleteTestProject,
  useTestConfigurationTree,
  useUpdateTestCase,
  useUpdateTestModule,
  useUpdateTestProject,
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
type PlanningEntity = 'project' | 'module' | 'case';
type PlanningFormMode = 'create' | 'edit';

type PlanningFormState = {
  mode: PlanningFormMode;
  entity: PlanningEntity;
  id?: string;
  name: string;
  description: string;
  status: string;
  tags: string;
  testType: string;
  priority: string;
  executionMode: string;
  platforms: string[];
  defaultVariables: string;
};

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

function csvToTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function tagsToCsv(tags?: string[]) {
  return (tags ?? []).join(', ');
}

const INPUT_CLASS =
  'w-full rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)] placeholder:text-[var(--color-fg-subtle)]';
const LABEL_CLASS = 'mb-1.5 block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]';

function PlanningWorkspace({ automationId }: { automationId: string }) {
  const [view, setView] = useState<PlanningView>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanningFormState | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data, isLoading, isError, refetch, isFetching } = useTestConfigurationTree(automationId);
  const createProject = useCreateTestProject();
  const createModule = useCreateTestModule(selectedProjectId ?? '');
  const createCase = useCreateTestCase(selectedModuleId ?? '');
  const updateProject = useUpdateTestProject(form?.entity === 'project' && form.mode === 'edit' ? form.id ?? '' : '');
  const updateModule = useUpdateTestModule(form?.entity === 'module' && form.mode === 'edit' ? form.id ?? '' : '');
  const updateCase = useUpdateTestCase(form?.entity === 'case' && form.mode === 'edit' ? form.id ?? '' : '');
  const deleteProject = useDeleteTestProject();
  const deleteModule = useDeleteTestModule();
  const deleteCase = useDeleteTestCase();

  const projects = data?.projects ?? [];
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedModule = selectedProject?.modules.find((module) => module.id === selectedModuleId) ?? null;
  const totalModules = projects.reduce((sum, project) => sum + project.modules.length, 0);
  const totalCases = projects.reduce((sum, project) => sum + project.modules.reduce((moduleSum, module) => moduleSum + module.test_cases.length, 0), 0);
  const isSaving =
    form?.entity === 'project'
      ? form.mode === 'create'
        ? createProject.isPending
        : updateProject.isPending
      : form?.entity === 'module'
        ? form.mode === 'create'
          ? createModule.isPending
          : updateModule.isPending
        : form?.entity === 'case'
          ? form.mode === 'create'
            ? createCase.isPending
            : updateCase.isPending
          : false;

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
    setForm(null);
    setValidationError(null);
    setView('modules');
  };

  const selectModule = (module: TestModule) => {
    setSelectedModuleId(module.id);
    setForm(null);
    setValidationError(null);
    setView('testcases');
  };

  const openCreateForm = (entity: PlanningEntity) => {
    setValidationError(null);
    setForm({
      mode: 'create',
      entity,
      name: '',
      description: '',
      status: entity === 'case' ? 'draft' : 'active',
      tags: `planning, ${automationId}`,
      testType: 'functional',
      priority: 'p2',
      executionMode: 'automated',
      platforms: automationPlatforms(automationId),
      defaultVariables: '{}',
    });
  };

  const openEditProject = (project: TestProject) => {
    setValidationError(null);
    setSelectedProjectId(project.id);
    setSelectedModuleId(project.modules[0]?.id ?? null);
    setView('projects');
    setForm({
      mode: 'edit',
      entity: 'project',
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      tags: tagsToCsv(project.tags),
      testType: 'functional',
      priority: 'p2',
      executionMode: 'automated',
      platforms: automationPlatforms(automationId),
      defaultVariables: '{}',
    });
  };

  const openEditModule = (module: TestModule) => {
    setValidationError(null);
    setSelectedModuleId(module.id);
    setView('modules');
    setForm({
      mode: 'edit',
      entity: 'module',
      id: module.id,
      name: module.name,
      description: module.description,
      status: module.status,
      tags: tagsToCsv(module.tags),
      testType: 'functional',
      priority: 'p2',
      executionMode: 'automated',
      platforms: automationPlatforms(automationId),
      defaultVariables: '{}',
    });
  };

  const openEditCase = (testCase: TestCase) => {
    setValidationError(null);
    setForm({
      mode: 'edit',
      entity: 'case',
      id: testCase.id,
      name: testCase.name,
      description: testCase.description,
      status: testCase.status,
      tags: tagsToCsv(testCase.tags),
      testType: testCase.test_type,
      priority: testCase.priority,
      executionMode: testCase.execution_mode,
      platforms: testCase.platforms.length ? testCase.platforms : automationPlatforms(automationId),
      defaultVariables: JSON.stringify(testCase.default_variables ?? {}, null, 2),
    });
  };

  const submitForm = () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      setValidationError(`${form.entity === 'case' ? 'Test case' : form.entity} name is required.`);
      return;
    }

    setValidationError(null);

    if (form.entity === 'project') {
      const payload = {
        name,
        description: form.description,
        status: form.status,
        automation_space: automationId,
        tags: csvToTags(form.tags),
      };
      if (form.mode === 'create') {
        createProject.mutate(payload, {
          onSuccess: (project) => {
            setSelectedProjectId(project.id);
            setSelectedModuleId(project.modules[0]?.id ?? null);
            setForm(null);
          },
        });
      } else {
        updateProject.mutate(payload, { onSuccess: () => setForm(null) });
      }
      return;
    }

    if (form.entity === 'module') {
      if (!selectedProjectId) {
        setValidationError('Select a project before saving a module.');
        return;
      }
      const payload = {
        name,
        description: form.description,
        status: form.status,
        automation_space: automationId,
        tags: csvToTags(form.tags),
      };
      if (form.mode === 'create') {
        createModule.mutate(payload, {
          onSuccess: (module) => {
            setSelectedModuleId(module.id);
            setForm(null);
          },
        });
      } else {
        updateModule.mutate(payload, { onSuccess: () => setForm(null) });
      }
      return;
    }

    if (!selectedModuleId && form.mode === 'create') {
      setValidationError('Select a module before saving a test case.');
      return;
    }
    if (form.platforms.length === 0) {
      setValidationError('Select at least one platform.');
      return;
    }

    let defaultVariables: Record<string, unknown>;
    try {
      defaultVariables = JSON.parse(form.defaultVariables || '{}') as Record<string, unknown>;
    } catch {
      setValidationError('Default variables must be valid JSON.');
      return;
    }

    const payload = {
      name,
      description: form.description,
      status: form.status,
      automation_space: automationId,
      test_type: form.testType,
      priority: form.priority,
      execution_mode: form.executionMode,
      platforms: form.platforms,
      tags: csvToTags(form.tags),
      default_variables: defaultVariables,
    };

    if (form.mode === 'create') {
      createCase.mutate(payload, { onSuccess: () => setForm(null) });
    } else {
      updateCase.mutate(payload, { onSuccess: () => setForm(null) });
    }
  };

  const deleteProjectCard = (project: TestProject) => {
    if (!window.confirm(`Delete project "${project.name}" and its modules and test cases?`)) return;
    const nextProject = projects.find((candidate) => candidate.id !== project.id) ?? null;
    setValidationError(null);
    if (selectedProjectId === project.id) {
      setSelectedProjectId(nextProject?.id ?? null);
      setSelectedModuleId(nextProject?.modules[0]?.id ?? null);
      setView(nextProject ? 'projects' : 'projects');
    }
    if (form?.id === project.id) setForm(null);
    deleteProject.mutate(project.id);
  };

  const deleteModuleCard = (module: TestModule) => {
    if (!window.confirm(`Delete module "${module.name}" and its test cases?`)) return;
    const nextModule = selectedProject?.modules.find((candidate) => candidate.id !== module.id) ?? null;
    setValidationError(null);
    if (selectedModuleId === module.id) {
      setSelectedModuleId(nextModule?.id ?? null);
      setView('modules');
    }
    if (form?.id === module.id) setForm(null);
    deleteModule.mutate(module.id);
  };

  const deleteCaseCard = (testCase: TestCase) => {
    if (!window.confirm(`Delete test case "${testCase.name}"?`)) return;
    setValidationError(null);
    if (form?.id === testCase.id) setForm(null);
    deleteCase.mutate(testCase.id);
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

  const renderPlanningForm = (entity: PlanningEntity) => {
    if (!form || form.entity !== entity) return null;

    return (
      <div className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-[var(--color-fg-default)]">
              {form.mode === 'create' ? 'Create' : 'Edit'} {entity === 'case' ? 'Test Case' : entity[0].toUpperCase() + entity.slice(1)}
            </h4>
            <p className="text-xs text-[var(--color-fg-muted)]">Saved under {automationId} automation planning.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setForm(null)} disabled={isSaving}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button variant="neon" size="sm" onClick={submitForm} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {form.mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </div>
        </div>

        {validationError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {validationError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Name</label>
            <input
              className={INPUT_CLASS}
              value={form.name}
              onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)}
              placeholder={entity === 'case' ? 'Test case name' : `${entity[0].toUpperCase() + entity.slice(1)} name`}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Status</label>
            <select
              className={INPUT_CLASS}
              value={form.status}
              onChange={(event) => setForm((current) => current ? { ...current, status: event.target.value } : current)}
            >
              {(entity === 'case' ? ['draft', 'active', 'deprecated'] : ['active', 'draft', 'archived']).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {entity === 'case' && (
            <>
              <div>
                <label className={LABEL_CLASS}>Priority</label>
                <select
                  className={INPUT_CLASS}
                  value={form.priority}
                  onChange={(event) => setForm((current) => current ? { ...current, priority: event.target.value } : current)}
                >
                  {['p0', 'p1', 'p2', 'p3'].map((priority) => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Type</label>
                <select
                  className={INPUT_CLASS}
                  value={form.testType}
                  onChange={(event) => setForm((current) => current ? { ...current, testType: event.target.value } : current)}
                >
                  {['functional', 'smoke', 'regression', 'integration', 'e2e'].map((testType) => (
                    <option key={testType} value={testType}>{testType}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Execution Mode</label>
                <select
                  className={INPUT_CLASS}
                  value={form.executionMode}
                  onChange={(event) => setForm((current) => current ? { ...current, executionMode: event.target.value } : current)}
                >
                  {['automated', 'manual', 'hybrid'].map((mode) => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Platforms</label>
                <div className="flex min-h-10 flex-wrap items-center gap-2">
                  {['web', 'desktop', 'mobile', 'api'].map((platform) => {
                    const active = form.platforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => setForm((current) => current
                          ? {
                              ...current,
                              platforms: active
                                ? current.platforms.filter((item) => item !== platform)
                                : [...current.platforms, platform],
                            }
                          : current)}
                        className={`rounded-full border px-3 py-1 text-xs font-mono transition-colors ${
                          active
                            ? 'border-[rgba(91,140,255,0.55)] bg-[rgba(91,140,255,0.14)] text-[#5b8cff]'
                            : 'border-[var(--color-line-default)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)]'
                        }`}
                      >
                        {platform}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className={entity === 'case' ? '' : 'lg:col-span-2'}>
            <label className={LABEL_CLASS}>Tags</label>
            <input
              className={INPUT_CLASS}
              value={form.tags}
              onChange={(event) => setForm((current) => current ? { ...current, tags: event.target.value } : current)}
              placeholder="planning, smoke"
            />
          </div>
          <div className="lg:col-span-2">
            <label className={LABEL_CLASS}>Description</label>
            <textarea
              className={`${INPUT_CLASS} min-h-24 resize-y`}
              value={form.description}
              onChange={(event) => setForm((current) => current ? { ...current, description: event.target.value } : current)}
              placeholder="Describe the scope and intent"
            />
          </div>
          {entity === 'case' && (
            <div className="lg:col-span-2">
              <label className={LABEL_CLASS}>Default Variables JSON</label>
              <textarea
                className={`${INPUT_CLASS} min-h-24 resize-y font-mono text-xs`}
                value={form.defaultVariables}
                onChange={(event) => setForm((current) => current ? { ...current, defaultVariables: event.target.value } : current)}
                placeholder='{"baseUrl":"https://example.test"}'
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderProjects = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-[var(--color-fg-default)]">Projects</h3>
        <Button variant="neon" size="sm" onClick={() => openCreateForm('project')} disabled={createProject.isPending}>
          <Plus className="h-4 w-4" />
          Project
        </Button>
      </div>
      {renderPlanningForm('project')}
      {projects.length === 0 ? (
        <EmptyState message="No projects yet. Create a project to unlock modules." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-4 transition-all hover:border-[rgba(91,140,255,0.45)] hover:bg-[rgba(91,140,255,0.06)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-[var(--color-fg-default)]">{project.name}</h4>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-fg-muted)]">{project.description || 'No description'}</p>
                </div>
                <span className="rounded-full bg-[rgba(91,140,255,0.12)] px-2 py-1 font-mono text-[10px] text-[#5b8cff]">{project.status}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-fg-subtle)]">
                <span>{project.modules.length} modules</span>
                <span>{project.modules.reduce((sum, module) => sum + module.test_cases.length, 0)} cases</span>
                <span className="font-mono">{project.automation_space ?? automationId}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="glass" size="xs" onClick={() => selectProject(project)}>
                  <ArrowRight className="h-3.5 w-3.5" />
                  Open
                </Button>
                <Button variant="glass" size="xs" onClick={() => openEditProject(project)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button variant="danger" size="xs" onClick={() => deleteProjectCard(project)} disabled={deleteProject.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
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
        <Button variant="neon" size="sm" onClick={() => openCreateForm('module')} disabled={!selectedProject || createModule.isPending}>
          <Plus className="h-4 w-4" />
          Module
        </Button>
      </div>
      {renderPlanningForm('module')}
      {!selectedProject ? (
        <EmptyState message="Select a project from Step 1 before creating modules." />
      ) : selectedProject.modules.length === 0 ? (
        <EmptyState message="No modules yet. Create a module to unlock test cases." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {selectedProject.modules.map((module) => (
            <div
              key={module.id}
              className="rounded-xl border border-[var(--color-line-default)] bg-[var(--color-surface-1)] p-4 transition-all hover:border-[rgba(22,163,74,0.45)] hover:bg-[rgba(22,163,74,0.06)]"
            >
              <h4 className="font-semibold text-[var(--color-fg-default)]">{module.name}</h4>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--color-fg-muted)]">{module.description || 'No description'}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[var(--color-fg-subtle)]">
                <span>{module.test_cases.length} cases</span>
                <span>{module.status}</span>
                <span className="font-mono">{module.automation_space ?? automationId}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="glass" size="xs" onClick={() => selectModule(module)}>
                  <ArrowRight className="h-3.5 w-3.5" />
                  Open
                </Button>
                <Button variant="glass" size="xs" onClick={() => openEditModule(module)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button variant="danger" size="xs" onClick={() => deleteModuleCard(module)} disabled={deleteModule.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
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
        <Button variant="neon" size="sm" onClick={() => openCreateForm('case')} disabled={!selectedModule || createCase.isPending}>
          <Plus className="h-4 w-4" />
          Case
        </Button>
      </div>
      {renderPlanningForm('case')}
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
                <span className="font-mono">{testCase.automation_space ?? automationId}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="glass" size="xs" onClick={() => openEditCase(testCase)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button variant="danger" size="xs" onClick={() => deleteCaseCard(testCase)} disabled={deleteCase.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
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
