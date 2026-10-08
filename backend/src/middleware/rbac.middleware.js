'use strict';

const rbac = require('../services/rbac.service');
const { ApiError } = require('../utils/apiResponse');

/**
 * Route-level guards. These cover the *capability* layer only.
 * The *ownership* layer lives in the services (they hold the document), which
 * is why every service call re-checks with assertAccess.
 */

function requireRole(...roles) {
  const allowed = roles.flat();
  return function guard(req, _res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden(`This route requires one of: ${allowed.join(', ')}`));
    }
    return next();
  };
}

function requirePermission(resource, action) {
  return function guard(req, _res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (!rbac.can(req.user.role, resource, action)) {
      return next(ApiError.forbidden(`Role "${req.user.role}" cannot ${action} ${resource}`));
    }
    return next();
  };
}

/**
 * For routes keyed by a profile id in the path (e.g. /patients/:id).
 * Lets the owner through, plus any listed role.
 * @param {string} param   route param holding the id
 * @param {string} field   which identity field it should match ('patientId' | 'doctorId' | 'id')
 */
function requireSelfOr(param, field, ...roles) {
  const allowed = roles.flat();
  return function guard(req, _res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (allowed.includes(req.user.role)) return next();
    if (req.user[field] && String(req.user[field]) === String(req.params[param])) return next();
    return next(ApiError.forbidden('You do not have access to this resource'));
  };
}

module.exports = { requireRole, requirePermission, requireSelfOr, RESOURCES: rbac.RESOURCES, ACTIONS: rbac.ACTIONS };
