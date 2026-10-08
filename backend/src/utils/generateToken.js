'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { ApiError } = require('./apiResponse');

/**
 * Access tokens carry the identity AND the profile id (patientId/doctorId) so
 * ownership checks don't need an extra lookup on every request.
 */
function signAccessToken(payload) {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

function signRefreshToken(payload) {
  return jwt.sign({ sub: payload.sub, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
}

function generateTokenPair(payload) {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (decoded.type !== 'access') throw new Error('wrong token type');
    return decoded;
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token',
      { code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' }
    );
  }
}

function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') throw new Error('wrong token type');
    return decoded;
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Refresh token expired, please log in again' : 'Invalid refresh token',
      { code: 'REFRESH_INVALID' }
    );
  }
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
};
