import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { KeycloakGuard } from './keycloak.guard';

@Global()
@Module({
  providers: [
    KeycloakGuard,
    {
      provide: APP_GUARD,
      useClass: KeycloakGuard,
    },
  ],
  exports: [KeycloakGuard],
})
export class AuthModule {}
