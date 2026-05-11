import { randomUUID } from 'crypto';

export function generateId(): string {
  return randomUUID();
}

export function prefixedId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}
