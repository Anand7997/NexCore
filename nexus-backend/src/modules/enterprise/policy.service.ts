import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleService } from '../../infrastructure/postgres/drizzle.service';
import { executionRuns, runtimeLeases } from '../../infrastructure/postgres/schema';
import type { Principal } from '../../common/auth/principal.decorator';

export interface ExecutionPolicy {
  tenantId: string;
  allowedPlatforms: string[];
  requiresApproval: boolean;
  approverRoles: string[];
  budgetLimit?: number; // Max execution cost in USD
  concurrentExecutionLimit?: number;
}

export interface ArtifactAccessPolicy {
  tenantId: string;
  encryptionAtRest: boolean;
  ttlDays: number;
  accessLoggingEnabled: boolean;
  allowedRoles: string[];
}

export interface AiInvestigationPolicy {
  tenantId: string;
  piiMaskingEnabled: boolean;
  requiresApproval: boolean;
  approverRoles: string[];
  maxCostPerJob?: number;
  sensitiveDataPatterns: string[]; // Regex patterns for PII/sensitive data
}

export interface RuntimeControlPolicy {
  tenantId: string;
  maxConcurrentAgentsPerTenant: number;
  cpuQuota?: number; // CPU cores
  memoryQuota?: number; // MB
  storageQuota?: number; // GB
}

export interface PolicyViolation {
  policyType: string;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Policy enforcement service for pre-execution checks, artifact access,
 * AI investigation controls, and runtime resource quotas.
 *
 * Supports integration with OPA for Rego policy evaluation.
 */
@Injectable()
export class PolicyService {
  private executionPolicies: Map<string, ExecutionPolicy> = new Map();
  private artifactPolicies: Map<string, ArtifactAccessPolicy> = new Map();
  private aiPolicies: Map<string, AiInvestigationPolicy> = new Map();
  private runtimePolicies: Map<string, RuntimeControlPolicy> = new Map();

  constructor(
    private readonly drizzle: DrizzleService,
    @InjectPinoLogger(PolicyService.name)
    private readonly logger: PinoLogger,
  ) {
    this.initializeDefaultPolicies();
  }

  private initializeDefaultPolicies(): void {
    // Default execution policy
    this.executionPolicies.set('*', {
      tenantId: '*',
      allowedPlatforms: ['web', 'android', 'ios', 'desktop', 'api', 'db'],
      requiresApproval: false,
      approverRoles: ['admin', 'qa-lead'],
      concurrentExecutionLimit: 100,
    });

    // Default artifact access policy
    this.artifactPolicies.set('*', {
      tenantId: '*',
      encryptionAtRest: true,
      ttlDays: 30,
      accessLoggingEnabled: true,
      allowedRoles: ['admin', 'qa-engineer', 'developer'],
    });

    // Default AI investigation policy
    this.aiPolicies.set('*', {
      tenantId: '*',
      piiMaskingEnabled: true,
      requiresApproval: false,
      approverRoles: ['admin'],
      sensitiveDataPatterns: [
        '\\b\\d{3}-\\d{2}-\\d{4}\\b', // SSN
        '\\b\\d{16}\\b', // Credit card
        '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', // Email
      ],
    });

    // Default runtime control policy
    this.runtimePolicies.set('*', {
      tenantId: '*',
      maxConcurrentAgentsPerTenant: 50,
      cpuQuota: 16,
      memoryQuota: 32768, // 32GB
      storageQuota: 100, // 100GB
    });
  }

  /**
   * Check if an execution is allowed before starting.
   */
  async checkExecutionPolicy(
    tenantId: string,
    platform: string,
    principal: Principal,
  ): Promise<PolicyViolation | null> {
    const policy = this.executionPolicies.get(tenantId) ?? this.executionPolicies.get('*')!;

    if (!policy.allowedPlatforms.includes(platform)) {
      return {
        policyType: 'execution',
        reason: `Platform ${platform} is not allowed for tenant ${tenantId}`,
        metadata: { allowedPlatforms: policy.allowedPlatforms },
      };
    }

    if (policy.requiresApproval && !this.hasApproverRole(principal, policy.approverRoles)) {
      return {
        policyType: 'execution',
        reason: 'Execution requires approval from authorized role',
        metadata: { requiredRoles: policy.approverRoles },
      };
    }

    // Check concurrent execution limits from DB
    const concurrentLimit = policy.concurrentExecutionLimit ?? 100;
    try {
      const activeRuns = await this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(executionRuns)
        .where(
          and(
            eq(executionRuns.tenantId, tenantId),
            inArray(executionRuns.status, ['queued', 'running'])
          )
        );

      const activeCount = activeRuns[0]?.count ?? 0;
      if (activeCount >= concurrentLimit) {
        return {
          policyType: 'execution',
          reason: `Concurrent execution limit of ${concurrentLimit} exceeded (current active: ${activeCount})`,
          metadata: { limit: concurrentLimit, current: activeCount },
        };
      }
    } catch (err) {
      this.logger.error({ err, tenantId }, 'Failed to check concurrent execution limit from database');
    }

    return null;
  }

  /**
   * Check if artifact access is allowed.
   */
  async checkArtifactAccessPolicy(
    tenantId: string,
    principal: Principal,
  ): Promise<PolicyViolation | null> {
    const policy = this.artifactPolicies.get(tenantId) ?? this.artifactPolicies.get('*')!;

    if (!this.hasAnyRole(principal, policy.allowedRoles)) {
      return {
        policyType: 'artifact_access',
        reason: 'User does not have permission to access artifacts',
        metadata: { allowedRoles: policy.allowedRoles },
      };
    }

    return null;
  }

  /**
   * Check if AI investigation is allowed and apply PII masking if needed.
   */
  async checkAiInvestigationPolicy(
    tenantId: string,
    principal: Principal,
    evidenceData: string,
  ): Promise<{ allowed: boolean; violation?: PolicyViolation; maskedData?: string }> {
    const policy = this.aiPolicies.get(tenantId) ?? this.aiPolicies.get('*')!;

    if (policy.requiresApproval && !this.hasApproverRole(principal, policy.approverRoles)) {
      return {
        allowed: false,
        violation: {
          policyType: 'ai_investigation',
          reason: 'AI investigation requires approval',
          metadata: { requiredRoles: policy.approverRoles },
        },
      };
    }

    let maskedData = evidenceData;
    if (policy.piiMaskingEnabled) {
      maskedData = this.maskSensitiveData(evidenceData, policy.sensitiveDataPatterns);
    }

    return { allowed: true, maskedData };
  }

  /**
   * Check runtime resource quota for tenant.
   */
  async checkRuntimeControlPolicy(
    tenantId: string,
    currentAgentCount: number,
  ): Promise<PolicyViolation | null> {
    const policy = this.runtimePolicies.get(tenantId) ?? this.runtimePolicies.get('*')!;

    if (currentAgentCount >= policy.maxConcurrentAgentsPerTenant) {
      return {
        policyType: 'runtime_control',
        reason: 'Maximum concurrent agents limit reached',
        metadata: {
          limit: policy.maxConcurrentAgentsPerTenant,
          current: currentAgentCount,
        },
      };
    }

    try {
      // Query active runtime leases for real-time CPU/Memory telemetry aggregation
      const activeLeasesResult = await this.drizzle.db
        .select()
        .from(runtimeLeases)
        .where(
          and(
            eq(runtimeLeases.tenantId, tenantId),
            eq(runtimeLeases.status, 'active')
          )
        );

      let totalCpu = 0;
      let totalMemory = 0;

      for (const lease of activeLeasesResult) {
        const leaseMetadata = (lease.metadata ?? {}) as Record<string, unknown>;
        totalCpu += Number(leaseMetadata.cpu ?? 1); // fallback to 1 core per lease
        totalMemory += Number(leaseMetadata.memory ?? 2048); // fallback to 2GB per lease
      }

      if (policy.cpuQuota && totalCpu >= policy.cpuQuota) {
        return {
          policyType: 'runtime_control',
          reason: `CPU quota of ${policy.cpuQuota} exceeded (current total CPU allocation: ${totalCpu} cores)`,
          metadata: { limit: policy.cpuQuota, current: totalCpu },
        };
      }

      if (policy.memoryQuota && totalMemory >= policy.memoryQuota) {
        return {
          policyType: 'runtime_control',
          reason: `Memory quota of ${policy.memoryQuota}MB exceeded (current total Memory allocation: ${totalMemory}MB)`,
          metadata: { limit: policy.memoryQuota, current: totalMemory },
        };
      }
    } catch (err) {
      this.logger.error({ err, tenantId }, 'Failed to check runtime telemetry quota from database');
    }

    return null;
  }

  /**
   * Set custom execution policy for a tenant.
   */
  setExecutionPolicy(policy: ExecutionPolicy): void {
    this.executionPolicies.set(policy.tenantId, policy);
    this.logger.info({ tenantId: policy.tenantId }, 'Execution policy updated');
  }

  /**
   * Set custom artifact access policy for a tenant.
   */
  setArtifactAccessPolicy(policy: ArtifactAccessPolicy): void {
    this.artifactPolicies.set(policy.tenantId, policy);
    this.logger.info({ tenantId: policy.tenantId }, 'Artifact access policy updated');
  }

  /**
   * Set custom AI investigation policy for a tenant.
   */
  setAiInvestigationPolicy(policy: AiInvestigationPolicy): void {
    this.aiPolicies.set(policy.tenantId, policy);
    this.logger.info({ tenantId: policy.tenantId }, 'AI investigation policy updated');
  }

  /**
   * Set custom runtime control policy for a tenant.
   */
  setRuntimeControlPolicy(policy: RuntimeControlPolicy): void {
    this.runtimePolicies.set(policy.tenantId, policy);
    this.logger.info({ tenantId: policy.tenantId }, 'Runtime control policy updated');
  }

  private hasApproverRole(principal: Principal, approverRoles: string[]): boolean {
    return approverRoles.some((role) => principal.roles.includes(role));
  }

  private hasAnyRole(principal: Principal, allowedRoles: string[]): boolean {
    return allowedRoles.some((role) => principal.roles.includes(role));
  }

  private maskSensitiveData(data: string, patterns: string[]): string {
    let masked = data;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'g');
      masked = masked.replace(regex, '[REDACTED]');
    }
    return masked;
  }
}
