import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantQueryService } from './tenant-query.service';
import { workflows, executionRuns } from '../../infrastructure/postgres/schema';
import { eq } from 'drizzle-orm';

describe('TenantQueryService', () => {
  let service: TenantQueryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantQueryService,
        {
          provide: REQUEST,
          useValue: {
            user: {
              sub: 'user-123',
              email: 'test@example.com',
              tenantId: 'tenant-abc',
              roles: ['admin'],
            },
          },
        },
      ],
    }).compile();

    service = await module.resolve<TenantQueryService>(TenantQueryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return current tenant ID', () => {
    expect(service.getCurrentTenantId()).toBe('tenant-abc');
  });

  it('should create tenant-scoped WHERE clause', () => {
    const where = service.tenantScope(workflows, eq(workflows.status, 'active'));
    expect(where).toBeDefined();
  });

  it('should create tenant-scoped INSERT payload', () => {
    const payload = service.tenantInsert({ name: 'Test Workflow', status: 'draft' });
    expect(payload).toEqual({
      name: 'Test Workflow',
      status: 'draft',
      tenantId: 'tenant-abc',
    });
  });

  it('should validate tenant ownership for matching tenant', () => {
    expect(() => {
      service.validateTenantOwnership('tenant-abc', 'Workflow');
    }).not.toThrow();
  });

  it('should throw error for cross-tenant access', () => {
    expect(() => {
      service.validateTenantOwnership('tenant-xyz', 'Workflow');
    }).toThrow(/Cross-tenant access denied/);
  });

  it('should throw error if table does not have tenantId column', () => {
    const mockTable = {} as any;
    expect(() => {
      service.tenantScope(mockTable);
    }).toThrow(/does not have a tenantId column/);
  });
});
