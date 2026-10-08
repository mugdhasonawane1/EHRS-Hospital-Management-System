'use strict';

const express = require('express');
const controller = require('../controllers/medicalRecord.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, RESOURCES, ACTIONS } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { idParam, objectId } = require('../validators/common.validator');
const schemas = require('../validators/medicalRecord.validator');
const { z } = require('zod');

const router = express.Router();

router.use(authenticate);

/* --------------------------- prescriptions --------------------------- */
router.post(
  '/prescriptions',
  requirePermission(RESOURCES.PRESCRIPTION, ACTIONS.CREATE),
  validate({ body: schemas.createPrescriptionSchema }),
  controller.createPrescription
);

router.get(
  '/prescriptions',
  requirePermission(RESOURCES.PRESCRIPTION, ACTIONS.READ),
  validate({ query: schemas.listPrescriptionsQuery }),
  controller.listPrescriptions
);

/* ------------------------- records ------------------------- */
/** Doctor only, and only for one of their own completed appointments. */
router.post(
  '/',
  requirePermission(RESOURCES.MEDICAL_RECORD, ACTIONS.CREATE),
  validate({ body: schemas.createRecordSchema }),
  controller.create
);

router.get(
  '/',
  requirePermission(RESOURCES.MEDICAL_RECORD, ACTIONS.READ),
  validate({ query: schemas.listRecordsQuery }),
  controller.list
);

/** RBAC-filtered patient history. Declared before /:id so it isn't shadowed. */
router.get(
  '/patient/:patientId',
  requirePermission(RESOURCES.MEDICAL_RECORD, ACTIONS.READ),
  validate({ params: z.object({ patientId: objectId }) }),
  controller.getPatientHistory
);

router.get(
  '/:id',
  requirePermission(RESOURCES.MEDICAL_RECORD, ACTIONS.READ),
  validate({ params: idParam }),
  controller.getById
);

router.patch(
  '/:id',
  requirePermission(RESOURCES.MEDICAL_RECORD, ACTIONS.UPDATE),
  validate({ params: idParam, body: schemas.updateRecordSchema }),
  controller.update
);

module.exports = router;
