import { integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { uniqueIndex } from 'drizzle-orm/pg-core';

// TypeScript-owned control-plane schemas. Python workers may only write back
// through NestJS APIs; they do not mutate these tables directly.

export const tenants = pgTable('tenant_tenants', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workflows = pgTable('workflow_definitions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const executionRuns = pgTable('execution_runs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  workflowId: varchar('workflow_id', { length: 36 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('queued'),
  platform: varchar('platform', { length: 32 }).notNull().default('web'),
  variables: jsonb('variables').$type<Record<string, unknown>>().notNull().default({}),
  temporalWorkflowId: varchar('temporal_workflow_id', { length: 255 }),
  temporalRunId: varchar('temporal_run_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});

export const runtimeAgents = pgTable('runtime_agents', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('idle'),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  activeLeases: integer('active_leases').notNull().default(0),
  maxConcurrency: integer('max_concurrency').notNull().default(1),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const runtimeLeases = pgTable('runtime_leases', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  executionId: varchar('execution_id', { length: 36 }).notNull(),
  agentId: varchar('agent_id', { length: 36 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  acquiredAt: timestamp('acquired_at').defaultNow().notNull(),
  releasedAt: timestamp('released_at'),
});

export const aiJobs = pgTable('ai_jobs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  executionId: varchar('execution_id', { length: 36 }).notNull(),
  jobType: varchar('job_type', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('queued'),
  evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb('result').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const auditLogs = pgTable('audit_logs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  actorId: varchar('actor_id', { length: 255 }).notNull(),
  action: varchar('action', { length: 120 }).notNull(),
  resourceType: varchar('resource_type', { length: 80 }).notNull(),
  resourceId: varchar('resource_id', { length: 120 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Test Management ──────────────────────────────────────────────────────────────────

export const projects = pgTable('test_projects', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const projectModules = pgTable(
  'test_project_modules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    projectId: varchar('project_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    testingTypes: jsonb('testing_types').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    projectModuleUnique: uniqueIndex('test_project_modules_pid_name_uidx').on(t.projectId, t.name),
  }),
);

export const testCases = pgTable('test_cases', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  projectId: varchar('project_id', { length: 36 }).notNull(),
  moduleId: varchar('module_id', { length: 36 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  platform: varchar('platform', { length: 32 }).notNull(),
  intentId: varchar('intent_id', { length: 64 }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  steps: jsonb('steps').$type<unknown[]>().notNull().default([]),
  expectedResult: text('expected_result'),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const testSuites = pgTable('test_suites', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  projectId: varchar('project_id', { length: 36 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  platform: varchar('platform', { length: 32 }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const testSuiteCases = pgTable(
  'test_suite_cases',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    suiteId: varchar('suite_id', { length: 36 }).notNull(),
    testCaseId: varchar('test_case_id', { length: 36 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    suiteCaseUnique: uniqueIndex('test_suite_cases_sid_tcid_uidx').on(t.suiteId, t.testCaseId),
  }),
);

export const testExecutions = pgTable('test_executions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  suiteId: varchar('suite_id', { length: 36 }).notNull(),
  projectId: varchar('project_id', { length: 36 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  platform: varchar('platform', { length: 32 }),
  config: jsonb('config').$type<Record<string, unknown>>(),
  totalTests: integer('total_tests').notNull().default(0),
  passedTests: integer('passed_tests').notNull().default(0),
  failedTests: integer('failed_tests').notNull().default(0),
  skippedTests: integer('skipped_tests').notNull().default(0),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const testExecutionResults = pgTable('test_execution_results', {
  id: varchar('id', { length: 36 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 36 }).notNull(),
  executionId: varchar('execution_id', { length: 36 }).notNull(),
  testCaseId: varchar('test_case_id', { length: 36 }).notNull(),
  testCaseName: varchar('test_case_name', { length: 255 }).notNull(),
  suiteId: varchar('suite_id', { length: 36 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  platform: varchar('platform', { length: 32 }),
  intentId: varchar('intent_id', { length: 64 }),
  durationMs: integer('duration_ms'),
  error: text('error'),
  screenshotUrls: jsonb('screenshot_urls').$type<string[]>(),
  logs: text('logs'),
  attempts: integer('attempts').notNull().default(0),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── DAG execution node tracking ─────────────────────────────────────────────
// Mirrors Python ExecutionNodeModel — one row per workflow node per execution.
// Temporal activities own all writes; Python workers must not mutate these rows.

export const executionNodes = pgTable(
  'execution_nodes',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    executionId: varchar('execution_id', { length: 36 }).notNull(),
    nodeKey: varchar('node_key', { length: 255 }).notNull(),
    nodeLabel: varchar('node_label', { length: 255 }).notNull().default(''),
    nodeType: varchar('node_type', { length: 64 }).notNull().default('action'),
    // created → queued → running → completed | failed | skipped | retrying
    status: varchar('status', { length: 32 }).notNull().default('created'),
    attemptCount: integer('attempt_count').notNull().default(0),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    durationMs: integer('duration_ms'),
    output: jsonb('output').$type<Record<string, unknown>>(),
    error: varchar('error', { length: 2048 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    executionNodeUnique: uniqueIndex('execution_nodes_exec_key_uidx').on(
      t.executionId,
      t.nodeKey,
    ),
  }),
);

// ─── DAG execution timeline ────────────────────────────────────────────────────
// Append-only audit trail for each phase transition of each node.
// Used for debugging, replay analysis, and the frontend timeline view.

export const executionTimeline = pgTable('execution_timeline', {
  id: varchar('id', { length: 36 }).primaryKey(),
  executionId: varchar('execution_id', { length: 36 }).notNull(),
  nodeKey: varchar('node_key', { length: 255 }).notNull(),
  phase: varchar('phase', { length: 64 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
