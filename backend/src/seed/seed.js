'use strict';

const { prisma, connectDB, disconnectDB } = require('../config/db');
const env = require('../config/env');
const { hashPassword } = require('../utils/hashPassword');
const logger = require('../utils/logger');

async function upsertUser({ name, email, role, phone }) {
  const passwordHash = await hashPassword(env.SEED_PASSWORD);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, phone, passwordHash, isActive: true },
    create: { name, email, role, phone, passwordHash, isActive: true },
  });
}

async function seed() {
  await connectDB();
  try {
    const departments = [
      { name: 'Cardiology', slug: 'cardiology', description: 'Heart and vascular care', location: 'Block A, Floor 2', consultationFee: 900 },
      { name: 'Neurology', slug: 'neurology', description: 'Brain, spine and nervous system', location: 'Block B, Floor 3', consultationFee: 1100 },
      { name: 'General Medicine', slug: 'general-medicine', description: 'Primary care and diagnostics', location: 'Block A, Floor 1', consultationFee: 500 },
      { name: 'Orthopaedics', slug: 'orthopaedics', description: 'Bones, joints and sports injuries', location: 'Block C, Floor 1', consultationFee: 800 },
    ];

    for (const department of departments) {
      await prisma.department.upsert({
        where: { slug: department.slug },
        update: department,
        create: department,
      });
    }

    await upsertUser({
      name: 'Asha Menon',
      email: 'admin@hospital.test',
      role: 'ADMIN',
      phone: '+91 90000 00001',
    });

    logger.info('MySQL seed completed. Existing application data was preserved.');
    console.log(`Demo admin: admin@hospital.test | Password: ${env.SEED_PASSWORD}`);
    console.log('Departments: Cardiology, Neurology, General Medicine, Orthopaedics');
  } finally {
    await disconnectDB();
  }
}

seed().catch((error) => {
  logger.error(`MySQL seed failed: ${error.message}`);
  process.exitCode = 1;
});
