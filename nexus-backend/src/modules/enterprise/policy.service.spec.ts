import { PolicyService } from './policy.service';

describe('PolicyService', () => {
  let service: PolicyService;
  let mockLogger: any;
  let mockDb: any;
  let mockDrizzle: any;

  const mockPrincipal = {
    userId: 'user-123',
    tenantId: 'tenant-1',
    roles: ['qa-engineer'],
  } as any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn(),
    };

    mockDrizzle = {
      db: mockDb,
    };

    service = new PolicyService(mockDrizzle, mockLogger);
  });

  test('should allow execution if within concurrent limits', async () => {
    mockDb.where.mockResolvedValue([{ count: 5 }]); // current active executions is 5

    service.setExecutionPolicy({
      tenantId: 'tenant-1',
      allowedPlatforms: ['web'],
      requiresApproval: false,
      approverRoles: [],
      concurrentExecutionLimit: 10,
    });

    const violation = await service.checkExecutionPolicy('tenant-1', 'web', mockPrincipal);
    expect(violation).toBeNull();
  });

  test('should deny execution if concurrent execution limit is exceeded', async () => {
    mockDb.where.mockResolvedValue([{ count: 12 }]); // current active executions is 12 (limit is 10)

    service.setExecutionPolicy({
      tenantId: 'tenant-1',
      allowedPlatforms: ['web'],
      requiresApproval: false,
      approverRoles: [],
      concurrentExecutionLimit: 10,
    });

    const violation = await service.checkExecutionPolicy('tenant-1', 'web', mockPrincipal);
    expect(violation).not.toBeNull();
    expect(violation?.reason).toContain('Concurrent execution limit of 10 exceeded');
  });

  test('should deny execution if platform is not allowed', async () => {
    service.setExecutionPolicy({
      tenantId: 'tenant-1',
      allowedPlatforms: ['web'],
      requiresApproval: false,
      approverRoles: [],
      concurrentExecutionLimit: 10,
    });

    const violation = await service.checkExecutionPolicy('tenant-1', 'android', mockPrincipal);
    expect(violation).not.toBeNull();
    expect(violation?.reason).toContain('Platform android is not allowed');
  });

  test('should enforce telemetry CPU/Memory quotas from active leases in DB', async () => {
    // Stub active leases in DB
    mockDb.where.mockResolvedValue([
      { metadata: { cpu: 4, memory: 8192 } },
      { metadata: { cpu: 8, memory: 16384 } },
    ]); // Total CPU: 12, Total Memory: 24576

    service.setRuntimeControlPolicy({
      tenantId: 'tenant-1',
      maxConcurrentAgentsPerTenant: 10,
      cpuQuota: 10, // quota is 10, total is 12 -> exceed!
      memoryQuota: 32768,
    });

    const violation = await service.checkRuntimeControlPolicy('tenant-1', 2);
    expect(violation).not.toBeNull();
    expect(violation?.reason).toContain('CPU quota of 10 exceeded');
  });
});
