/**
 * Minimal @nestjs/common shim for Playwright test environments.
 *
 * NestJS source files imported by regression tests carry @Injectable() and
 * similar decorators.  Those decorators are harmless no-ops when instances are
 * created directly with `new` outside a DI container — but the import throws
 * "Cannot find module '@nestjs/common'" when the package is absent.
 *
 * This shim satisfies the import without requiring the full NestJS package in
 * nexus-qa's devDependencies.  Only the symbols actually used by the imported
 * service files need to be present here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Class decorator — no-op outside DI container. */
export function Injectable(): ClassDecorator {
  return () => {};
}

export function Module(): ClassDecorator {
  return () => {};
}

export function Controller(): ClassDecorator {
  return () => {};
}

export function Get(): MethodDecorator {
  return () => {};
}

export function Post(): MethodDecorator {
  return () => {};
}

export function Body(): ParameterDecorator {
  return () => {};
}

export function Param(): ParameterDecorator {
  return () => {};
}

export class NotFoundException extends Error {
  constructor(message?: string) {
    super(message ?? 'Not Found');
    this.name = 'NotFoundException';
  }
}

export class BadRequestException extends Error {
  constructor(message?: string) {
    super(message ?? 'Bad Request');
    this.name = 'BadRequestException';
  }
}
