/**
 * src/shared/utils/notification.util.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Notification Service Utility
 *
 * THESIS NOTE:
 * Rather than each module directly inserting into the Notification table,
 * this utility centralizes notification creation. It:
 *   1. Persists in-app notifications to the DB (always)
 *   2. Can be extended to dispatch email/SMS/push (currently stubbed)
 *   3. Decouples the notification concern from business logic
 *
 * In a production system, steps 2 and 3 would publish to a message queue
 * (e.g., BullMQ + Redis) for async processing, preventing notification
 * failures from blocking the primary transaction.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const prisma = require('../../config/database');
const logger = require('../../config/logger');
const { NOTIFICATION_CHANNEL } = require('../constants');

/**
 * Creates an in-app notification record.
 *
 * @param {object} params
 * @param {number}   params.recipientId    - Employee who receives it
 * @param {string}   params.eventCode      - EVENT_CODE constant
 * @param {string}   params.title          - Short notification title
 * @param {string}   [params.body]         - Full message body
 * @param {string}   params.sourceModule   - 'Leave' | 'Attendance' | 'Payroll' | 'Employee'
 * @param {number}   [params.sourceEntityId] - ID of the related entity (LeaveRequestID, etc.)
 * @param {string}   [params.channel]      - Defaults to 'InApp'
 */
async function notify({
  recipientId,
  eventCode,
  title,
  body,
  sourceModule,
  sourceEntityId,
  channel = NOTIFICATION_CHANNEL.IN_APP,
}) {
  try {
    await prisma.notification.create({
      data: {
        RecipientID: recipientId,
        EventCode: eventCode,
        Title: title,
        Body: body || null,
        Channel: channel,
        SourceModule: sourceModule,
        SourceEntityID: sourceEntityId || null,
        IsRead: false,
      },
    });

    // Stub: extend here for Email/SMS
    if (channel === NOTIFICATION_CHANNEL.EMAIL) {
      logger.info(`[Notification] Email stub triggered for ${eventCode} → recipient ${recipientId}`);
      // await emailService.send({ to: recipientEmail, subject: title, body });
    }
} catch (err) {
  logger.error('[Notification] Failed to create notification — FULL ERROR:', {
    message:      err.message,
    code:         err.code,          // Prisma error code e.g. P2002, P2003
    meta:         err.meta,          // Prisma FK/constraint detail
    recipientId,
    eventCode,
    sourceModule,
  });
}
}

/**
 * Sends the same notification to multiple recipients.
 */
async function notifyMany(recipients, params) {
  await Promise.all(recipients.map((id) => notify({ ...params, recipientId: id })));
}

module.exports = { notify, notifyMany };
