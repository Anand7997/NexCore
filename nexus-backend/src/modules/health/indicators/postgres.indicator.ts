import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { DrizzleService } from '../../../infrastructure/postgres/drizzle.service';

@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  constructor(private readonly drizzle: DrizzleService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.drizzle.ping();
      return this.getStatus(key, true);
    } catch (err) {
      throw new HealthCheckError(
        'PostgreSQL is unreachable',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}
