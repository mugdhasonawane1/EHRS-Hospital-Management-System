'use strict';

const { ZodError } = require('zod');
const { ApiError, failure } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const env = require('../config/env');

/** 404 for anything that fell through the router. */
function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/** Central error formatter — the only place that writes an error response. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code;
  let details = err.details;

  if (err instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err.name === 'ValidationError' && err.errors) {
    // Mongoose schema validation
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid value for "${err.path}"`;
  } else if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyPattern || {}).join(', ') || 'field';
    message = `A record with that ${field} already exists`;
  } else if (!(err instanceof ApiError) && statusCode === 500) {
    code = 'INTERNAL_ERROR';
    if (env.isProd) message = 'Internal server error'; // never leak internals
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`, err.stack);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode}: ${message}`);
  }

  return failure(res, { statusCode, message, code, details });
}

module.exports = { notFoundHandler, errorHandler };
