import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import { generateId } from '../ids/id.util';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { correlationId?: string }>();
    const res = context.switchToHttp().getResponse<Response>();

    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string) || generateId();

    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    return next.handle();
  }
}
