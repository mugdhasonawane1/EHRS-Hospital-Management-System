'use strict';

const { prisma } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, ApiError } = require('../utils/apiResponse');
const { getPagination, buildMeta } = require('../utils/paginate');
const slugify = require('../utils/slugify');

const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.includeInactive !== 'true') where.isActive = true;
  if (req.query.search) where.name = { contains: req.query.search };

  const { page, limit, skip } = getPagination(req.query);
  const [items, total] = await Promise.all([
    prisma.department.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
      include: { _count: { select: { doctors: true, additionalDoctors: true } } },
    }),
    prisma.department.count({ where }),
  ]);

  const data = items.map((department) => ({
    ...department,
    doctorCount: department._count.doctors + department._count.additionalDoctors,
    _count: undefined,
  }));

  return success(res, data, { meta: buildMeta({ page, limit, total }) });
});

const getById = asyncHandler(async (req, res) => {
  const department = await prisma.department.findUnique({
    where: { id: req.params.id },
    include: {
      doctors: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      additionalDoctors: {
        include: {
          doctor: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });

  if (!department) throw ApiError.notFound('Department not found');

  const primary = department.doctors.map((doctor) => ({
    ...doctor,
    userId: doctor.user,
    user: undefined,
  }));
  const secondary = department.additionalDoctors.map((entry) => ({
    ...entry.doctor,
    userId: entry.doctor.user,
    user: undefined,
  }));

  return success(res, {
    ...department,
    doctors: [...primary, ...secondary],
    additionalDoctors: undefined,
  });
});

const create = asyncHandler(async (req, res) => {
  const data = {
    ...req.body,
    name: req.body.name.trim(),
    slug: slugify(req.body.name),
  };

  try {
    const department = await prisma.department.create({ data });
    return created(res, department);
  } catch (error) {
    if (error.code === 'P2002') {
      throw ApiError.conflict('A department with this name or URL slug already exists');
    }
    throw error;
  }
});

const update = asyncHandler(async (req, res) => {
  const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!existing) throw ApiError.notFound('Department not found');

  const data = { ...req.body };
  if (data.name) {
    data.name = data.name.trim();
    data.slug = slugify(data.name);
  }

  try {
    const department = await prisma.department.update({
      where: { id: req.params.id },
      data,
    });
    return success(res, department);
  } catch (error) {
    if (error.code === 'P2002') {
      throw ApiError.conflict('A department with this name or URL slug already exists');
    }
    throw error;
  }
});

/** Soft-delete departments that still have primary or additional doctors assigned. */
const remove = asyncHandler(async (req, res) => {
  const department = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!department) throw ApiError.notFound('Department not found');

  const [primaryCount, additionalCount] = await Promise.all([
    prisma.doctor.count({ where: { departmentId: department.id } }),
    prisma.doctorDepartment.count({ where: { departmentId: department.id } }),
  ]);
  const doctorCount = primaryCount + additionalCount;

  if (doctorCount > 0) {
    const updated = await prisma.department.update({
      where: { id: department.id },
      data: { isActive: false },
    });
    return success(res, {
      deactivated: true,
      reason: `${doctorCount} doctor assignment(s) still exist — department deactivated instead of deleted`,
      department: updated,
    });
  }

  await prisma.department.delete({ where: { id: department.id } });
  return success(res, { deleted: true, id: req.params.id });
});

module.exports = { list, getById, create, update, remove };
