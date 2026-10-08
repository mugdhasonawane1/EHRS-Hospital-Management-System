'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');
const authService = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result);
});

const registerStaff = asyncHandler(async (req, res) => {
  const user = await authService.registerStaff(req.body);
  return created(res, { user });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return success(res, result);
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken);
  return success(res, result);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  return success(res, { user });
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body);
  return success(res, result);
});

/**
 * Stateless JWT: there is no server-side session to destroy. The endpoint
 * exists so the client has one place to call; it drops its tokens.
 * (A production build would keep a refresh-token denylist here.)
 */
const logout = asyncHandler(async (_req, res) => success(res, { loggedOut: true }));

module.exports = { register, registerStaff, login, refresh, me, changePassword, logout };
