'use strict';

const { timeToMinutes, minutesToTime, MS_PER_MINUTE } = require('./formatDate');

/**
 * Pure interval math used by the appointment conflict detector.
 * Intervals are half-open [start, end): an appointment ending at 10:00 does
 * NOT conflict with one starting at 10:00.
 */

/** Do two [start, end) intervals (Dates or ms numbers) overlap? */
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && bs < ae;
}

/** Is [start, end) fully inside [windowStart, windowEnd]? */
function isWithinWindow(start, end, windowStart, windowEnd) {
  return new Date(start).getTime() >= new Date(windowStart).getTime()
    && new Date(end).getTime() <= new Date(windowEnd).getTime();
}

/**
 * Find the first appointment in `appointments` that overlaps [start, end).
 * Each appointment needs `dateTime` and `durationMinutes`.
 */
function findConflict(appointments, start, end) {
  return appointments.find((appt) => {
    const apptStart = new Date(appt.dateTime);
    const apptEnd = new Date(apptStart.getTime() + (appt.durationMinutes || 30) * MS_PER_MINUTE);
    return intervalsOverlap(start, end, apptStart, apptEnd);
  }) || null;
}

/**
 * Expand an availability window ("09:00" -> "12:00", 30 min slots) into
 * discrete slot start times. Trailing time too short for a full slot is dropped.
 */
function expandWindowToSlots(startTime, endTime, slotDurationMinutes) {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const slots = [];
  for (let m = startMin; m + slotDurationMinutes <= endMin; m += slotDurationMinutes) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

/** Does [start, end) sit inside an "HH:mm" window on the same UTC day? */
function fitsInTimeWindow(startDate, endDate, windowStart, windowEnd) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  const startMin = s.getUTCHours() * 60 + s.getUTCMinutes();
  // minutes since midnight of the START day (may exceed 1440 if it spills over)
  const endMin = startMin + (e.getTime() - s.getTime()) / MS_PER_MINUTE;
  return startMin >= timeToMinutes(windowStart) && endMin <= timeToMinutes(windowEnd);
}

module.exports = {
  intervalsOverlap,
  isWithinWindow,
  findConflict,
  expandWindowToSlots,
  fitsInTimeWindow,
};
