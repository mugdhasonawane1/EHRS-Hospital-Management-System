'use strict';

const { prisma } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { success, ApiError } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/paginate');
const appointmentService = require('../services/appointment.service');
const rbac = require('../services/rbac.service');
const { toDateKey } = require('../utils/formatDate');

const doctorInclude = {
  user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
  department: { select: { id: true, name: true, description: true, consultationFee: true } },
  additionalDepartments: {
    include: { department: { select: { id: true, name: true } } },
  },
  availabilitySlots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
};

function doctorForApi(doctor) {
  if (!doctor) return doctor;
  const {
    user,
    department,
    additionalDepartments,
    availabilitySlots,
    ...fields
  } = doctor;

  return {
    ...fields,
    userId: user,
    departmentId: department,
    additionalDepartmentIds: (additionalDepartments || []).map((entry) => entry.department),
    availableSlots: availabilitySlots || [],
  };
}

function validateSlots(slots) {
  for (const slot of slots || []) {
    if (slot.startTime >= slot.endTime) {
      throw ApiError.badRequest('Availability endTime must be after startTime');
    }
  }
}

/** Authenticated doctor directory. */
const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.departmentId) {
    where.OR = [
      { departmentId: req.query.departmentId },
      { additionalDepartments: { some: { departmentId: req.query.departmentId } } },
    ];
  }
  if (req.query.specialization) {
    where.specialization = { contains: req.query.specialization };
  }
  if (req.query.acceptingOnly === 'true') where.isAcceptingPatients = true;
  if (req.query.search) {
    where.user = {
      is: {
        role: 'DOCTOR',
        name: { contains: req.query.search },
      },
    };
  }

  const { page, limit, skip } = getPagination(req.query);
  const [items, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      include: doctorInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.doctor.count({ where }),
  ]);

  return success(res, items.map(doctorForApi), {
    meta: buildMeta({ page, limit, total }),
  });
});

const getById = asyncHandler(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.params.id },
    include: doctorInclude,
  });
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return success(res, doctorForApi(doctor));
});

/** Appointment availability and schedule are migrated with the appointment service in Batch 4. */
const getAvailability = asyncHandler(async (req, res) => {
  const data = await appointmentService.getAvailability(req.params.id, req.query.date);
  return success(res, data);
});

const getSchedule = asyncHandler(async (req, res) => {
  const data = await appointmentService.getDoctorSchedule(
    req.user,
    req.params.id,
    req.query.date || toDateKey(new Date())
  );
  return success(res, data);
});

const update = asyncHandler(async (req, res) => {
  const existing = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Doctor not found');
  rbac.assertAccess(req.user, rbac.RESOURCES.DOCTOR, rbac.ACTIONS.UPDATE, existing);

  const {
    name,
    phone,
    additionalDepartmentIds,
    availableSlots,
    ...doctorFields
  } = req.body;

  // Doctors may edit their own profile, but cannot change department or fees.
  if (req.user.role === 'doctor') {
    delete doctorFields.departmentId;
    delete doctorFields.consultationFee;
  }

  if (availableSlots) validateSlots(availableSlots);

  const fresh = await prisma.$transaction(async (tx) => {
    if (Object.keys(doctorFields).length) {
      await tx.doctor.update({
        where: { id: existing.id },
        data: doctorFields,
      });
    }

    if (name || phone) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { ...(name ? { name } : {}), ...(phone ? { phone } : {}) },
      });
    }

    if (Array.isArray(additionalDepartmentIds) && req.user.role === 'admin') {
      await tx.doctorDepartment.deleteMany({ where: { doctorId: existing.id } });
      if (additionalDepartmentIds.length) {
        await tx.doctorDepartment.createMany({
          data: [...new Set(additionalDepartmentIds)]
            .filter((id) => id !== existing.departmentId)
            .map((departmentId) => ({ doctorId: existing.id, departmentId })),
        });
      }
    }

    if (Array.isArray(availableSlots)) {
      await tx.doctorAvailability.deleteMany({ where: { doctorId: existing.id } });
      if (availableSlots.length) {
        await tx.doctorAvailability.createMany({
          data: availableSlots.map((slot) => ({
            doctorId: existing.id,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotDurationMinutes: slot.slotDurationMinutes || 30,
          })),
        });
      }
    }

    return tx.doctor.findUnique({
      where: { id: existing.id },
      include: doctorInclude,
    });
  });

  return success(res, doctorForApi(fresh));
});

const updateAvailability = asyncHandler(async (req, res) => {
  const existing = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Doctor not found');
  rbac.assertAccess(req.user, rbac.RESOURCES.DOCTOR, rbac.ACTIONS.UPDATE, existing);
  validateSlots(req.body.availableSlots);

  const [doctor, upcomingAppointments] = await prisma.$transaction(async (tx) => {
    await tx.doctorAvailability.deleteMany({ where: { doctorId: existing.id } });
    if (req.body.availableSlots.length) {
      await tx.doctorAvailability.createMany({
        data: req.body.availableSlots.map((slot) => ({
          doctorId: existing.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          slotDurationMinutes: slot.slotDurationMinutes || 30,
        })),
      });
    }

    const updatedDoctor = await tx.doctor.findUnique({
      where: { id: existing.id },
      include: doctorInclude,
    });
    const count = await tx.appointment.count({
      where: {
        doctorId: existing.id,
        status: 'BOOKED',
        dateTime: { gte: new Date() },
      },
    });
    return [updatedDoctor, count];
  });

  return success(res, {
    doctor: doctorForApi(doctor),
    upcomingAppointments,
  });
});

const deactivate = asyncHandler(async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor) throw ApiError.notFound('Doctor not found');

  await prisma.$transaction([
    prisma.doctor.update({
      where: { id: doctor.id },
      data: { isAcceptingPatients: false },
    }),
    prisma.user.update({
      where: { id: doctor.userId },
      data: { isActive: false },
    }),
  ]);

  return success(res, { deactivated: true, doctorId: doctor.id });
});

const getMyProfile = asyncHandler(async (req, res) => {
  if (!req.user.doctorId) throw ApiError.forbidden('Your account has no doctor profile');
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.user.doctorId },
    include: doctorInclude,
  });
  if (!doctor) throw ApiError.notFound('Doctor profile not found');
  return success(res, doctorForApi(doctor));
});

module.exports = {
  list,
  getById,
  getAvailability,
  getSchedule,
  update,
  updateAvailability,
  deactivate,
  getMyProfile,
};
