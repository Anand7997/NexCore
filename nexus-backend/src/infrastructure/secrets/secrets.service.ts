import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../config/config.service';
import { ISecretsBackend } from './secrets-backend.interface';
import { LocalEncryptedSecretsBackend } from './local-encrypted-secrets.backend';

/**
 * Unified secrets management service supporting multiple backends:
 * - Local encrypted file (development/testing)
 * - AWS Secrets Manager (production)
 * - Azure Key Vault (production)
 * - HashiCorp Vault (production)
 *
 * Configure backend via SECRETS_BACKEND env var: local|aws|azure|vault
 */
@Injectable()
export class SecretsService implements OnModuleInit {
  private backend!: ISecretsBackend;

  constructor(
    private readonly config: AppConfigService,
    @InjectPinoLogger(SecretsService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const backendType = process.env.SECRETS_BACKEND ?? 'local';

    switch (backendType) {
      case 'local':
        this.backend = new LocalEncryptedSecretsBackend();
        this.logger.info('Secrets backend: LocalEncryptedFile');
        break;

      case 'aws':
        throw new Error('AWS Secrets Manager backend not yet implemented');

      case 'azure':
        throw new Error('Azure Key Vault backend not yet implemented');

      case 'vault':
        throw new Error('HashiCorp Vault backend not yet implemented');

      default:
        throw new Error(`Unknown SECRETS_BACKEND: ${backendType}`);
    }
  }

  /**
   * Retrieve a secret value by key.
   * Throws error if secret does not exist.
   */
  async getSecret(key: string): Promise<string> {
    return this.backend.getSecret(key);
  }

  /**
   * Store or update a secret value.
   */
  async setSecret(key: string, value: string, ttl?: number): Promise<void> {
    await this.backend.setSecret(key, value, ttl);
    this.logger.info({ key }, 'Secret updated');
  }

  /**
   * Delete a secret permanently.
   */
  async deleteSecret(key: string): Promise<void> {
    await this.backend.deleteSecret(key);
    this.logger.info({ key }, 'Secret deleted');
  }

  /**
   * Rotate a secret with a new value.
   */
  async rotateSecret(key: string, newValue: string): Promise<void> {
    await this.backend.rotateSecret(key, newValue);
    this.logger.info({ key }, 'Secret rotated');
  }

  /**
   * List available secret keys.
   */
  async listSecrets(): Promise<string[]> {
    return this.backend.listSecrets();
  }

  /**
   * Convenience helper: get secret or return default value.
   */
  async getSecretOrDefault(key: string, defaultValue: string): Promise<string> {
    try {
      return await this.getSecret(key);
    } catch {
      return defaultValue;
    }
  }
}
