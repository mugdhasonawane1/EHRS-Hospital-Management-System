'use strict';

const mongoose = require('mongoose');
const slugify = require('../utils/slugify');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    slug: { type: String, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    location: { type: String, trim: true },
    consultationFee: { type: Number, min: 0, default: 500 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

departmentSchema.pre('validate', function setSlug(next) {
  if (this.isModified('name') || !this.slug) this.slug = slugify(this.name);
  next();
});

/** Doctors in this department (populate on demand). */
departmentSchema.virtual('doctors', {
  ref: 'Doctor',
  localField: '_id',
  foreignField: 'departmentId',
});

module.exports = mongoose.model('Department', departmentSchema);
