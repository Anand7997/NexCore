import { LocalEncryptedSecretsBackend } from './local-encrypted-secrets.backend';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

describe('LocalEncryptedSecretsBackend', () => {
  let backend: LocalEncryptedSecretsBackend;
  let testFilePath: string;
  let masterKey: string;

  beforeEach(() => {
    masterKey = randomBytes(32).toString('hex');
    testFilePath = join(__dirname, `test-secrets-${Date.now()}.json`);
    backend = new LocalEncryptedSecretsBackend(masterKey, testFilePath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should set and get a secret', async () => {
    await backend.setSecret('db-password', 'super-secret-123');
    const value = await backend.getSecret('db-password');
    expect(value).toBe('super-secret-123');
  });

  it('should list secrets', async () => {
    await backend.setSecret('api-key', 'key-123');
    await backend.setSecret('jwt-secret', 'jwt-456');
    const keys = await backend.listSecrets();
    expect(keys).toEqual(['api-key', 'jwt-secret']);
  });

  it('should delete a secret', async () => {
    await backend.setSecret('temp-key', 'temp-value');
    await backend.deleteSecret('temp-key');
    await expect(backend.getSecret('temp-key')).rejects.toThrow(/Secret not found/);
  });

  it('should rotate a secret', async () => {
    await backend.setSecret('rotate-key', 'old-value');
    await backend.rotateSecret('rotate-key', 'new-value');
    const value = await backend.getSecret('rotate-key');
    expect(value).toBe('new-value');
  });

  it('should throw error if master key is missing', () => {
    delete process.env.SECRETS_MASTER_KEY;
    expect(() => new LocalEncryptedSecretsBackend()).toThrow(/SECRETS_MASTER_KEY/);
  });

  it('should throw error if master key is invalid length', () => {
    expect(() => new LocalEncryptedSecretsBackend('tooshort')).toThrow(/64-character hex string/);
  });

  it('should persist secrets to disk', async () => {
    await backend.setSecret('persistent-key', 'persistent-value');

    // Create a new backend instance pointing to the same file
    const backend2 = new LocalEncryptedSecretsBackend(masterKey, testFilePath);
    const value = await backend2.getSecret('persistent-key');
    expect(value).toBe('persistent-value');
  });
});
