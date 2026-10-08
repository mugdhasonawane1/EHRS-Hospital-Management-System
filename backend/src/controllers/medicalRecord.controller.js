'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');
const service = require('../services/medicalRecord.service');

const create = asyncHandler(async (req, res) => {
  const record = await service.createRecord(req.user, req.body);
  return created(res, record);
});

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listRecords(req.user, req.query);
  return success(res, items, { meta });
});

const getById = asyncHandler(async (req, res) => {
  const record = await service.getRecordById(req.user, req.params.id);
  return success(res, record);
});

const update = asyncHandler(async (req, res) => {
  const record = await service.updateRecord(req.user, req.params.id, req.body);
  return success(res, record);
});

/** RBAC-filtered history for one patient. */
const getPatientHistory = asyncHandler(async (req, res) => {
  const data = await service.getPatientHistory(req.user, req.params.patientId, req.query);
  return success(res, data);
});

const createPrescription = asyncHandler(async (req, res) => {
  const prescription = await service.createPrescription(req.user, req.body);
  return created(res, prescription);
});

const listPrescriptions = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listPrescriptions(req.user, req.query);
  return success(res, items, { meta });
});

module.exports = {
  create,
  list,
  getById,
  update,
  getPatientHistory,
  createPrescription,
  listPrescriptions,
};
