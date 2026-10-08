'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');
const appointmentService = require('../services/appointment.service');

const book = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.bookAppointment(req.user, req.body);
  return created(res, appointment);
});

/** Role-aware: patients see their own, doctors see assigned, admins see all. */
const listMine = asyncHandler(async (req, res) => {
  const { items, meta } = await appointmentService.listAppointments(req.user, req.query);
  return success(res, items, { meta });
});

const getById = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.getAppointmentById(req.user, req.params.id);
  return success(res, appointment);
});

const cancel = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.cancelAppointment(req.user, req.params.id, req.body);
  return success(res, appointment);
});

const complete = asyncHandler(async (req, res) => {
  const result = await appointmentService.completeAppointment(req.user, req.params.id, req.body);
  return success(res, result);
});

module.exports = { book, listMine, getById, cancel, complete };
