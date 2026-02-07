/**
 * Thrown by stub methods that are not yet implemented.
 * Used during TDD Red phase -- tests expect this error from stubs.
 */
export class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(`Not implemented: ${methodName}`);
    this.name = 'NotImplementedError';
  }
}

/**
 * Application-level error with a user-facing message.
 * Used for validation errors, duplicate detection, etc.
 */
export class AppError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
