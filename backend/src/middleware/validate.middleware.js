'use strict';

const { ZodError } = require('zod');
const { ApiError } = require('../utils/apiResponse');

/**
 * validate({ body, params, query }) — each value is a Zod schema.
 * Parsed (and coerced/defaulted) output replaces the raw input so controllers
 * always work with clean data.
 */
function validate(schemas = {}) {
  return function middleware(req, _res, next) {
    try {
      for (const key of ['body', 'params', 'query']) {
        if (!schemas[key]) continue;
        const parsed = schemas[key].parse(req[key]);
        if (key === 'query') {
          // req.query is a getter in some Express versions — mutate in place.
          Object.keys(req.query).forEach((k) => delete req.query[k]);
          Object.assign(req.query, parsed);
        } else {
          req[key] = parsed;
        }
      }
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          ApiError.unprocessable('Validation failed', {
            code: 'VALIDATION_ERROR',
            details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          })
        );
      }
      return next(err);
    }
  };
}

module.exports = { validate };
