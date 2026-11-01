'use strict';

const { prisma } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { success, ApiError } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/paginate');
const rbac = require('../services/rbac.service');

const patientInclude = { user: { select: { id: true, name: true, email: true, phone: true, isActive: true } } };

const list = asyncHandler(async (req, res) => {
  rbac.assertCan(req.user, rbac.RESOURCES.PATIENT, rbac.ACTIONS.READ);
  const where = {};
  if (req.user.role === 'doctor') {
    const treated = await prisma.appointment.findMany({ where: { doctorId: req.user.doctorId }, select: { patientId: true }, distinct: ['patientId'] });
    where.id = { in: treated.map((item) => item.patientId) };
  } else if (req.user.role === 'patient') {
    where.id = req.user.patientId;
  }
  if (req.query.search) {
    where.user = { is: { OR: [
      { name: { contains: req.query.search } },
      { email: { contains: req.query.search } },
    ] } };
  }
  const { page, limit, skip } = getPagination(req.query);
  const [items, total] = await Promise.all([
    prisma.patient.findMany({ where, include: patientInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.patient.count({ where }),
  ]);
  return success(res, items, { meta: buildMeta({ page, limit, total }) });
});

const getById = asyncHandler(async (req, res) => {
  rbac.assertCan(req.user, rbac.RESOURCES.PATIENT, rbac.ACTIONS.READ);
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id }, include: patientInclude });
  if (!patient) throw ApiError.notFound('Patient not found');
  if (req.user.role === 'patient') rbac.assertOwnership(req.user, rbac.RESOURCES.PATIENT, patient);
  else if (req.user.role === 'doctor') {
    const treatment = await prisma.appointment.findFirst({ where: { doctorId: req.user.doctorId, patientId: patient.id } });
    if (!treatment) throw ApiError.forbidden('You can only access patients you have treated');
  }
  return success(res, patient);
});

const update = asyncHandler(async (req, res) => {
  rbac.assertCan(req.user, rbac.RESOURCES.PATIENT, rbac.ACTIONS.UPDATE);
  const existing = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Patient not found');
  if (req.user.role !== 'admin') rbac.assertOwnership(req.user, rbac.RESOURCES.PATIENT, existing);

  const { name, phone, ...patientFields } = req.body;
  await prisma.$transaction(async (tx) => {
    if (Object.keys(patientFields).length) {
      await tx.patient.update({ where: { id: existing.id }, data: patientFields });
    }
    if (name || phone) {
      await tx.user.update({ where: { id: existing.userId }, data: { ...(name ? { name } : {}), ...(phone ? { phone } : {}) } });
    }
  });
  const fresh = await prisma.patient.findUnique({ where: { id: existing.id }, include: patientInclude });
  return success(res, fresh);
});

const getMyProfile = asyncHandler(async (req, res) => {
  if (!req.user.patientId) throw ApiError.forbidden('Your account has no patient profile');
  const patient = await prisma.patient.findUnique({ where: { id: req.user.patientId }, include: patientInclude });
  if (!patient) throw ApiError.notFound('Patient profile not found');
  const [upcoming, completed] = await Promise.all([
    prisma.appointment.count({ where: { patientId: patient.id, status: 'BOOKED', dateTime: { gte: new Date() } } }),
    prisma.appointment.count({ where: { patientId: patient.id, status: 'COMPLETED' } }),
  ]);
  return success(res, { patient, stats: { upcomingAppointments: upcoming, completedVisits: completed } });
});

const deactivate = asyncHandler(async (req, res) => {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient) throw ApiError.notFound('Patient not found');
  await prisma.user.update({ where: { id: patient.userId }, data: { isActive: false } });
  return success(res, { deactivated: true, patientId: patient.id });
});

module.exports = { list, getById, update, getMyProfile, deactivate };
