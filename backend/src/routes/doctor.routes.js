'use strict';

const express = require('express');
const controller = require('../controllers/doctor.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireRole, RESOURCES, ACTIONS } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { idParam } = require('../validators/common.validator');
const schemas = require('../validators/doctor.validator');
const { availabilityQuery, scheduleQuery } = require('../validators/appointment.validator');

const router = express.Router();

router.use(authenticate);

router.get('/me', requireRole('doctor'), controller.getMyProfile);

router.get(
  '/',
  requirePermission(RESOURCES.DOCTOR, ACTIONS.READ),
  validate({ query: schemas.listDoctorsQuery }),
  controller.list
);

router.get(
  '/:id',
  requirePermission(RESOURCES.DOCTOR, ACTIONS.READ),
  validate({ params: idParam }),
  controller.getById
);

/** Slot list used by the patient booking UI. */
router.get(
  '/:id/availability',
  requirePermission(RESOURCES.DOCTOR, ACTIONS.READ),
  validate({ params: idParam, query: availabilityQuery }),
  controller.getAvailability
);

/** The doctor's own day sheet (ownership checked in the service). */
router.get(
  '/:id/schedule',
  requireRole('doctor', 'admin'),
  validate({ params: idParam, query: scheduleQuery }),
  controller.getSchedule
);

router.patch(
  '/:id',
  requirePermission(RESOURCES.DOCTOR, ACTIONS.UPDATE),
  validate({ params: idParam, body: schemas.updateDoctorSchema }),
  controller.update
);

router.patch(
  '/:id/availability',
  requirePermission(RESOURCES.DOCTOR, ACTIONS.UPDATE),
  validate({ params: idParam, body: schemas.updateAvailabilitySchema }),
  controller.updateAvailability
);

router.delete('/:id', requireRole('admin'), validate({ params: idParam }), controller.deactivate);

module.exports = router;
