'use strict';

/** Whole years between dob and `asOf` (default: now). Null for missing/invalid dob. */
module.exports = function calculateAge(dob, asOf = new Date()) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;

  const ref = new Date(asOf);
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = ref.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age < 0 ? null : age;
};
