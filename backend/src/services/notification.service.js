'use strict';

const logger = require('../utils/logger');
const { formatDateTime } = require('../utils/formatDate');

/**
 * Notification fan-out. Deliberately a logging stub — swapping in Nodemailer /
 * Twilio / a job queue means changing only `deliver()`. Every call is
 * fire-and-forget: a failed notification must never fail the booking.
 */

const sent = []; // in-memory outbox, handy for tests and the /health debug view

async function deliver(notification) {
  sent.push({ ...notification, sentAt: new Date() });
  if (sent.length > 200) sent.shift();
  logger.info(`[notify:${notification.channel}] -> ${notification.to}: ${notification.subject}`);
  return true;
}

function safeSend(notification) {
  Promise.resolve()
    .then(() => deliver(notification))
    .catch((err) => logger.warn(`Notification failed: ${err.message}`));
}

function appointmentBooked({ to, patientName, doctorName, dateTime }) {
  safeSend({
    channel: 'email',
    to,
    subject: 'Appointment confirmed',
    body: `Hi ${patientName}, your appointment with Dr. ${doctorName} on ${formatDateTime(dateTime)} is confirmed.`,
    type: 'APPOINTMENT_BOOKED',
  });
}

function appointmentCancelled({ to, patientName, doctorName, dateTime, reason }) {
  safeSend({
    channel: 'email',
    to,
    subject: 'Appointment cancelled',
    body: `Hi ${patientName}, your appointment with Dr. ${doctorName} on ${formatDateTime(dateTime)} was cancelled.${reason ? ` Reason: ${reason}` : ''}`,
    type: 'APPOINTMENT_CANCELLED',
  });
}

function appointmentCompleted({ to, patientName, doctorName, dateTime }) {
  safeSend({
    channel: 'email',
    to,
    subject: 'Visit summary available',
    body: `Hi ${patientName}, your visit with Dr. ${doctorName} on ${formatDateTime(dateTime)} is complete. Records and invoice are now available.`,
    type: 'APPOINTMENT_COMPLETED',
  });
}

function invoiceGenerated({ to, patientName, invoiceNumber, totalAmount }) {
  safeSend({
    channel: 'email',
    to,
    subject: `Invoice ${invoiceNumber}`,
    body: `Hi ${patientName}, invoice ${invoiceNumber} for ${totalAmount} has been generated.`,
    type: 'INVOICE_GENERATED',
  });
}

function appointmentReminder({ to, patientName, doctorName, dateTime }) {
  safeSend({
    channel: 'sms',
    to,
    subject: 'Appointment reminder',
    body: `Reminder: ${patientName} has an appointment with Dr. ${doctorName} at ${formatDateTime(dateTime)}.`,
    type: 'APPOINTMENT_REMINDER',
  });
}

module.exports = {
  deliver,
  appointmentBooked,
  appointmentCancelled,
  appointmentCompleted,
  appointmentReminder,
  invoiceGenerated,
  outbox: sent,
};
