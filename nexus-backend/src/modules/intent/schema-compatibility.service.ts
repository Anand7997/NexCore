/**
 * Intent schema compatibility service.
 *
 * Rules:
 *   - Same MAJOR version → compatible (minor additions are backward-compatible).
 *   - Different MAJOR version → breaking; consumer must migrate or upgrade.
 *   - Client version ahead of server → client should downgrade or use negotiation.
 *   - Malformed version strings → treated as incompatible.
 */
import { Injectable } from '@nestjs/common';
import type {
  IntentSchemaVersion,
  CompatibilityResult,
} from '../../contracts/intent-contracts';
import { INTENT_SCHEMA_VERSION } from '../../contracts/intent-contracts';

function parseSemver(version: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) };
}

@Injectable()
export class SchemaCompatibilityService {
  /** The schema version this server currently produces. */
  readonly serverVersion: IntentSchemaVersion = INTENT_SCHEMA_VERSION;

  /**
   * Check whether a client-declared schema version is compatible with the
   * current server schema version.
   */
  check(clientVersion: IntentSchemaVersion): CompatibilityResult {
    const server = parseSemver(this.serverVersion);
    const client = parseSemver(clientVersion);

    if (!server || !client) {
      return {
        compatible: false,
        reason: `Malformed schema version: client='${clientVersion}' server='${this.serverVersion}'.`,
        requiredAction: 'upgrade-client',
      };
    }

    if (client.major !== server.major) {
      const direction = client.major < server.major ? 'migrate' : 'upgrade-client';
      return {
        compatible: false,
        reason:
          `Schema major version mismatch: client=${clientVersion}, server=${this.serverVersion}. ` +
          `Major version changes are breaking.`,
        requiredAction: direction,
      };
    }

    if (client.minor > server.minor) {
      // Client expects features the server hasn't shipped yet.
      return {
        compatible: false,
        reason:
          `Client schema version ${clientVersion} is ahead of server version ${this.serverVersion}. ` +
          `Downgrade the client or upgrade the server.`,
        requiredAction: 'upgrade-client',
      };
    }

    // Same major, client minor ≤ server minor → fully compatible.
    return { compatible: true };
  }

  /** Returns the list of known migration paths (for documentation / error messages). */
  migrationGuide(): Record<string, string> {
    return {
      '0.x → 1.0':
        'Rename camelCase mapping fields (nodeType, requiredParams) to match v1.0 contract. ' +
        'Add "api" and "db" platform keys to all intent definitions.',
    };
  }
}
