'use strict';

const express = require('express');
const { z } = require('zod');
const { prisma } = require('../config/db');
const authController = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');
const { success, ApiError } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/paginate');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { idParam, paginationQuery } = require('../validators/common.validator');
const { registerStaffSchema } = require('../validators/auth.validator');

const router = express.Router();
router.use(authenticate, requireRole('admin'));
const roleToDb = { admin: 'ADMIN', doctor: 'DOCTOR', patient: 'PATIENT' };
function safeUser(user) {
  if (!user) return user;
  const { passwordHash, ...safe } = user;
  return { ...safe, role: String(safe.role).toLowerCase() };
}

router.get('/', validate({ query: paginationQuery.extend({ role: z.enum(['admin', 'doctor', 'patient']).optional(), search: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.role) where.role = roleToDb[req.query.role];
  if (req.query.search) where.OR = [
    { name: { contains: req.query.search } },
    { email: { contains: req.query.search } },
  ];
  const { page, limit, skip } = getPagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.user.count({ where }),
  ]);
  return success(res, rows.map(safeUser), { meta: buildMeta({ page, limit, total }) });
}));

router.post('/staff', validate({ body: registerStaffSchema }), authController.registerStaff);

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw ApiError.notFound('User not found');
  return success(res, safeUser(user));
}));

router.patch('/:id/status', validate({ params: idParam, body: z.object({ isActive: z.boolean() }) }), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot change the status of your own account');
  const exists = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!exists) throw ApiError.notFound('User not found');
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive } });
  return success(res, safeUser(user));
}));

module.exports = router;
