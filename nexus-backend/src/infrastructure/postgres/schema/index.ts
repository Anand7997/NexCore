import { integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

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
