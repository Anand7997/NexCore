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
});

export type AppConfig = z.infer<typeof configSchema>;
