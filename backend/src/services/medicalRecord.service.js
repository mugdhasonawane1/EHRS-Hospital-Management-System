'use strict';

const { prisma } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/paginate');
const rbac = require('./rbac.service');
const logger = require('../utils/logger');

const { RESOURCES, ACTIONS } = rbac;

const recordInclude = {
  patient: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } },
  doctor: { include: { user: { select: { id: true, name: true } } } },
  appointment: { select: { id: true, dateTime: true, status: true, reason: true } },
  prescription: { include: { medicines: true } },
};

function asApiRecord(record) {
  if (!record) return null;
  return {
    ...record,
    patientId: record.patient ? { ...record.patient, userId: record.patient.user } : record.patientId,
    doctorId: record.doctor ? { ...record.doctor, userId: record.doctor.user } : record.doctorId,
    appointmentId: record.appointment || record.appointmentId,
    prescriptions: record.prescription ? [record.prescription] : [],
  };
}

function asApiPrescription(prescription) {
  if (!prescription) return null;
  return {
    ...prescription,
    medicalRecordId: prescription.medicalRecord || prescription.medicalRecordId,
    doctorId: prescription.doctor ? { ...prescription.doctor, userId: prescription.doctor.user } : prescription.doctorId,
    medicines: prescription.medicines || [],
  };
}

function ownershipWhere(user) {
  if (user.role === 'patient') return { patientId: user.patientId };
  if (user.role === 'doctor') return { doctorId: user.doctorId };
  return {};
}

function vitalsData(vitals) {
  if (!vitals) return {};
  const result = {};
  for (const key of ['temperatureC', 'pulseBpm', 'systolic', 'diastolic', 'weightKg', 'heightCm']) {
    if (vitals[key] !== undefined && vitals[key] !== null && vitals[key] !== '') {
      result[key] = ['temperatureC', 'weightKg', 'heightCm'].includes(key)
        ? Number(vitals[key]) : Number.parseInt(vitals[key], 10);
    }
  }
  return result;
}

function prescriptionCreateData(prescription) {
  return {
    advice: prescription.advice || null,
    medicines: {
      create: prescription.medicines.map((medicine) => ({
        name: medicine.name, dosage: medicine.dosage,
        frequency: medicine.frequency || null, duration: medicine.duration,
        instructions: medicine.instructions || null,
      })),
    },
  };
}

async function createRecord(user, payload) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.CREATE);
  if (!user.doctorId) throw ApiError.forbidden('Your account has no doctor profile');

  const appointment = await prisma.appointment.findUnique({ where: { id: payload.appointmentId } });
  if (!appointment) throw ApiError.notFound('Appointment not found');
  if (appointment.doctorId !== user.doctorId) {
    throw ApiError.forbidden('You can only write records for your own appointments');
  }
  if (appointment.status !== 'COMPLETED') {
    throw ApiError.conflict('A medical record can only be created for a completed appointment', {
      code: 'APPOINTMENT_NOT_COMPLETED', details: { currentStatus: appointment.status.toLowerCase() },
    });
  }
  const existing = await prisma.medicalRecord.findUnique({ where: { appointmentId: appointment.id } });
  if (existing) throw ApiError.conflict('This appointment already has a medical record', { code: 'RECORD_EXISTS' });

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.medicalRecord.create({
      data: {
        patientId: appointment.patientId, doctorId: appointment.doctorId,
        appointmentId: appointment.id, diagnosis: payload.diagnosis,
        symptoms: payload.symptoms || [], notes: payload.notes || null,
        ...vitalsData(payload.vitals),
        followUpDate: payload.followUpDate ? new Date(payload.followUpDate) : null,
      },
    });
    if (payload.prescription?.medicines?.length) {
      await tx.prescription.create({
        data: {
          medicalRecordId: created.id, patientId: created.patientId, doctorId: created.doctorId,
          ...prescriptionCreateData(payload.prescription),
        },
      });
    }
    return tx.medicalRecord.findUnique({ where: { id: created.id }, include: recordInclude });
  });

  logger.info(`Medical record ${record.id} created for appointment ${appointment.id}`);
  return asApiRecord(record);
}

async function updateRecord(user, id, payload) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.UPDATE);
  const record = await prisma.medicalRecord.findUnique({ where: { id } });
  if (!record) throw ApiError.notFound('Medical record not found');
  rbac.assertAccess(user, RESOURCES.MEDICAL_RECORD, ACTIONS.UPDATE, record);

  const data = {};
  for (const key of ['diagnosis', 'symptoms', 'notes', 'followUpDate']) {
    if (payload[key] !== undefined) data[key] = key === 'followUpDate'
      ? (payload[key] ? new Date(payload[key]) : null) : payload[key];
  }
  Object.assign(data, vitalsData(payload.vitals));
  const updated = await prisma.medicalRecord.update({
    where: { id }, data, include: recordInclude,
  });
  return asApiRecord(updated);
}

async function listRecords(user, query = {}) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.READ);
  const { page, limit, skip } = getPagination(query);
  const where = { ...ownershipWhere(user) };

  if (query.patientId) {
    if (user.role === 'patient' && String(query.patientId) !== String(user.patientId)) {
      throw ApiError.forbidden('You can only view your own medical records');
    }
    if (user.role === 'doctor') await assertHasTreated(user.doctorId, query.patientId);
    where.patientId = query.patientId;
  }
  if (query.doctorId && user.role === 'admin') where.doctorId = query.doctorId;
  if (query.appointmentId) where.appointmentId = query.appointmentId;

  const [records, total] = await Promise.all([
    prisma.medicalRecord.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: recordInclude,
    }),
    prisma.medicalRecord.count({ where }),
  ]);
  return { items: records.map(asApiRecord), meta: buildMeta({ page, limit, total }) };
}

async function getRecordById(user, id) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.READ);
  const record = await prisma.medicalRecord.findUnique({ where: { id }, include: recordInclude });
  if (!record) throw ApiError.notFound('Medical record not found');
  rbac.assertAccess(user, RESOURCES.MEDICAL_RECORD, ACTIONS.READ, record);
  return asApiRecord(record);
}

async function getPatientHistory(user, patientId, query = {}) {
  rbac.assertCan(user, RESOURCES.MEDICAL_RECORD, ACTIONS.READ);
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });
  if (!patient) throw ApiError.notFound('Patient not found');
  if (user.role === 'patient' && String(patientId) !== String(user.patientId)) {
    throw ApiError.forbidden('You can only view your own medical history');
  }
  if (user.role === 'doctor') await assertHasTreated(user.doctorId, patientId);

  const { page, limit, skip } = getPagination(query);
  const where = { patientId, ...(user.role === 'doctor' ? { doctorId: user.doctorId } : {}) };
  const [records, total] = await Promise.all([
    prisma.medicalRecord.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: recordInclude,
    }),
    prisma.medicalRecord.count({ where }),
  ]);
  return {
    patient: { ...patient, userId: patient.user },
    records: records.map(asApiRecord),
    meta: buildMeta({ page, limit, total }),
  };
}

async function assertHasTreated(doctorId, patientId) {
  const linked = await prisma.appointment.findFirst({
    where: { doctorId, patientId },
    select: { id: true },
  });
  if (!linked) throw ApiError.forbidden('You have no appointment history with this patient');
  return true;
}

async function createPrescription(user, payload) {
  rbac.assertCan(user, RESOURCES.PRESCRIPTION, ACTIONS.CREATE);
  const record = await prisma.medicalRecord.findUnique({ where: { id: payload.medicalRecordId } });
  if (!record) throw ApiError.notFound('Medical record not found');
  rbac.assertAccess(user, RESOURCES.MEDICAL_RECORD, ACTIONS.UPDATE, record);

  const prescription = await prisma.prescription.create({
    data: {
      medicalRecordId: record.id, patientId: record.patientId, doctorId: record.doctorId,
      ...prescriptionCreateData(payload),
    },
    include: {
      medicines: true,
      medicalRecord: { select: { id: true, diagnosis: true, createdAt: true } },
      doctor: { include: { user: { select: { name: true } } } },
    },
  });
  logger.info(`Prescription ${prescription.id} issued on record ${record.id}`);
  return asApiPrescription(prescription);
}

async function listPrescriptions(user, query = {}) {
  rbac.assertCan(user, RESOURCES.PRESCRIPTION, ACTIONS.READ);
  const { page, limit, skip } = getPagination(query);
  const where = { ...ownershipWhere(user) };
  if (query.medicalRecordId) where.medicalRecordId = query.medicalRecordId;
  if (query.patientId) {
    if (user.role === 'patient' && String(query.patientId) !== String(user.patientId)) {
      throw ApiError.forbidden('You can only view your own prescriptions');
    }
    where.patientId = query.patientId;
  }

  const include = {
    medicines: true,
    medicalRecord: { select: { id: true, diagnosis: true, createdAt: true } },
    doctor: { include: { user: { select: { name: true } } } },
  };
  const [items, total] = await Promise.all([
    prisma.prescription.findMany({
      where, skip, take: limit, orderBy: { issuedAt: 'desc' }, include,
    }),
    prisma.prescription.count({ where }),
  ]);
  return {
    items: items.map(asApiPrescription),
    meta: buildMeta({ page, limit, total }),
  };
}

module.exports = {
  createRecord, updateRecord, listRecords, getRecordById, getPatientHistory,
  createPrescription, listPrescriptions, assertHasTreated,
};
