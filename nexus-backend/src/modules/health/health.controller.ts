import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './indicators/postgres.indicator';
import { Public } from '../../common/auth/keycloak.guard';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([() => this.postgres.isHealthy('postgres')]);
  }

  @Get('live')
  @Public()
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  ready() {
    return this.health.check([() => this.postgres.isHealthy('postgres')]);
  }
}
