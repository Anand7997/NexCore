import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ISecretsBackend } from './secrets-backend.interface';

interface EncryptedSecretsFile {
  version: string;
  secrets: Record<string, { value: string; iv: string; createdAt: string }>;
}

/**
 * Local file-based encrypted secrets backend for development and testing.
 * Uses AES-256-GCM encryption with a master key derived from SECRETS_MASTER_KEY env var.
 *
 * ⚠️ NOT RECOMMENDED FOR PRODUCTION. Use AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault instead.
 */
@Injectable()
export class LocalEncryptedSecretsBackend implements ISecretsBackend {
  private readonly algorithm = 'aes-256-gcm';
  private readonly filePath: string;
  private readonly masterKey: Buffer;
  private cache: EncryptedSecretsFile | null = null;

  constructor(masterKeyHex?: string, filePath?: string) {
    const keyHex = masterKeyHex ?? process.env.SECRETS_MASTER_KEY;
    if (!keyHex) {
      throw new Error(
        'LocalEncryptedSecretsBackend: SECRETS_MASTER_KEY environment variable is required',
      );
    }

    this.masterKey = Buffer.from(keyHex, 'hex');
    if (this.masterKey.length !== 32) {
      throw new Error('SECRETS_MASTER_KEY must be a 64-character hex string (32 bytes)');
    }

    this.filePath = filePath ?? join(process.cwd(), 'secrets.encrypted.json');
  }

  async getSecret(key: string): Promise<string> {
    const file = await this.loadFile();
    const encrypted = file.secrets[key];
    if (!encrypted) {
      throw new Error(`Secret not found: ${key}`);
    }

    return this.decrypt(encrypted.value, encrypted.iv);
  }

  async setSecret(key: string, value: string): Promise<void> {
    const file = await this.loadFile();
    const iv = randomBytes(16).toString('hex');
    const encrypted = this.encrypt(value, iv);

    file.secrets[key] = {
      value: encrypted,
      iv,
      createdAt: new Date().toISOString(),
    };

    await this.saveFile(file);
  }

  async deleteSecret(key: string): Promise<void> {
    const file = await this.loadFile();
    delete file.secrets[key];
    await this.saveFile(file);
  }

  async rotateSecret(key: string, newValue: string): Promise<void> {
    // For local backend, rotation is the same as setting a new value
    await this.setSecret(key, newValue);
  }

  async listSecrets(): Promise<string[]> {
    const file = await this.loadFile();
    return Object.keys(file.secrets);
  }

  private async loadFile(): Promise<EncryptedSecretsFile> {
    if (this.cache) return this.cache;

    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(content);
      return this.cache!;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.cache = { version: '1.0', secrets: {} };
        return this.cache;
      }
      throw err;
    }
  }

  private async saveFile(file: EncryptedSecretsFile): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(file, null, 2), 'utf8');
    this.cache = file;
  }

  private encrypt(plaintext: string, ivHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const cipher = createCipheriv(this.algorithm, this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return encrypted.toString('hex') + ':' + authTag.toString('hex');
  }

  private decrypt(ciphertext: string, ivHex: string): string {
    const [encryptedHex, authTagHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(this.algorithm, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
