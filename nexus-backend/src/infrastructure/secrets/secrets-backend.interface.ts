/**
 * Interface for secret storage backends.
 * Supports AWS Secrets Manager, Azure Key Vault, HashiCorp Vault, or local encrypted storage.
 */
export interface ISecretsBackend {
  /**
   * Retrieve a secret value by key.
   * @throws Error if secret does not exist or access is denied.
   */
  getSecret(key: string): Promise<string>;

  /**
   * Store or update a secret value.
   * @param ttl Time-to-live in seconds (optional, backend-specific)
   */
  setSecret(key: string, value: string, ttl?: number): Promise<void>;

  /**
   * Delete a secret permanently.
   */
  deleteSecret(key: string): Promise<void>;

  /**
   * Rotate a secret (generate new value, optionally preserve old version).
   */
  rotateSecret(key: string, newValue: string): Promise<void>;

  /**
   * List available secret keys (may be restricted by backend permissions).
   */
  listSecrets(): Promise<string[]>;
}
