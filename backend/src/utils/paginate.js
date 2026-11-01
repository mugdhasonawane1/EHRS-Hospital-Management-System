'use strict';

const MAX_LIMIT = 100;

function getPagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 20));

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function buildMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

module.exports = { getPagination, buildMeta, MAX_LIMIT };
