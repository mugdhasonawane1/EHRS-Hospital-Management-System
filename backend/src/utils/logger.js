'use strict';

/* Tiny leveled logger. Swap for pino/winston without touching call sites. */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'debug');
const threshold = LEVELS[active] ?? LEVELS.debug;

function stamp() {
  return new Date().toISOString();
}

function log(level, ...args) {
  if (LEVELS[level] > threshold) return;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${stamp()}] [${level.toUpperCase()}]`, ...args);
}

module.exports = {
  error: (...a) => log('error', ...a),
  warn: (...a) => log('warn', ...a),
  info: (...a) => log('info', ...a),
  debug: (...a) => log('debug', ...a),
};
