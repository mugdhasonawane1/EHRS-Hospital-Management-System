'use strict';

const MedicalRecord = require('../models/MedicalRecord');
const Prescription = require('../models/Prescription');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const { ApiError } = require('../utils/apiResponse');
const { paginateQuery } = require('../utils/paginate');
const rbac = require('./rbac.service');
const logger = require('../utils/logger');

const { RESOURCES, ACTIONS } = rbac;

/**
 * A medical record may only be created from an appointment that
 *   (a) exists, (b) belongs to the calling doctor, (c) is `completed`,
 *   (d) doesn't already have a record.
 * Enforced here — the frontend hiding the button is not a control.
 */
async function createRecord(user, payload) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.CREATE);
  if (!user.doctorId) throw ApiError.forbidden('Your account has no doctor profile');

  const appointment = await Appointment.findById(payload.appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  if (String(appointment.doctorId) !== String(user.doctorId)) {
    throw ApiError.forbidden('You can only write records for your own appointments');
  }
  if (appointment.status !== 'completed') {
    throw ApiError.conflict('A medical record can only be created for a completed appointment', {
      code: 'APPOINTMENT_NOT_COMPLETED',
      details: { currentStatus: appointment.status },
    });
  }
  if (await MedicalRecord.exists({ appointmentId: appointment._id })) {
    throw ApiError.conflict('This appointment already has a medical record', { code: 'RECORD_EXISTS' });
  }

  const record = await MedicalRecord.create({
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    appointmentId: appointment._id,
    diagnosis: payload.diagnosis,
    symptoms: payload.symptoms || [],
    notes: payload.notes,
    vitals: payload.vitals,
    followUpDate: payload.followUpDate,
  });

  // Optional prescription created in the same call — one form, one request.
  if (payload.prescription && payload.prescription.medicines?.length) {
    await Prescription.create({
      medicalRecordId: record._id,
      patientId: record.patientId,
      doctorId: record.doctorId,
      medicines: payload.prescription.medicines,
      advice: payload.prescription.advice,
    });
  }

  logger.info(`Medical record ${record._id} created for appointment ${appointment._id}`);
  return getRecordById(user, record._id);
}

async function updateRecord(user, id, payload) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.UPDATE);
  const record = await MedicalRecord.findById(id);
  if (!record) throw ApiError.notFound('Medical record not found');
  rbac.assertAccess(user, RESOURCES.MEDICAL_RECORD, ACTIONS.UPDATE, record);

  const updatable = ['diagnosis', 'symptoms', 'notes', 'vitals', 'followUpDate'];
  for (const key of updatable) {
    if (payload[key] !== undefined) record[key] = payload[key];
  }
  await record.save();
  return getRecordById(user, record._id);
}

/**
 * Access-control filtered retrieval.
 * The ownership filter is folded into the query, so a patient literally cannot
 * page past their own records even by guessing ids.
 */
async function listRecords(user, query = {}) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.READ);
  const filter = { ...rbac.ownershipFilter(user, RESOURCES.MEDICAL_RECORD) };

  if (query.patientId) {
    if (user.role === 'patient' && String(query.patientId) !== String(user.patientId)) {
      throw ApiError.forbidden('You can only view your own medical records');
    }
    if (user.role === 'doctor') {
      // Doctors may query by patient, but only for patients they've treated;
      // the doctorId filter above already narrows it, so this is belt & braces.
      await assertHasTreated(user.doctorId, query.patientId);
    }
    filter.patientId = query.patientId;
  }
  if (query.doctorId && user.role === 'admin') filter.doctorId = query.doctorId;
  if (query.appointmentId) filter.appointmentId = query.appointmentId;

  return paginateQuery(MedicalRecord, filter, {
    query,
    sort: { createdAt: -1 },
    populate: [
      { path: 'patientId', select: 'userId dob gender bloodGroup allergies', populate: { path: 'userId', select: 'name email' } },
      { path: 'doctorId', select: 'userId specialization', populate: { path: 'userId', select: 'name' } },
      { path: 'appointmentId', select: 'dateTime status reason' },
      { path: 'prescriptions' },
    ],
  });
}

async function getRecordById(user, id) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.READ);
  const record = await MedicalRecord.findById(id)
    .populate({ path: 'patientId', select: 'userId dob gender bloodGroup allergies', populate: { path: 'userId', select: 'name email' } })
    .populate({ path: 'doctorId', select: 'userId specialization', populate: { path: 'userId', select: 'name' } })
    .populate({ path: 'appointmentId', select: 'dateTime status reason' })
    .populate('prescriptions');

  if (!record) throw ApiError.notFound('Medical record not found');
  // record.doctorId === req.user.doctorId, not merely "is a doctor".
  rbac.assertAccess(user, RESOURCES.MEDICAL_RECORD, ACTIONS.READ, record);
  return record;
}

/** GET /api/medical-records/patient/:patientId — the RBAC-filtered history view. */
async function getPatientHistory(user, patientId, query = {}) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.READ);

  const patient = await Patient.findById(patientId).populate('userId', 'name email phone');
  if (!patient) throw ApiError.notFound('Patient not found');

  if (user.role === 'patient' && String(patientId) !== String(user.patientId)) {
    throw ApiError.forbidden('You can only view your own medical history');
  }
  if (user.role === 'doctor') await assertHasTreated(user.doctorId, patientId);

  const filter = { patientId };
  if (user.role === 'doctor') filter.doctorId = user.doctorId;

  const { items, meta } = await paginateQuery(MedicalRecord, filter, {
    query,
    sort: { createdAt: -1 },
    populate: [
      { path: 'doctorId', select: 'userId specialization', populate: { path: 'userId', select: 'name' } },
      { path: 'appointmentId', select: 'dateTime status reason' },
      { path: 'prescriptions' },
    ],
  });

  return { patient, records: items, meta };
}

/**
 * A doctor is allowed near a patient's chart only if there is an appointment
 * linking them. This is the ownership rule for the patient resource.
 */
async function assertHasTreated(doctorId, patientId) {
  const linked = await Appointment.exists({ doctorId, patientId });
  if (!linked) throw ApiError.forbidden('You have no appointment history with this patient');
  return true;
}

/* ---------------------------- prescriptions ---------------------------- */

async function createPrescription(user, payload) {
  rbac.assertCan(user, RESOURCES.PRESCRIPTION, ACTIONS.CREATE);
  const record = await MedicalRecord.findById(payload.medicalRecordId);
  if (!record) throw ApiError.notFound('Medical record not found');
  rbac.assertAccess(user, RESOURCES.MEDICAL_RECORD, ACTIONS.UPDATE, record);

  const prescription = await Prescription.create({
    medicalRecordId: record._id,
    patientId: record.patientId,
    doctorId: record.doctorId,
    medicines: payload.medicines,
    advice: payload.advice,
  });

  logger.info(`Prescription ${prescription._id} issued on record ${record._id}`);
  return prescription;
}

async function listPrescriptions(user, query = {}) {
  rbac.assertCan(user, RESOURCES.PRESCRIPTION, ACTIONS.READ);
  const filter = { ...rbac.ownershipFilter(user, RESOURCES.PRESCRIPTION) };
  if (query.medicalRecordId) filter.medicalRecordId = query.medicalRecordId;
  if (query.patientId) {
    if (user.role === 'patient' && String(query.patientId) !== String(user.patientId)) {
      throw ApiError.forbidden('You can only view your own prescriptions');
    }
    filter.patientId = query.patientId;
  }

  return paginateQuery(Prescription, filter, {
    query,
    sort: { issuedAt: -1 },
    populate: [
      { path: 'doctorId', select: 'userId specialization', populate: { path: 'userId', select: 'name' } },
      { path: 'medicalRecordId', select: 'diagnosis createdAt' },
    ],
  });
}

module.exports = {
  createRecord,
  updateRecord,
  listRecords,
  getRecordById,
  getPatientHistory,
  createPrescription,
  listPrescriptions,
  assertHasTreated,
};
