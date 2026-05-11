import { pgTable, varchar, timestamp, text } from 'drizzle-orm/pg-core';

// Phase 1: minimal tenant table.
// Phase 2 will expand this with full domain schemas:
// identity_*, project_*, workflow_*, execution_*, runtime_*, artifact_*, audit_*

export const tenants = pgTable('tenant_tenants', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
