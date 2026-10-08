'use strict';

const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const asyncHandler = require('../utils/asyncHandler');
const { success, ApiError } = require('../utils/apiResponse');
const { paginateQuery } = require('../utils/paginate');
const appointmentService = require('../services/appointment.service');
const rbac = require('../services/rbac.service');
const { toDateKey } = require('../utils/formatDate');

/** Public-ish directory: any authenticated user may browse doctors to book. */
const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  if (req.query.specialization) filter.specialization = new RegExp(req.query.specialization, 'i');
  if (req.query.acceptingOnly === 'true') filter.isAcceptingPatients = true;

  if (req.query.search) {
    const users = await User.find({ role: 'doctor', name: new RegExp(req.query.search, 'i') }).select('_id').lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }

  const { items, meta } = await paginateQuery(Doctor, filter, {
    query: req.query,
    sort: { createdAt: -1 },
    populate: [
      { path: 'userId', select: 'name email phone isActive' },
      { path: 'departmentId', select: 'name consultationFee' },
    ],
  });

  return success(res, items, { meta });
});

const getById = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id)
    .populate('userId', 'name email phone isActive')
    .populate('departmentId', 'name description consultationFee')
    .populate('additionalDepartmentIds', 'name');
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return success(res, doctor);
});

/** GET /api/doctors/:id/availability?date=YYYY-MM-DD */
const getAvailability = asyncHandler(async (req, res) => {
  const data = await appointmentService.getAvailability(req.params.id, req.query.date);
  return success(res, data);
});

/** GET /api/doctors/:id/schedule?date= — the doctor's own day view. */
const getSchedule = asyncHandler(async (req, res) => {
  const data = await appointmentService.getDoctorSchedule(req.user, req.params.id, req.query.date || toDateKey(new Date()));
  return success(res, data);
});

/**
 * Admins may edit any doctor; a doctor may edit only their own profile —
 * ownership, not merely role.
 */
const update = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw ApiError.notFound('Doctor not found');
  rbac.assertAccess(req.user, rbac.RESOURCES.DOCTOR, rbac.ACTIONS.UPDATE, doctor);

  const { name, phone, ...doctorFields } = req.body;

  // Doctors cannot move themselves between departments; that's an admin action.
  if (req.user.role === 'doctor') {
    delete doctorFields.departmentId;
    delete doctorFields.additionalDepartmentIds;
    delete doctorFields.consultationFee;
  }

  Object.assign(doctor, doctorFields);
  await doctor.save();

  if (name || phone) {
    await User.findByIdAndUpdate(doctor.userId, {
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
    });
  }

  const fresh = await Doctor.findById(doctor._id)
    .populate('userId', 'name email phone')
    .populate('departmentId', 'name');
  return success(res, fresh);
});

/** PATCH /api/doctors/:id/availability — replaces the weekly template. */
const updateAvailability = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw ApiError.notFound('Doctor not found');
  rbac.assertAccess(req.user, rbac.RESOURCES.DOCTOR, rbac.ACTIONS.UPDATE, doctor);

  doctor.availableSlots = req.body.availableSlots;
  await doctor.save();

  // Warn (don't auto-cancel) about future bookings the new template no longer covers.
  const upcoming = await Appointment.countDocuments({
    doctorId: doctor._id,
    status: 'booked',
    dateTime: { $gte: new Date() },
  });

  return success(res, { doctor, upcomingAppointments: upcoming });
});

/** Deactivating the underlying user account also stops new bookings. */
const deactivate = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw ApiError.notFound('Doctor not found');

  doctor.isAcceptingPatients = false;
  await doctor.save();
  await User.findByIdAndUpdate(doctor.userId, { isActive: false });

  return success(res, { deactivated: true, doctorId: String(doctor._id) });
});

/** Doctors the caller is (or has been) treated by / their own record. */
const getMyProfile = asyncHandler(async (req, res) => {
  if (!req.user.doctorId) throw ApiError.forbidden('Your account has no doctor profile');
  const doctor = await Doctor.findById(req.user.doctorId)
    .populate('userId', 'name email phone')
    .populate('departmentId', 'name consultationFee');
  return success(res, doctor);
});

module.exports = {
  list,
  getById,
  getAvailability,
  getSchedule,
  update,
  updateAvailability,
  deactivate,
  getMyProfile,
};
