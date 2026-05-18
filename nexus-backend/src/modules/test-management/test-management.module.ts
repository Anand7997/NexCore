import { Module } from '@nestjs/common';
import { TestManagementService } from './test-management.service';
import { TestExecutionService } from './test-execution.service';
import { TestManagementController } from './test-management.controller';
import { TestExecutionController } from './test-execution.controller';

@Module({
  controllers: [TestManagementController, TestExecutionController],
  providers: [TestManagementService, TestExecutionService],
  exports: [TestManagementService, TestExecutionService],
})
export class TestManagementModule {}
