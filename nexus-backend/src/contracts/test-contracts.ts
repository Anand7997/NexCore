/**
 * Test Management Contracts.
 *
 * Shared types, DTOs, and view interfaces for the test-management module.
 * These are consumed by both the controllers and frontend consumers.
 */

// ─── Literal union types ──────────────────────────────────────────────────────────────

export type TestPlatform = 'web' | 'api' | 'mobile' | 'desktop';
export type TestCaseStatus = 'draft' | 'active' | 'deprecated';
export type ExecutionStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TestExecutionResultStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'error';

// ─── View Interfaces ───────────────────────────────────────────────────────────────────

export interface ProjectView {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectModuleView {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description?: string | null;
  testingTypes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseView {
  id: string;
  tenantId: string;
  projectId: string;
  moduleId: string;
  name: string;
  description?: string | null;
  platform: TestPlatform;
  intentId?: string | null;
  config: Record<string, unknown>;
  steps: unknown[];
  expectedResult?: string | null;
  status: TestCaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TestSuiteView {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description?: string | null;
  platform?: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TestSuiteCaseView {
  id: string;
  suiteId: string;
  testCaseId: string;
  sortOrder: number;
  createdAt: string;
}

export interface TestExecutionView {
  id: string;
  tenantId: string;
  suiteId: string;
  projectId: string;
  name: string;
  status: ExecutionStatus;
  platform?: string | null;
  config?: Record<string, unknown> | null;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestExecutionResultView {
  id: string;
  tenantId: string;
  executionId: string;
  testCaseId: string;
  testCaseName: string;
  suiteId: string;
  status: TestExecutionResultStatus;
  platform?: string | null;
  intentId?: string | null;
  durationMs?: number | null;
  error?: string | null;
  screenshotUrls?: string[] | null;
  logs?: string | null;
  attempts: number;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

// ─── Create DTOs ───────────────────────────────────────────────────────────────────────

export interface CreateProjectDto {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateProjectModuleDto {
  name: string;
  description?: string;
  testingTypes?: string[];
}

export interface UpdateProjectModuleDto {
  name?: string;
  description?: string;
  testingTypes?: string[];
}

export interface CreateTestCaseDto {
  name: string;
  description?: string;
  platform: TestPlatform;
  moduleId: string;
  intentId?: string;
  config?: Record<string, unknown>;
  steps?: unknown[];
  expectedResult?: string;
  status?: TestCaseStatus;
}

export interface UpdateTestCaseDto {
  name?: string;
  description?: string;
  platform?: TestPlatform;
  moduleId?: string;
  intentId?: string;
  config?: Record<string, unknown>;
  steps?: unknown[];
  expectedResult?: string;
  status?: TestCaseStatus;
}

export interface CreateTestSuiteDto {
  name: string;
  description?: string;
  platform?: TestPlatform;
  config?: Record<string, unknown>;
}

export interface UpdateTestSuiteDto {
  name?: string;
  description?: string;
  platform?: TestPlatform;
  config?: Record<string, unknown>;
}

export interface AddCasesToSuiteDto {
  testCaseIds: string[];
}

// ─── Execution Commands & Events ───────────────────────────────────────────────────────

export interface StartExecutionCommand {
  suiteId: string;
  platform?: TestPlatform;
  config?: Record<string, unknown>;
}

export interface UpdateResultCommand {
  status: TestExecutionResultStatus;
  durationMs?: number;
  error?: string;
  screenshotUrls?: string[];
  logs?: string;
  attempts?: number;
}

export interface TestExecutionProgressEvent {
  executionId: string;
  testCaseId: string;
  status: TestExecutionResultStatus;
  durationMs?: number;
  error?: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  timestamp: string;
}

// ─── List query params ─────────────────────────────────────────────────────────────────

export interface ListTestCasesQuery {
  moduleId?: string;
  platform?: TestPlatform;
}
