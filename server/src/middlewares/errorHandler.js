const { AppError } = require('../utils/errors/errorTypes');
const { errorResponse } = require('../utils/responses');
const logger = require('../utils/logger');
const { getRequestContext } = require('../utils/auditContext');

// ── Map well-known thrown shapes into a tidy AppError (code + field errors) ────
const handleSequelizeValidationError = (err) => {
  const e = new AppError('Validation failed', 400, 'VALIDATION_ERROR');
  e.errors = (err.errors || []).map((x) => ({ field: x.path, message: x.message }));
  return e;
};
const handleSequelizeUniqueConstraintError = (err) => {
  const field = err.errors?.[0]?.path || 'value';
  const e = new AppError(`${field} already exists`, 409, 'CONFLICT');
  e.errors = (err.errors || []).map((x) => ({ field: x.path, message: `${x.path} already exists` }));
  return e;
};
const handleSequelizeForeignKeyConstraintError = () =>
  new AppError('Invalid reference. A related resource does not exist.', 400, 'BAD_REQUEST');
const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401, 'AUTH_REQUIRED');
const handleJWTExpiredError = () => new AppError('Your session has expired. Please log in again.', 401, 'TOKEN_EXPIRED');

/**
 * Global error handler. One consistent envelope for every failure:
 *   { success:false, message, statusCode, code, errors?, requestId }
 * - Normalises JWT / Sequelize errors into AppErrors (with stable codes).
 * - Logs structured: 5xx → error (+ stack); 4xx → warn. Logs are JSON in prod,
 *   ready to ship to a log aggregator.
 * - In production, an UNEXPECTED 5xx never leaks internals (generic message);
 *   4xx and operational errors keep their human message.
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let error = err;
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  else if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();
  else if (err.name === 'SequelizeValidationError') error = handleSequelizeValidationError(err);
  else if (err.name === 'SequelizeUniqueConstraintError') error = handleSequelizeUniqueConstraintError(err);
  else if (err.name === 'SequelizeForeignKeyConstraintError') error = handleSequelizeForeignKeyConstraintError(err);

  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational === true;
  const code = error.code || (statusCode >= 500 ? 'INTERNAL' : null);
  const requestId = getRequestContext()?.requestId;

  const meta = {
    requestId, code, status: statusCode,
    method: req.method, url: req.originalUrl, userId: req.user?.id || null,
  };
  if (statusCode >= 500) {
    // Unexpected (non-operational) bugs are the ones worth alerting on in the aggregator.
    logger.error(error.message || 'Unhandled error', { ...meta, unexpected: !isOperational, stack: error.stack });
  } else {
    logger.warn(error.message || 'Request error', meta);
  }

  // Production: don't leak internals on an unexpected 5xx; everything else keeps its message.
  const hideDetails = process.env.NODE_ENV === 'production' && statusCode >= 500 && !isOperational;
  const message = hideDetails ? 'Something went wrong on our end. Please try again.' : (error.message || 'Something went wrong');

  const body = errorResponse(message, statusCode, error.errors || null, code);
  if (process.env.NODE_ENV !== 'production') body.stack = error.stack; // dev convenience
  res.status(statusCode).json(body);
};

/** Wrap an async route so thrown/rejected errors reach the handler above. */
const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Unknown route → a clean 404 with a code. */
const notFound = (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404, 'NOT_FOUND'));
};

module.exports = { errorHandler, catchAsync, notFound };
