import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');

  await app.listen(config.port);
}

void bootstrap();
