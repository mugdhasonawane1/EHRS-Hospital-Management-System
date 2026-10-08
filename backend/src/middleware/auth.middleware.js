'use strict';

const { verifyAccessToken } = require('../utils/generateToken');
const { ApiError } = require('../utils/apiResponse');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

/**
 * Verifies the JWT and attaches the caller identity:
 *   req.user = { id, email, name, role, patientId, doctorId }
 * The profile ids come from the token so ownership checks cost no extra query.
 */
function authenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized('Missing bearer token'));

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.id || decoded.sub,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      patientId: decoded.patientId || null,
      doctorId: decoded.doctorId || null,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Attaches req.user when a valid token is present, but never rejects. */
function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.id || decoded.sub,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      patientId: decoded.patientId || null,
      doctorId: decoded.doctorId || null,
    };
  } catch {
    /* ignore — treated as anonymous */
  }
  return next();
}

module.exports = { authenticate, optionalAuth, extractToken };
