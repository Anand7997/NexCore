import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './indicators/postgres.indicator';
import { NatsHealthIndicator } from './indicators/nats.indicator';
import { TemporalHealthIndicator } from './indicators/temporal.indicator';
import { DependencyHealthIndicator } from './indicators/dependency.indicator';
import { Public } from '../../common/auth/keycloak.guard';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly nats: NatsHealthIndicator,
    private readonly temporal: TemporalHealthIndicator,
    private readonly dependency: DependencyHealthIndicator,
  ) {}

  /**
   * Basic health check endpoint.
   * Checks critical dependencies: Postgres, NATS, Temporal.
   */
  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.postgres.isHealthy('postgres'),
      () => this.nats.isHealthy('nats'),
      () => this.temporal.isHealthy('temporal'),
    ]);
  }

  /**
   * Kubernetes liveness probe.
   * Lightweight check that returns quickly without external calls.
   */
  @Get('live')
  @Public()
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Kubernetes readiness probe.
   * Comprehensive check of all critical and optional dependencies.
   */
  @Get('ready')
  @Public()
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.postgres.isHealthy('postgres'),
      () => this.nats.isHealthy('nats'),
      () => this.temporal.isHealthy('temporal'),
      () => this.dependency.isHealthy('dependencies'),
    ]);
  }
}
