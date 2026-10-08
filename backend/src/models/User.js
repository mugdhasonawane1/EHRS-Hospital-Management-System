'use strict';

const mongoose = require('mongoose');
const { comparePassword } = require('../utils/hashPassword');

const ROLES = ['admin', 'doctor', 'patient'];

/**
 * Base auth identity. Doctor/Patient documents reference this via `userId`;
 * an admin has no profile document.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return comparePassword(plain, this.passwordHash);
};

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
