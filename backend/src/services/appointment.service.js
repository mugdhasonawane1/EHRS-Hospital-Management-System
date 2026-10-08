'use strict';

const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Invoice = require('../models/Invoice');
const env = require('../config/env');
const { ApiError } = require('../utils/apiResponse');
const { paginateQuery } = require('../utils/paginate');
const rbac = require('./rbac.service');
const notify = require('./notification.service');
const logger = require('../utils/logger');
const {
  addMinutes, addDays, toDateKey, toTimeKey, combineDateAndTime,
  dayOfWeek, startOfDay, endOfDay, MS_PER_MINUTE,
} = require('../utils/formatDate');
const {
  findConflict, expandWindowToSlots, fitsInTimeWindow, intervalsOverlap,
} = require('../utils/slotOverlapCheck');

const { RESOURCES, ACTIONS } = rbac;

/* ------------------------------------------------------------------ *
 *  CONFLICT DETECTION — the core business logic
 * ------------------------------------------------------------------ */

/**
 * Validate a proposed booking against every way it could collide.
 * Returns { ok: true } or throws an ApiError describing the exact reason.
 *
 * Checks, in order:
 *   1. the slot is in the future
 *   2. the doctor exists and is accepting patients
 *   3. the doctor publishes availability for that weekday
 *   4. the requested interval fits entirely inside one availability window
 *   5. the start time lands on the window's slot grid (no 10:07 bookings)
 *   6. no other *booked* appointment for that doctor overlaps
 *   7. the patient isn't double-booked with someone else at the same time
 *
 * `ignoreAppointmentId` lets a reschedule skip colliding with itself.
 */
async function detectConflicts({
  doctorId, patientId, dateTime, durationMinutes, ignoreAppointmentId = null, now = new Date(),
}) {
  const start = new Date(dateTime);
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest('dateTime is not a valid date');

  // 1. no time travel
  if (start.getTime() <= now.getTime()) {
    throw ApiError.badRequest('Appointments must be booked for a future time', { code: 'SLOT_IN_PAST' });
  }

  // 2. doctor must exist and be open for business
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw ApiError.notFound('Doctor not found');
  if (!doctor.isAcceptingPatients) {
    throw ApiError.conflict('This doctor is not currently accepting appointments', { code: 'DOCTOR_UNAVAILABLE' });
  }

  const duration = durationMinutes || defaultDurationForDoctor(doctor, start);
  const end = addMinutes(start, duration);

  // 3 + 4 + 5. must fall inside a published availability window, on the grid
  const windows = (doctor.availableSlots || []).filter((s) => s.dayOfWeek === dayOfWeek(start));
  if (windows.length === 0) {
    throw ApiError.conflict('The doctor does not consult on this day', { code: 'OUTSIDE_AVAILABILITY' });
  }

  const window = windows.find((w) => fitsInTimeWindow(start, end, w.startTime, w.endTime));
  if (!window) {
    throw ApiError.conflict(
      'The requested time is outside the doctor\'s available hours (or the visit would run past them)',
      { code: 'OUTSIDE_AVAILABILITY', details: { windows: windows.map((w) => `${w.startTime}-${w.endTime}`) } }
    );
  }

  const gridSlots = expandWindowToSlots(window.startTime, window.endTime, window.slotDurationMinutes || duration);
  if (!gridSlots.includes(toTimeKey(start))) {
    throw ApiError.conflict('Appointments must start on a published slot boundary', {
      code: 'INVALID_SLOT_BOUNDARY',
      details: { validStarts: gridSlots },
    });
  }

  // 6. doctor double-booking. Query a padded day range, then do exact interval
  // math in memory — cheap, and keeps the overlap rule in one tested helper.
  const doctorAppointments = await findBookedInRange({
    filter: { doctorId },
    from: addDays(startOfDay(start), -1),
    to: addDays(endOfDay(start), 1),
    ignoreAppointmentId,
  });

  const doctorClash = findConflict(doctorAppointments, start, end);
  if (doctorClash) {
    throw ApiError.conflict('The doctor already has an appointment overlapping that time', {
      code: 'DOCTOR_DOUBLE_BOOKED',
      details: { conflictingAppointmentId: String(doctorClash._id), conflictingTime: doctorClash.dateTime },
    });
  }

  // 7. patient double-booking (with any doctor)
  if (patientId) {
    const patientAppointments = await findBookedInRange({
      filter: { patientId },
      from: addDays(startOfDay(start), -1),
      to: addDays(endOfDay(start), 1),
      ignoreAppointmentId,
    });
    const patientClash = findConflict(patientAppointments, start, end);
    if (patientClash) {
      throw ApiError.conflict('You already have another appointment at that time', {
        code: 'PATIENT_DOUBLE_BOOKED',
        details: { conflictingAppointmentId: String(patientClash._id) },
      });
    }
  }

  return { ok: true, doctor, start, end, durationMinutes: duration };
}

async function findBookedInRange({ filter, from, to, ignoreAppointmentId }) {
  const query = {
    ...filter,
    status: 'booked',
    dateTime: { $gte: from, $lte: to },
  };
  if (ignoreAppointmentId) query._id = { $ne: ignoreAppointmentId };
  return Appointment.find(query).select('_id dateTime durationMinutes doctorId patientId').lean();
}

function defaultDurationForDoctor(doctor, when) {
  const window = (doctor.availableSlots || []).find((s) => s.dayOfWeek === dayOfWeek(when));
  return window?.slotDurationMinutes || env.DEFAULT_APPOINTMENT_MINUTES;
}

/* ------------------------------------------------------------------ *
 *  AVAILABILITY
 * ------------------------------------------------------------------ */

/**
 * Slot list for a doctor on a given UTC date, each marked available/taken.
 * The frontend SlotPicker renders this directly — same rules as the booking
 * check, so the UI can't offer something the API would reject.
 */
async function getAvailability(doctorId, dateKey, { now = new Date() } = {}) {
  const doctor = await Doctor.findById(doctorId).populate('departmentId', 'name consultationFee');
  if (!doctor) throw ApiError.notFound('Doctor not found');

  const day = combineDateAndTime(dateKey, '00:00');
  if (Number.isNaN(day.getTime())) throw ApiError.badRequest('date must be in YYYY-MM-DD format');

  const windows = (doctor.availableSlots || []).filter((s) => s.dayOfWeek === dayOfWeek(day));

  const booked = await Appointment.find({
    doctorId,
    status: 'booked',
    dateTime: { $gte: startOfDay(day), $lte: endOfDay(day) },
  }).select('dateTime durationMinutes').lean();

  const slots = [];
  for (const w of windows) {
    const duration = w.slotDurationMinutes || env.DEFAULT_APPOINTMENT_MINUTES;
    for (const hhmm of expandWindowToSlots(w.startTime, w.endTime, duration)) {
      const start = combineDateAndTime(dateKey, hhmm);
      const end = addMinutes(start, duration);

      const taken = booked.some((a) => intervalsOverlap(
        start, end, a.dateTime, new Date(new Date(a.dateTime).getTime() + (a.durationMinutes || duration) * MS_PER_MINUTE)
      ));
      const isPast = start.getTime() <= now.getTime();

      slots.push({
        startTime: hhmm,
        dateTime: start.toISOString(),
        durationMinutes: duration,
        available: !taken && !isPast && doctor.isAcceptingPatients,
        reason: taken ? 'booked' : isPast ? 'past' : !doctor.isAcceptingPatients ? 'doctor_unavailable' : null,
      });
    }
  }

  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return {
    doctorId: String(doctor._id),
    date: dateKey,
    dayOfWeek: dayOfWeek(day),
    consultationFee: doctor.consultationFee,
    isAcceptingPatients: doctor.isAcceptingPatients,
    totalSlots: slots.length,
    availableCount: slots.filter((s) => s.available).length,
    slots,
  };
}

/* ------------------------------------------------------------------ *
 *  BOOKING / LIFECYCLE
 * ------------------------------------------------------------------ */

async function bookAppointment(user, payload) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.CREATE);

  // A patient can only book for themselves; an admin may book on anyone's behalf.
  let patientId = payload.patientId;
  if (user.role === 'patient') {
    if (!user.patientId) throw ApiError.forbidden('Your account has no patient profile');
    if (patientId && String(patientId) !== String(user.patientId)) {
      throw ApiError.forbidden('You can only book appointments for yourself');
    }
    patientId = user.patientId;
  }
  if (!patientId) throw ApiError.badRequest('patientId is required');

  const patient = await Patient.findById(patientId);
  if (!patient) throw ApiError.notFound('Patient not found');

  const { doctor, start, durationMinutes } = await detectConflicts({
    doctorId: payload.doctorId,
    patientId,
    dateTime: payload.dateTime,
    durationMinutes: payload.durationMinutes,
  });

  try {
    const appointment = await Appointment.create({
      patientId,
      doctorId: doctor._id,
      departmentId: doctor.departmentId,
      dateTime: start,
      durationMinutes,
      reason: payload.reason,
      status: 'booked',
      createdBy: user.id,
    });

    await notifyParticipants('booked', appointment);
    logger.info(`Appointment ${appointment._id} booked for patient ${patientId} with doctor ${doctor._id}`);
    return populateAppointment(appointment._id);
  } catch (err) {
    // The partial unique index is the last line of defence against two
    // requests passing detectConflicts concurrently.
    if (err.code === 11000) {
      throw ApiError.conflict('That slot was just taken — please pick another', { code: 'DOCTOR_DOUBLE_BOOKED' });
    }
    throw err;
  }
}

async function listAppointments(user, query = {}) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.READ);

  const filter = { ...rbac.ownershipFilter(user, RESOURCES.APPOINTMENT) };

  if (query.status) filter.status = query.status;
  if (query.doctorId && user.role === 'admin') filter.doctorId = query.doctorId;
  if (query.patientId && user.role === 'admin') filter.patientId = query.patientId;
  if (query.from || query.to) {
    filter.dateTime = {};
    if (query.from) filter.dateTime.$gte = new Date(query.from);
    if (query.to) filter.dateTime.$lte = new Date(query.to);
  }
  if (query.upcoming === 'true') {
    filter.dateTime = { ...(filter.dateTime || {}), $gte: new Date() };
    filter.status = filter.status || 'booked';
  }

  return paginateQuery(Appointment, filter, {
    query,
    sort: { dateTime: query.sort === 'asc' ? 1 : -1 },
    populate: [
      { path: 'patientId', select: 'userId dob gender bloodGroup', populate: { path: 'userId', select: 'name email phone' } },
      { path: 'doctorId', select: 'userId specialization consultationFee', populate: { path: 'userId', select: 'name email' } },
      { path: 'departmentId', select: 'name' },
    ],
  });
}

async function getAppointmentById(user, id) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.READ);
  const appointment = await populateAppointment(id);
  if (!appointment) throw ApiError.notFound('Appointment not found');
  // Ownership, not just role: a doctor may only open their own appointments.
  rbac.assertAccess(user, RESOURCES.APPOINTMENT, ACTIONS.READ, appointment);
  return appointment;
}

async function cancelAppointment(user, id, { reason } = {}) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.CANCEL);

  const appointment = await Appointment.findById(id);
  if (!appointment) throw ApiError.notFound('Appointment not found');
  rbac.assertAccess(user, RESOURCES.APPOINTMENT, ACTIONS.CANCEL, appointment);

  if (appointment.status === 'cancelled') throw ApiError.conflict('Appointment is already cancelled');
  if (appointment.status === 'completed') throw ApiError.conflict('A completed appointment cannot be cancelled');

  // Patients get a cancellation window; staff can always cancel.
  if (user.role === 'patient') {
    const hoursUntil = (appointment.dateTime.getTime() - Date.now()) / (60 * 60 * 1000);
    if (hoursUntil < env.CANCELLATION_WINDOW_HOURS) {
      throw ApiError.conflict(
        `Appointments can only be cancelled at least ${env.CANCELLATION_WINDOW_HOURS}h in advance — please call the front desk`,
        { code: 'CANCELLATION_WINDOW_PASSED' }
      );
    }
  }

  appointment.status = 'cancelled';
  appointment.cancelledAt = new Date();
  appointment.cancelledBy = user.id;
  appointment.cancellationReason = reason;
  await appointment.save();

  // Cascade: the slot frees itself (the partial index only counts `booked`),
  // and any unpaid invoice for the visit is voided.
  const voided = await voidDraftInvoice(appointment._id, user.id);

  await notifyParticipants('cancelled', appointment, { reason });
  logger.info(`Appointment ${appointment._id} cancelled by ${user.role} ${user.id}${voided ? ' (invoice voided)' : ''}`);

  return populateAppointment(appointment._id);
}

async function voidDraftInvoice(appointmentId, userId) {
  const invoice = await Invoice.findOne({ appointmentId });
  if (!invoice || invoice.status === 'void') return false;
  if (invoice.amountPaid > 0) return false; // money moved — leave it to billing
  invoice.status = 'void';
  invoice.voidedAt = new Date();
  invoice.voidReason = 'Appointment cancelled';
  invoice.generatedBy = invoice.generatedBy || userId;
  await invoice.save();
  return true;
}

/**
 * Doctor marks the visit done. This is the gate that unlocks MedicalRecord
 * creation and (optionally) generates the invoice.
 */
async function completeAppointment(user, id, { notes, generateInvoice = true } = {}) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.COMPLETE);

  const appointment = await Appointment.findById(id);
  if (!appointment) throw ApiError.notFound('Appointment not found');
  rbac.assertAccess(user, RESOURCES.APPOINTMENT, ACTIONS.COMPLETE, appointment);

  if (appointment.status === 'completed') throw ApiError.conflict('Appointment is already completed');
  if (appointment.status === 'cancelled') throw ApiError.conflict('A cancelled appointment cannot be completed');

  appointment.status = 'completed';
  appointment.completedAt = new Date();
  if (notes) appointment.notes = notes;
  await appointment.save();

  let invoice = null;
  if (generateInvoice) {
    // Required lazily: billing.service also reads appointments, and requiring
    // it at module load would create a cycle.
    const billingService = require('./billing.service');
    try {
      invoice = await billingService.generateInvoiceForAppointment(user, appointment._id, { system: true });
    } catch (err) {
      // A billing hiccup must not roll back a completed visit.
      logger.warn(`Invoice generation failed for appointment ${appointment._id}: ${err.message}`);
    }
  }

  await notifyParticipants('completed', appointment);

  return { appointment: await populateAppointment(appointment._id), invoice };
}

function populateAppointment(id) {
  return Appointment.findById(id)
    .populate({ path: 'patientId', select: 'userId dob gender bloodGroup', populate: { path: 'userId', select: 'name email phone' } })
    .populate({ path: 'doctorId', select: 'userId specialization consultationFee', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'departmentId', select: 'name consultationFee' })
    .populate('medicalRecord')
    .populate('invoice');
}

/** Look up the human-readable participants and hand off to notification.service. */
async function notifyParticipants(event, appointment, extra = {}) {
  try {
    const [patient, doctor] = await Promise.all([
      Patient.findById(appointment.patientId).populate('userId', 'name email').lean(),
      Doctor.findById(appointment.doctorId).populate('userId', 'name email').lean(),
    ]);
    const payload = {
      to: patient?.userId?.email || 'unknown@example.com',
      patientName: patient?.userId?.name || 'patient',
      doctorName: doctor?.userId?.name || 'doctor',
      dateTime: appointment.dateTime,
      ...extra,
    };
    if (event === 'booked') notify.appointmentBooked(payload);
    if (event === 'cancelled') notify.appointmentCancelled(payload);
    if (event === 'completed') notify.appointmentCompleted(payload);
  } catch (err) {
    logger.warn(`Could not send ${event} notification: ${err.message}`);
  }
}

/** Doctor-facing: today's schedule. */
async function getDoctorSchedule(user, doctorId, dateKey) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.READ);
  if (user.role === 'doctor' && String(user.doctorId) !== String(doctorId)) {
    throw ApiError.forbidden('You can only view your own schedule');
  }
  const day = combineDateAndTime(dateKey || toDateKey(new Date()), '00:00');
  const items = await Appointment.find({
    doctorId,
    dateTime: { $gte: startOfDay(day), $lte: endOfDay(day) },
    status: { $ne: 'cancelled' },
  })
    .sort({ dateTime: 1 })
    .populate({ path: 'patientId', select: 'userId dob gender', populate: { path: 'userId', select: 'name email phone' } });

  return { date: toDateKey(day), count: items.length, items };
}

module.exports = {
  detectConflicts,
  getAvailability,
  bookAppointment,
  listAppointments,
  getAppointmentById,
  cancelAppointment,
  completeAppointment,
  getDoctorSchedule,
  populateAppointment,
};
