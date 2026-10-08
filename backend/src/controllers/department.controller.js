'use strict';

const Department = require('../models/Department');
const Doctor = require('../models/Doctor');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, ApiError } = require('../utils/apiResponse');
const { paginateQuery } = require('../utils/paginate');

const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.includeInactive !== 'true') filter.isActive = true;
  if (req.query.search) filter.name = new RegExp(req.query.search, 'i');

  const { items, meta } = await paginateQuery(Department, filter, {
    query: req.query,
    sort: { name: 1 },
  });

  // Doctor counts make the admin table useful without an N+1 on the client.
  const counts = await Doctor.aggregate([
    { $match: { departmentId: { $in: items.map((d) => d._id) } } },
    { $group: { _id: '$departmentId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

  const data = items.map((d) => ({ ...d.toObject(), doctorCount: countMap[String(d._id)] || 0 }));
  return success(res, data, { meta });
});

const getById = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id).populate({
    path: 'doctors',
    select: 'userId specialization consultationFee isAcceptingPatients',
    populate: { path: 'userId', select: 'name email' },
  });
  if (!department) throw ApiError.notFound('Department not found');
  return success(res, department);
});

const create = asyncHandler(async (req, res) => {
  const department = await Department.create(req.body);
  return created(res, department);
});

const update = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw ApiError.notFound('Department not found');
  Object.assign(department, req.body);
  await department.save();
  return success(res, department);
});

/** Soft delete: a department with doctors attached is deactivated, not removed. */
const remove = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw ApiError.notFound('Department not found');

  const doctorCount = await Doctor.countDocuments({ departmentId: department._id });
  if (doctorCount > 0) {
    department.isActive = false;
    await department.save();
    return success(res, {
      deactivated: true,
      reason: `${doctorCount} doctor(s) still assigned — department deactivated instead of deleted`,
      department,
    });
  }

  await department.deleteOne();
  return success(res, { deleted: true, id: req.params.id });
});

module.exports = { list, getById, create, update, remove };
