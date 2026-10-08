'use strict';

const mongoose = require('mongoose');

/**
 * A recurring weekly availability window.
 * `startTime`/`endTime` are "HH:mm" interpreted in UTC (see utils/formatDate.js).
 */
const availabilitySlotSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0 = Sunday
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    slotDurationMinutes: { type: Number, default: 30, min: 5, max: 240 },
  },
  { _id: false }
);

const doctorSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    specialization: { type: String, required: true, trim: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    /** Secondary departments — the M:N side of the relationship. */
    additionalDepartmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    licenseNumber: { type: String, trim: true },
    experienceYears: { type: Number, min: 0, default: 0 },
    consultationFee: { type: Number, min: 0, default: 500 },
    bio: { type: String, maxlength: 2000 },
    availableSlots: {
      type: [availabilitySlotSchema],
      default: [],
      validate: {
        validator(slots) {
          return slots.every((s) => s.startTime < s.endTime);
        },
        message: 'Availability endTime must be after startTime',
      },
    },
    isAcceptingPatients: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

doctorSchema.virtual('appointments', {
  ref: 'Appointment',
  localField: '_id',
  foreignField: 'doctorId',
});

/** All departments this doctor belongs to. */
doctorSchema.methods.departmentIds = function departmentIds() {
  return [this.departmentId, ...(this.additionalDepartmentIds || [])];
};

module.exports = mongoose.model('Doctor', doctorSchema);
