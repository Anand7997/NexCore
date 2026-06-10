'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from './client';
import type {
  TestCase,
  TestCaseCreateInput,
  TestCaseUpdateInput,
  TestConfigurationTree,
  TestModule,
  TestModuleCreateInput,
  TestModuleUpdateInput,
  TestProject,
  TestProjectCreateInput,
  TestProjectListItem,
  TestProjectUpdateInput,
  TestStep,
  TestStepCreateInput,
  TestStepUpdateInput,
} from './types';

export const testConfigurationKeys = {
  all: ['test-configuration'] as const,
  tree: ['test-configuration', 'tree'] as const,
  projects: ['test-configuration', 'projects'] as const,
};

function withoutProject(tree: TestConfigurationTree | undefined, projectId: string) {
  if (!tree) return tree;
  return {
    ...tree,
    projects: tree.projects.filter((project) => project.id !== projectId),
  };
}

function withoutProjectListItem(projects: TestProjectListItem[] | undefined, projectId: string) {
  return projects?.filter((project) => project.id !== projectId);
}

const DELETE_VERIFY_ATTEMPTS = 6;
const DELETE_VERIFY_DELAY_MS = 1_000;

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

function isUpstreamUnavailable(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 502 &&
    error.message === 'upstream_unavailable'
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function confirmProjectDeleted(projectId: string) {
  for (let attempt = 0; attempt < DELETE_VERIFY_ATTEMPTS; attempt += 1) {
    await sleep(DELETE_VERIFY_DELAY_MS);
    try {
      await api.get<TestProject>(`/test-configuration/projects/${projectId}`);
    } catch (error) {
      if (isNotFound(error)) return true;
      if (isUpstreamUnavailable(error)) continue;
      return false;
    }
  }
  return false;
}

export function useTestConfigurationTree() {
  return useQuery({
    queryKey: testConfigurationKeys.tree,
    queryFn: () => api.get<TestConfigurationTree>('/test-configuration/tree'),
    staleTime: 10_000,
  });
}

export function useTestProjects(status?: string) {
  const query = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: [...testConfigurationKeys.projects, status],
    queryFn: () => api.get<TestProjectListItem[]>(`/test-configuration/projects/${query}`),
    staleTime: 10_000,
  });
}

export function useCreateTestProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TestProjectCreateInput) =>
      api.post<TestProject>('/test-configuration/projects/', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useUpdateTestProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TestProjectUpdateInput) =>
      api.put<TestProject>(`/test-configuration/projects/${projectId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useDeleteTestProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      try {
        await api.delete(`/test-configuration/projects/${projectId}`);
      } catch (error) {
        if (isNotFound(error)) return;
        if (isUpstreamUnavailable(error) && (await confirmProjectDeleted(projectId))) return;
        throw error;
      }
    },
    onMutate: async (projectId: string) => {
      await qc.cancelQueries({ queryKey: testConfigurationKeys.all });
      const previousTree = qc.getQueryData<TestConfigurationTree>(testConfigurationKeys.tree);
      const previousProjectLists = qc.getQueriesData<TestProjectListItem[]>({
        queryKey: testConfigurationKeys.projects,
      });

      qc.setQueryData<TestConfigurationTree>(
        testConfigurationKeys.tree,
        (current) => withoutProject(current, projectId),
      );
      previousProjectLists.forEach(([queryKey]) => {
        qc.setQueryData<TestProjectListItem[]>(
          queryKey,
          (current) => withoutProjectListItem(current, projectId),
        );
      });

      return { previousTree, previousProjectLists };
    },
    onError: (_error, _projectId, context) => {
      if (!context) return;
      qc.setQueryData(testConfigurationKeys.tree, context.previousTree);
      context.previousProjectLists.forEach(([queryKey, data]) => {
        qc.setQueryData(queryKey, data);
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useCreateTestModule(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TestModuleCreateInput) =>
      api.post<TestModule>(`/test-configuration/projects/${projectId}/modules/`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useUpdateTestModule(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TestModuleUpdateInput) =>
      api.put<TestModule>(`/test-configuration/modules/${moduleId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useDeleteTestModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) => api.delete(`/test-configuration/modules/${moduleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useCreateTestCase(moduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TestCaseCreateInput) =>
      api.post<TestCase>(`/test-configuration/modules/${moduleId}/cases/`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useUpdateTestCase(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TestCaseUpdateInput) =>
      api.put<TestCase>(`/test-configuration/cases/${caseId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useDeleteTestCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.delete(`/test-configuration/cases/${caseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useCreateTestStep(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TestStepCreateInput) =>
      api.post<TestStep>(`/test-configuration/cases/${caseId}/steps/`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useUpdateTestStep(stepId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TestStepUpdateInput) =>
      api.put<TestStep>(`/test-configuration/steps/${stepId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useUpdateAnyTestStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, input }: { stepId: string; input: TestStepUpdateInput }) =>
      api.put<TestStep>(`/test-configuration/steps/${stepId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}

export function useDeleteTestStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stepId: string) => api.delete(`/test-configuration/steps/${stepId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testConfigurationKeys.all });
    },
  });
}
