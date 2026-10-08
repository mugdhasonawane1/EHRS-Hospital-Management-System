'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
const { hashPassword } = require('../utils/hashPassword');
const { generateTokenPair, verifyRefreshToken, signAccessToken } = require('../utils/generateToken');
const { ApiError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Builds the JWT payload / req.user shape. Carrying patientId & doctorId means
 * ownership checks are one comparison instead of an extra round trip.
 */
async function buildIdentity(user) {
  const identity = {
    sub: String(user._id),
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    patientId: null,
    doctorId: null,
  };

  if (user.role === 'patient') {
    const patient = await Patient.findOne({ userId: user._id }).select('_id').lean();
    identity.patientId = patient ? String(patient._id) : null;
  } else if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ userId: user._id }).select('_id').lean();
    identity.doctorId = doctor ? String(doctor._id) : null;
  }

  return identity;
}

function publicUser(user, identity) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
    patientId: identity.patientId,
    doctorId: identity.doctorId,
  };
}

/**
 * Self-service registration.
 * Only `patient` is open to the public. Doctors and admins are provisioned by
 * an admin (see registerStaff) — otherwise anyone could self-promote.
 */
async function register(payload) {
  const email = payload.email.toLowerCase().trim();
  const existing = await User.findOne({ email }).lean();
  if (existing) throw ApiError.conflict('An account with that email already exists');

  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const [user] = await User.create(
        [{
          name: payload.name,
          email,
          passwordHash: await hashPassword(payload.password),
          role: 'patient',
          phone: payload.phone,
        }],
        { session }
      );

      await Patient.create(
        [{
          userId: user._id,
          dob: payload.dob,
          gender: payload.gender,
          bloodGroup: payload.bloodGroup,
          address: payload.address,
        }],
        { session }
      );

      created = user;
    });
  } catch (err) {
    if (isTransactionUnsupported(err)) {
      created = await registerWithoutTransaction(payload, email);
    } else {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  return issueSession(created);
}

/** Standalone mongod has no transactions; fall back to sequential writes. */
async function registerWithoutTransaction(payload, email) {
  const user = await User.create({
    name: payload.name,
    email,
    passwordHash: await hashPassword(payload.password),
    role: 'patient',
    phone: payload.phone,
  });
  try {
    await Patient.create({
      userId: user._id,
      dob: payload.dob,
      gender: payload.gender,
      bloodGroup: payload.bloodGroup,
      address: payload.address,
    });
  } catch (err) {
    await User.deleteOne({ _id: user._id }); // manual compensation
    throw err;
  }
  return user;
}

function isTransactionUnsupported(err) {
  const msg = String(err?.message || '');
  return (
    err?.code === 20
    || /Transaction numbers are only allowed/i.test(msg)
    || /replica set/i.test(msg)
    || /transactions are not supported/i.test(msg)
  );
}

/** Admin-only creation of doctor/admin accounts (and their Doctor profile). */
async function registerStaff(payload) {
  const email = payload.email.toLowerCase().trim();
  if (await User.exists({ email })) throw ApiError.conflict('An account with that email already exists');

  if (payload.role === 'doctor') {
    const dept = await Department.findById(payload.departmentId).lean();
    if (!dept) throw ApiError.badRequest('departmentId does not refer to an existing department');
  }

  const user = await User.create({
    name: payload.name,
    email,
    passwordHash: await hashPassword(payload.password),
    role: payload.role,
    phone: payload.phone,
  });

  if (payload.role === 'doctor') {
    try {
      await Doctor.create({
        userId: user._id,
        specialization: payload.specialization,
        departmentId: payload.departmentId,
        licenseNumber: payload.licenseNumber,
        experienceYears: payload.experienceYears,
        consultationFee: payload.consultationFee,
        availableSlots: payload.availableSlots || [],
      });
    } catch (err) {
      await User.deleteOne({ _id: user._id });
      throw err;
    }
  }

  const identity = await buildIdentity(user);
  return publicUser(user, identity);
}

async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  // Same message either way so the endpoint isn't a user-enumeration oracle.
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const ok = await user.verifyPassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  user.lastLoginAt = new Date();
  await user.save();
  logger.info(`Login: ${user.email} (${user.role})`);

  return issueSession(user);
}

async function issueSession(user) {
  const identity = await buildIdentity(user);
  const tokens = generateTokenPair(identity);
  return { user: publicUser(user, identity), ...tokens };
}

/** Exchange a refresh token for a fresh access token (identity re-read from DB). */
async function refresh(refreshToken) {
  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  const identity = await buildIdentity(user);
  return { accessToken: signAccessToken(identity), user: publicUser(user, identity) };
}

async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  const identity = await buildIdentity(user);
  return publicUser(user, identity);
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');
  if (!(await user.verifyPassword(currentPassword))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  return { changed: true };
}

module.exports = {
  register,
  registerStaff,
  login,
  refresh,
  getMe,
  changePassword,
  buildIdentity,
  publicUser,
};
