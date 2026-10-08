'use strict';

const { z } = require('zod');
const { objectId, paginationQuery } = require('./common.validator');
const { availabilitySlot } = require('./auth.validator');

const updateDoctorSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(6).max(20).optional(),
  specialization: z.string().min(2).optional(),
  departmentId: objectId.optional(),
  additionalDepartmentIds: z.array(objectId).optional(),
  licenseNumber: z.string().optional(),
  experienceYears: z.coerce.number().min(0).optional(),
  consultationFee: z.coerce.number().min(0).optional(),
  bio: z.string().max(2000).optional(),
  isAcceptingPatients: z.boolean().optional(),
  availableSlots: z.array(availabilitySlot).optional(),
});

const updateAvailabilitySchema = z.object({
  availableSlots: z.array(availabilitySlot).min(0),
});

const listDoctorsQuery = paginationQuery.extend({
  departmentId: objectId.optional(),
  specialization: z.string().optional(),
  search: z.string().max(120).optional(),
  acceptingOnly: z.enum(['true', 'false']).optional(),
});

module.exports = { updateDoctorSchema, updateAvailabilitySchema, listDoctorsQuery };
