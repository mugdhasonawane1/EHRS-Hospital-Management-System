'use strict';

const { z } = require('zod');
const { objectId, dateKey, paginationQuery } = require('./common.validator');

const createAppointmentSchema = z.object({
  doctorId: objectId,
  patientId: objectId.optional(), // admins may book on a patient's behalf
  dateTime: z.coerce.date({ invalid_type_error: 'dateTime must be an ISO date string' }),
  durationMinutes: z.coerce.number().int().min(5).max(240).optional(),
  reason: z.string().max(500).optional(),
});

const cancelAppointmentSchema = z.object({
  reason: z.string().max(500).optional(),
});

const completeAppointmentSchema = z.object({
  notes: z.string().max(2000).optional(),
  generateInvoice: z.coerce.boolean().optional().default(true),
});

const listAppointmentsQuery = paginationQuery.extend({
  status: z.enum(['booked', 'completed', 'cancelled', 'no_show']).optional(),
  doctorId: objectId.optional(),
  patientId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  upcoming: z.enum(['true', 'false']).optional(),
});

const availabilityQuery = z.object({
  date: dateKey,
});

const scheduleQuery = z.object({
  date: dateKey.optional(),
});

module.exports = {
  createAppointmentSchema,
  cancelAppointmentSchema,
  completeAppointmentSchema,
  listAppointmentsQuery,
  availabilityQuery,
  scheduleQuery,
};
