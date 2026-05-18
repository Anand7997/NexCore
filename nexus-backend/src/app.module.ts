import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/config.service';
import { AuthModule } from './common/auth/auth.module';
import { KeycloakGuard } from './common/auth/keycloak.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenantMiddleware } from './common/tenancy/tenant.middleware';
import { TenantModule } from './common/tenancy/tenant.module';
import { PostgresModule } from './infrastructure/postgres/postgres.module';
import { TemporalModule } from './infrastructure/temporal/temporal.module';
import { HealthModule } from './modules/health/health.module';
import { OrchestrationModule } from './modules/orchestration/orchestration.module';
import { RuntimeModule } from './modules/runtime/runtime.module';
import { AiGatewayModule } from './modules/ai-gateway/ai-gateway.module';
import { EnterpriseModule } from './modules/enterprise/enterprise.module';
import { IntentModule } from './modules/intent/intent.module';
import { TestManagementModule } from './modules/test-management/test-management.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isProd ? 'info' : 'debug',
          transport: config.isDev ? { target: 'pino-pretty' } : undefined,
        },
      }),
    }),
    AuthModule,
    TenantModule,
    PostgresModule,
    TemporalModule,
    HealthModule,
    OrchestrationModule,
    RuntimeModule,
    AiGatewayModule,
    EnterpriseModule,
    IntentModule,
    TestManagementModule,
  ],
  controllers: [],
  providers: [AllExceptionsFilter, { provide: APP_GUARD, useClass: KeycloakGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
