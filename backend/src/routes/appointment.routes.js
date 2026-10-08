'use strict';

const express = require('express');
const controller = require('../controllers/appointment.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, RESOURCES, ACTIONS } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { idParam } = require('../validators/common.validator');
const schemas = require('../validators/appointment.validator');

const router = express.Router();

router.use(authenticate);

/** Patient books (admin may book on a patient's behalf). */
router.post(
  '/',
  requirePermission(RESOURCES.APPOINTMENT, ACTIONS.CREATE),
  validate({ body: schemas.createAppointmentSchema }),
  controller.book
);

/** Role-aware list: patient -> own, doctor -> assigned, admin -> all. */
router.get(
  '/me',
  requirePermission(RESOURCES.APPOINTMENT, ACTIONS.READ),
  validate({ query: schemas.listAppointmentsQuery }),
  controller.listMine
);

router.get(
  '/',
  requirePermission(RESOURCES.APPOINTMENT, ACTIONS.READ),
  validate({ query: schemas.listAppointmentsQuery }),
  controller.listMine
);

router.get(
  '/:id',
  requirePermission(RESOURCES.APPOINTMENT, ACTIONS.READ),
  validate({ params: idParam }),
  controller.getById
);

router.patch(
  '/:id/cancel',
  requirePermission(RESOURCES.APPOINTMENT, ACTIONS.CANCEL),
  validate({ params: idParam, body: schemas.cancelAppointmentSchema }),
  controller.cancel
);

/** Doctor marks the visit done — unlocks the medical record + invoice. */
router.patch(
  '/:id/complete',
  requirePermission(RESOURCES.APPOINTMENT, ACTIONS.COMPLETE),
  validate({ params: idParam, body: schemas.completeAppointmentSchema }),
  controller.complete
);

module.exports = router;
