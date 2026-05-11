import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import { AppConfigService } from '../../config/config.service';
import type { Principal } from './principal.decorator';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => (target: object, key?: string, descriptor?: PropertyDescriptor) => {
  Reflect.defineMetadata(IS_PUBLIC_KEY, true, descriptor?.value ?? target);
  return descriptor ?? target;
};

@Injectable()
export class KeycloakGuard implements CanActivate {
  private readonly jwksClient: jwksRsa.JwksClient;

  constructor(
    private readonly config: AppConfigService,
    private readonly reflector: Reflector,
  ) {
    this.jwksClient = jwksRsa({
      jwksUri: this.config.keycloakJwksUri,
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 600_000,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (this.config.authDisabled) {
      this.attachDevPrincipal(context);
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: Principal }>();
    const token = this.extractBearerToken(request);
    if (!token) throw new UnauthorizedException('Missing Bearer token');

    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        throw new UnauthorizedException('Invalid token format');
      }

      const kid = decoded.header.kid;
      const key = await this.jwksClient.getSigningKey(kid);
      const publicKey = key.getPublicKey();

      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        audience: this.config.keycloakClientId,
      }) as jwt.JwtPayload;

      request.user = {
        sub: payload.sub ?? '',
        email: payload.email as string | undefined,
        tenantId: (payload.tenant_id as string) ?? (payload.tenantId as string),
        roles: (payload.realm_access as { roles?: string[] })?.roles ?? [],
      };

      return true;
    } catch (err) {
      throw new UnauthorizedException('Token validation failed');
    }
  }

  private extractBearerToken(req: Request): string | undefined {
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return undefined;
  }

  private attachDevPrincipal(context: ExecutionContext): void {
    const req = context.switchToHttp().getRequest<Request & { user?: Principal }>();
    req.user = {
      sub: 'dev-user',
      email: 'dev@nexus.local',
      tenantId: req.headers['x-tenant-id'] as string ?? 'dev-tenant',
      roles: ['admin'],
    };
  }
}
