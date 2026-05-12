/**
 * Temporal worker process.
 *
 * Run with:
 *   npm run start:worker
 *
 * Registers:
 *  - executionWorkflow   (legacy single-agent orchestration)
 *  - dagExecutionWorkflow (Phase 4: durable DAG-level orchestration)
 *
 * Environment variables (same as NestJS API):
 *   DATABASE_URL        – PostgreSQL connection string
 *   TEMPORAL_ADDRESS    – Temporal server address (default: localhost:7233)
 *   TEMPORAL_NAMESPACE  – Temporal namespace       (default: default)
 */
import 'reflect-metadata';
import path from 'path';
import { Worker, NativeConnection } from '@temporalio/worker';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './infrastructure/postgres/schema';
import { createExecutionActivities } from './temporal/activities/execution.activities';
import { createDagActivities } from './temporal/activities/dag.activities';
import { EXECUTION_TASK_QUEUE } from './infrastructure/temporal/temporal.constants';

async function run(): Promise<void> {
  const temporalAddress = process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';
  const temporalNamespace = process.env['TEMPORAL_NAMESPACE'] ?? 'default';
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const db = drizzle(pool, { schema });

  const connection = await NativeConnection.connect({ address: temporalAddress });

  const worker = await Worker.create({
    connection,
    namespace: temporalNamespace,
    taskQueue: EXECUTION_TASK_QUEUE,
    // Point at the workflows folder so both executionWorkflow and
    // dagExecutionWorkflow are picked up from the compiled bundle.
    workflowsPath: path.resolve(__dirname, './temporal/workflows'),
    activities: {
      ...createExecutionActivities(db),
      ...createDagActivities(db),
    },
  });

  console.log(
    `[temporal-worker] Connected to ${temporalAddress} (namespace=${temporalNamespace}), polling queue "${EXECUTION_TASK_QUEUE}"`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[temporal-worker] ${signal} received – shutting down…`);
    worker.shutdown();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await worker.run();
}

run().catch((err) => {
  console.error('[temporal-worker] Fatal error', err);
  process.exit(1);
});
