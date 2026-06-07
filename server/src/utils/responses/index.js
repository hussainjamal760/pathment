/**
 * Standardized API response utilities
 */

/**
 * Success response format
 */
const successResponse = (message, data = null, statusCode = 200) => {
  const response = {
    success: true,
    message,
    statusCode
  };

  if (data !== null) {
    response.data = data;
  }

  return response;
};

/**
 * Error response format
 */
const errorResponse = (message, statusCode = 500, errors = null, code = null) => {
  const response = {
    success: false,
    message,
    statusCode
  };

  if (code) response.code = code;
  if (errors !== null) response.errors = errors;

  // Attach the correlation id when inside a request (also in X-Request-Id header).
  try {
    const { getRequestContext } = require('../auditContext');
    const reqId = getRequestContext()?.requestId;
    if (reqId) response.requestId = reqId;
  } catch { /* no request context (e.g. a unit test) - omit */ }

  return response;
};

/**
 * Paginated response format
 */
const paginatedResponse = (message, data, pagination, statusCode = 200) => {
  return {
    success: true,
    message,
    statusCode,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems
    }
  };
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse
};
