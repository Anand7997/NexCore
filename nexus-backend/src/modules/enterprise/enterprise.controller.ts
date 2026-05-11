import { Controller, Get } from '@nestjs/common';

@Controller('enterprise')
export class EnterpriseController {
  @Get('readiness')
  readiness() {
    return {
      rbac: 'keycloak-guard-enabled',
      tenantIsolation: 'tenant-context-middleware-enabled',
      audit: 'schema-ready',
      secrets: 'secret-ref-policy-required',
      deployment: 'kubernetes-manifests-required',
      pythonWorkers: 'ai-ocr-cv-ml-only',
      controlPlane: 'typescript-owned',
    };
  }
}
