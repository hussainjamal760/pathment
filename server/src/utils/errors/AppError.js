/**
 * Custom Application Error class
 * Extends Error to include statusCode and operational flag
 */
class AppError extends Error {
  /**
   * @param {string} message  human-readable, safe-to-show message
   * @param {number} statusCode  HTTP status
   * @param {string|null} code  STABLE machine code clients branch on (e.g. 'NOT_FOUND')
   * @param {boolean} isOperational  expected/handled error (vs an unexpected bug)
   */
  constructor(message, statusCode, code = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    // Field-level details (set by validators) surfaced to the client as `errors[]`.
    this.errors = null;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
