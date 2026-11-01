'use strict';

const { z } = require('zod');

// IDs are UUID strings in the MySQL/Prisma schema (not MongoDB ObjectIds).
const objectId = z.string().uuid('Must be a valid UUID');
const idParam = z.object({ id: objectId });
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');
const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['asc', 'desc']).optional(),
});

module.exports = { objectId, idParam, dateKey, paginationQuery };
