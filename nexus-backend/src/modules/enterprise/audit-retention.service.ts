import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DrizzleService } from '../../infrastructure/postgres/drizzle.service';
import { auditLogs } from '../../infrastructure/postgres/schema';
import { and, eq, lt, gte, lte } from 'drizzle-orm';

export interface AuditRetentionPolicy {
  tenantId: string;
  retentionDays: number;
  archiveEnabled: boolean;
  archiveDestination?: string; // S3/MinIO bucket path
}

export interface AuditExportRequest {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  format: 'json' | 'csv';
  filters?: {
    actorId?: string;
    action?: string;
    resourceType?: string;
  };
}

export interface ComplianceReport {
  tenantId: string;
  reportType: 'pci' | 'soc2' | 'hipaa' | 'gdpr';
  period: { start: Date; end: Date };
  totalEvents: number;
  criticalEvents: number;
  summary: Record<string, unknown>;
}

/**
 * Audit retention, archival, and export service.
 * Manages audit log lifecycle and compliance reporting.
 */
@Injectable()
export class AuditRetentionService {
  private readonly defaultRetentionDays = 365;
  private readonly policies: Map<string, AuditRetentionPolicy> = new Map();

  constructor(
    private readonly drizzle: DrizzleService,
    @InjectPinoLogger(AuditRetentionService.name)
    private readonly logger: PinoLogger,
  ) {
    // Load default policy
    this.policies.set('*', {
      tenantId: '*',
      retentionDays: this.defaultRetentionDays,
      archiveEnabled: true,
      archiveDestination: process.env.AUDIT_ARCHIVE_BUCKET ?? 's3://nexus-audit-archive',
    });
  }

  /**
   * Set retention policy for a specific tenant.
   */
  setRetentionPolicy(policy: AuditRetentionPolicy): void {
    this.policies.set(policy.tenantId, policy);
    this.logger.info({ tenantId: policy.tenantId, retentionDays: policy.retentionDays }, 'Audit retention policy updated');
  }

  /**
   * Get retention policy for a tenant (falls back to default).
   */
  getRetentionPolicy(tenantId: string): AuditRetentionPolicy {
    return this.policies.get(tenantId) ?? this.policies.get('*')!;
  }

  /**
   * Daily cron job to archive old audit logs.
   * Runs at 2:00 AM daily.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async archiveOldAuditLogs(): Promise<void> {
    this.logger.info('Starting daily audit log archival');

    for (const [tenantId, policy] of this.policies) {
      if (!policy.archiveEnabled || tenantId === '*') continue;

      try {
        await this.archiveTenantAuditLogs(tenantId, policy);
      } catch (err) {
        this.logger.error({ err, tenantId }, 'Failed to archive audit logs');
      }
    }

    this.logger.info('Audit log archival completed');
  }

  /**
   * Archive audit logs for a specific tenant.
   */
  private async archiveTenantAuditLogs(
    tenantId: string,
    policy: AuditRetentionPolicy,
  ): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    const db = this.drizzle.db;

    // Query old audit logs
    const oldLogs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), lt(auditLogs.createdAt, cutoffDate)));

    if (oldLogs.length === 0) {
      this.logger.debug({ tenantId }, 'No audit logs to archive');
      return;
    }

    // TODO: Upload to S3/MinIO (implementation depends on storage backend)
    // For now, just log the archive intent
    this.logger.info(
      { tenantId, count: oldLogs.length, destination: policy.archiveDestination },
      'Would archive audit logs (S3/MinIO upload not implemented)',
    );

    // After successful upload, delete archived logs from DB
    // await db.delete(auditLogs).where(
    //   and(
    //     eq(auditLogs.tenantId, tenantId),
    //     lt(auditLogs.createdAt, cutoffDate)
    //   )
    // );
  }

  /**
   * Export audit logs for a date range in JSON or CSV format.
   */
  async exportAuditLogs(request: AuditExportRequest): Promise<string> {
    const db = this.drizzle.db;

    let conditions = [
      eq(auditLogs.tenantId, request.tenantId),
      gte(auditLogs.createdAt, request.startDate),
      lte(auditLogs.createdAt, request.endDate),
    ];

    if (request.filters?.actorId) {
      conditions.push(eq(auditLogs.actorId, request.filters.actorId));
    }
    if (request.filters?.action) {
      conditions.push(eq(auditLogs.action, request.filters.action));
    }
    if (request.filters?.resourceType) {
      conditions.push(eq(auditLogs.resourceType, request.filters.resourceType));
    }

    const logs = await db.select().from(auditLogs).where(and(...conditions));

    if (request.format === 'csv') {
      return this.exportToCsv(logs);
    } else {
      return JSON.stringify(logs, null, 2);
    }
  }

  /**
   * Generate compliance report for a tenant.
   */
  async generateComplianceReport(
    tenantId: string,
    reportType: 'pci' | 'soc2' | 'hipaa' | 'gdpr',
    startDate: Date,
    endDate: Date,
  ): Promise<ComplianceReport> {
    const db = this.drizzle.db;

    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          gte(auditLogs.createdAt, startDate),
          lte(auditLogs.createdAt, endDate),
        ),
      );

    // Critical events: admin actions, data access, deletions
    const criticalActions = new Set(['admin.login', 'data.delete', 'data.export', 'user.delete']);
    const criticalEvents = logs.filter((log) => criticalActions.has(log.action));

    return {
      tenantId,
      reportType,
      period: { start: startDate, end: endDate },
      totalEvents: logs.length,
      criticalEvents: criticalEvents.length,
      summary: {
        actionBreakdown: this.groupByAction(logs),
        criticalActionBreakdown: this.groupByAction(criticalEvents),
        topActors: this.getTopActors(logs, 10),
      },
    };
  }

  private exportToCsv(logs: any[]): string {
    if (logs.length === 0) return '';

    const headers = ['id', 'tenantId', 'actorId', 'action', 'resourceType', 'resourceId', 'createdAt'];
    const rows = logs.map((log) =>
      headers.map((h) => JSON.stringify(log[h] ?? '')).join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private groupByAction(logs: any[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const log of logs) {
      groups[log.action] = (groups[log.action] ?? 0) + 1;
    }
    return groups;
  }

  private getTopActors(logs: any[], limit: number): Array<{ actorId: string; count: number }> {
    const counts: Record<string, number> = {};
    for (const log of logs) {
      counts[log.actorId] = (counts[log.actorId] ?? 0) + 1;
    }

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([actorId, count]) => ({ actorId, count }));
  }
}
