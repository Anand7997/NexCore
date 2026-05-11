import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PostgresHealthIndicator } from './indicators/postgres.indicator';
import { NatsHealthIndicator } from './indicators/nats.indicator';
import { TemporalHealthIndicator } from './indicators/temporal.indicator';
import { DependencyHealthIndicator } from './indicators/dependency.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    PostgresHealthIndicator,
    NatsHealthIndicator,
    TemporalHealthIndicator,
    DependencyHealthIndicator,
  ],
  exports: [
    PostgresHealthIndicator,
    NatsHealthIndicator,
    TemporalHealthIndicator,
    DependencyHealthIndicator,
  ],
})
export class HealthModule {}
