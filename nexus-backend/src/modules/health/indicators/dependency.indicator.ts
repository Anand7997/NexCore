import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

/**
 * Aggregated dependency health indicator.
 * Checks multiple external services and provides a consolidated health status.
 */
@Injectable()
export class DependencyHealthIndicator extends HealthIndicator {
  /**
   * Check all critical dependencies: ClickHouse, Neo4j, Qdrant, MinIO.
   * These are optional components, so failures are logged but don't fail the check.
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const dependencies: Record<string, boolean> = {
      clickhouse: await this.checkClickHouse(),
      neo4j: await this.checkNeo4j(),
      qdrant: await this.checkQdrant(),
      minio: await this.checkMinIO(),
    };

    const allHealthy = Object.values(dependencies).every((status) => status);

    if (!allHealthy) {
      const unhealthy = Object.entries(dependencies)
        .filter(([_, healthy]) => !healthy)
        .map(([name]) => name);

      return this.getStatus(key, false, { unhealthy, dependencies });
    }

    return this.getStatus(key, true, { dependencies });
  }

  private async checkClickHouse(): Promise<boolean> {
    const url = process.env.CLICKHOUSE_URL;
    if (!url) return true; // Optional dependency

    try {
      const response = await fetch(`${url}/ping`, { signal: AbortSignal.timeout(3000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async checkNeo4j(): Promise<boolean> {
    const url = process.env.NEO4J_URL;
    if (!url) return true; // Optional dependency

    // TODO: Implement Neo4j health check using neo4j-driver
    return true;
  }

  private async checkQdrant(): Promise<boolean> {
    const url = process.env.QDRANT_URL;
    if (!url) return true; // Optional dependency

    try {
      const response = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(3000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async checkMinIO(): Promise<boolean> {
    const url = process.env.MINIO_URL;
    if (!url) return true; // Optional dependency

    try {
      const response = await fetch(`${url}/minio/health/live`, { signal: AbortSignal.timeout(3000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}
