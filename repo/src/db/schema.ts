export const TABLE_SCHEMA = {
  users: '++id, &username, role, passwordHash, salt, failedAttempts, lockedUntil',
  sessions: '++id, userId, createdAt, lastActiveAt',
  fishEntries: '++id, slug, status, scheduledPublishAt, currentVersion, *tags',
  fishRevisions: '++id, fishId, version, author, timestamp, diffSummary, snapshot',
  campaigns: '++id, status, cutoffAt, minParticipants, createdBy, version',
  orders:
    '++id, &operationId, campaignId, memberId, [campaignId+memberId], status, paymentMethod, createdAt, autoCloseAt, version',
  deliveryTasks: '++id, orderId, batchId, status, priority, address, version',
  deliveryBatches: '++id, label, vehicleId, driverId, date, status, version',
  dispatchLogs: '++id, batchId, taskId, actorId, action, reason, timestamp',
  courses: '++id, status, instructorId, startDateTime, endDateTime, capacity, version',
  enrollments: '++id, &operationId, courseId, memberId, status, waitlistPosition, version',
  notifications: '++id, recipientId, templateKey, status, isRead, createdAt, retries, lastAttemptAt, nextRetryAt',
  ledgerEntries: '++id, type, accountCode, payee, amount, date, hash, status, createdAt, ocrReviewedBy, version',
  attachments: '++id, ledgerEntryId, [ledgerEntryId+fingerprint], filename, mimeType, size, fingerprint',
  auditLogs: '++id, actor, action, entityType, entityId, timestamp',
} as const
