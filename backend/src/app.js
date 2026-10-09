'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const { success } = require('./utils/apiResponse');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const patientRoutes = require('./routes/patient.routes');
const doctorRoutes = require('./routes/doctor.routes');
const departmentRoutes = require('./routes/department.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const medicalRecordRoutes = require('./routes/medicalRecord.routes');
const billingRoutes = require('./routes/billing.routes');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // Same-origin / curl / Postman requests have no Origin header.
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

app.get('/api/health', (_req, res) =>
  success(res, {
    status: 'ok',
    service: 'hospital-management-api',
    env: env.NODE_ENV,
    time: new Date().toISOString(),
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medical-records', medicalRecordRoutes);
app.use('/api/billing', billingRoutes);

app.use('/api/*', notFoundHandler);

if (env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
} else {
  app.use(notFoundHandler);
}

app.use(errorHandler);

module.exports = app;
