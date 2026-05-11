import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { Connection } from '@temporalio/client';

/**
 * Temporal workflow engine health indicator.
 */
@Injectable()
export class TemporalHealthIndicator extends HealthIndicator {
  private temporalAddress: string;

  constructor() {
    super();
    this.temporalAddress = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    let connection: Connection | undefined;
    try {
      connection = await Connection.connect({ address: this.temporalAddress });
      await connection.close();

      return this.getStatus(key, true, { address: this.temporalAddress });
    } catch (err) {
      await connection?.close();
      throw new HealthCheckError(
        'Temporal is unreachable',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}
