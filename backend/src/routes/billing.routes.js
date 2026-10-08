'use strict';

const express = require('express');
const { z } = require('zod');
const controller = require('../controllers/billing.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requirePermission, requireRole, RESOURCES, ACTIONS } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validate.middleware');
const { idParam, objectId } = require('../validators/common.validator');
const schemas = require('../validators/billing.validator');

const router = express.Router();

router.use(authenticate);

router.get('/summary', requireRole('admin'), controller.summary);

router.get(
  '/',
  requirePermission(RESOURCES.INVOICE, ACTIONS.READ),
  validate({ query: schemas.listInvoicesQuery }),
  controller.list
);

router.get(
  '/patient/:patientId',
  requirePermission(RESOURCES.INVOICE, ACTIONS.READ),
  validate({ params: z.object({ patientId: objectId }) }),
  controller.getPatientInvoices
);

/** Admin can (re)generate an invoice for a completed appointment. */
router.post(
  '/:appointmentId/generate',
  requirePermission(RESOURCES.INVOICE, ACTIONS.CREATE),
  validate({ params: z.object({ appointmentId: objectId }), body: schemas.generateInvoiceSchema }),
  controller.generate
);

router.get(
  '/invoice/:id',
  requirePermission(RESOURCES.INVOICE, ACTIONS.READ),
  validate({ params: idParam }),
  controller.getById
);

router.post(
  '/invoice/:id/pay',
  requirePermission(RESOURCES.INVOICE, ACTIONS.PAY),
  validate({ params: idParam, body: schemas.payInvoiceSchema }),
  controller.pay
);

router.patch(
  '/invoice/:id',
  requirePermission(RESOURCES.INVOICE, ACTIONS.UPDATE),
  validate({ params: idParam, body: schemas.updateInvoiceSchema }),
  controller.update
);

router.delete(
  '/invoice/:id',
  requirePermission(RESOURCES.INVOICE, ACTIONS.DELETE),
  validate({ params: idParam, body: schemas.voidInvoiceSchema }),
  controller.voidInvoice
);

module.exports = router;
