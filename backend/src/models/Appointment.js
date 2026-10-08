'use strict';

const mongoose = require('mongoose');
const { MS_PER_MINUTE } = require('../utils/formatDate');

const APPOINTMENT_STATUS = ['booked', 'completed', 'cancelled', 'no_show'];

const appointmentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    dateTime: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 5, max: 240, default: 30 },
    status: { type: String, enum: APPOINTMENT_STATUS, default: 'booked', index: true },
    reason: { type: String, trim: true, maxlength: 500 },
    notes: { type: String, trim: true, maxlength: 2000 },
    /** Set on cancel — kept for auditability rather than deleting the row. */
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    completedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/**
 * Race-condition backstop for the conflict-detection service: two simultaneous
 * bookings for the same doctor+time can pass the application-level check, but
 * only one can win this unique index. Partial so cancelled/completed rows
 * don't block re-booking the freed slot.
 */
appointmentSchema.index(
  { doctorId: 1, dateTime: 1 },
  { unique: true, partialFilterExpression: { status: 'booked' } }
);

appointmentSchema.index({ patientId: 1, dateTime: -1 });

appointmentSchema.virtual('endTime').get(function endTime() {
  if (!this.dateTime) return null;
  return new Date(this.dateTime.getTime() + (this.durationMinutes || 30) * MS_PER_MINUTE);
});

appointmentSchema.virtual('medicalRecord', {
  ref: 'MedicalRecord',
  localField: '_id',
  foreignField: 'appointmentId',
  justOne: true,
});

appointmentSchema.virtual('invoice', {
  ref: 'Invoice',
  localField: '_id',
  foreignField: 'appointmentId',
  justOne: true,
});

module.exports = mongoose.model('Appointment', appointmentSchema);
module.exports.APPOINTMENT_STATUS = APPOINTMENT_STATUS;
