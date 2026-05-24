import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  SERVICE_NAME: z.string().min(1).default('nexus-backend'),

  DATABASE_URL: z.string().min(1),

  KEYCLOAK_URL: z.string().url().default('http://localhost:8080'),
  KEYCLOAK_REALM: z.string().min(1).default('nexus'),
  KEYCLOAK_CLIENT_ID: z.string().min(1).default('nexus-backend'),
  AUTH_DISABLED: z.coerce.boolean().default(false),

  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),

  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),

  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1).default('minioadmin'),
  S3_SECRET_KEY: z.string().min(1).default('minioadmin'),
  AUDIT_ARCHIVE_BUCKET: z.string().min(1).default('nexus-audit-archive'),
});

export type AppConfig = z.infer<typeof configSchema>;
