import { Module } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';
import { TenantQueryService } from './tenant-query.service';

@Module({
  providers: [TenantMiddleware, TenantQueryService],
  exports: [TenantMiddleware, TenantQueryService],
})
export class TenantModule {}
