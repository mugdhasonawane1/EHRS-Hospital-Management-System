'use strict';

/**
 * Date helpers.
 *
 * IMPORTANT CONVENTION: doctor availability windows are stored as "HH:mm"
 * strings and are interpreted in UTC. Appointment `dateTime` is a real Date
 * (UTC instant). Keeping both in UTC makes conflict detection deterministic
 * regardless of where the server runs. A production system would store an
 * IANA timezone per clinic and convert; that is deliberately out of scope.
 */

const MS_PER_MINUTE = 60 * 1000;

/** "2026-08-12" for a Date, in UTC. */
function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** "14:30" for a Date, in UTC. */
function toTimeKey(date) {
  return new Date(date).toISOString().slice(11, 16);
}

/** Minutes since midnight for "HH:mm". */
function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Combine "2026-08-12" + "14:30" into a UTC Date. */
function combineDateAndTime(dateKey, hhmm) {
  return new Date(`${dateKey}T${hhmm}:00.000Z`);
}

function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * MS_PER_MINUTE);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** 0 = Sunday ... 6 = Saturday, in UTC. */
function dayOfWeek(date) {
  return new Date(date).getUTCDay();
}

function startOfDay(date) {
  return new Date(`${toDateKey(date)}T00:00:00.000Z`);
}

function endOfDay(date) {
  return new Date(`${toDateKey(date)}T23:59:59.999Z`);
}

function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${toDateKey(d)} ${toTimeKey(d)} UTC`;
}

module.exports = {
  MS_PER_MINUTE,
  toDateKey,
  toTimeKey,
  timeToMinutes,
  minutesToTime,
  combineDateAndTime,
  addMinutes,
  addDays,
  dayOfWeek,
  startOfDay,
  endOfDay,
  formatDateTime,
};
