import Dexie, { type Table } from 'dexie'
import { TABLE_SCHEMA } from './schema.ts'
import type {
  Attachment,
  AuditLog,
  Campaign,
  Course,
  DeliveryBatch,
  DeliveryTask,
  DispatchLog,
  Enrollment,
  FishEntry,
  FishRevision,
  LedgerEntry,
  Notification,
  Order,
  Session,
  User,
} from '../types/index.ts'

class HarborFreshDatabase extends Dexie {
  users!: Table<User, number>
  sessions!: Table<Session, number>
  fishEntries!: Table<FishEntry, number>
  fishRevisions!: Table<FishRevision, number>
  campaigns!: Table<Campaign, number>
  orders!: Table<Order, number>
  deliveryTasks!: Table<DeliveryTask, number>
  deliveryBatches!: Table<DeliveryBatch, number>
  dispatchLogs!: Table<DispatchLog, number>
  courses!: Table<Course, number>
  enrollments!: Table<Enrollment, number>
  notifications!: Table<Notification, number>
  ledgerEntries!: Table<LedgerEntry, number>
  attachments!: Table<Attachment, number>
  auditLogs!: Table<AuditLog, number>

  constructor() {
    super('harborfresh_offline_console')
    this.version(1).stores({
      users: '++id, &username, role, passwordHash, salt, failedAttempts, lockedUntil',
      sessions: '++id, userId, createdAt, lastActiveAt',
      fishEntries: '++id, slug, status, scheduledPublishAt, currentVersion, *tags',
      fishRevisions: '++id, fishId, version, author, timestamp, diffSummary, snapshot',
      campaigns: '++id, status, cutoffAt, minParticipants, createdBy, version',
      orders: '++id, &operationId, campaignId, memberId, [campaignId+memberId], status, paymentMethod, createdAt, autoCloseAt, version',
      deliveryTasks: '++id, orderId, batchId, status, priority, address, version',
      deliveryBatches: '++id, label, vehicleId, driverId, date, status, version',
      dispatchLogs: '++id, batchId, taskId, actorId, action, reason, timestamp',
      courses: '++id, status, instructorId, startDate, endDate, capacity, version',
      enrollments: '++id, courseId, memberId, status, operationId, waitlistPosition, version',
      notifications: '++id, recipientId, templateKey, status, isRead, createdAt, retries, lastAttemptAt',
      ledgerEntries: '++id, type, accountCode, payee, amount, date, hash, status, ocrReviewedBy, version',
      attachments: '++id, ledgerEntryId, [ledgerEntryId+fingerprint], filename, mimeType, size, fingerprint',
      auditLogs: '++id, actor, action, entityType, entityId, timestamp',
    })
    this.version(2).stores(TABLE_SCHEMA)
    this.version(3).stores(TABLE_SCHEMA)
    this.version(4).stores(TABLE_SCHEMA).upgrade(async (tx) => {
      function mmddyyyyToIso(val: string, endOfDay = false): string {
        const parts = val.split('/')
        if (parts.length !== 3) return val
        const [mm, dd, yyyy] = parts.map((p) => p.trim())
        const time = endOfDay ? '23:59' : '00:00'
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${time}`
      }
      await tx.table('courses').toCollection().modify((course: Record<string, unknown>) => {
        if ('startDate' in course && !('startDateTime' in course)) {
          course.startDateTime = mmddyyyyToIso(course.startDate as string, false)
          delete course.startDate
        }
        if ('endDate' in course && !('endDateTime' in course)) {
          course.endDateTime = mmddyyyyToIso(course.endDate as string, true)
          delete course.endDate
        }
      })
    })
    this.version(5).stores({
      ...TABLE_SCHEMA,
      users: '++id, &username, role, passwordHash, salt, failedAttempts, lockedUntil, mustChangePassword',
    }).upgrade(async (tx) => {
      await tx.table('users').toCollection().modify((user: Record<string, unknown>) => {
        if (!('mustChangePassword' in user)) {
          user.mustChangePassword = false
        }
      })
    })
    this.version(6).stores(TABLE_SCHEMA)
  }
}

export const db = new HarborFreshDatabase()
