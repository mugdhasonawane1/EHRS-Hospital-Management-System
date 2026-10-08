'use strict';

const Patient = require('../models/Patient');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const asyncHandler = require('../utils/asyncHandler');
const { success, ApiError } = require('../utils/apiResponse');
const { paginateQuery } = require('../utils/paginate');
const rbac = require('../services/rbac.service');
const medicalRecordService = require('../services/medicalRecord.service');

/**
 * Admins see everyone. Doctors see only patients they have appointments with —
 * derived from the appointment table, not from a role check.
 */
const list = asyncHandler(async (req, res) => {
  rbac.assertCan(req.user, rbac.RESOURCES.PATIENT, rbac.ACTIONS.READ);

  const filter = {};
  if (req.user.role === 'doctor') {
    const patientIds = await Appointment.distinct('patientId', { doctorId: req.user.doctorId });
    filter._id = { $in: patientIds };
  } else if (req.user.role === 'patient') {
    filter._id = req.user.patientId;
  }

  if (req.query.search) {
    const users = await User.find({ role: 'patient', $or: [
      { name: new RegExp(req.query.search, 'i') },
      { email: new RegExp(req.query.search, 'i') },
    ] }).select('_id').lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }

  const { items, meta } = await paginateQuery(Patient, filter, {
    query: req.query,
    sort: { createdAt: -1 },
    populate: [{ path: 'userId', select: 'name email phone isActive' }],
  });

  return success(res, items, { meta });
});

const getById = asyncHandler(async (req, res) => {
  rbac.assertCan(req.user, rbac.RESOURCES.PATIENT, rbac.ACTIONS.READ);

  const patient = await Patient.findById(req.params.id).populate('userId', 'name email phone isActive');
  if (!patient) throw ApiError.notFound('Patient not found');

  if (req.user.role === 'patient') {
    rbac.assertOwnership(req.user, rbac.RESOURCES.PATIENT, patient);
  } else if (req.user.role === 'doctor') {
    // A doctor's "ownership" of a patient is a treatment relationship.
    await medicalRecordService.assertHasTreated(req.user.doctorId, patient._id);
  }

  return success(res, patient);
});

const update = asyncHandler(async (req, res) => {
  rbac.assertCan(req.user, rbac.RESOURCES.PATIENT, rbac.ACTIONS.UPDATE);

  const patient = await Patient.findById(req.params.id);
  if (!patient) throw ApiError.notFound('Patient not found');
  if (req.user.role !== 'admin') rbac.assertOwnership(req.user, rbac.RESOURCES.PATIENT, patient);

  const { name, phone, ...patientFields } = req.body;
  Object.assign(patient, patientFields);
  await patient.save();

  if (name || phone) {
    await User.findByIdAndUpdate(patient.userId, {
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
    });
  }

  const fresh = await Patient.findById(patient._id).populate('userId', 'name email phone');
  return success(res, fresh);
});

/** The logged-in patient's own profile + a small activity summary. */
const getMyProfile = asyncHandler(async (req, res) => {
  if (!req.user.patientId) throw ApiError.forbidden('Your account has no patient profile');

  const patient = await Patient.findById(req.user.patientId).populate('userId', 'name email phone');
  const [upcoming, completed] = await Promise.all([
    Appointment.countDocuments({ patientId: patient._id, status: 'booked', dateTime: { $gte: new Date() } }),
    Appointment.countDocuments({ patientId: patient._id, status: 'completed' }),
  ]);

  return success(res, { patient, stats: { upcomingAppointments: upcoming, completedVisits: completed } });
});

const deactivate = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) throw ApiError.notFound('Patient not found');
  await User.findByIdAndUpdate(patient.userId, { isActive: false });
  return success(res, { deactivated: true, patientId: String(patient._id) });
});

module.exports = { list, getById, update, getMyProfile, deactivate };
