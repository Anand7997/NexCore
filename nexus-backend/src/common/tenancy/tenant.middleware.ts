import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(
    req: Request & { tenantId?: string },
    _res: Response,
    next: NextFunction,
  ): void {
    // Prefer explicit header; fall back to JWT claim extracted during auth
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    const jwtTenantId = this.extractFromJwt(req.headers['authorization']);

    req.tenantId = headerTenantId ?? jwtTenantId;
    next();
  }

  private extractFromJwt(authHeader: string | undefined): string | undefined {
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
      );
      return (payload.tenant_id as string) ?? (payload.tenantId as string);
    } catch {
      return undefined;
    }
  }
}
