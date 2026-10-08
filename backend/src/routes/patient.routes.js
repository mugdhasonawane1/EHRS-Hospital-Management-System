'use strict';

const express = require('express');
const controller = require('../controllers/patient.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireRole, RESOURCES, ACTIONS } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { idParam } = require('../validators/common.validator');
const schemas = require('../validators/patient.validator');

const router = express.Router();

router.use(authenticate);

router.get('/me', requireRole('patient'), controller.getMyProfile);

router.get(
  '/',
  requirePermission(RESOURCES.PATIENT, ACTIONS.READ),
  validate({ query: schemas.listPatientsQuery }),
  controller.list
);

router.get(
  '/:id',
  requirePermission(RESOURCES.PATIENT, ACTIONS.READ),
  validate({ params: idParam }),
  controller.getById
);

router.patch(
  '/:id',
  requirePermission(RESOURCES.PATIENT, ACTIONS.UPDATE),
  validate({ params: idParam, body: schemas.updatePatientSchema }),
  controller.update
);

router.delete('/:id', requireRole('admin'), validate({ params: idParam }), controller.deactivate);

module.exports = router;
