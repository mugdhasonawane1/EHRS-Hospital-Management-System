'use strict';

const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dosage: { type: String, required: true, trim: true },   // "500mg"
    frequency: { type: String, trim: true },                 // "twice daily"
    duration: { type: String, required: true, trim: true },  // "5 days"
    instructions: { type: String, trim: true },
  },
  { _id: false }
);

const prescriptionSchema = new mongoose.Schema(
  {
    medicalRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalRecord', required: true, index: true },
    /** Denormalised for RBAC filtering without an extra join on every read. */
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    medicines: {
      type: [medicineSchema],
      validate: { validator: (m) => m.length > 0, message: 'A prescription needs at least one medicine' },
    },
    advice: { type: String, trim: true, maxlength: 2000 },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model('Prescription', prescriptionSchema);
