import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config.validation';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  get port(): number { return this.config.get('PORT', { infer: true }); }
  get nodeEnv(): string { return this.config.get('NODE_ENV', { infer: true }); }
  get serviceName(): string { return this.config.get('SERVICE_NAME', { infer: true }); }
  get isDev(): boolean { return this.nodeEnv === 'development'; }
  get isProd(): boolean { return this.nodeEnv === 'production'; }

  get databaseUrl(): string { return this.config.get('DATABASE_URL', { infer: true }); }

  get keycloakUrl(): string { return this.config.get('KEYCLOAK_URL', { infer: true }); }
  get keycloakRealm(): string { return this.config.get('KEYCLOAK_REALM', { infer: true }); }
  get keycloakClientId(): string { return this.config.get('KEYCLOAK_CLIENT_ID', { infer: true }); }
  get authDisabled(): boolean { return this.config.get('AUTH_DISABLED', { infer: true }); }

  get otelEnabled(): boolean { return this.config.get('OTEL_ENABLED', { infer: true }); }
  get otlpEndpoint(): string | undefined { return this.config.get('OTEL_EXPORTER_OTLP_ENDPOINT', { infer: true }); }

  get aiServiceUrl(): string { return this.config.get('AI_SERVICE_URL', { infer: true }); }

  get temporalAddress(): string { return this.config.get('TEMPORAL_ADDRESS', { infer: true }); }
  get temporalNamespace(): string { return this.config.get('TEMPORAL_NAMESPACE', { infer: true }); }

  get s3Endpoint(): string { return this.config.get('S3_ENDPOINT', { infer: true }); }
  get s3Region(): string { return this.config.get('S3_REGION', { infer: true }); }
  get s3AccessKey(): string { return this.config.get('S3_ACCESS_KEY', { infer: true }); }
  get s3SecretKey(): string { return this.config.get('S3_SECRET_KEY', { infer: true }); }
  get auditArchiveBucket(): string { return this.config.get('AUDIT_ARCHIVE_BUCKET', { infer: true }); }

  get keycloakJwksUri(): string {
    return `${this.keycloakUrl}/realms/${this.keycloakRealm}/protocol/openid-connect/certs`;
  }
}
