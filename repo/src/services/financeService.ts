import { db } from '../db/db.ts'
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
import { decryptField, deriveEncryptionKey, encryptField } from './cryptoService.ts'

const ALLOWED_ATTACHMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_ATTACHMENT_SIZE = 10_485_760

type EntryInput = Omit<
  LedgerEntry,
  'id' | 'hash' | 'salesTaxAmount' | 'status' | 'attachmentIds' | 'createdBy' | 'createdAt' | 'version'
>

export class FinanceError extends Error {
  code:
    | 'FINANCE_AMOUNT_INVALID'
    | 'FINANCE_TAX_RATE_OUT_OF_RANGE'
    | 'FINANCE_ACCOUNT_CODE_REQUIRED'
    | 'FINANCE_DATE_INVALID'
    | 'FINANCE_DUPLICATE_VOUCHER'
    | 'FINANCE_OCR_REVIEW_PENDING'
    | 'ATTACHMENT_TYPE_NOT_ALLOWED'
    | 'ATTACHMENT_TOO_LARGE'
    | 'ATTACHMENT_DUPLICATE'
    | 'FINANCE_ROLE_FORBIDDEN'
    | 'DATASET_REPLACE_CONFIRM_REQUIRED'

  meta?: Record<string, unknown>

  constructor(code: FinanceError['code'], message: string, meta?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.meta = meta
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2))
}

function toHexBytes(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

function toHexBuffer(buffer: ArrayBuffer): string {
  return toHexBytes(new Uint8Array(buffer))
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function strictArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function isValidUsDate(value: string): boolean {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return false
  const [, mm, dd, yyyy] = match
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0, 0)
  return (
    date.getFullYear() === Number(yyyy) &&
    date.getMonth() === Number(mm) - 1 &&
    date.getDate() === Number(dd)
  )
}

async function addAudit(actor: User, action: string, entityId: number, reason?: string) {
  await db.auditLogs.add({
    actor: actor.username,
    action: reason ? `${action}:${reason}` : action,
    entityType: 'LedgerEntry',
    entityId: String(entityId),
    timestamp: Date.now(),
  })
}

async function fingerprintBlob(blob: Blob): Promise<string> {
  const source = blob.arrayBuffer
    ? await blob.arrayBuffer()
    : await new Response(blob as unknown as BodyInit).arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(source))
  return toHexBuffer(digest)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return `data:${blob.type};base64,${bytesToBase64(bytes)}`
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, payload] = dataUrl.split(',', 2)
  const mime = meta.match(/^data:(.*);base64$/)?.[1] ?? 'application/octet-stream'
  const bytes = base64ToBytes(payload)
  return new Blob([strictArrayBuffer(bytes)], { type: mime })
}

function assertFinanceRole(actor: { role: User['role'] }) {
  if (actor.role !== 'FinanceClerk' && actor.role !== 'Administrator') {
    throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only FinanceClerk or Administrator can access finance data.')
  }
}

export const financeService = {
  async listLedgerEntries(actor: { role: User['role'] }): Promise<LedgerEntry[]> {
    assertFinanceRole(actor)
    return db.ledgerEntries.orderBy('createdAt').reverse().toArray()
  },

  async listAttachments(actor: { role: User['role'] }): Promise<Attachment[]> {
    assertFinanceRole(actor)
    return db.attachments.toArray()
  },

  async computeHash(payee: string, amount: number, date: string, memo: string): Promise<string> {
    const raw = `${payee}|${amount.toFixed(2)}|${date}|${memo}`
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    return toHexBuffer(buf)
  },

  async encryptSensitiveFields(entry: Pick<LedgerEntry, 'invoiceNotes' | 'accountIdentifier'>, key: CryptoKey) {
    return {
      invoiceNotes: await encryptField(entry.invoiceNotes, key),
      accountIdentifier: await encryptField(entry.accountIdentifier, key),
    }
  },

  async decryptSensitiveFields(entry: Pick<LedgerEntry, 'invoiceNotes' | 'accountIdentifier'>, key: CryptoKey) {
    return {
      invoiceNotes: await decryptField(entry.invoiceNotes, key),
      accountIdentifier: await decryptField(entry.accountIdentifier, key),
    }
  },

  async createEntry(
    data: EntryInput,
    actor: User,
    encryptionKey: CryptoKey,
    options?: { allowDuplicate?: boolean },
  ): Promise<LedgerEntry> {
    if (!(actor.role === 'FinanceClerk' || actor.role === 'Administrator')) {
      throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only FinanceClerk or Administrator can create entries.')
    }
    if (!(data.amount > 0) || round2(data.amount) !== data.amount) {
      throw new FinanceError('FINANCE_AMOUNT_INVALID', 'Amount must be positive with at most 2 decimals.')
    }
    if (data.salesTaxRate < 0 || data.salesTaxRate > 12) {
      throw new FinanceError('FINANCE_TAX_RATE_OUT_OF_RANGE', 'Sales tax rate must be 0.00-12.00.')
    }
    if (!data.accountCode.trim()) {
      throw new FinanceError('FINANCE_ACCOUNT_CODE_REQUIRED', 'Account code is required.')
    }
    if (!isValidUsDate(data.date)) {
      throw new FinanceError('FINANCE_DATE_INVALID', 'Date must be MM/DD/YYYY.')
    }
    if (!data.payee.trim()) {
      throw new Error('Payee is required.')
    }
    if (!actor.id) {
      throw new Error('Actor id is required.')
    }

    const hash = await this.computeHash(data.payee.trim(), data.amount, data.date, data.memo ?? '')
    const existing = await db.ledgerEntries.where('hash').equals(hash).first()
    if (existing && existing.status !== 'Void' && !options?.allowDuplicate) {
      throw new FinanceError('FINANCE_DUPLICATE_VOUCHER', 'Duplicate voucher detected.', {
        existingId: existing.id,
      })
    }

    const secure = await this.encryptSensitiveFields(
      {
        invoiceNotes: data.invoiceNotes,
        accountIdentifier: data.accountIdentifier,
      },
      encryptionKey,
    )

    const entry: LedgerEntry = {
      ...data,
      hash,
      salesTaxAmount: round2((data.amount * data.salesTaxRate) / 100),
      invoiceNotes: secure.invoiceNotes,
      accountIdentifier: secure.accountIdentifier,
      status: 'Draft',
      attachmentIds: [],
      createdBy: actor.id,
      createdAt: Date.now(),
      version: 1,
    }

    const id = await db.ledgerEntries.add(entry)
    await addAudit(actor, 'LEDGER_ENTRY_CREATED', id)
    return { ...entry, id }
  },

  async postEntry(entryId: number, actor: User): Promise<void> {
    if (!(actor.role === 'FinanceClerk' || actor.role === 'Administrator')) {
      throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only finance clerk or admin can post.')
    }
    const entry = await db.ledgerEntries.get(entryId)
    if (!entry || entry.status !== 'Draft') return
    if (entry.ocrSourceText && entry.ocrReviewedBy === undefined) {
      throw new FinanceError('FINANCE_OCR_REVIEW_PENDING', 'OCR review pending.')
    }
    await db.ledgerEntries.update(entryId, { status: 'Posted', version: entry.version + 1 })
    await addAudit(actor, 'LEDGER_ENTRY_POSTED', entryId)
  },

  async voidEntry(entryId: number, actor: User, reason: string): Promise<void> {
    if (actor.role !== 'Administrator') {
      throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only administrator can void entries.')
    }
    const entry = await db.ledgerEntries.get(entryId)
    if (!entry) return
    await db.ledgerEntries.update(entryId, { status: 'Void', version: entry.version + 1 })
    await addAudit(actor, 'LEDGER_ENTRY_VOIDED', entryId, reason)
  },

  async attachFile(entryId: number, file: File, actor: User): Promise<Attachment> {
    if (!(actor.role === 'FinanceClerk' || actor.role === 'Administrator')) {
      throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only FinanceClerk or Administrator can attach files.')
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      throw new FinanceError('ATTACHMENT_TYPE_NOT_ALLOWED', 'Allowed types: PDF, JPG, PNG.')
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw new FinanceError('ATTACHMENT_TOO_LARGE', 'Attachment must be <= 10 MB.')
    }

    const fingerprint = await fingerprintBlob(file)
    const duplicate = await db.attachments
      .where('[ledgerEntryId+fingerprint]')
      .equals([entryId, fingerprint])
      .first()
    if (duplicate) {
      throw new FinanceError('ATTACHMENT_DUPLICATE', 'Duplicate attachment for this entry.')
    }

    const attachment: Attachment = {
      ledgerEntryId: entryId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      fingerprint,
      blob: file,
      uploadedAt: Date.now(),
    }

    const attachmentId = await db.attachments.add(attachment)
    const entry = await db.ledgerEntries.get(entryId)
    if (entry) {
      await db.ledgerEntries.update(entryId, {
        attachmentIds: [...entry.attachmentIds, attachmentId],
        version: entry.version + 1,
      })
      await addAudit(actor, 'LEDGER_ATTACHMENT_ADDED', entryId)
    }

    return { ...attachment, id: attachmentId }
  },

  async importOcrText(entryId: number, rawText: string, actor: User): Promise<void> {
    if (!(actor.role === 'FinanceClerk' || actor.role === 'Administrator')) {
      throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only FinanceClerk or Administrator can import OCR text.')
    }
    const entry = await db.ledgerEntries.get(entryId)
    if (!entry) return
    await db.ledgerEntries.update(entryId, {
      ocrSourceText: rawText,
      ocrReviewedBy: undefined,
      version: entry.version + 1,
    })
    await addAudit(actor, 'OCR_TEXT_IMPORTED', entryId)
  },

  async approveOcr(entryId: number, actor: User): Promise<void> {
    if (!(actor.role === 'FinanceClerk' || actor.role === 'Administrator')) {
      throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only FinanceClerk or Administrator can approve OCR.')
    }
    const entry = await db.ledgerEntries.get(entryId)
    if (!entry || !actor.id) return
    await db.ledgerEntries.update(entryId, {
      ocrReviewedBy: actor.id,
      version: entry.version + 1,
    })
    await addAudit(actor, 'OCR_TEXT_REVIEWED', entryId)
  },

  async getDecryptedEntry(entryId: number, key: CryptoKey, actor: { role: User['role'] }): Promise<LedgerEntry | null> {
    assertFinanceRole(actor)
    const entry = await db.ledgerEntries.get(entryId)
    if (!entry) return null
    const secure = await this.decryptSensitiveFields(entry, key)
    return {
      ...entry,
      ...secure,
    }
  },

  async exportDataset(password: string, actor: User): Promise<Blob> {
    if (actor.role !== 'Administrator' && actor.role !== 'FinanceClerk') {
      throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only Administrator or FinanceClerk can export data.')
    }
    const usersRaw = await db.users.toArray()
    // Include all user fields (passwordHash and salt are already hashed/salted, not plaintext)
    const users = usersRaw.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      passwordHash: user.passwordHash,
      salt: user.salt,
      failedAttempts: user.failedAttempts,
      lockedUntil: user.lockedUntil,
      sensitiveNotes: user.sensitiveNotes,
    }))

    const attachments = await db.attachments.toArray()
    const attachmentsData = await Promise.all(
      attachments.map(async (item) => ({
        ...item,
        blob: await blobToDataUrl(item.blob),
      })),
    )

    const payload = {
      users,
      fishEntries: await db.fishEntries.toArray(),
      fishRevisions: await db.fishRevisions.toArray(),
      campaigns: await db.campaigns.toArray(),
      orders: await db.orders.toArray(),
      deliveryTasks: await db.deliveryTasks.toArray(),
      deliveryBatches: await db.deliveryBatches.toArray(),
      courses: await db.courses.toArray(),
      enrollments: await db.enrollments.toArray(),
      ledgerEntries: await db.ledgerEntries.toArray(),
      attachments: attachmentsData,
      notifications: await db.notifications.toArray(),
      auditLogs: await db.auditLogs.toArray(),
      dispatchLogs: await db.dispatchLogs.toArray(),
      sessions: await db.sessions.toArray(),
    }

    const json = JSON.stringify(payload)
    const keySalt = toHexBytes(crypto.getRandomValues(new Uint8Array(16)))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveEncryptionKey(password, keySalt)
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(json),
    )

    const wrapper = {
      version: 1,
      salt: keySalt,
      iv: toHexBytes(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    }

    const blob = new Blob([JSON.stringify(wrapper)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `harborfresh-export-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    return blob
  },

  async importDataset(file: File, password: string, actor: User, confirmed = false): Promise<void> {
    if (actor.role !== 'Administrator' && actor.role !== 'FinanceClerk') {
      throw new FinanceError('FINANCE_ROLE_FORBIDDEN', 'Only Administrator or FinanceClerk can import data.')
    }
    if (!confirmed) {
      throw new FinanceError(
        'DATASET_REPLACE_CONFIRM_REQUIRED',
        'This import will replace all local data. Confirmation required.',
      )
    }

    const fileBuffer = file.arrayBuffer
      ? await file.arrayBuffer()
      : await new Response(file as unknown as BodyInit).arrayBuffer()
    const text = new TextDecoder().decode(fileBuffer)
    const parsed = JSON.parse(text) as {
      version: number
      salt: string
      iv: string
      ciphertext: string
    }
    if (parsed.version !== 1) {
      throw new Error('Unsupported import version.')
    }

    const key = await deriveEncryptionKey(password, parsed.salt)
    const ivBytes = Uint8Array.from(fromHex(parsed.iv))
    const cipherBytes = Uint8Array.from(base64ToBytes(parsed.ciphertext))
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes,
      },
      key,
      cipherBytes,
    )
    const dataset = JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>

    await db.transaction(
      'rw',
      db.tables,
      async () => {
        await Promise.all(db.tables.map((table) => table.clear()))

        const importedUsers = (dataset.users as Array<Record<string, unknown>> | undefined) ?? []
        await db.users.bulkAdd(
          importedUsers.map((item) => ({
            ...(item as Partial<User>),
            username: String(item.username ?? ''),
            role: (item.role as User['role']) ?? 'Member',
            passwordHash: String(item.passwordHash ?? ''),
            salt: String(item.salt ?? ''),
            failedAttempts: Number(item.failedAttempts ?? 0),
          })),
        )

        await db.fishEntries.bulkAdd((dataset.fishEntries as FishEntry[] | undefined) ?? [])
        await db.fishRevisions.bulkAdd((dataset.fishRevisions as FishRevision[] | undefined) ?? [])
        await db.campaigns.bulkAdd((dataset.campaigns as Campaign[] | undefined) ?? [])
        await db.orders.bulkAdd((dataset.orders as Order[] | undefined) ?? [])
        await db.deliveryTasks.bulkAdd((dataset.deliveryTasks as DeliveryTask[] | undefined) ?? [])
        await db.deliveryBatches.bulkAdd((dataset.deliveryBatches as DeliveryBatch[] | undefined) ?? [])
        await db.courses.bulkAdd((dataset.courses as Course[] | undefined) ?? [])
        await db.enrollments.bulkAdd((dataset.enrollments as Enrollment[] | undefined) ?? [])
        await db.ledgerEntries.bulkAdd((dataset.ledgerEntries as LedgerEntry[] | undefined) ?? [])

        const attachments = (dataset.attachments as Array<Record<string, unknown>> | undefined) ?? []
        await db.attachments.bulkAdd(
          attachments.map((item) => ({
            ...(item as Partial<Attachment>),
            blob: dataUrlToBlob(String(item.blob ?? 'data:application/octet-stream;base64,')),
          })) as Attachment[],
        )

        await db.notifications.bulkAdd((dataset.notifications as Notification[] | undefined) ?? [])
        await db.auditLogs.bulkAdd((dataset.auditLogs as AuditLog[] | undefined) ?? [])
        await db.dispatchLogs.bulkAdd((dataset.dispatchLogs as DispatchLog[] | undefined) ?? [])
        await db.sessions.bulkAdd((dataset.sessions as Session[] | undefined) ?? [])
      },
    )

    await db.auditLogs.add({
      actor: 'system',
      action: 'DATASET_IMPORTED',
      entityType: 'System',
      entityId: 'dataset',
      timestamp: Date.now(),
    })
  },
}
