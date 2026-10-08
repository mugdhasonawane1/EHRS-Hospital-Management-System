'use strict';

const mongoose = require('mongoose');

const medicalRecordSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    /** 1:1 with a *completed* appointment — enforced in medicalRecord.service.js. */
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      unique: true,
      index: true,
    },
    diagnosis: { type: String, required: true, trim: true, maxlength: 1000 },
    symptoms: [{ type: String, trim: true }],
    notes: { type: String, trim: true, maxlength: 5000 },
    vitals: {
      temperatureC: { type: Number },
      pulseBpm: { type: Number },
      systolic: { type: Number },
      diastolic: { type: Number },
      weightKg: { type: Number },
      heightCm: { type: Number },
    },
    followUpDate: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

medicalRecordSchema.virtual('prescriptions', {
  ref: 'Prescription',
  localField: '_id',
  foreignField: 'medicalRecordId',
});

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
