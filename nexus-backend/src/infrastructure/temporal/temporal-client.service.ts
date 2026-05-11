import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Client, Connection, WorkflowHandle } from '@temporalio/client';
import { AppConfigService } from '../../config/config.service';

@Injectable()
export class TemporalClientService implements OnModuleInit, OnModuleDestroy {
  private connection!: Connection;
  private _client!: Client;

  constructor(
    private readonly config: AppConfigService,
    @InjectPinoLogger(TemporalClientService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
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
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
    this.logger.info('Temporal client connection closed');
  }

  get client(): Client {
    return this._client;
  }

  getWorkflowHandle(workflowId: string): WorkflowHandle {
    return this._client.workflow.getHandle(workflowId);
  }
}
