import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import { AppConfigService } from '../../config/config.service';

@Injectable()
export class TemporalClientService implements OnModuleInit, OnModuleDestroy {
  private connection?: Connection;
  private _client?: Client;

  constructor(
    private readonly config: AppConfigService,
    @InjectPinoLogger(TemporalClientService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.connection = await Connection.connect({
        address: this.config.temporalAddress,
      });
      this._client = new Client({
        connection: this.connection,
        namespace: this.config.temporalNamespace,
      });
      this.logger.info(
        { address: this.config.temporalAddress, namespace: this.config.temporalNamespace },
        'Temporal client connected',
      );
    } catch (error) {
      this.connection = undefined;
      this._client = undefined;
      this.logger.warn(
        { err: error, address: this.config.temporalAddress, namespace: this.config.temporalNamespace },
        'Temporal unavailable during startup; workflow operations will fail until Temporal is reachable',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.logger.info('Temporal client connection closed');
    }
  }

  get client(): Client {
    if (!this._client) {
      throw new Error('Temporal client is unavailable. Ensure Temporal is running and reachable.');
    }
    return this._client;
  }

  getWorkflowHandle(workflowId: string): WorkflowHandle {
    return this.client.workflow.getHandle(workflowId);
  }
}
