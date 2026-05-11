import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { connect, NatsConnection } from 'nats';

/**
 * NATS health indicator for K8s readiness/liveness probes.
 */
@Injectable()
export class NatsHealthIndicator extends HealthIndicator {
  private natsUrl: string;

  constructor() {
    super();
    this.natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    let nc: NatsConnection | undefined;
    try {
      nc = await connect({ servers: this.natsUrl, timeout: 3000 });
      const stats = nc.stats();
      await nc.close();

      return this.getStatus(key, true, {
        url: this.natsUrl,
        inMsgs: stats.inMsgs,
        outMsgs: stats.outMsgs,
      });
    } catch (err) {
      await nc?.close();
      throw new HealthCheckError(
        'NATS is unreachable',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}
