'use strict';

const MAX_LIMIT = 100;

/** Normalise ?page & ?limit into skip/limit + echo-able meta. */
function getPagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
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

/** Run a paginated find + count against a Mongoose model. */
async function paginateQuery(Model, filter, { query = {}, sort = { createdAt: -1 }, populate = [], select } = {}) {
  const { page, limit, skip } = getPagination(query);

  let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
  for (const p of populate) q = q.populate(p);
  if (select) q = q.select(select);

  const [items, total] = await Promise.all([q.exec(), Model.countDocuments(filter)]);
  return { items, meta: buildMeta({ page, limit, total }) };
}

module.exports = { getPagination, buildMeta, paginateQuery, MAX_LIMIT };
