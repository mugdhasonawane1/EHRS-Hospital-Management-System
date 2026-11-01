'use strict';

const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const env = require('./env');
const logger = require('../utils/logger');

function buildAdapter() {
  const databaseUrl = new URL(env.DATABASE_URL);

  return new PrismaMariaDb({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
  });
}

const adapter = buildAdapter();
const prisma = new PrismaClient({ adapter });

async function connectDB() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    logger.info('MySQL connected successfully through Prisma');
    return prisma;
  } catch (err) {
    logger.error(`MySQL connection failed: ${err.message}`);
    throw err;
  }
}

async function disconnectDB() {
  await prisma.$disconnect();
  logger.info('MySQL disconnected');
}

module.exports = { connectDB, disconnectDB, prisma };
