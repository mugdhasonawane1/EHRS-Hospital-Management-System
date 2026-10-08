'use strict';

/**
 * Wraps an async controller so rejected promises reach the central error
 * middleware instead of hanging the request.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
