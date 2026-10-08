'use strict';

const { z } = require('zod');
const { paginationQuery } = require('./common.validator');

const createDepartmentSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  location: z.string().max(120).optional(),
  consultationFee: z.coerce.number().min(0).optional(),
});

const updateDepartmentSchema = createDepartmentSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const listDepartmentsQuery = paginationQuery.extend({
  search: z.string().max(120).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});

module.exports = { createDepartmentSchema, updateDepartmentSchema, listDepartmentsQuery };
