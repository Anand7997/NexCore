import { AuditRetentionService } from './audit-retention.service';

describe('AuditRetentionService', () => {
  let service: AuditRetentionService;
  let mockLogger: any;
  let mockConfig: any;
  let mockS3: any;
  let mockDb: any;
  let mockDrizzle: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    mockConfig = {
      auditArchiveBucket: 'test-bucket',
    };

    mockS3 = {
      putObject: jest.fn().mockResolvedValue(undefined),
    };

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn(),
      delete: jest.fn().mockReturnThis(),
      transaction: jest.fn(async (cb) => cb(mockDb)),
    };

    mockDrizzle = {
      db: mockDb,
    };

    service = new AuditRetentionService(mockDrizzle, mockS3, mockConfig, mockLogger);
  });

  test('should skip archiving if no old logs exist', async () => {
    // Stub select returning empty logs list
    mockDb.where.mockResolvedValue([]);

    service.setRetentionPolicy({
      tenantId: 'tenant-1',
      retentionDays: 30,
      archiveEnabled: true,
    });

    await service.archiveOldAuditLogs();

    expect(mockS3.putObject).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.any(Object),
      'No audit logs to archive',
    );
  });

  test('should successfully convert, compress, upload and delete old audit logs', async () => {
    const oldLogs = [
      {
        id: '1',
        tenantId: 'tenant-1',
        actorId: 'user-1',
        action: 'user.login',
        resourceType: 'auth',
        resourceId: 'res-1',
        createdAt: new Date(),
      },
    ];

    // Stub select returning logs
    mockDb.where.mockResolvedValue(oldLogs);

    service.setRetentionPolicy({
      tenantId: 'tenant-1',
      retentionDays: 30,
      archiveEnabled: true,
      archiveDestination: 's3://custom-bucket',
    });

    await service.archiveOldAuditLogs();

    // Verify S3 upload
    expect(mockS3.putObject).toHaveBeenCalledWith(
      'custom-bucket',
      expect.stringMatching(/^audit-logs\/tenant-1\/tenant-1_archive_\d+\.csv\.gz$/),
      expect.any(Buffer),
      'application/gzip',
    );

    // Verify DB delete is executed inside transaction
    expect(mockDb.delete).toHaveBeenCalled();
  });
});
