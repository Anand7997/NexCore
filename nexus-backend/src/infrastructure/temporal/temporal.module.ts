import { Global, Module } from '@nestjs/common';
import { TemporalClientService } from './temporal-client.service';

@Global()
@Module({
  providers: [TemporalClientService],
  exports: [TemporalClientService],
})
export class TemporalModule {}
