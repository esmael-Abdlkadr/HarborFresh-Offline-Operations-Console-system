// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../../db/db.ts'
import { exportImportService } from '../../services/exportImportService.ts'
import { financeService } from '../../services/financeService.ts'
import type { User } from '../../types/index.ts'

async function clearDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}

const adminUser: User = {
  id: 1,
  username: 'admin',
  role: 'Administrator',
  passwordHash: 'fakehash',
  salt: 'fakesalt',
  failedAttempts: 0,
}

const memberUser: User = {
  id: 2,
  username: 'member',
  role: 'Member',
  passwordHash: 'fakehash',
  salt: 'fakesalt',
  failedAttempts: 0,
}

describe('exportImportService', () => {
  beforeEach(async () => {
    await clearDb()
    // Stub out browser APIs not available in jsdom
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
    global.URL.revokeObjectURL = vi.fn()
    // Stub document.createElement to avoid anchor click
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: vi.fn() })
      }
      return el
    })
  })
  afterEach(async () => {
    await clearDb()
    vi.restoreAllMocks()
  })

  it('exportDataset is a function that references financeService.exportDataset', () => {
    expect(typeof exportImportService.exportDataset).toBe('function')
    expect(exportImportService.exportDataset).toBe(financeService.exportDataset)
  })

  it('importDataset is a function that references financeService.importDataset', () => {
    expect(typeof exportImportService.importDataset).toBe('function')
    expect(exportImportService.importDataset).toBe(financeService.importDataset)
  })

  it('exportDataset exports data to Blob for admin user', async () => {
    const password = 'testpassword123'
    const result = await exportImportService.exportDataset(password, adminUser)
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBeGreaterThan(0)
  })

  it('exportDataset throws for non-finance role', async () => {
    await expect(
      exportImportService.exportDataset('pass', memberUser),
    ).rejects.toThrow(/only administrator or financeclerk/i)
  })
})
