'use strict';

/**
 * These are pure unit tests — no database. We pre-populate the env so
 * config/env.js validates without needing a real .env file.
 * (dotenv never overwrites variables that are already set.)
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hms_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret_value_1234567890';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_value_1234567890';
process.env.INVOICE_TAX_RATE = process.env.INVOICE_TAX_RATE || '0.05';
process.env.LOG_LEVEL = 'error';

module.exports = {};
