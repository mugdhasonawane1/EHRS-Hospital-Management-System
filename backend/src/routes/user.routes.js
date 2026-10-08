'use strict';

const express = require('express');
const { z } = require('zod');
const User = require('../models/User');
const authController = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');
const { success, ApiError } = require('../utils/apiResponse');
const { paginateQuery } = require('../utils/paginate');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { idParam, paginationQuery } = require('../validators/common.validator');
const { registerStaffSchema } = require('../validators/auth.validator');

const router = express.Router();

// Everything below is admin-only account management.
router.use(authenticate, requireRole('admin'));

router.get(
  '/',
  validate({ query: paginationQuery.extend({ role: z.enum(['admin', 'doctor', 'patient']).optional(), search: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.search) {
      filter.$or = [
        { name: new RegExp(req.query.search, 'i') },
        { email: new RegExp(req.query.search, 'i') },
      ];
    }
    const { items, meta } = await paginateQuery(User, filter, { query: req.query, sort: { createdAt: -1 } });
    return success(res, items, { meta });
  })
);

/** Admin provisioning of doctor/admin accounts (creates the Doctor profile too). */
router.post('/staff', validate({ body: registerStaffSchema }), authController.registerStaff);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw ApiError.notFound('User not found');
    return success(res, user);
  })
);

router.patch(
  '/:id/status',
  validate({ params: idParam, body: z.object({ isActive: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user.id)) {
      throw ApiError.badRequest('You cannot change the status of your own account');
    }
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
    if (!user) throw ApiError.notFound('User not found');
    return success(res, user);
  })
);

module.exports = router;
