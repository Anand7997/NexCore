import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AiNatsService } from './ai-nats.service';
import type { AiWorkerResult } from '../../contracts/ai-worker-contracts';

/**
 * Socket.IO gateway for real-time AI investigation streaming.
 *
 * Clients subscribe to a job-id room to receive:
 *  - ai:progress  — incremental analysis steps (step, progress 0–1, detail)
 *  - ai:result    — completed investigation result (findings, recommendations)
 *  - ai:error     — terminal failure from the Python worker
 *
 * Usage from the browser:
 *   const socket = io('/ai');
 *   socket.emit('subscribe', { jobId: 'aijob_...' });
 *   socket.on('ai:progress', ({ step, progress, detail }) => ...);
 *   socket.on('ai:result',   (result) => ...);
 */
@WebSocketGateway({ namespace: '/ai', cors: { origin: '*' } })
export class AiInvestigationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(AiInvestigationGateway.name);

  constructor(private readonly nats: AiNatsService) {}

  // ── Module init — wire NATS listeners ─────────────────────────────────────

  onModuleInit(): void {
    this.nats.onResult((result) => this._broadcastResult(result));
    this.nats.onProgress((event) => {
      this.server
        .to(`job:${event.jobId}`)
        .emit('ai:progress', {
          jobId: event.jobId,
          step: event.step,
          progress: event.progress,
          detail: event.detail,
        });
    });
  }

  // ── Gateway lifecycle ─────────────────────────────────────────────────────

  afterInit(server: Server): void {
    this.logger.log('AI investigation Socket.IO gateway initialised (namespace: /ai)');
  }

  handleConnection(client: Socket): void {
    this.logger.debug('AI gateway client connected: %s', client.id);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug('AI gateway client disconnected: %s', client.id);
  }

  // ── Subscription messages ─────────────────────────────────────────────────

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { jobId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data?.jobId) return;
    const room = `job:${data.jobId}`;
    client.join(room);
    this.logger.debug('Client %s joined room %s', client.id, room);
    client.emit('subscribed', { jobId: data.jobId });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { jobId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data?.jobId) return;
    client.leave(`job:${data.jobId}`);
  }

  // ── Internal broadcast ────────────────────────────────────────────────────

  private _broadcastResult(result: AiWorkerResult): void {
    const room = `job:${result.jobId}`;
    if (result.status === 'failed') {
      this.server.to(room).emit('ai:error', {
        jobId: result.jobId,
        summary: result.summary,
      });
    } else {
      this.server.to(room).emit('ai:result', result);
    }
    this.logger.debug(
      'Broadcast AI result for job %s to room %s (status=%s)',
      result.jobId,
      room,
      result.status,
    );
  }

  /**
   * Broadcast a result directly (used by AiGatewayService for non-NATS results).
   */
  broadcastResult(result: AiWorkerResult): void {
    this._broadcastResult(result);
  }
}
