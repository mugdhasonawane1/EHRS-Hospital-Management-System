'use strict';

const { z } = require('zod');
const { objectId, paginationQuery } = require('./common.validator');

const medicineSchema = z.object({
  name: z.string().min(1, 'Medicine name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().optional(),
  duration: z.string().min(1, 'Duration is required'),
  instructions: z.string().optional(),
});

const vitalsSchema = z.object({
  temperatureC: z.coerce.number().optional(),
  pulseBpm: z.coerce.number().optional(),
  systolic: z.coerce.number().optional(),
  diastolic: z.coerce.number().optional(),
  weightKg: z.coerce.number().optional(),
  heightCm: z.coerce.number().optional(),
}).partial();

const createRecordSchema = z.object({
  appointmentId: objectId,
  diagnosis: z.string().min(2).max(1000),
  symptoms: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
  vitals: vitalsSchema.optional(),
  followUpDate: z.coerce.date().optional(),
  prescription: z.object({
    medicines: z.array(medicineSchema).min(1),
    advice: z.string().max(2000).optional(),
  }).optional(),
});

const updateRecordSchema = z.object({
  diagnosis: z.string().min(2).max(1000).optional(),
  symptoms: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
  vitals: vitalsSchema.optional(),
  followUpDate: z.coerce.date().optional(),
});

const createPrescriptionSchema = z.object({
  medicalRecordId: objectId,
  medicines: z.array(medicineSchema).min(1),
  advice: z.string().max(2000).optional(),
});

const listRecordsQuery = paginationQuery.extend({
  patientId: objectId.optional(),
  doctorId: objectId.optional(),
  appointmentId: objectId.optional(),
});

const listPrescriptionsQuery = paginationQuery.extend({
  patientId: objectId.optional(),
  medicalRecordId: objectId.optional(),
});

module.exports = {
  createRecordSchema,
  updateRecordSchema,
  createPrescriptionSchema,
  listRecordsQuery,
  listPrescriptionsQuery,
  medicineSchema,
};
