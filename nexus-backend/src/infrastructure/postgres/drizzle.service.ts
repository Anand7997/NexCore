import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfigService } from '../../config/config.service';
import * as schema from './schema';

export type NexusDb = NodePgDatabase<typeof schema>;

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  private _db!: NexusDb;

  constructor(
    private readonly config: AppConfigService,
    @InjectPinoLogger(DrizzleService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    this.pool.on('error', (err) => {
      this.logger.error({ err }, 'PostgreSQL pool error');
    });

    this._db = drizzle(this.pool, { schema });
    this.logger.info('PostgreSQL pool initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.info('PostgreSQL pool closed');
  }

  get db(): NexusDb {
    return this._db;
  }

  async ping(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }
}
