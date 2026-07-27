/**
 * Minimal @nestjs/common shim for Playwright test environments.
 *
 * Legacy backend source files imported by regression tests carried @Injectable() and
 * similar decorators.  Those decorators are harmless no-ops when instances are
 * created directly with `new` outside a DI container â€” but the import throws
 * "Cannot find module '@nestjs/common'" when the package is absent.
 *
 * This shim satisfies the import without requiring the old backend package in
 * Nexus-Advanced's devDependencies.  Only the symbols actually used by the imported
 * service files need to be present here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Class decorator â€” no-op outside DI container. */
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

