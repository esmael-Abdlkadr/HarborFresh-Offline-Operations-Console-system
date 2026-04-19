// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactElement } from 'react'
import { db } from '../../db/db.ts'
import type { User, UserRole, Campaign, FishEntry, Notification, Order, Course, DeliveryTask } from '../../types/index.ts'

export async function clearDb(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}

const DUMMY_HASH = 'a'.repeat(64)
const DUMMY_SALT = 'b'.repeat(32)

export async function makeUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  const user: User = {
    username: `user_${Math.random().toString(36).slice(2, 8)}`,
    passwordHash: DUMMY_HASH,
    salt: DUMMY_SALT,
    role: 'Member',
    failedAttempts: 0,
    mustChangePassword: false,
    ...overrides,
  }
  const id = await db.users.add(user)
  return { ...user, id }
}

export async function makeAdminUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  return makeUser({ username: 'admin', role: 'Administrator', ...overrides })
}

export async function makeMemberUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  return makeUser({ username: 'member', role: 'Member', ...overrides })
}

export async function makeDispatcherUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  return makeUser({ username: 'dispatcher', role: 'Dispatcher', ...overrides })
}

export async function makeContentEditorUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  return makeUser({ username: 'editor', role: 'ContentEditor', ...overrides })
}

export async function makeInstructorUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  return makeUser({ username: 'instructor', role: 'Instructor', ...overrides })
}

export async function makeFinanceClerkUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  return makeUser({ username: 'finance', role: 'FinanceClerk', ...overrides })
}

function renderWithRouter(ui: ReactElement, options: { initialEntries?: string[] } = {}) {
  return render(
    createElement(MemoryRouter, { initialEntries: options.initialEntries ?? ['/'] }, ui),
  )
}

export { renderWithRouter }

export function makeAuthMock(user: User) {
  return {
    currentUser: user,
    encryptionKey: null as CryptoKey | null,
    isReady: true,
    login: async () => user,
    logout: () => {},
    hasRole: (...roles: UserRole[]) => {
      if (roles.length === 0) return true
      return roles.includes(user.role)
    },
  }
}

export async function makeFishEntry(overrides: Partial<FishEntry> = {}): Promise<FishEntry & { id: number }> {
  const entry: FishEntry = {
    slug: `fish-${Math.random().toString(36).slice(2, 8)}`,
    commonName: 'Test Fish',
    scientificName: 'Testus fishus',
    taxonomy: {
      kingdom: 'Animalia',
      phylum: 'Chordata',
      class: 'Actinopterygii',
      order: 'Perciformes',
      family: 'Testidae',
      genus: 'Testus',
      species: 'fishus',
    },
    morphologyNotes: '',
    habitat: 'Ocean',
    distribution: 'Worldwide',
    protectionLevel: 'None',
    mediaAssets: [],
    status: 'published',
    currentVersion: 1,
    tags: [],
    createdBy: 1,
    updatedAt: Date.now(),
    ...overrides,
  }
  const id = await db.fishEntries.add(entry)
  return { ...entry, id }
}

export async function makeCampaign(overrides: Partial<Campaign> = {}): Promise<Campaign & { id: number }> {
  const campaign: Campaign = {
    title: 'Test Campaign',
    description: 'A test campaign',
    fishEntryId: 1,
    pricePerUnit: 10.00,
    unit: 'lb',
    minParticipants: 2,
    cutoffAt: Date.now() + 86400000,
    status: 'Open',
    createdBy: 1,
    createdAt: Date.now(),
    version: 1,
    ...overrides,
  }
  const id = await db.campaigns.add(campaign)
  return { ...campaign, id }
}

export async function makeNotification(overrides: Partial<Notification> = {}): Promise<Notification & { id: number }> {
  const notification: Notification = {
    recipientId: 1,
    templateKey: 'ORDER_CONFIRMED',
    templateData: { orderId: '1' },
    status: 'Pending',
    isRead: false,
    createdAt: Date.now(),
    retries: 0,
    ...overrides,
  }
  const id = await db.notifications.add(notification)
  return { ...notification, id }
}

export async function makeOrder(overrides: Partial<Order> = {}): Promise<Order & { id: number }> {
  const order: Order = {
    operationId: crypto.randomUUID(),
    campaignId: 1,
    memberId: 2,
    quantity: 1,
    totalPrice: 10.00,
    status: 'Created',
    createdAt: Date.now(),
    autoCloseAt: Date.now() + 30 * 60 * 1000,
    version: 1,
    ...overrides,
  }
  const id = await db.orders.add(order)
  return { ...order, id }
}

export async function makeCourse(overrides: Partial<Course> = {}): Promise<Course & { id: number }> {
  const course: Course = {
    title: 'Test Course',
    description: 'A test course',
    instructorId: 1,
    startDateTime: '2027-01-15T09:00',
    endDateTime: '2027-01-15T17:00',
    dropDeadline: '01/14/2027 23:59',
    capacity: 20,
    prerequisiteCourseIds: [],
    status: 'Open',
    version: 1,
    ...overrides,
  }
  const id = await db.courses.add(course)
  return { ...course, id }
}

export async function makeDeliveryTask(overrides: Partial<DeliveryTask> = {}): Promise<DeliveryTask & { id: number }> {
  const now = Date.now()
  const task: DeliveryTask = {
    orderId: 1,
    status: 'Unassigned',
    priority: 1,
    weightLbs: 10,
    promisedPickupWindow: { start: now + 3600000, end: now + 7200000 },
    promisedDeliveryWindow: { start: now + 7200000, end: now + 10800000 },
    address: '123 Test Street, Testville',
    version: 1,
    ...overrides,
  }
  const id = await db.deliveryTasks.add(task)
  return { ...task, id }
}
