// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db.ts'
import { seedIfEmpty } from '../db/seed.ts'
import { deriveEncryptionKey } from './cryptoService.ts'
import { FinanceError, financeService } from './financeService.ts'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function getUser(username: string) {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedIfEmpty()
})

describe('financeService', () => {
  it('validates amount and tax rate bounds', async () => {
    const clerk = await getUser('finance')
    const key = await deriveEncryptionKey('HarborFin#1!!', clerk.salt)

    await expect(
      financeService.createEntry(
        {
          type: 'Expense',
          accountCode: '5000',
          payee: 'Vendor',
          amount: 10.123,
          salesTaxRate: 3,
          date: '10/10/2026',
          memo: 'memo',
          invoiceNotes: 'note',
          accountIdentifier: 'acct',
        },
        clerk,
        key,
      ),
    ).rejects.toMatchObject({ code: 'FINANCE_AMOUNT_INVALID' })

    await expect(
      financeService.createEntry(
        {
          type: 'Expense',
          accountCode: '5000',
          payee: 'Vendor',
          amount: 10,
          salesTaxRate: 13,
          date: '10/10/2026',
          memo: 'memo',
          invoiceNotes: 'note',
          accountIdentifier: 'acct',
        },
        clerk,
        key,
      ),
    ).rejects.toMatchObject({ code: 'FINANCE_TAX_RATE_OUT_OF_RANGE' })
  })

  it('detects duplicate voucher hash and can proceed with allowDuplicate', async () => {
    const clerk = await getUser('finance')
    const key = await deriveEncryptionKey('HarborFin#1!!', clerk.salt)
    const payload = {
      type: 'Expense' as const,
      accountCode: '6100',
      payee: 'Harbor Supplies',
      amount: 120.55,
      salesTaxRate: 2,
      date: '11/10/2026',
      memo: 'Nets',
      invoiceNotes: 'n1',
      accountIdentifier: 'a1',
    }

    const first = await financeService.createEntry(payload, clerk, key)
    expect(first.id).toBeTruthy()

    await expect(financeService.createEntry(payload, clerk, key)).rejects.toMatchObject({
      code: 'FINANCE_DUPLICATE_VOUCHER',
    })

    const second = await financeService.createEntry(payload, clerk, key, { allowDuplicate: true })
    expect(second.id).not.toBe(first.id)
  })

  it('stores encrypted fields and decrypts back correctly', async () => {
    const clerk = await getUser('finance')
    const key = await deriveEncryptionKey('HarborFin#1!!', clerk.salt)

    const created = await financeService.createEntry(
      {
        type: 'Income',
        accountCode: '4000',
        payee: 'Member Payment',
        amount: 90,
        salesTaxRate: 0,
        date: '10/11/2026',
        memo: 'cash',
        invoiceNotes: 'secret invoice',
        accountIdentifier: 'ACC-100',
      },
      clerk,
      key,
    )

    const stored = await db.ledgerEntries.get(created.id!)
    expect(stored?.invoiceNotes).not.toBe('secret invoice')
    expect(stored?.accountIdentifier).not.toBe('ACC-100')

    const decrypted = await financeService.getDecryptedEntry(created.id!, key)
    expect(decrypted?.invoiceNotes).toBe('secret invoice')
    expect(decrypted?.accountIdentifier).toBe('ACC-100')
  })

  it('rejects duplicate attachment and wrong type/size', async () => {
    const clerk = await getUser('finance')
    const key = await deriveEncryptionKey('HarborFin#1!!', clerk.salt)
    const entry = await financeService.createEntry(
      {
        type: 'Expense',
        accountCode: '6200',
        payee: 'Dock Parts',
        amount: 35,
        salesTaxRate: 1,
        date: '10/12/2026',
        memo: 'parts',
        invoiceNotes: 'note',
        accountIdentifier: 'A-2',
      },
      clerk,
      key,
    )

    const pdf = new File([new Uint8Array([1, 2, 3])], 'a.pdf', { type: 'application/pdf' })
    await financeService.attachFile(entry.id!, pdf, clerk)

    await expect(financeService.attachFile(entry.id!, pdf, clerk)).rejects.toMatchObject({
      code: 'ATTACHMENT_DUPLICATE',
    })

    const txt = new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' })
    await expect(financeService.attachFile(entry.id!, txt, clerk)).rejects.toMatchObject({
      code: 'ATTACHMENT_TYPE_NOT_ALLOWED',
    })

    const largeBlob = new Uint8Array(10_485_761)
    const large = new File([largeBlob], 'big.pdf', { type: 'application/pdf' })
    await expect(financeService.attachFile(entry.id!, large, clerk)).rejects.toMatchObject({
      code: 'ATTACHMENT_TOO_LARGE',
    })
  })

  it('prevents posting while OCR review pending until approved', async () => {
    const clerk = await getUser('finance')
    const key = await deriveEncryptionKey('HarborFin#1!!', clerk.salt)
    const entry = await financeService.createEntry(
      {
        type: 'Expense',
        accountCode: '6500',
        payee: 'OCR Vendor',
        amount: 49,
        salesTaxRate: 1,
        date: '10/13/2026',
        memo: 'ocr',
        invoiceNotes: 'note',
        accountIdentifier: 'A-3',
      },
      clerk,
      key,
    )

    await financeService.importOcrText(entry.id!, 'raw ocr text', clerk)
    await expect(financeService.postEntry(entry.id!, clerk)).rejects.toMatchObject({
      code: 'FINANCE_OCR_REVIEW_PENDING',
    })

    await financeService.approveOcr(entry.id!, clerk)
    await expect(financeService.postEntry(entry.id!, clerk)).resolves.toBeUndefined()

    const posted = await db.ledgerEntries.get(entry.id!)
    expect(posted?.status).toBe('Posted')
  })

  it('exports and imports encrypted dataset', async () => {
    const clerk = await getUser('finance')
    const key = await deriveEncryptionKey('HarborFin#1!!', clerk.salt)
    await financeService.createEntry(
      {
        type: 'Income',
        accountCode: '4100',
        payee: 'Export Test',
        amount: 77,
        salesTaxRate: 0,
        date: '10/14/2026',
        memo: 'export',
        invoiceNotes: 'note',
        accountIdentifier: 'A-4',
      },
      clerk,
      key,
    )

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const blob = await financeService.exportDataset('ExportPass#1!')
    expect(blob).toBeTruthy()

    const payload = {
      users: (await db.users.toArray()).map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        failedAttempts: user.failedAttempts,
        lockedUntil: user.lockedUntil,
      })),
      fishEntries: await db.fishEntries.toArray(),
      fishRevisions: await db.fishRevisions.toArray(),
      campaigns: await db.campaigns.toArray(),
      orders: await db.orders.toArray(),
      deliveryTasks: await db.deliveryTasks.toArray(),
      deliveryBatches: await db.deliveryBatches.toArray(),
      courses: await db.courses.toArray(),
      enrollments: await db.enrollments.toArray(),
      ledgerEntries: await db.ledgerEntries.toArray(),
      attachments: [],
      notifications: await db.notifications.toArray(),
      auditLogs: await db.auditLogs.toArray(),
      dispatchLogs: await db.dispatchLogs.toArray(),
      sessions: await db.sessions.toArray(),
    }

    const saltBytes = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const exportPassword = 'ExportPass#1!'
    const exportKey = await deriveEncryptionKey(exportPassword, toHex(saltBytes))
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      exportKey,
      new TextEncoder().encode(JSON.stringify(payload)),
    )

    const wrapper = {
      version: 1,
      salt: toHex(saltBytes),
      iv: toHex(iv),
      ciphertext: toBase64(new Uint8Array(cipher)),
    }

    const file = {
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(wrapper)).buffer,
    } as unknown as File

    await expect(financeService.importDataset(file, exportPassword, false)).rejects.toBeInstanceOf(
      FinanceError,
    )
    await financeService.importDataset(file, exportPassword, true)

    const after = await db.ledgerEntries.toArray()
    expect(after.length).toBeGreaterThan(0)

    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    clickSpy.mockRestore()
  })
})
