'use strict';

const { z } = require('zod');
const { objectId } = require('./common.validator');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

const availabilitySlot = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:mm'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'endTime must be HH:mm'),
  slotDurationMinutes: z.coerce.number().int().min(5).max(240).default(30),
}).refine((s) => s.startTime < s.endTime, { message: 'endTime must be after startTime' });

/** Public self-registration — always creates a patient. */
const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password,
  phone: z.string().min(6).max(20).optional(),
  dob: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other', 'undisclosed']).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']).optional(),
  address: z.object({
    line1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});

/** Admin-only staff provisioning. */
const registerStaffSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password,
  role: z.enum(['admin', 'doctor']),
  phone: z.string().min(6).max(20).optional(),
  specialization: z.string().min(2).optional(),
  departmentId: objectId.optional(),
  licenseNumber: z.string().optional(),
  experienceYears: z.coerce.number().min(0).optional(),
  consultationFee: z.coerce.number().min(0).optional(),
  availableSlots: z.array(availabilitySlot).optional(),
}).refine((d) => d.role !== 'doctor' || (d.departmentId && d.specialization), {
  message: 'departmentId and specialization are required when role is "doctor"',
  path: ['departmentId'],
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'refreshToken is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

module.exports = {
  registerSchema,
  registerStaffSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  availabilitySlot,
};
