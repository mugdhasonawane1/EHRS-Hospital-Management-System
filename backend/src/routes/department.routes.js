'use strict';

const express = require('express');
const controller = require('../controllers/department.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, RESOURCES, ACTIONS } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { idParam } = require('../validators/common.validator');
const schemas = require('../validators/department.validator');

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(RESOURCES.DEPARTMENT, ACTIONS.READ),
  validate({ query: schemas.listDepartmentsQuery }),
  controller.list
);

router.get(
  '/:id',
  requirePermission(RESOURCES.DEPARTMENT, ACTIONS.READ),
  validate({ params: idParam }),
  controller.getById
);

router.post(
  '/',
  requirePermission(RESOURCES.DEPARTMENT, ACTIONS.CREATE),
  validate({ body: schemas.createDepartmentSchema }),
  controller.create
);

router.patch(
  '/:id',
  requirePermission(RESOURCES.DEPARTMENT, ACTIONS.UPDATE),
  validate({ params: idParam, body: schemas.updateDepartmentSchema }),
  controller.update
);

router.delete(
  '/:id',
  requirePermission(RESOURCES.DEPARTMENT, ACTIONS.DELETE),
  validate({ params: idParam }),
  controller.remove
);

module.exports = router;
