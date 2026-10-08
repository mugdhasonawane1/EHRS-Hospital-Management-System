'use strict';

const { ApiError } = require('../utils/apiResponse');

/**
 * Central permission resolution.
 *
 * Two layers, and both matter:
 *   1. CAPABILITY  — "can a doctor create medical records at all?"  (the matrix below)
 *   2. OWNERSHIP   — "is THIS medical record one of *their* records?" (ownsResource)
 *
 * A role check alone is decorative: it would let doctor A read doctor B's
 * patients. Every resource-scoped route runs both layers.
 */

const RESOURCES = {
  DEPARTMENT: 'department',
  DOCTOR: 'doctor',
  PATIENT: 'patient',
  APPOINTMENT: 'appointment',
  MEDICAL_RECORD: 'medicalRecord',
  PRESCRIPTION: 'prescription',
  INVOICE: 'invoice',
  USER: 'user',
};

const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  CANCEL: 'cancel',
  COMPLETE: 'complete',
  PAY: 'pay',
};

/**
 * role -> resource -> allowed actions.
 * `scope: 'all'` means the role may act on any document of that type;
 * `scope: 'own'` means access is additionally narrowed by ownsResource().
 */
const PERMISSIONS = {
  admin: {
    [RESOURCES.DEPARTMENT]: { actions: ['create', 'read', 'update', 'delete'], scope: 'all' },
    [RESOURCES.DOCTOR]: { actions: ['create', 'read', 'update', 'delete'], scope: 'all' },
    [RESOURCES.PATIENT]: { actions: ['create', 'read', 'update', 'delete'], scope: 'all' },
    [RESOURCES.APPOINTMENT]: { actions: ['create', 'read', 'update', 'cancel'], scope: 'all' },
    [RESOURCES.MEDICAL_RECORD]: { actions: ['read'], scope: 'all' },
    [RESOURCES.PRESCRIPTION]: { actions: ['read'], scope: 'all' },
    [RESOURCES.INVOICE]: { actions: ['create', 'read', 'update', 'pay', 'delete'], scope: 'all' },
    [RESOURCES.USER]: { actions: ['create', 'read', 'update', 'delete'], scope: 'all' },
  },
  doctor: {
    [RESOURCES.DEPARTMENT]: { actions: ['read'], scope: 'all' },
    [RESOURCES.DOCTOR]: { actions: ['read', 'update'], scope: 'own' },
    // A doctor may read the patients they actually treat — enforced by ownsResource.
    [RESOURCES.PATIENT]: { actions: ['read'], scope: 'own' },
    [RESOURCES.APPOINTMENT]: { actions: ['read', 'cancel', 'complete'], scope: 'own' },
    [RESOURCES.MEDICAL_RECORD]: { actions: ['create', 'read', 'update'], scope: 'own' },
    [RESOURCES.PRESCRIPTION]: { actions: ['create', 'read'], scope: 'own' },
    [RESOURCES.INVOICE]: { actions: ['read'], scope: 'own' },
    [RESOURCES.USER]: { actions: ['read'], scope: 'own' },
  },
  patient: {
    [RESOURCES.DEPARTMENT]: { actions: ['read'], scope: 'all' },
    [RESOURCES.DOCTOR]: { actions: ['read'], scope: 'all' }, // needed to browse & book
    [RESOURCES.PATIENT]: { actions: ['read', 'update'], scope: 'own' },
    [RESOURCES.APPOINTMENT]: { actions: ['create', 'read', 'cancel'], scope: 'own' },
    [RESOURCES.MEDICAL_RECORD]: { actions: ['read'], scope: 'own' },
    [RESOURCES.PRESCRIPTION]: { actions: ['read'], scope: 'own' },
    [RESOURCES.INVOICE]: { actions: ['read', 'pay'], scope: 'own' },
    [RESOURCES.USER]: { actions: ['read', 'update'], scope: 'own' },
  },
};

function getPermission(role, resource) {
  return PERMISSIONS[role]?.[resource] || null;
}

/** Layer 1: does this role have the capability at all? */
function can(role, resource, action) {
  const perm = getPermission(role, resource);
  return Boolean(perm && perm.actions.includes(action));
}

function scopeOf(role, resource) {
  return getPermission(role, resource)?.scope || null;
}

function assertCan(user, resource, action) {
  if (!user) throw ApiError.unauthorized();
  if (!can(user.role, resource, action)) {
    throw ApiError.forbidden(`Role "${user.role}" cannot ${action} ${resource}`);
  }
}

const idOf = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v._id) return String(v._id);
  return String(v);
};

const sameId = (a, b) => Boolean(a && b && idOf(a) === idOf(b));

/**
 * Layer 2: ownership. `doc` is the already-loaded resource document.
 * Admins bypass (their scope is 'all'); everyone else must match on the
 * resource's own foreign keys.
 */
function ownsResource(user, resource, doc) {
  if (!user || !doc) return false;
  if (scopeOf(user.role, resource) === 'all') return true;

  switch (resource) {
    case RESOURCES.USER:
      return sameId(doc._id ?? doc.id, user.id);

    case RESOURCES.PATIENT:
      if (user.role === 'patient') return sameId(doc._id ?? doc.id, user.patientId);
      // Doctors don't own patients outright; the controller checks a treatment
      // relationship (hasTreated) before handing the document over.
      return false;

    case RESOURCES.DOCTOR:
      return user.role === 'doctor' && sameId(doc._id ?? doc.id, user.doctorId);

    case RESOURCES.APPOINTMENT:
      if (user.role === 'patient') return sameId(doc.patientId, user.patientId);
      if (user.role === 'doctor') return sameId(doc.doctorId, user.doctorId);
      return false;

    case RESOURCES.MEDICAL_RECORD:
    case RESOURCES.PRESCRIPTION:
      if (user.role === 'patient') return sameId(doc.patientId, user.patientId);
      if (user.role === 'doctor') return sameId(doc.doctorId, user.doctorId);
      return false;

    case RESOURCES.INVOICE:
      if (user.role === 'patient') return sameId(doc.patientId, user.patientId);
      // A doctor may see the invoice for a visit they ran; resolved by the
      // billing service, which loads the appointment first.
      return false;

    default:
      return false;
  }
}

function assertOwnership(user, resource, doc) {
  if (!ownsResource(user, resource, doc)) {
    // 404 rather than 403 would hide existence; we keep 403 because the ids
    // here are not guessable secrets and the clearer error helps the UI.
    throw ApiError.forbidden('You do not have access to this resource');
  }
}

/** Convenience: capability + ownership in one call. */
function assertAccess(user, resource, action, doc) {
  assertCan(user, resource, action);
  if (scopeOf(user.role, resource) === 'own') assertOwnership(user, resource, doc);
}

/**
 * Mongo filter that narrows a list query to what the caller may see.
 * Used by every "list" endpoint so ownership is enforced at the query level,
 * not by filtering after the fact.
 */
function ownershipFilter(user, resource) {
  if (!user) throw ApiError.unauthorized();
  if (scopeOf(user.role, resource) === 'all') return {};

  switch (resource) {
    case RESOURCES.APPOINTMENT:
    case RESOURCES.MEDICAL_RECORD:
    case RESOURCES.PRESCRIPTION:
      if (user.role === 'patient') return { patientId: user.patientId };
      if (user.role === 'doctor') return { doctorId: user.doctorId };
      break;
    case RESOURCES.INVOICE:
      if (user.role === 'patient') return { patientId: user.patientId };
      break;
    case RESOURCES.PATIENT:
      if (user.role === 'patient') return { _id: user.patientId };
      break;
    case RESOURCES.DOCTOR:
      if (user.role === 'doctor') return { _id: user.doctorId };
      break;
    default:
      break;
  }
  // Unknown combination: deny by default with a filter that matches nothing.
  return { _id: null };
}

module.exports = {
  RESOURCES,
  ACTIONS,
  PERMISSIONS,
  can,
  scopeOf,
  assertCan,
  ownsResource,
  assertOwnership,
  assertAccess,
  ownershipFilter,
  idOf,
  sameId,
};
