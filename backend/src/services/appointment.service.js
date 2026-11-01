'use strict';

const { prisma } = require('../config/db');
const env = require('../config/env');
const { ApiError } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/paginate');
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
const ACTIVE = 'BOOKED';

const appointmentInclude = {
  patient: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
  doctor: { include: { user: { select: { id: true, name: true, email: true } } } },
  department: true,
  medicalRecord: { include: { prescription: { include: { medicines: true } } } },
  invoice: { include: { items: true, payments: true } },
};

function asApiAppointment(a) {
  if (!a) return null;
  return {
    ...a,
    patientId: a.patient ? { ...a.patient, userId: a.patient.user } : a.patientId,
    doctorId: a.doctor ? { ...a.doctor, userId: a.doctor.user } : a.doctorId,
    departmentId: a.department || a.departmentId,
    medicalRecord: a.medicalRecord || null,
    invoice: a.invoice || null,
  };
}

function statusValue(status) {
  if (!status) return undefined;
  const value = String(status).toUpperCase();
  return ['BOOKED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(value) ? value : null;
}

function defaultDurationForDoctor(doctor, when) {
  const window = (doctor.availabilitySlots || []).find((s) => s.dayOfWeek === dayOfWeek(when));
  return window?.slotDurationMinutes || env.DEFAULT_APPOINTMENT_MINUTES;
}

function patientWhere(user) {
  if (user.role === 'patient') return { patientId: user.patientId };
  if (user.role === 'doctor') return { doctorId: user.doctorId };
  return {};
}

async function findBookedInRange(tx, { doctorId, patientId, from, to, ignoreAppointmentId }) {
  const where = {
    status: ACTIVE,
    dateTime: { gte: from, lte: to },
    ...(doctorId ? { doctorId } : {}),
    ...(patientId ? { patientId } : {}),
    ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {}),
  };
  return tx.appointment.findMany({
    where,
    select: { id: true, dateTime: true, durationMinutes: true, doctorId: true, patientId: true },
  });
}

async function detectConflicts({
  doctorId, patientId, dateTime, durationMinutes, ignoreAppointmentId = null, now = new Date(),
}) {
  const start = new Date(dateTime);
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest('dateTime is not a valid date');
  if (start.getTime() <= now.getTime()) {
    throw ApiError.badRequest('Appointments must be booked for a future time', { code: 'SLOT_IN_PAST' });
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { availabilitySlots: true, department: true },
  });
  if (!doctor) throw ApiError.notFound('Doctor not found');
  if (!doctor.isAcceptingPatients) {
    throw ApiError.conflict('This doctor is not currently accepting appointments', { code: 'DOCTOR_UNAVAILABLE' });
  }

  const duration = Number(durationMinutes || defaultDurationForDoctor(doctor, start));
  const end = addMinutes(start, duration);
  const windows = doctor.availabilitySlots.filter((s) => s.dayOfWeek === dayOfWeek(start));
  if (!windows.length) {
    throw ApiError.conflict('The doctor does not consult on this day', { code: 'OUTSIDE_AVAILABILITY' });
  }

  const window = windows.find((w) => fitsInTimeWindow(start, end, w.startTime, w.endTime));
  if (!window) {
    throw ApiError.conflict(
      'The requested time is outside the doctor\'s available hours (or the visit would run past them)',
      { code: 'OUTSIDE_AVAILABILITY', details: { windows: windows.map((w) => `${w.startTime}-${w.endTime}`) } }
    );
  }

  const gridSlots = expandWindowToSlots(
    window.startTime, window.endTime, window.slotDurationMinutes || duration
  );
  if (!gridSlots.includes(toTimeKey(start))) {
    throw ApiError.conflict('Appointments must start on a published slot boundary', {
      code: 'INVALID_SLOT_BOUNDARY', details: { validStarts: gridSlots },
    });
  }

  const from = addDays(startOfDay(start), -1);
  const to = addDays(endOfDay(start), 1);
  const [doctorAppointments, patientAppointments] = await Promise.all([
    findBookedInRange(prisma, { doctorId, from, to, ignoreAppointmentId }),
    patientId ? findBookedInRange(prisma, { patientId, from, to, ignoreAppointmentId }) : [],
  ]);

  const doctorClash = findConflict(doctorAppointments, start, end);
  const capacity = /physio/i.test(doctor.specialization || '')
    ? 4
    : Math.max(1, Number(doctor.maxPatientsPerSlot || 1));
  const overlapping = doctorAppointments.filter((a) =>
    intervalsOverlap(start, end, a.dateTime,
      new Date(new Date(a.dateTime).getTime() + (a.durationMinutes || duration) * MS_PER_MINUTE))
  );

  if (doctorClash && capacity <= 1) {
    throw ApiError.conflict('The doctor already has an appointment overlapping that time', {
      code: 'DOCTOR_DOUBLE_BOOKED',
      details: { conflictingAppointmentId: doctorClash.id, conflictingTime: doctorClash.dateTime },
    });
  }
  if (overlapping.length >= capacity) {
    throw ApiError.conflict('This appointment slot has reached its patient capacity', {
      code: 'SLOT_CAPACITY_REACHED', details: { capacity },
    });
  }

  const patientClash = patientId ? findConflict(patientAppointments, start, end) : null;
  if (patientClash) {
    throw ApiError.conflict('You already have another appointment at that time', {
      code: 'PATIENT_DOUBLE_BOOKED',
      details: { conflictingAppointmentId: patientClash.id, conflictingTime: patientClash.dateTime },
    });
  }

  return { ok: true, doctor, start, end, durationMinutes: duration };
}

async function getAvailability(doctorId, dateKey, { now = new Date() } = {}) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { department: true, availabilitySlots: true },
  });
  if (!doctor) throw ApiError.notFound('Doctor not found');

  const day = combineDateAndTime(dateKey, '00:00');
  if (Number.isNaN(day.getTime())) throw ApiError.badRequest('date must be in YYYY-MM-DD format');

  const windows = doctor.availabilitySlots.filter((s) => s.dayOfWeek === dayOfWeek(day));
  const booked = await prisma.appointment.findMany({
    where: {
      doctorId, status: ACTIVE,
      dateTime: { gte: startOfDay(day), lte: endOfDay(day) },
    },
    select: { dateTime: true, durationMinutes: true },
  });

  const capacity = /physio/i.test(doctor.specialization || '')
    ? 4
    : Math.max(1, Number(doctor.maxPatientsPerSlot || 1));
  const slots = [];
  for (const w of windows) {
    const duration = w.slotDurationMinutes || env.DEFAULT_APPOINTMENT_MINUTES;
    for (const hhmm of expandWindowToSlots(w.startTime, w.endTime, duration)) {
      const start = combineDateAndTime(dateKey, hhmm);
      const end = addMinutes(start, duration);
      const overlapping = booked.filter((a) => intervalsOverlap(
        start, end, a.dateTime,
        new Date(new Date(a.dateTime).getTime() + (a.durationMinutes || duration) * MS_PER_MINUTE)
      )).length;
      const isPast = start.getTime() <= now.getTime();
      const available = overlapping < capacity && !isPast && doctor.isAcceptingPatients;
      slots.push({
        startTime: hhmm, dateTime: start.toISOString(), durationMinutes: duration,
        available,
        reason: overlapping >= capacity ? 'booked' : isPast ? 'past' :
          !doctor.isAcceptingPatients ? 'doctor_unavailable' : null,
        remainingCapacity: Math.max(0, capacity - overlapping),
      });
    }
  }
  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return {
    doctorId: doctor.id, date: dateKey, dayOfWeek: dayOfWeek(day),
    consultationFee: doctor.consultationFee, isAcceptingPatients: doctor.isAcceptingPatients,
    totalSlots: slots.length, availableCount: slots.filter((s) => s.available).length, slots,
  };
}

async function bookAppointment(user, payload) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.CREATE);
  let patientId = payload.patientId;
  if (user.role === 'patient') {
    if (!user.patientId) throw ApiError.forbidden('Your account has no patient profile');
    if (patientId && String(patientId) !== String(user.patientId)) {
      throw ApiError.forbidden('You can only book appointments for yourself');
    }
    patientId = user.patientId;
  }
  if (!patientId) throw ApiError.badRequest('patientId is required');

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw ApiError.notFound('Patient not found');

  const appointment = await prisma.$transaction(async (tx) => {
    // Serialize bookings for a doctor, so concurrent requests cannot exceed slot capacity.
    await tx.$queryRaw`SELECT id FROM doctor WHERE id = ${payload.doctorId} FOR UPDATE`;
    const { doctor, start, durationMinutes } = await detectConflicts({
      doctorId: payload.doctorId, patientId, dateTime: payload.dateTime,
      durationMinutes: payload.durationMinutes,
    });
    return tx.appointment.create({
      data: {
        patientId, doctorId: doctor.id, departmentId: doctor.departmentId,
        dateTime: start, durationMinutes, reason: payload.reason,
        status: 'BOOKED', createdBy: user.id,
      },
      include: appointmentInclude,
    });
  });

  await notifyParticipants('booked', appointment);
  logger.info(`Appointment ${appointment.id} booked for patient ${patientId} with doctor ${appointment.doctorId}`);
  return asApiAppointment(appointment);
}

async function listAppointments(user, query = {}) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.READ);
  const { page, limit, skip } = getPagination(query);
  const where = { ...patientWhere(user) };
  if (query.status) {
    const status = statusValue(query.status);
    if (!status) throw ApiError.badRequest('Invalid appointment status');
    where.status = status;
  }
  if (query.doctorId && user.role === 'admin') where.doctorId = query.doctorId;
  if (query.patientId && user.role === 'admin') where.patientId = query.patientId;
  if (query.from || query.to) {
    where.dateTime = {};
    if (query.from) where.dateTime.gte = new Date(query.from);
    if (query.to) where.dateTime.lte = new Date(query.to);
  }
  if (query.upcoming === 'true') {
    where.dateTime = { ...(where.dateTime || {}), gte: new Date() };
    where.status = where.status || ACTIVE;
  }
  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      where, skip, take: limit,
      orderBy: { dateTime: query.sort === 'asc' ? 'asc' : 'desc' },
      include: appointmentInclude,
    }),
    prisma.appointment.count({ where }),
  ]);
  return { items: items.map(asApiAppointment), meta: buildMeta({ page, limit, total }) };
}

async function populateAppointment(id) {
  const appointment = await prisma.appointment.findUnique({
    where: { id }, include: appointmentInclude,
  });
  return asApiAppointment(appointment);
}

async function getAppointmentById(user, id) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.READ);
  const appointment = await populateAppointment(id);
  if (!appointment) throw ApiError.notFound('Appointment not found');
  rbac.assertAccess(user, RESOURCES.APPOINTMENT, ACTIONS.READ, appointment);
  return appointment;
}

async function voidDraftInvoice(tx, appointmentId, userId) {
  const invoice = await tx.invoice.findUnique({ where: { appointmentId } });
  if (!invoice || invoice.status === 'VOID' || Number(invoice.amountPaid) > 0) return false;
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      status: 'VOID', voidedAt: new Date(), voidReason: 'Appointment cancelled',
      generatedBy: invoice.generatedBy || userId,
    },
  });
  return true;
}

async function cancelAppointment(user, id, { reason } = {}) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.CANCEL);
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw ApiError.notFound('Appointment not found');
  rbac.assertAccess(user, RESOURCES.APPOINTMENT, ACTIONS.CANCEL, appointment);
  if (appointment.status === 'CANCELLED') throw ApiError.conflict('Appointment is already cancelled');
  if (appointment.status === 'COMPLETED') throw ApiError.conflict('A completed appointment cannot be cancelled');

  if (user.role === 'patient') {
    const hoursUntil = (appointment.dateTime.getTime() - Date.now()) / 3600000;
    if (hoursUntil < env.CANCELLATION_WINDOW_HOURS) {
      throw ApiError.conflict(
        `Appointments can only be cancelled at least ${env.CANCELLATION_WINDOW_HOURS}h in advance — please call the front desk`,
        { code: 'CANCELLATION_WINDOW_PASSED' }
      );
    }
  }

  const voided = await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id },
      data: {
        status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: user.id,
        cancellationReason: reason || null,
      },
    });
    return voidDraftInvoice(tx, id, user.id);
  });
  const updated = await populateAppointment(id);
  await notifyParticipants('cancelled', updated, { reason });
  logger.info(`Appointment ${id} cancelled by ${user.role} ${user.id}${voided ? ' (invoice voided)' : ''}`);
  return updated;
}

async function completeAppointment(user, id, { notes, generateInvoice = true } = {}) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.COMPLETE);
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) throw ApiError.notFound('Appointment not found');
  rbac.assertAccess(user, RESOURCES.APPOINTMENT, ACTIONS.COMPLETE, appointment);
  if (appointment.status === 'COMPLETED') throw ApiError.conflict('Appointment is already completed');
  if (appointment.status === 'CANCELLED') throw ApiError.conflict('A cancelled appointment cannot be completed');

  await prisma.appointment.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date(), ...(notes ? { notes } : {}) },
  });

  let invoice = null;
  if (generateInvoice) {
    const billingService = require('./billing.service');
    try {
      invoice = await billingService.generateInvoiceForAppointment(user, id, { system: true });
    } catch (err) {
      logger.warn(`Invoice generation failed for appointment ${id}: ${err.message}`);
    }
  }
  const updated = await populateAppointment(id);
  await notifyParticipants('completed', updated);
  return { appointment: updated, invoice };
}

async function notifyParticipants(event, appointment, extra = {}) {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: appointment.patient?.id || appointment.patientId },
      include: { user: { select: { name: true, email: true } } },
    });
    const doctor = await prisma.doctor.findUnique({
      where: { id: appointment.doctor?.id || appointment.doctorId },
      include: { user: { select: { name: true, email: true } } },
    });
    const payload = {
      to: patient?.user?.email || 'unknown@example.com',
      patientName: patient?.user?.name || 'patient',
      doctorName: doctor?.user?.name || 'doctor',
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

async function getDoctorSchedule(user, doctorId, dateKey) {
  rbac.assertCan(user, RESOURCES.APPOINTMENT, ACTIONS.READ);
  if (user.role === 'doctor' && String(user.doctorId) !== String(doctorId)) {
    throw ApiError.forbidden('You can only view your own schedule');
  }
  const day = combineDateAndTime(dateKey || toDateKey(new Date()), '00:00');
  if (Number.isNaN(day.getTime())) throw ApiError.badRequest('date must be in YYYY-MM-DD format');
  const items = await prisma.appointment.findMany({
    where: {
      doctorId, dateTime: { gte: startOfDay(day), lte: endOfDay(day) },
      status: { not: 'CANCELLED' },
    },
    orderBy: { dateTime: 'asc' },
    include: {
      patient: { include: { user: { select: { name: true, email: true, phone: true } } } },
    },
  });
  const mapped = items.map((a) => ({
    ...a, patientId: a.patient ? { ...a.patient, userId: a.patient.user } : a.patientId,
  }));
  return { date: toDateKey(day), count: mapped.length, items: mapped };
}

module.exports = {
  detectConflicts, getAvailability, bookAppointment, listAppointments,
  getAppointmentById, cancelAppointment, completeAppointment, getDoctorSchedule,
  populateAppointment,
};
