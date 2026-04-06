// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedTestUsers } from '../db/seed.ts'
import { deriveEncryptionKey } from './cryptoService.ts'
import { financeService } from './financeService.ts'
import type { User } from '../types/index.ts'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function getUser(username: string): Promise<User> {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

async function makeEncryptedFile(password: string, payload: Record<string, unknown>) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveEncryptionKey(password, toHex(saltBytes))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const wrapper = {
    version: 1,
    salt: toHex(saltBytes),
    iv: toHex(iv),
    ciphertext: toBase64(new Uint8Array(cipher)),
  }
  return { arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(wrapper)).buffer } as unknown as File
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedTestUsers()
})

describe('finance import error paths', () => {
  it('wrong password fails decryption', async () => {
    const clerk = await getUser('finance')
    const file = await makeEncryptedFile('CorrectPassword#1!', { users: [], fishEntries: [] })
    await expect(
      financeService.importDataset(file, 'WrongPassword#99!', clerk, true),
    ).rejects.toThrow()
  })

  it('corrupt / non-JSON file is rejected', async () => {
    const clerk = await getUser('finance')
    const file = {
      arrayBuffer: async () => new TextEncoder().encode('not-json-at-all!!!').buffer,
    } as unknown as File
    await expect(financeService.importDataset(file, 'any', clerk, true)).rejects.toThrow()
  })

  it('unsupported import version is rejected', async () => {
    const clerk = await getUser('finance')
    const wrapper = { version: 99, salt: 'aa', iv: 'bb', ciphertext: 'cc' }
    const file = {
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(wrapper)).buffer,
    } as unknown as File
    await expect(financeService.importDataset(file, 'any', clerk, true)).rejects.toThrow(
      'Unsupported import version.',
    )
  })

  it('import without confirmation throws DATASET_REPLACE_CONFIRM_REQUIRED', async () => {
    const clerk = await getUser('finance')
    const file = await makeEncryptedFile('Pass#1!', { users: [] })
    await expect(financeService.importDataset(file, 'Pass#1!', clerk, false)).rejects.toMatchObject({
      code: 'DATASET_REPLACE_CONFIRM_REQUIRED',
    })
  })

  it('import with confirmed=true proceeds (valid payload)', async () => {
    const clerk = await getUser('finance')
    const payload = {
      users: [],
      fishEntries: [],
      fishRevisions: [],
      campaigns: [],
      orders: [],
      deliveryTasks: [],
      deliveryBatches: [],
      courses: [],
      enrollments: [],
      ledgerEntries: [],
      attachments: [],
      notifications: [],
      auditLogs: [],
      dispatchLogs: [],
      sessions: [],
    }
    const file = await makeEncryptedFile('ValidPass#1!', payload)
    await expect(financeService.importDataset(file, 'ValidPass#1!', clerk, true)).resolves.toBeUndefined()
  })
})
