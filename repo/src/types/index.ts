export type UserRole =
  | 'Administrator'
  | 'ContentEditor'
  | 'ContentReviewer'
  | 'Member'
  | 'Dispatcher'
  | 'FinanceClerk'
  | 'Instructor'

export interface User {
  id?: number
  username: string
  passwordHash: string
  salt: string
  role: UserRole
  failedAttempts: number
  lockedUntil?: number
  sensitiveNotes?: string
  mustChangePassword?: boolean
}

export interface Session {
  id?: number
  userId: number
  createdAt: number
  lastActiveAt: number
}

export interface FishEntry {
  id?: number
  slug: string
  commonName: string
  scientificName: string
  taxonomy: {
    kingdom: string
    phylum: string
    class: string
    order: string
    family: string
    genus: string
    species: string
  }
  morphologyNotes: string
  habitat: string
  distribution: string
  protectionLevel: 'None' | 'Protected' | 'Endangered' | 'Critically Endangered'
  mediaAssets: MediaAsset[]
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'rejected'
  scheduledPublishAt?: number
  currentVersion: number
  tags: string[]
  createdBy: number
  updatedAt: number
}

export interface FishRevision {
  id?: number
  fishId: number
  version: number
  author: number
  timestamp: number
  diffSummary: string
  snapshot: FishEntry
}

export interface MediaAsset {
  assetId: string
  type: 'image' | 'audio' | 'video'
  filename: string
  size: number
  blobRef: Blob
}

export interface Campaign {
  id?: number
  title: string
  description: string
  fishEntryId: number
  pricePerUnit: number
  unit: string
  status: 'Open' | 'Confirmed' | 'Cancelled' | 'Closed'
  cutoffAt: number
  minParticipants: number
  createdBy: number
  createdAt: number
  version: number
}

export interface Order {
  id?: number
  operationId: string
  campaignId: number
  memberId: number
  quantity: number
  totalPrice: number
  status: 'Created' | 'Confirmed' | 'Fulfilled' | 'Cancelled' | 'Refunded'
  paymentMethod?: 'Cash' | 'CardOnPickup' | 'ManualMark'
  paymentRecordedAt?: number
  paymentNote?: string
  fulfillmentAddress?: string
  promisedPickupWindow?: { start: number; end: number }
  promisedDeliveryWindow?: { start: number; end: number }
  createdAt: number
  autoCloseAt: number
  version: number
}

export interface DeliveryTask {
  id?: number
  orderId: number
  batchId?: number
  status: 'Unassigned' | 'Assigned' | 'PickedUp' | 'Delivered' | 'Failed'
  priority: 1 | 2 | 3
  weightLbs: number
  promisedPickupWindow: { start: number; end: number }
  promisedDeliveryWindow: { start: number; end: number }
  address: string
  notes?: string
  version: number
}

export interface DeliveryBatch {
  id?: number
  label: string
  vehicleId: string
  driverId: number
  date: string
  shiftStart: number
  shiftEnd: number
  vehicleCapacityLbs: number
  status: 'Planned' | 'InProgress' | 'Completed' | 'Cancelled'
  version: number
}

export interface DispatchLog {
  id?: number
  batchId?: number
  taskId?: number
  actorId: number
  action: 'AUTO_PLAN' | 'MANUAL_ASSIGN' | 'MANUAL_UNASSIGN' | 'BATCH_CREATED' | 'RECALCULATE'
  reason: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  timestamp: number
}

export interface Course {
  id?: number
  title: string
  description: string
  instructorId: number
  startDateTime: string
  endDateTime: string
  dropDeadline: string
  capacity: number
  prerequisiteCourseIds: number[]
  status: 'Draft' | 'Open' | 'Full' | 'Closed' | 'Completed'
  fee?: number
  version: number
}

export interface Enrollment {
  id?: number
  operationId: string
  courseId: number
  memberId: number
  status: 'Waitlisted' | 'Enrolled' | 'Dropped' | 'Completed' | 'NoShow'
  waitlistPosition?: number
  enrolledAt?: number
  droppedAt?: number
  changeHistory: EnrollmentChange[]
  version: number
}

export interface EnrollmentChange {
  fromStatus: string
  toStatus: string
  actor: number
  timestamp: number
  reason?: string
}

export type NotificationTemplate =
  | 'FISH_REVIEW_REQUESTED'
  | 'FISH_APPROVED'
  | 'FISH_REJECTED'
  | 'ORDER_AUTO_CLOSED'
  | 'ORDER_CONFIRMED'
  | 'CAMPAIGN_CANCELLED'
  | 'PICKUP_DUE'
  | 'HOLD_AVAILABLE'
  | 'ORDER_OVERDUE'
  | 'FEE_CHANGED'
  | 'COURSE_ENROLLED'
  | 'COURSE_WAITLISTED'
  | 'COURSE_DROPPED'
  | 'COURSE_WAITLIST_PROMOTED'

export interface Notification {
  id?: number
  recipientId: number
  templateKey: NotificationTemplate
  templateData: Record<string, string>
  renderedSubject?: string
  renderedBody?: string
  status: 'Pending' | 'Delivered' | 'Failed' | 'Archived'
  isRead: boolean
  createdAt: number
  retries: number
  lastAttemptAt?: number
  /** Epoch ms after which a Pending notification is eligible for retry. */
  nextRetryAt?: number
}

export interface LedgerEntry {
  id?: number
  type: 'Income' | 'Expense' | 'Transfer'
  accountCode: string
  payee: string
  amount: number
  salesTaxRate: number
  salesTaxAmount: number
  date: string
  memo: string
  hash: string
  invoiceNotes: string
  accountIdentifier: string
  status: 'Draft' | 'Posted' | 'Void'
  ocrSourceText?: string
  ocrReviewedBy?: number
  attachmentIds: number[]
  createdBy: number
  createdAt: number
  version: number
}

export interface Attachment {
  id?: number
  ledgerEntryId: number
  filename: string
  mimeType: string
  size: number
  fingerprint: string
  blob: Blob
  uploadedAt: number
}

export interface AuditLog {
  id?: number
  actor: string
  action: string
  entityType: string
  entityId: string
  timestamp: number
}
