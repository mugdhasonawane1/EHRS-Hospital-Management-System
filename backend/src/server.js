'use strict';

const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const logger = require('./utils/logger');

let server;

async function start() {
  await connectDB();
  server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    logger.info(`CORS allowed origins: ${env.corsOrigins.join(', ')}`);
  });
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDB().catch(() => {});
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

start().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
