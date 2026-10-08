'use strict';

require('./setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');

const rbac = require('../src/services/rbac.service');
const { RESOURCES, ACTIONS } = rbac;

const doctorA = { id: 'u1', role: 'doctor', doctorId: 'd1' };
const doctorB = { id: 'u2', role: 'doctor', doctorId: 'd2' };
const patient = { id: 'u3', role: 'patient', patientId: 'p1' };
const admin = { id: 'u4', role: 'admin' };

test('capability layer: patients cannot write medical records', () => {
  assert.equal(rbac.can('patient', RESOURCES.MEDICAL_RECORD, ACTIONS.CREATE), false);
  assert.equal(rbac.can('doctor', RESOURCES.MEDICAL_RECORD, ACTIONS.CREATE), true);
});

test('ownership layer: a doctor cannot read another doctor\'s record', () => {
  const record = { _id: 'r1', doctorId: 'd1', patientId: 'p1' };
  assert.equal(rbac.ownsResource(doctorA, RESOURCES.MEDICAL_RECORD, record), true);
  assert.equal(rbac.ownsResource(doctorB, RESOURCES.MEDICAL_RECORD, record), false);
  assert.throws(() => rbac.assertOwnership(doctorB, RESOURCES.MEDICAL_RECORD, record), /do not have access/);
});

test('a patient owns only their own appointments', () => {
  assert.equal(rbac.ownsResource(patient, RESOURCES.APPOINTMENT, { patientId: 'p1' }), true);
  assert.equal(rbac.ownsResource(patient, RESOURCES.APPOINTMENT, { patientId: 'p9' }), false);
});

test('admins bypass ownership because their scope is "all"', () => {
  assert.equal(rbac.ownsResource(admin, RESOURCES.APPOINTMENT, { patientId: 'p9', doctorId: 'd9' }), true);
});

test('ownershipFilter narrows list queries at the database level', () => {
  assert.deepEqual(rbac.ownershipFilter(patient, RESOURCES.APPOINTMENT), { patientId: 'p1' });
  assert.deepEqual(rbac.ownershipFilter(doctorA, RESOURCES.APPOINTMENT), { doctorId: 'd1' });
  assert.deepEqual(rbac.ownershipFilter(admin, RESOURCES.APPOINTMENT), {});
});

test('assertAccess enforces capability and ownership together', () => {
  assert.throws(
    () => rbac.assertAccess(patient, RESOURCES.MEDICAL_RECORD, ACTIONS.CREATE, { patientId: 'p1' }),
    /cannot create medicalRecord/
  );
  assert.doesNotThrow(() => rbac.assertAccess(patient, RESOURCES.MEDICAL_RECORD, ACTIONS.READ, { patientId: 'p1' }));
});
