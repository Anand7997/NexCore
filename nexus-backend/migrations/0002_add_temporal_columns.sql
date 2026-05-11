-- Phase 4: Add Temporal workflow tracking columns to execution_runs
-- Run with: npm run db:migrate  (drizzle-kit migrate)
--
-- These columns link each execution record to its Temporal workflow so the
-- API can signal, query, and replay workflows by workflow ID / run ID.

ALTER TABLE execution_runs
  ADD COLUMN IF NOT EXISTS temporal_workflow_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS temporal_run_id      VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_execution_runs_temporal_workflow_id
  ON execution_runs (temporal_workflow_id);
