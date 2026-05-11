import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { eq, and, SQL } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { Principal } from '../auth/principal.decorator';

/**
 * Request-scoped service that enforces tenant isolation in all DB queries.
 * Automatically injects tenant filters based on the authenticated user.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantQueryService {
  private readonly tenantId: string;

  constructor(@Inject(REQUEST) private readonly request: Request & { user?: Principal }) {
    // Extract tenantId from authenticated JWT principal
    this.tenantId = this.request.user?.tenantId ?? '';
    if (!this.tenantId) {
      throw new Error('TenantQueryService: No tenantId found in request context');
    }
  }

  /**
   * Get the current tenant ID from the request context.
   */
  getCurrentTenantId(): string {
    return this.tenantId;
  }

  /**
   * Create a tenant-scoped WHERE clause for a table with a tenantId column.
   * Use this helper to automatically enforce tenant isolation.
   *
   * @example
   * const where = tenantQuery.tenantScope(workflows, eq(workflows.status, 'active'));
   * const result = await db.select().from(workflows).where(where);
   */
  tenantScope<T extends PgTable>(
    table: T & { tenantId?: unknown },
    ...conditions: (SQL<unknown> | undefined)[]
  ): SQL<unknown> {
    if (!('tenantId' in table)) {
      const tableName = (table as any)[Symbol.for('drizzle:Name')] ?? 'unknown';
      throw new Error(
        `TenantQueryService: Table ${tableName} does not have a tenantId column`,
      );
    }

    const tenantFilter = eq(table.tenantId as any, this.tenantId);
    const validConditions = conditions.filter((c): c is SQL<unknown> => c !== undefined);

    return validConditions.length > 0
      ? and(tenantFilter, ...validConditions)!
      : tenantFilter;
  }

  /**
   * Validate that an entity belongs to the current tenant.
   * Throws an error if the tenantId does not match.
   */
  validateTenantOwnership(entityTenantId: string | null | undefined, entityType: string): void {
    if (entityTenantId !== this.tenantId) {
      throw new Error(
        `TenantQueryService: Cross-tenant access denied. ${entityType} belongs to tenant ${entityTenantId}, but current user is in tenant ${this.tenantId}`,
      );
    }
  }

  /**
   * Create a tenant-scoped INSERT payload by automatically adding tenantId.
   *
   * @example
   * const payload = tenantQuery.tenantInsert({ name: 'Test Workflow', status: 'draft' });
   * await db.insert(workflows).values(payload);
   */
  tenantInsert<T extends Record<string, unknown>>(payload: T): T & { tenantId: string } {
    return { ...payload, tenantId: this.tenantId };
  }
}
