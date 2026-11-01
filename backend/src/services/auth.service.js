'use strict';

const { prisma } = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { generateTokenPair, verifyRefreshToken, signAccessToken } = require('../utils/generateToken');
const { ApiError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const ROLE_TO_DB = { admin: 'ADMIN', doctor: 'DOCTOR', patient: 'PATIENT' };
const ROLE_FROM_DB = { ADMIN: 'admin', DOCTOR: 'doctor', PATIENT: 'patient' };

function publicUser(user, identity) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: identity.role,
    phone: user.phone,
    isActive: user.isActive,
    patientId: identity.patientId,
    doctorId: identity.doctorId,
  };
}

async function buildIdentity(user) {
  const role = ROLE_FROM_DB[user.role] || String(user.role).toLowerCase();
  const identity = {
    sub: user.id,
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    patientId: null,
    doctorId: null,
  };

  if (role === 'patient') {
    const patient = await prisma.patient.findUnique({ where: { userId: user.id }, select: { id: true } });
    identity.patientId = patient?.id || null;
  } else if (role === 'doctor') {
    const doctor = await prisma.doctor.findUnique({ where: { userId: user.id }, select: { id: true } });
    identity.doctorId = doctor?.id || null;
  }
  return identity;
}

function isUniqueConflict(error) {
  return error?.code === 'P2002' || error?.code === 'ER_DUP_ENTRY';
}

async function register(payload) {
  const email = payload.email.toLowerCase().trim();
  const passwordHash = await hashPassword(payload.password);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: payload.name, email, passwordHash, role: 'PATIENT', phone: payload.phone },
      });
      await tx.patient.create({
        data: {
          userId: user.id,
          dob: payload.dob,
          gender: payload.gender || 'undisclosed',
          bloodGroup: payload.bloodGroup || 'unknown',
          address: payload.address,
        },
      });
      return user;
    });
    return issueSession(created);
  } catch (error) {
    if (isUniqueConflict(error)) throw ApiError.conflict('An account with that email already exists');
    throw error;
  }
}

async function registerStaff(payload) {
  const email = payload.email.toLowerCase().trim();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: payload.name, email, passwordHash: await hashPassword(payload.password), role: ROLE_TO_DB[payload.role], phone: payload.phone },
      });

      if (payload.role === 'doctor') {
        const department = await tx.department.findUnique({ where: { id: payload.departmentId } });
        if (!department) throw ApiError.badRequest('departmentId does not refer to an existing department');

        const isPhysio = /physio/i.test(payload.specialization || '') || /physio/i.test(department.name || '');
        const doctor = await tx.doctor.create({
          data: {
            userId: user.id,
            specialization: payload.specialization,
            departmentId: payload.departmentId,
            licenseNumber: payload.licenseNumber,
            experienceYears: payload.experienceYears ?? 0,
            consultationFee: payload.consultationFee ?? 500,
            maxPatientsPerSlot: isPhysio ? 4 : 1,
            availabilitySlots: payload.availableSlots?.length ? { create: payload.availableSlots.map((slot) => ({
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              slotDurationMinutes: slot.slotDurationMinutes || 30,
            })) } : undefined,
          },
        });
        return { user, doctorId: doctor.id };
      }
      return { user, doctorId: null };
    });
    const identity = await buildIdentity(result.user);
    return publicUser(result.user, identity);
  } catch (error) {
    if (isUniqueConflict(error)) throw ApiError.conflict('An account with that email already exists');
    throw error;
  }
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  logger.info(`Login: ${updated.email} (${ROLE_FROM_DB[updated.role] || updated.role})`);
  return issueSession(updated);
}

async function issueSession(user) {
  const identity = await buildIdentity(user);
  return { user: publicUser(user, identity), ...generateTokenPair(identity) };
}

async function refresh(refreshToken) {
  const decoded = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  const identity = await buildIdentity(user);
  return { accessToken: signAccessToken(identity), user: publicUser(user, identity) };
}

async function getMe(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  const identity = await buildIdentity(user);
  return publicUser(user, identity);
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  if (!(await comparePassword(currentPassword, user.passwordHash))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
  return { changed: true };
}

module.exports = { register, registerStaff, login, refresh, getMe, changePassword, buildIdentity, publicUser };
