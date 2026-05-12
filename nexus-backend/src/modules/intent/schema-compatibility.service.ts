import { Injectable } from '@nestjs/common';
import type {
  CompatibilityResult,
  IntentSchemaManifest,
  IntentSchemaVersion,
} from '../../contracts/intent-contracts';
import {
  INTENT_SCHEMA_HISTORY,
  INTENT_SCHEMA_VERSION,
} from '../../contracts/intent-contracts';

function parseSemver(version: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) };
}

@Injectable()
export class SchemaCompatibilityService {
  readonly serverVersion: IntentSchemaVersion = INTENT_SCHEMA_VERSION;

  compatibilityPolicy(): string {
    return (
      'Same major versions are backward-compatible. New major versions require migration. ' +
      'Client minor versions cannot be ahead of the server.'
    );
  }

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
          'Major version changes are breaking.',
        requiredAction: direction,
      };
    }

    if (client.minor > server.minor) {
      return {
        compatible: false,
        reason:
          `Client schema version ${clientVersion} is ahead of server version ${this.serverVersion}. ` +
          'Downgrade the client or upgrade the server.',
        requiredAction: 'upgrade-client',
      };
    }

    return { compatible: true };
  }

  migrationGuide(): Record<string, string> {
    return {
      '0.9 -> 1.0':
        'Move compiler authority to NestJS, rename legacy Python mapping fields to the v1.0 contract, ' +
        'and add "api" and "db" platform keys to all intent definitions.',
    };
  }

  manifest(): IntentSchemaManifest {
    return {
      currentVersion: this.serverVersion,
      versions: INTENT_SCHEMA_HISTORY,
      compatibilityPolicy: this.compatibilityPolicy(),
      migrationGuide: this.migrationGuide(),
    };
  }
}
