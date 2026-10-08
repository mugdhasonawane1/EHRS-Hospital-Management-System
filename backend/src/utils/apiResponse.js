'use strict';

/**
 * Every response the API emits has the same envelope:
 *   { success: true,  data: <payload>, meta?: <pagination etc> }
 *   { success: false, error: { message, code, details? } }
 */

class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code || defaultCode(statusCode);
    this.details = options.details;
    this.isOperational = true;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(msg = 'Bad request', o) { return new ApiError(400, msg, o); }
  static unauthorized(msg = 'Authentication required', o) { return new ApiError(401, msg, o); }
  static forbidden(msg = 'You do not have access to this resource', o) { return new ApiError(403, msg, o); }
  static notFound(msg = 'Resource not found', o) { return new ApiError(404, msg, o); }
  static conflict(msg = 'Conflict', o) { return new ApiError(409, msg, o); }
  static unprocessable(msg = 'Unprocessable entity', o) { return new ApiError(422, msg, o); }
  static internal(msg = 'Internal server error', o) { return new ApiError(500, msg, o); }
}

function defaultCode(statusCode) {
  return {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    500: 'INTERNAL_ERROR',
  }[statusCode] || 'ERROR';
}

function success(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function created(res, data, opts = {}) {
  return success(res, data, { ...opts, status: 201 });
}

function failure(res, { statusCode = 500, message, code, details }) {
  const error = { message, code: code || defaultCode(statusCode) };
  if (details) error.details = details;
  return res.status(statusCode).json({ success: false, error });
}

module.exports = { ApiError, success, created, failure };
