'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Centralised env loading + validation.
 * The process refuses to boot with a broken config rather than failing later
 * at some random request with an "undefined secret" stack trace.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  DEFAULT_APPOINTMENT_MINUTES: z.coerce.number().int().positive().default(30),
  CANCELLATION_WINDOW_HOURS: z.coerce.number().min(0).default(2),
  INVOICE_TAX_RATE: z.coerce.number().min(0).max(1).default(0.05),
  INVOICE_DUE_DAYS: z.coerce.number().int().min(0).default(14),

  SEED_PASSWORD: z.string().min(6).default('Password123!'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.\n`);
  process.exit(1);
}

const env = parsed.data;

env.corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

env.isProd = env.NODE_ENV === 'production';
env.isTest = env.NODE_ENV === 'test';

module.exports = env;
