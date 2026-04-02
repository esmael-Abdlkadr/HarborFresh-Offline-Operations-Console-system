// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { getBootstrapPassword, seedIfEmpty } from '../db/seed.ts'

// Save and restore VITE_TEST_SEED so bootstrap tests run in production mode
const originalTestSeed = import.meta.env.VITE_TEST_SEED

beforeEach(async () => {
  sessionStorage.clear()
  localStorage.clear()
  // Force production mode (no test seed) for bootstrap tests
  import.meta.env.VITE_TEST_SEED = ''
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
})

afterEach(() => {
  import.meta.env.VITE_TEST_SEED = originalTestSeed
})

describe('bootstrap seed', () => {
  it('creates exactly one admin user on empty DB', async () => {
    const result = await seedIfEmpty()
    expect(result.wasBootstrapped).toBe(true)
    const count = await db.users.count()
    expect(count).toBe(1)
    const admin = await db.users.where('username').equals('admin').first()
    expect(admin).toBeTruthy()
    expect(admin?.role).toBe('Administrator')
  })

  it('sets mustChangePassword on bootstrap admin', async () => {
    await seedIfEmpty()
    const admin = await db.users.where('username').equals('admin').first()
    expect(admin?.mustChangePassword).toBe(true)
  })

  it('stores bootstrap password in sessionStorage', async () => {
    await seedIfEmpty()
    const pw = getBootstrapPassword()
    expect(pw).toBeTruthy()
    expect(typeof pw).toBe('string')
    expect(pw!.startsWith('Harbor-')).toBe(true)
  })

  it('does not create another user when called again with existing users', async () => {
    await seedIfEmpty()
    const countBefore = await db.users.count()
    await seedIfEmpty()
    const countAfter = await db.users.count()
    expect(countAfter).toBe(countBefore)
  })

  it('returns wasBootstrapped false when users already exist', async () => {
    await seedIfEmpty()
    const result = await seedIfEmpty()
    expect(result.wasBootstrapped).toBe(false)
  })
})

describe('bootstrap seed — production guard', () => {
  const originalTestSeed = import.meta.env.VITE_TEST_SEED
  const originalProd = import.meta.env.PROD

  beforeEach(async () => {
    sessionStorage.clear()
    localStorage.clear()
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()))
    })
  })

  afterEach(() => {
    import.meta.env.VITE_TEST_SEED = originalTestSeed
    import.meta.env.PROD = originalProd
  })

  it('uses production bootstrap (not test seed) when VITE_TEST_SEED=true but PROD=true', async () => {
    import.meta.env.VITE_TEST_SEED = 'true'
    import.meta.env.PROD = true

    const result = await seedIfEmpty()

    // Must run the production bootstrap path, not the test-seed path
    expect(result.wasBootstrapped).toBe(true)
    const count = await db.users.count()
    expect(count).toBe(1)
    const admin = await db.users.where('username').equals('admin').first()
    expect(admin?.mustChangePassword).toBe(true)
    // Must not have seeded the 7 known test users
    const editor = await db.users.where('username').equals('editor').first()
    expect(editor).toBeUndefined()
  })
})
