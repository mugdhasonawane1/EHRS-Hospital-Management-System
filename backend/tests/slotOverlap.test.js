'use strict';

require('./setupEnv');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  intervalsOverlap,
  findConflict,
  expandWindowToSlots,
  fitsInTimeWindow,
} = require('../src/utils/slotOverlapCheck');

const at = (hhmm) => new Date(`2026-08-12T${hhmm}:00.000Z`);

test('intervals that touch at the boundary do not overlap', () => {
  assert.equal(intervalsOverlap(at('09:00'), at('09:30'), at('09:30'), at('10:00')), false);
});

test('partially overlapping intervals are detected', () => {
  assert.equal(intervalsOverlap(at('09:00'), at('09:30'), at('09:15'), at('09:45')), true);
});

test('a fully contained interval overlaps', () => {
  assert.equal(intervalsOverlap(at('09:00'), at('10:00'), at('09:15'), at('09:30')), true);
});

test('findConflict returns the clashing appointment', () => {
  const existing = [
    { _id: 'a', dateTime: at('09:00'), durationMinutes: 30 },
    { _id: 'b', dateTime: at('11:00'), durationMinutes: 30 },
  ];
  assert.equal(findConflict(existing, at('09:15'), at('09:45'))._id, 'a');
  assert.equal(findConflict(existing, at('09:30'), at('10:00')), null);
});

test('expandWindowToSlots drops a trailing partial slot', () => {
  assert.deepEqual(expandWindowToSlots('09:00', '10:00', 30), ['09:00', '09:30']);
  // 10:00–10:30 would run past the 10:20 window end, so it is not offered.
  assert.deepEqual(expandWindowToSlots('09:00', '10:20', 30), ['09:00', '09:30']);
  assert.deepEqual(expandWindowToSlots('10:00', '11:00', 20), ['10:00', '10:20', '10:40']);
});

test('a visit that runs past the window does not fit', () => {
  assert.equal(fitsInTimeWindow(at('12:30'), at('13:00'), '09:00', '13:00'), true);
  assert.equal(fitsInTimeWindow(at('12:45'), at('13:15'), '09:00', '13:00'), false);
  assert.equal(fitsInTimeWindow(at('08:30'), at('09:00'), '09:00', '13:00'), false);
});
