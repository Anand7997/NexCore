'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  FileText,
  FolderOpen,
  Layers3,
  Plus,
  Save,
  Tag,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  useCreateTestCase,
  useCreateTestModule,
  useCreateTestProject,
  useCreateTestStep,
  useDeleteTestCase,
  useDeleteTestModule,
  useDeleteTestProject,
  useDeleteTestStep,
  useTestConfigurationTree,
  useUpdateTestCase,
  useUpdateTestModule,
  useUpdateTestProject,
  useUpdateTestStep,
} from '@/lib/api/testConfiguration';
import type {
  TestCase,
  TestModule,
  TestProject,
  TestStep,
} from '@/lib/api/types';

type EditorTarget = 'project' | 'module' | 'case' | 'step';

type ProjectDraft = {
  name: string;
  description: string;
  status: string;
  tags: string;
};

type ModuleDraft = {
  name: string;
  description: string;
  status: string;
  tags: string;
};

type CaseDraft = {
  name: string;
  description: string;
  status: string;
  testType: string;
  priority: string;
  executionMode: string;
  platforms: string[];
  tags: string;
  defaultVariablesText: string;
};

type StepDraft = {
  name: string;
  description: string;
  stepOrder: string;
  intent: string;
  target: string;
  expectedResult: string;
  tags: string;
  testDataText: string;
  bindingsText: string;
  isEnabled: boolean;
};

const PANEL_CLASS = 'rounded-xl border border-[var(--color-line-default)] bg-[rgba(16,16,22,0.84)]';
const INPUT_CLASS = 'w-full rounded-md border border-[var(--color-line-default)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-fg-default)] outline-none transition-colors focus:border-[var(--color-accent-default)]';
const LABEL_CLASS = 'text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]';

const PROJECT_STATUS = ['active', 'draft', 'archived'];
const MODULE_STATUS = ['active', 'draft', 'archived'];
const CASE_STATUS = ['draft', 'active', 'deprecated'];

function findProject(projects: TestProject[], projectId: string | null) {
  if (!projectId) return null;
  return projects.find((project) => project.id === projectId) ?? null;
}

function findModule(projects: TestProject[], moduleId: string | null) {
  if (!moduleId) return null;
  for (const project of projects) {
    const match = project.modules.find((module) => module.id === moduleId);
    if (match) return match;
  }
  return null;
}

function findCase(projects: TestProject[], caseId: string | null) {
  if (!caseId) return null;
  for (const project of projects) {
    for (const module of project.modules) {
      const match = module.test_cases.find((testCase) => testCase.id === caseId);
      if (match) return match;
    }
  }
  return null;
}

function findStep(projects: TestProject[], stepId: string | null) {
  if (!stepId) return null;
  for (const project of projects) {
    for (const module of project.modules) {
      for (const testCase of module.test_cases) {
        const match = testCase.test_steps.find((step) => step.id === stepId);
        if (match) return match;
      }
    }
  }
  return null;
}

function csvToTags(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function tagsToCsv(tags: string[]) {
  return tags.join(', ');
}

function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObject(text: string, label: string) {
  if (!text.trim()) return {};
  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function appendTag(current: string, next: string) {
  const values = new Set(csvToTags(current));
  values.add(next);
  return Array.from(values).join(', ');
}

export default function TestConfigurationPage() {
  const { data, isLoading } = useTestConfigurationTree();
  const projects = data?.projects ?? [];
  const tagCatalog = data?.tag_catalog ?? [];

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget>('project');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [projectDraft, setProjectDraft] = useState<ProjectDraft>({
    name: '',
    description: '',
    status: 'active',
    tags: '',
  });
  const [moduleDraft, setModuleDraft] = useState<ModuleDraft>({
    name: '',
    description: '',
    status: 'active',
    tags: '',
  });
  const [caseDraft, setCaseDraft] = useState<CaseDraft>({
    name: '',
    description: '',
    status: 'draft',
    testType: 'functional',
    priority: 'p2',
    executionMode: 'automated',
    platforms: [],
    tags: '',
    defaultVariablesText: '{}',
  });
  const [stepDraft, setStepDraft] = useState<StepDraft>({
    name: '',
    description: '',
    stepOrder: '1',
    intent: 'action',
    target: '',
    expectedResult: '',
    tags: '',
    testDataText: '{}',
    bindingsText: '{}',
    isEnabled: true,
  });

  const selectedProject = findProject(projects, selectedProjectId);
  const selectedModule = findModule(projects, selectedModuleId);
  const selectedCase = findCase(projects, selectedCaseId);
  const selectedStep = findStep(projects, selectedStepId);

  const createProject = useCreateTestProject();
  const updateProject = useUpdateTestProject(selectedProjectId ?? '');
  const deleteProject = useDeleteTestProject();
  const createModule = useCreateTestModule(selectedProjectId ?? '');
  const updateModule = useUpdateTestModule(selectedModuleId ?? '');
  const deleteModule = useDeleteTestModule();
  const createCase = useCreateTestCase(selectedModuleId ?? '');
  const updateCase = useUpdateTestCase(selectedCaseId ?? '');
  const deleteCase = useDeleteTestCase();
  const createStep = useCreateTestStep(selectedCaseId ?? '');
  const updateStep = useUpdateTestStep(selectedStepId ?? '');
  const deleteStep = useDeleteTestStep();

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId(null);
      setSelectedModuleId(null);
      setSelectedCaseId(null);
      setSelectedStepId(null);
      return;
    }

    const project = findProject(projects, selectedProjectId) ?? projects[0];
    const module = project.modules.find((item) => item.id === selectedModuleId) ?? project.modules[0] ?? null;
    const testCase = module?.test_cases.find((item) => item.id === selectedCaseId) ?? module?.test_cases[0] ?? null;
    const step = testCase?.test_steps.find((item) => item.id === selectedStepId) ?? testCase?.test_steps[0] ?? null;

    if (project.id !== selectedProjectId) setSelectedProjectId(project.id);
    if ((module?.id ?? null) !== selectedModuleId) setSelectedModuleId(module?.id ?? null);
    if ((testCase?.id ?? null) !== selectedCaseId) setSelectedCaseId(testCase?.id ?? null);
    if ((step?.id ?? null) !== selectedStepId) setSelectedStepId(step?.id ?? null);
  }, [projects, selectedProjectId, selectedModuleId, selectedCaseId, selectedStepId]);

  useEffect(() => {
    if (!selectedProject) return;
    setProjectDraft({
      name: selectedProject.name,
      description: selectedProject.description,
      status: selectedProject.status,
      tags: tagsToCsv(selectedProject.tags),
    });
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedModule) return;
    setModuleDraft({
      name: selectedModule.name,
      description: selectedModule.description,
      status: selectedModule.status,
      tags: tagsToCsv(selectedModule.tags),
    });
  }, [selectedModule]);

  useEffect(() => {
    if (!selectedCase) return;
    setCaseDraft({
      name: selectedCase.name,
      description: selectedCase.description,
      status: selectedCase.status,
      testType: selectedCase.test_type,
      priority: selectedCase.priority,
      executionMode: selectedCase.execution_mode,
      platforms: selectedCase.platforms,
      tags: tagsToCsv(selectedCase.tags),
      defaultVariablesText: formatJson(selectedCase.default_variables),
    });
  }, [selectedCase]);

  useEffect(() => {
    if (!selectedStep) return;
    setStepDraft({
      name: selectedStep.name,
      description: selectedStep.description,
      stepOrder: String(selectedStep.step_order),
      intent: selectedStep.intent,
      target: selectedStep.target,
      expectedResult: selectedStep.expected_result,
      tags: tagsToCsv(selectedStep.tags),
      testDataText: formatJson(selectedStep.test_data),
      bindingsText: formatJson(selectedStep.bindings),
      isEnabled: selectedStep.is_enabled,
    });
  }, [selectedStep]);

  function selectProject(project: TestProject) {
    setSelectedProjectId(project.id);
    setSelectedModuleId(project.modules[0]?.id ?? null);
    setSelectedCaseId(project.modules[0]?.test_cases[0]?.id ?? null);
    setSelectedStepId(project.modules[0]?.test_cases[0]?.test_steps[0]?.id ?? null);
    setEditorTarget('project');
  }

  function selectModule(module: TestModule) {
    setSelectedModuleId(module.id);
    setSelectedCaseId(module.test_cases[0]?.id ?? null);
    setSelectedStepId(module.test_cases[0]?.test_steps[0]?.id ?? null);
    setEditorTarget('module');
  }

  function selectCaseItem(testCase: TestCase) {
    setSelectedCaseId(testCase.id);
    setSelectedStepId(testCase.test_steps[0]?.id ?? null);
    setEditorTarget('case');
  }

  function selectStepItem(step: TestStep) {
    setSelectedStepId(step.id);
    setEditorTarget('step');
  }

  function toggleCasePlatform(platform: string) {
    setCaseDraft((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((item) => item !== platform)
        : [...current.platforms, platform],
    }));
  }

  function applyCatalogValue(dimensionKey: string, value: string) {
    if (editorTarget === 'case') {
      if (dimensionKey === 'platform') {
        toggleCasePlatform(value);
        return;
      }
      if (dimensionKey === 'test_type') {
        setCaseDraft((current) => ({ ...current, testType: value }));
        return;
      }
      if (dimensionKey === 'priority') {
        setCaseDraft((current) => ({ ...current, priority: value }));
        return;
      }
      if (dimensionKey === 'execution_mode') {
        setCaseDraft((current) => ({ ...current, executionMode: value }));
        return;
      }
      setCaseDraft((current) => ({ ...current, tags: appendTag(current.tags, value) }));
      return;
    }
    if (editorTarget === 'step') {
      setStepDraft((current) => ({ ...current, tags: appendTag(current.tags, value) }));
      return;
    }
    if (editorTarget === 'module') {
      setModuleDraft((current) => ({ ...current, tags: appendTag(current.tags, value) }));
      return;
    }
    setProjectDraft((current) => ({ ...current, tags: appendTag(current.tags, value) }));
  }

  function saveProjectDetails() {
    if (!selectedProject) return;
    setValidationError(null);
    updateProject.mutate({
      name: projectDraft.name,
      description: projectDraft.description,
      status: projectDraft.status,
      tags: csvToTags(projectDraft.tags),
    });
  }

  function saveModuleDetails() {
    if (!selectedModule) return;
    setValidationError(null);
    updateModule.mutate({
      name: moduleDraft.name,
      description: moduleDraft.description,
      status: moduleDraft.status,
      tags: csvToTags(moduleDraft.tags),
    });
  }

  function saveCaseDetails() {
    if (!selectedCase) return;
    try {
      const defaultVariables = parseJsonObject(caseDraft.defaultVariablesText, 'Default variables');
      setValidationError(null);
      updateCase.mutate({
        name: caseDraft.name,
        description: caseDraft.description,
        status: caseDraft.status,
        test_type: caseDraft.testType,
        priority: caseDraft.priority,
        execution_mode: caseDraft.executionMode,
        platforms: caseDraft.platforms,
        tags: csvToTags(caseDraft.tags),
        default_variables: defaultVariables,
      });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to save case details.');
    }
  }

  function saveStepDetails() {
    if (!selectedStep) return;
    try {
      const testData = parseJsonObject(stepDraft.testDataText, 'Test data');
      const bindings = parseJsonObject(stepDraft.bindingsText, 'Bindings');
      setValidationError(null);
      updateStep.mutate({
        name: stepDraft.name,
        description: stepDraft.description,
        step_order: Number(stepDraft.stepOrder) || 1,
        intent: stepDraft.intent,
        target: stepDraft.target,
        expected_result: stepDraft.expectedResult,
        tags: csvToTags(stepDraft.tags),
        test_data: testData,
        bindings: bindings as Record<string, Record<string, unknown>>,
        is_enabled: stepDraft.isEnabled,
      });
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to save step details.');
    }
  }

  function removeCurrentEntity() {
    if (editorTarget === 'step' && selectedStep && window.confirm(`Delete step "${selectedStep.name}"?`)) {
      deleteStep.mutate(selectedStep.id);
      setEditorTarget('case');
      return;
    }
    if (editorTarget === 'case' && selectedCase && window.confirm(`Delete case "${selectedCase.name}"?`)) {
      deleteCase.mutate(selectedCase.id);
      setEditorTarget('module');
      return;
    }
    if (editorTarget === 'module' && selectedModule && window.confirm(`Delete module "${selectedModule.name}"?`)) {
      deleteModule.mutate(selectedModule.id);
      setEditorTarget('project');
      return;
    }
    if (editorTarget === 'project' && selectedProject && window.confirm(`Delete project "${selectedProject.name}"?`)) {
      deleteProject.mutate(selectedProject.id);
    }
  }

  function createDefaultProject() {
    createProject.mutate(
      {
        name: `Project ${projects.length + 1}`,
        description: 'Execution-ready test catalog.',
        status: 'active',
        tags: ['new'],
      },
      {
        onSuccess: (project) => {
          setSelectedProjectId(project.id);
          setSelectedModuleId(project.modules[0]?.id ?? null);
          setSelectedCaseId(project.modules[0]?.test_cases[0]?.id ?? null);
          setSelectedStepId(project.modules[0]?.test_cases[0]?.test_steps[0]?.id ?? null);
          setEditorTarget('project');
        },
      },
    );
  }

  function createDefaultModule() {
    if (!selectedProject) return;
    createModule.mutate(
      {
        name: `Module ${selectedProject.modules.length + 1}`,
        description: 'Area under test.',
        status: 'active',
        tags: [selectedProject.name.toLowerCase().replace(/\s+/g, '-')],
      },
      {
        onSuccess: (module) => {
          setSelectedModuleId(module.id);
          setSelectedCaseId(null);
          setSelectedStepId(null);
          setEditorTarget('module');
        },
      },
    );
  }

  function createDefaultCase() {
    if (!selectedModule) return;
    createCase.mutate(
      {
        name: `Test Case ${selectedModule.test_cases.length + 1}`,
        description: 'Reusable business flow.',
        status: 'draft',
        test_type: 'functional',
        priority: 'p2',
        execution_mode: 'automated',
        platforms: ['web'],
        tags: ['new'],
        default_variables: {},
      },
      {
        onSuccess: (testCase) => {
          setSelectedCaseId(testCase.id);
          setSelectedStepId(testCase.test_steps[0]?.id ?? null);
          setEditorTarget('case');
        },
      },
    );
  }

  function createDefaultStep() {
    if (!selectedCase) return;
    createStep.mutate(
      {
        name: `Step ${selectedCase.test_steps.length + 1}`,
        description: '',
        step_order: selectedCase.test_steps.length + 1,
        intent: 'action',
        target: '',
        expected_result: '',
        test_data: {},
        tags: ['new'],
        bindings: {},
        is_enabled: true,
      },
      {
        onSuccess: (step) => {
          setSelectedStepId(step.id);
          setEditorTarget('step');
        },
      },
    );
  }

  const casePlatforms = tagCatalog.find((dimension) => dimension.key === 'platform')?.values ?? ['web', 'android', 'ios', 'windows', 'api'];
  const caseTypes = tagCatalog.find((dimension) => dimension.key === 'test_type')?.values ?? ['functional', 'smoke', 'regression'];
  const casePriorities = tagCatalog.find((dimension) => dimension.key === 'priority')?.values ?? ['p0', 'p1', 'p2'];
  const executionModes = tagCatalog.find((dimension) => dimension.key === 'execution_mode')?.values ?? ['automated', 'manual', 'hybrid'];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Authoring Workspace
          </p>
          <h1 className="text-[30px] font-semibold tracking-normal text-[var(--color-fg-default)]">
            Test Configuration
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-fg-muted)]">
            Projects, modules, test cases, and step bindings live here before they fan out into execution workflows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="glass" size="sm" onClick={createDefaultProject}>
            <Plus size={12} />
            Project
          </Button>
          <Button variant="glass" size="sm" onClick={createDefaultModule} disabled={!selectedProject}>
            <Plus size={12} />
            Module
          </Button>
          <Button variant="glass" size="sm" onClick={createDefaultCase} disabled={!selectedModule}>
            <Plus size={12} />
            Case
          </Button>
          <Button variant="neon" size="sm" onClick={createDefaultStep} disabled={!selectedCase}>
            <Plus size={12} />
            Step
          </Button>
        </div>
      </motion.div>

      {validationError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {validationError}
        </div>
      )}

      <div className="grid min-h-[720px] grid-cols-1 gap-5 xl:grid-cols-[320px_380px_minmax(0,1fr)]">
        <section className={`${PANEL_CLASS} flex min-h-0 flex-col`}>
          <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-4 py-3">
            <div className="flex items-center gap-2">
              <FolderOpen size={14} className="text-[var(--color-accent-default)]" />
              <h2 className="text-sm font-medium text-[var(--color-fg-default)]">Project Tree</h2>
            </div>
            <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">{projects.length} projects</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-4 text-sm text-[var(--color-fg-subtle)]">
                Loading configuration tree...
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-4 text-sm text-[var(--color-fg-subtle)]">
                No projects yet. Create the first project to start organizing coverage.
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => {
                  const projectSelected = project.id === selectedProjectId;
                  return (
                    <div key={project.id} className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)]">
                      <button
                        onClick={() => selectProject(project)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors ${
                          projectSelected ? 'bg-[var(--color-accent-soft)] text-[var(--color-fg-default)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--color-fg-default)]">{project.name}</p>
                          <p className="mt-1 text-[10px] font-mono text-[var(--color-fg-subtle)]">
                            {project.modules.length} modules
                          </p>
                        </div>
                        <ChevronRight size={12} className="text-[var(--color-fg-subtle)]" />
                      </button>

                      <div className="border-t border-[var(--color-line-subtle)] px-2 py-2">
                        {project.modules.length === 0 ? (
                          <p className="px-2 py-1 text-[11px] text-[var(--color-fg-subtle)]">No modules yet</p>
                        ) : (
                          project.modules.map((module) => {
                            const moduleSelected = module.id === selectedModuleId;
                            return (
                              <button
                                key={module.id}
                                onClick={() => selectModule(module)}
                                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors ${
                                  moduleSelected ? 'bg-[rgba(91,140,255,0.12)]' : 'hover:bg-[rgba(255,255,255,0.03)]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-[13px] text-[var(--color-fg-default)]">{module.name}</p>
                                  <p className="text-[10px] font-mono text-[var(--color-fg-subtle)]">
                                    {module.test_cases.length} cases
                                  </p>
                                </div>
                                <span className="rounded-full border border-[var(--color-line-default)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]">
                                  {module.status}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className={`${PANEL_CLASS} flex min-h-0 flex-col`}>
          <div className="border-b border-[var(--color-line-subtle)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers3 size={14} className="text-[var(--color-state-running)]" />
              <h2 className="text-sm font-medium text-[var(--color-fg-default)]">Cases and Steps</h2>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
              {selectedModule ? selectedModule.name : 'Select a module to inspect test coverage.'}
            </p>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[1fr_1fr]">
            <div className="min-h-0 overflow-y-auto border-b border-[var(--color-line-subtle)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className={LABEL_CLASS}>Test Cases</span>
                <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">
                  {selectedModule?.test_cases.length ?? 0}
                </span>
              </div>

              {!selectedModule ? (
                <p className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-4 text-sm text-[var(--color-fg-subtle)]">
                  Pick a project module first.
                </p>
              ) : selectedModule.test_cases.length === 0 ? (
                <p className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-4 text-sm text-[var(--color-fg-subtle)]">
                  No test cases yet. Create one from the action bar.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedModule.test_cases.map((testCase) => (
                    <button
                      key={testCase.id}
                      onClick={() => selectCaseItem(testCase)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        testCase.id === selectedCaseId
                          ? 'border-[var(--color-line-active)] bg-[var(--color-accent-soft)]'
                          : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:bg-[rgba(255,255,255,0.03)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-[var(--color-fg-default)]">{testCase.name}</p>
                        <span className="rounded-full border border-[var(--color-line-default)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]">
                          {testCase.priority}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[testCase.test_type, ...testCase.platforms].slice(0, 4).map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-[var(--color-line-default)] px-2 py-0.5 text-[9px] font-mono text-[var(--color-fg-subtle)]"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className={LABEL_CLASS}>Test Steps</span>
                <span className="text-[10px] font-mono text-[var(--color-fg-subtle)]">
                  {selectedCase?.test_steps.length ?? 0}
                </span>
              </div>

              {!selectedCase ? (
                <p className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-4 text-sm text-[var(--color-fg-subtle)]">
                  Choose a test case to edit step bindings.
                </p>
              ) : selectedCase.test_steps.length === 0 ? (
                <p className="rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-4 text-sm text-[var(--color-fg-subtle)]">
                  No steps yet. Add the first one from the action bar.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedCase.test_steps.map((step) => (
                    <button
                      key={step.id}
                      onClick={() => selectStepItem(step)}
                      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                        step.id === selectedStepId
                          ? 'border-[var(--color-line-active)] bg-[rgba(91,140,255,0.1)]'
                          : 'border-[var(--color-line-default)] bg-[var(--color-surface-2)] hover:bg-[rgba(255,255,255,0.03)]'
                      }`}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--color-line-default)] bg-[var(--color-bg-base)] text-[10px] font-mono text-[var(--color-fg-subtle)]">
                        {step.step_order}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-fg-default)]">{step.name}</p>
                        <p className="mt-1 truncate text-[11px] text-[var(--color-fg-subtle)]">
                          {step.intent} {step.target ? `· ${step.target}` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={`${PANEL_CLASS} flex min-h-0 flex-col`}>
          <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)] px-5 py-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-[var(--color-state-success)]" />
              <h2 className="text-sm font-medium text-[var(--color-fg-default)]">Detail Editor</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={removeCurrentEntity}
                disabled={
                  (editorTarget === 'project' && !selectedProject) ||
                  (editorTarget === 'module' && !selectedModule) ||
                  (editorTarget === 'case' && !selectedCase) ||
                  (editorTarget === 'step' && !selectedStep)
                }
              >
                <Trash2 size={11} />
                Delete
              </Button>
              <Button
                variant="neon"
                size="sm"
                onClick={() => {
                  if (editorTarget === 'project') saveProjectDetails();
                  if (editorTarget === 'module') saveModuleDetails();
                  if (editorTarget === 'case') saveCaseDetails();
                  if (editorTarget === 'step') saveStepDetails();
                }}
              >
                <Save size={11} />
                Save
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {editorTarget === 'project' && selectedProject && (
              <div className="space-y-4">
                <div>
                  <p className={LABEL_CLASS}>Project</p>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <div className="lg:col-span-2">
                      <input
                        value={projectDraft.name}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="Project name"
                      />
                    </div>
                    <div>
                      <select
                        value={projectDraft.status}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, status: event.target.value }))}
                        className={INPUT_CLASS}
                      >
                        {PROJECT_STATUS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input
                        value={projectDraft.tags}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, tags: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="commerce, release"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <textarea
                        value={projectDraft.description}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, description: event.target.value }))}
                        className={`${INPUT_CLASS} min-h-28 resize-y`}
                        placeholder="What this project covers"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editorTarget === 'module' && selectedModule && (
              <div className="space-y-4">
                <div>
                  <p className={LABEL_CLASS}>Module</p>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <div className="lg:col-span-2">
                      <input
                        value={moduleDraft.name}
                        onChange={(event) => setModuleDraft((current) => ({ ...current, name: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="Module name"
                      />
                    </div>
                    <div>
                      <select
                        value={moduleDraft.status}
                        onChange={(event) => setModuleDraft((current) => ({ ...current, status: event.target.value }))}
                        className={INPUT_CLASS}
                      >
                        {MODULE_STATUS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input
                        value={moduleDraft.tags}
                        onChange={(event) => setModuleDraft((current) => ({ ...current, tags: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="checkout, payments"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <textarea
                        value={moduleDraft.description}
                        onChange={(event) => setModuleDraft((current) => ({ ...current, description: event.target.value }))}
                        className={`${INPUT_CLASS} min-h-28 resize-y`}
                        placeholder="What this module covers"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editorTarget === 'case' && selectedCase && (
              <div className="space-y-5">
                <div>
                  <p className={LABEL_CLASS}>Test Case</p>
                  <div className="mt-3 grid gap-4 xl:grid-cols-2">
                    <div className="xl:col-span-2">
                      <input
                        value={caseDraft.name}
                        onChange={(event) => setCaseDraft((current) => ({ ...current, name: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="Case name"
                      />
                    </div>
                    <div>
                      <select
                        value={caseDraft.status}
                        onChange={(event) => setCaseDraft((current) => ({ ...current, status: event.target.value }))}
                        className={INPUT_CLASS}
                      >
                        {CASE_STATUS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <select
                        value={caseDraft.priority}
                        onChange={(event) => setCaseDraft((current) => ({ ...current, priority: event.target.value }))}
                        className={INPUT_CLASS}
                      >
                        {casePriorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <select
                        value={caseDraft.testType}
                        onChange={(event) => setCaseDraft((current) => ({ ...current, testType: event.target.value }))}
                        className={INPUT_CLASS}
                      >
                        {caseTypes.map((testType) => (
                          <option key={testType} value={testType}>
                            {testType}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <select
                        value={caseDraft.executionMode}
                        onChange={(event) => setCaseDraft((current) => ({ ...current, executionMode: event.target.value }))}
                        className={INPUT_CLASS}
                      >
                        {executionModes.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="xl:col-span-2">
                      <textarea
                        value={caseDraft.description}
                        onChange={(event) => setCaseDraft((current) => ({ ...current, description: event.target.value }))}
                        className={`${INPUT_CLASS} min-h-24 resize-y`}
                        placeholder="Business path under test"
                      />
                    </div>
                    <div className="xl:col-span-2">
                      <p className={`${LABEL_CLASS} mb-2`}>Platforms</p>
                      <div className="flex flex-wrap gap-2">
                        {casePlatforms.map((platform) => {
                          const active = caseDraft.platforms.includes(platform);
                          return (
                            <button
                              key={platform}
                              onClick={() => toggleCasePlatform(platform)}
                              className={`rounded-full border px-3 py-1 text-xs font-mono transition-colors ${
                                active
                                  ? 'border-[var(--color-line-active)] bg-[var(--color-accent-soft)] text-[var(--color-fg-default)]'
                                  : 'border-[var(--color-line-default)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-default)]'
                              }`}
                            >
                              {platform}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="xl:col-span-2">
                      <input
                        value={caseDraft.tags}
                        onChange={(event) => setCaseDraft((current) => ({ ...current, tags: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="smoke, checkout, payments"
                      />
                    </div>
                    <div className="xl:col-span-2">
                      <textarea
                        value={caseDraft.defaultVariablesText}
                        onChange={(event) => setCaseDraft((current) => ({ ...current, defaultVariablesText: event.target.value }))}
                        className={`${INPUT_CLASS} min-h-36 resize-y font-mono text-xs`}
                        placeholder='{"baseUrl":"https://app.example.com"}'
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editorTarget === 'step' && selectedStep && (
              <div className="space-y-5">
                <div>
                  <p className={LABEL_CLASS}>Test Step</p>
                  <div className="mt-3 grid gap-4 xl:grid-cols-2">
                    <div className="xl:col-span-2">
                      <input
                        value={stepDraft.name}
                        onChange={(event) => setStepDraft((current) => ({ ...current, name: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="Step name"
                      />
                    </div>
                    <div>
                      <input
                        value={stepDraft.stepOrder}
                        onChange={(event) => setStepDraft((current) => ({ ...current, stepOrder: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <input
                        value={stepDraft.intent}
                        onChange={(event) => setStepDraft((current) => ({ ...current, intent: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="click"
                      />
                    </div>
                    <div className="xl:col-span-2">
                      <input
                        value={stepDraft.target}
                        onChange={(event) => setStepDraft((current) => ({ ...current, target: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="Target alias or element"
                      />
                    </div>
                    <div className="xl:col-span-2">
                      <textarea
                        value={stepDraft.expectedResult}
                        onChange={(event) => setStepDraft((current) => ({ ...current, expectedResult: event.target.value }))}
                        className={`${INPUT_CLASS} min-h-20 resize-y`}
                        placeholder="Expected result"
                      />
                    </div>
                    <div className="xl:col-span-2">
                      <input
                        value={stepDraft.tags}
                        onChange={(event) => setStepDraft((current) => ({ ...current, tags: event.target.value }))}
                        className={INPUT_CLASS}
                        placeholder="assertion, payment, critical"
                      />
                    </div>
                    <div className="xl:col-span-2 rounded-lg border border-[var(--color-line-default)] bg-[var(--color-surface-2)] px-3 py-2">
                      <label className="flex items-center gap-2 text-sm text-[var(--color-fg-default)]">
                        <input
                          type="checkbox"
                          checked={stepDraft.isEnabled}
                          onChange={(event) => setStepDraft((current) => ({ ...current, isEnabled: event.target.checked }))}
                        />
                        Step enabled
                      </label>
                    </div>
                    <div>
                      <p className={`${LABEL_CLASS} mb-2`}>Test Data</p>
                      <textarea
                        value={stepDraft.testDataText}
                        onChange={(event) => setStepDraft((current) => ({ ...current, testDataText: event.target.value }))}
                        className={`${INPUT_CLASS} min-h-44 resize-y font-mono text-xs`}
                        placeholder='{"username":"qa.user"}'
                      />
                    </div>
                    <div>
                      <p className={`${LABEL_CLASS} mb-2`}>Platform Bindings</p>
                      <textarea
                        value={stepDraft.bindingsText}
                        onChange={(event) => setStepDraft((current) => ({ ...current, bindingsText: event.target.value }))}
                        className={`${INPUT_CLASS} min-h-44 resize-y font-mono text-xs`}
                        placeholder='{"web":{"framework":"playwright","selector":"#login"}}'
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!selectedProject && !isLoading && (
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-fg-subtle)]">
                Create a project to start the test catalog.
              </div>
            )}
          </div>

          <div className="border-t border-[var(--color-line-subtle)] px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <Tag size={13} className="text-[var(--color-state-warning)]" />
              <span className="text-sm font-medium text-[var(--color-fg-default)]">Tag Ideas</span>
            </div>
            <div className="space-y-3">
              {tagCatalog.map((dimension) => (
                <div key={dimension.key}>
                  <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
                    {dimension.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dimension.values.map((value) => (
                      <button
                        key={value}
                        onClick={() => applyCatalogValue(dimension.key, value)}
                        className="rounded-full border border-[var(--color-line-default)] px-2.5 py-1 text-[10px] font-mono text-[var(--color-fg-subtle)] transition-colors hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg-default)]"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
