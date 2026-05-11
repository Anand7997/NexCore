import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface Principal {
  sub: string;
  email?: string;
  tenantId?: string;
  roles: string[];
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: Principal }>();
    return req.user;
  },
);
