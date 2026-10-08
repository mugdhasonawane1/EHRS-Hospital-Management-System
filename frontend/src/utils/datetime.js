/**
 * The API stores and returns everything in UTC (doctor availability windows are
 * UTC "HH:mm"). We render UTC too, so what the SlotPicker shows is exactly what
 * the backend books — no timezone drift between the two ends.
 */

export const toDateKey = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
export const toTimeKey = (d) => new Date(d).toISOString().slice(11, 16);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dayName = (dow) => DAYS[dow] ?? '';

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  return `${formatDate(value)}, ${toTimeKey(value)} UTC`;
}

export function addDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

export const isPast = (value) => new Date(value).getTime() < Date.now();

export function relativeDay(value) {
  const target = toDateKey(value);
  const today = toDateKey();
  if (target === today) return 'Today';
  if (target === addDaysKey(today, 1)) return 'Tomorrow';
  if (target === addDaysKey(today, -1)) return 'Yesterday';
  return dayName(new Date(value).getUTCDay());
}

export const currency = (n) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
