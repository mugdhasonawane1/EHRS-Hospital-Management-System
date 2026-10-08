'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');
const service = require('../services/billing.service');

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listInvoices(req.user, req.query);
  return success(res, items, { meta });
});

const getPatientInvoices = asyncHandler(async (req, res) => {
  const data = await service.getPatientInvoices(req.user, req.params.patientId, req.query);
  return success(res, data);
});

const getById = asyncHandler(async (req, res) => {
  const invoice = await service.getInvoiceById(req.user, req.params.id);
  return success(res, invoice);
});

const generate = asyncHandler(async (req, res) => {
  const invoice = await service.generateInvoiceForAppointment(req.user, req.params.appointmentId, req.body);
  return created(res, invoice);
});

const pay = asyncHandler(async (req, res) => {
  const invoice = await service.recordPayment(req.user, req.params.id, req.body);
  return success(res, invoice);
});

const update = asyncHandler(async (req, res) => {
  const invoice = await service.updateInvoiceItems(req.user, req.params.id, req.body);
  return success(res, invoice);
});

const voidInvoice = asyncHandler(async (req, res) => {
  const invoice = await service.voidInvoice(req.user, req.params.id, req.body.reason);
  return success(res, invoice);
});

const summary = asyncHandler(async (req, res) => {
  const data = await service.getBillingSummary(req.user);
  return success(res, data);
});

module.exports = { list, getPatientInvoices, getById, generate, pay, update, voidInvoice, summary };
