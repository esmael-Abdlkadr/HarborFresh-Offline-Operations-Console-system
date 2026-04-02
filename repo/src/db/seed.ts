import { db } from './db.ts'
import type { User } from '../types/index.ts'
import { hashPassword } from '../services/cryptoService.ts'

const testUsers: Array<{ username: string; password: string; role: User['role'] }> = [
  { username: 'admin', password: 'HarborAdmin#1!', role: 'Administrator' },
  { username: 'editor', password: 'HarborEdit#1!', role: 'ContentEditor' },
  { username: 'reviewer', password: 'HarborReview#1!', role: 'ContentReviewer' },
  { username: 'member', password: 'HarborMember1!', role: 'Member' },
  { username: 'dispatcher', password: 'HarborDisp#1!', role: 'Dispatcher' },
  { username: 'finance', password: 'HarborFin#1!!', role: 'FinanceClerk' },
  { username: 'instructor', password: 'HarborTeach#1!', role: 'Instructor' },
]

const seedPasswordMap = new Map(testUsers.map((u) => [u.username, u.password]))

async function migrateLegacySeedUsers() {
  const legacyUsers = await db.users.where('salt').equals('iteration-1-placeholder').toArray()
  await Promise.all(
    legacyUsers.map(async (legacyUser) => {
      if (!legacyUser.id) return
      const plainPassword = seedPasswordMap.get(legacyUser.username)
      if (!plainPassword) return
      const result = await hashPassword(plainPassword)
      await db.users.update(legacyUser.id, {
        passwordHash: result.hash,
        salt: result.salt,
      })
    }),
  )
}

export function getBootstrapPassword(): string | null {
  return sessionStorage.getItem('hf_bootstrap_pw')
}

export async function seedIfEmpty(): Promise<{ wasBootstrapped: boolean }> {
  // VITE_TEST_SEED is only permitted in non-production (dev/test) builds.
  // If it is somehow set in a production build, treat it as absent so the
  // normal bootstrap flow runs and known credentials are never seeded.
  const isTestSeed = import.meta.env.VITE_TEST_SEED === 'true' && !import.meta.env.PROD

  const usersCount = await db.users.count()

  if (usersCount > 0) {
    await migrateLegacySeedUsers()
    // Only run ensureMissingSeedUsers in test mode (VITE_TEST_SEED)
    if (isTestSeed) {
      await ensureMissingSeedUsers()
    }
    return { wasBootstrapped: false }
  }

  // Empty DB — check if we're in test seed mode
  if (isTestSeed) {
    await seedTestUsers()
    return { wasBootstrapped: false }
  }

  // Production bootstrap: create a single admin with a one-time password
  const uuid = crypto.randomUUID()
  const bootstrapPassword = `Harbor-${uuid.slice(0, 8)}`
  sessionStorage.setItem('hf_bootstrap_pw', bootstrapPassword)

  const result = await hashPassword(bootstrapPassword)
  await db.users.add({
    username: 'admin',
    role: 'Administrator',
    passwordHash: result.hash,
    salt: result.salt,
    failedAttempts: 0,
    mustChangePassword: true,
  })

  return { wasBootstrapped: true }
}

async function ensureMissingSeedUsers() {
  for (const user of testUsers) {
    const existing = await db.users.where('username').equals(user.username).first()
    if (existing) continue
    const result = await hashPassword(user.password)
    await db.users.add({
      username: user.username,
      role: user.role,
      passwordHash: result.hash,
      salt: result.salt,
      failedAttempts: 0,
    })
  }
}

/** For TEST purposes only — creates known test users. Do NOT call during normal app startup. */
export async function seedTestUsers(): Promise<void> {
  const users: User[] = await Promise.all(
    testUsers.map(async ({ username, password, role }) => {
      const result = await hashPassword(password)
      return {
        username,
        role,
        passwordHash: result.hash,
        salt: result.salt,
        failedAttempts: 0,
        lockedUntil: undefined,
      }
    }),
  )
  await db.users.bulkAdd(users)
}
