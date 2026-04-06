// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { notificationService } from './notificationService.ts'
import { orderService } from './orderService.ts'
import { courseService } from './courseService.ts'
import { userService } from './userService.ts'
import { fishService } from './fishService.ts'
import { campaignService } from './campaignService.ts'
import { hashPassword } from './cryptoService.ts'
import type { User, UserRole } from '../types/index.ts'

async function createUser(username: string, role: UserRole): Promise<User> {
  const { hash, salt } = await hashPassword('TestPassword#1!')
  const id = await db.users.add({
    username,
    role,
    passwordHash: hash,
    salt,
    failedAttempts: 0,
  })
  return (await db.users.get(id))!
}

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
})

describe('data isolation — notifications', () => {
  it('non-admin getInbox returns only own notifications', async () => {
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')

    await notificationService.send(alice.id!, 'PICKUP_DUE', { orderId: '1', dueTime: '3 PM' })
    await notificationService.send(bob.id!, 'PICKUP_DUE', { orderId: '2', dueTime: '4 PM' })
    await notificationService.send(alice.id!, 'ORDER_CONFIRMED', { orderId: '3' })

    const aliceInbox = await notificationService.getInbox(alice)
    expect(aliceInbox.length).toBe(2)
    expect(aliceInbox.every((n) => n.recipientId === alice.id)).toBe(true)

    const bobInbox = await notificationService.getInbox(bob)
    expect(bobInbox.length).toBe(1)
    expect(bobInbox[0].recipientId).toBe(bob.id)
  })

  it('admin getInbox returns all notifications', async () => {
    const admin = await createUser('admin', 'Administrator')
    const member = await createUser('member', 'Member')

    await notificationService.send(member.id!, 'PICKUP_DUE', { orderId: '1', dueTime: '3 PM' })
    await notificationService.send(admin.id!, 'PICKUP_DUE', { orderId: '2', dueTime: '4 PM' })

    const inbox = await notificationService.getInbox(admin)
    expect(inbox.length).toBe(2)
  })
})

describe('data isolation — campaign orders', () => {
  async function createCampaign() {
    return db.campaigns.add({
      title: 'Test Campaign',
      description: 'test',
      fishEntryId: 1,
      pricePerUnit: 10,
      unit: 'lb',
      status: 'Open',
      cutoffAt: Date.now() + 60_000,
      minParticipants: 1,
      createdBy: 1,
      createdAt: Date.now(),
      version: 1,
    })
  }

  it('non-admin getCampaignOrders returns only own orders', async () => {
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const campaignId = await createCampaign()

    await orderService.joinCampaign(campaignId, alice.id!, alice, 1, crypto.randomUUID(), 1)
    await orderService.joinCampaign(campaignId, bob.id!, bob, 2, crypto.randomUUID(), 1)

    const aliceOrders = await orderService.getCampaignOrders(campaignId, alice)
    expect(aliceOrders.length).toBe(1)
    expect(aliceOrders[0].memberId).toBe(alice.id)

    const bobOrders = await orderService.getCampaignOrders(campaignId, bob)
    expect(bobOrders.length).toBe(1)
    expect(bobOrders[0].memberId).toBe(bob.id)
  })

  it('admin getCampaignOrders returns all orders', async () => {
    const admin = await createUser('admin', 'Administrator')
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const campaignId = await createCampaign()

    await orderService.joinCampaign(campaignId, alice.id!, alice, 1, crypto.randomUUID(), 1)
    await orderService.joinCampaign(campaignId, bob.id!, bob, 2, crypto.randomUUID(), 1)

    const adminOrders = await orderService.getCampaignOrders(campaignId, admin)
    expect(adminOrders.length).toBe(2)
  })
})

describe('data isolation — course enrollments', () => {
  async function createOpenCourse(instructorId: number) {
    const course = await courseService.createCourse(
      {
        title: 'Test Course',
        description: 'test',
        instructorId,
        startDateTime: '2026-12-01T09:00',
        endDateTime: '2026-12-01T17:00',
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      { id: instructorId, role: 'Instructor', username: 'inst', passwordHash: '', salt: '', failedAttempts: 0 } as User,
    )
    await courseService.openCourse(course.id!, { id: instructorId, role: 'Instructor', username: 'inst', passwordHash: '', salt: '', failedAttempts: 0 } as User, {
      expectedCourseVersion: course.version,
    })
    return course
  }

  it('member getEnrollments returns only own enrollment', async () => {
    const instructor = await createUser('instructor', 'Instructor')
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const course = await createOpenCourse(instructor.id!)

    await courseService.enroll(course.id!, alice.id!, alice, 'op-a', { expectedCourseVersion: 2 })
    await courseService.enroll(course.id!, bob.id!, bob, 'op-b', { expectedCourseVersion: 2 })

    const aliceEnrollments = await courseService.getEnrollments(course.id!, alice)
    expect(aliceEnrollments.length).toBe(1)
    expect(aliceEnrollments[0].memberId).toBe(alice.id)

    const bobEnrollments = await courseService.getEnrollments(course.id!, bob)
    expect(bobEnrollments.length).toBe(1)
    expect(bobEnrollments[0].memberId).toBe(bob.id)
  })

  it('instructor getEnrollments returns all enrollments', async () => {
    const instructor = await createUser('instructor', 'Instructor')
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const course = await createOpenCourse(instructor.id!)

    await courseService.enroll(course.id!, alice.id!, alice, 'op-a', { expectedCourseVersion: 2 })
    await courseService.enroll(course.id!, bob.id!, bob, 'op-b', { expectedCourseVersion: 2 })

    const instructorEnrollments = await courseService.getEnrollments(course.id!, instructor)
    expect(instructorEnrollments.length).toBe(2)
  })

  it('admin getEnrollments returns all enrollments', async () => {
    const admin = await createUser('admin', 'Administrator')
    const instructor = await createUser('instructor', 'Instructor')
    const alice = await createUser('alice', 'Member')
    const course = await createOpenCourse(instructor.id!)

    await courseService.enroll(course.id!, alice.id!, alice, 'op-a', { expectedCourseVersion: 2 })

    const adminEnrollments = await courseService.getEnrollments(course.id!, admin)
    expect(adminEnrollments.length).toBe(1)
  })
})

describe('data isolation — participant counts (campaign list)', () => {
  async function createCampaign(title: string) {
    return db.campaigns.add({
      title,
      description: 'test',
      fishEntryId: 1,
      pricePerUnit: 10,
      unit: 'lb',
      status: 'Open',
      cutoffAt: Date.now() + 60_000,
      minParticipants: 1,
      createdBy: 1,
      createdAt: Date.now(),
      version: 1,
    })
  }

  it('getParticipantCounts returns aggregate counts without exposing order details', async () => {
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const c1 = await createCampaign('Campaign A')
    const c2 = await createCampaign('Campaign B')

    await orderService.joinCampaign(c1, alice.id!, alice, 1, crypto.randomUUID(), 1)
    await orderService.joinCampaign(c1, bob.id!, bob, 2, crypto.randomUUID(), 1)
    await orderService.joinCampaign(c2, alice.id!, alice, 1, crypto.randomUUID(), 1)

    const counts = await orderService.getParticipantCounts()
    expect(counts.get(c1)).toBe(2)
    expect(counts.get(c2)).toBe(1)
    // The return value is Map<number,number> — no member IDs, quantities, or order details
    expect(counts instanceof Map).toBe(true)
  })

  it('getParticipantCounts excludes cancelled orders', async () => {
    const admin = await createUser('admin', 'Administrator')
    const alice = await createUser('alice', 'Member')
    const c1 = await createCampaign('Campaign A')

    const order = await orderService.joinCampaign(c1, alice.id!, alice, 1, crypto.randomUUID(), 1)
    await orderService.transitionStatus(order.id!, 'Cancelled', admin, {
      expectedVersion: order.version,
    })

    const counts = await orderService.getParticipantCounts()
    expect(counts.get(c1) ?? 0).toBe(0)
  })
})

describe('data isolation — course list scoped methods', () => {
  async function createOpenCourse(instructorId: number) {
    const inst = { id: instructorId, role: 'Instructor' as const, username: 'inst', passwordHash: '', salt: '', failedAttempts: 0 }
    const course = await courseService.createCourse(
      {
        title: 'Test Course',
        description: 'test',
        instructorId,
        startDateTime: '2026-12-01T09:00',
        endDateTime: '2026-12-01T17:00',
        capacity: 10,
        prerequisiteCourseIds: [],
      },
      inst as User,
    )
    await courseService.openCourse(course.id!, inst as User, { expectedCourseVersion: course.version })
    return course
  }

  it('getEnrolledCounts returns aggregate counts without exposing member data', async () => {
    const instructor = await createUser('instructor', 'Instructor')
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const course = await createOpenCourse(instructor.id!)

    await courseService.enroll(course.id!, alice.id!, alice, 'op-a', { expectedCourseVersion: 2 })
    await courseService.enroll(course.id!, bob.id!, bob, 'op-b', { expectedCourseVersion: 2 })

    const counts = await courseService.getEnrolledCounts(instructor)
    expect(counts.get(course.id!)).toBe(2)
    expect(counts instanceof Map).toBe(true)
  })

  it('getMyEnrollmentStatuses returns only the requesting member enrollments', async () => {
    const instructor = await createUser('instructor', 'Instructor')
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    const course = await createOpenCourse(instructor.id!)

    await courseService.enroll(course.id!, alice.id!, alice, 'op-a', { expectedCourseVersion: 2 })
    await courseService.enroll(course.id!, bob.id!, bob, 'op-b', { expectedCourseVersion: 2 })

    const aliceStatuses = await courseService.getMyEnrollmentStatuses(alice.id!, alice)
    expect(aliceStatuses.size).toBe(1)
    expect(aliceStatuses.get(course.id!)).toBe('Enrolled')

    const bobStatuses = await courseService.getMyEnrollmentStatuses(bob.id!, bob)
    expect(bobStatuses.size).toBe(1)
    expect(bobStatuses.get(course.id!)).toBe('Enrolled')
  })
})

describe('data isolation — instructor list (no credentials)', () => {
  it('getInstructorList returns only id and username, never passwordHash or salt', async () => {
    await createUser('admin', 'Administrator')
    await createUser('instructor', 'Instructor')
    await createUser('member', 'Member')

    const list = await userService.getInstructorList()
    // Only Admin and Instructor roles returned
    expect(list.length).toBe(2)
    // Each item has only id and username — no credential fields
    for (const item of list) {
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('username')
      expect(item).not.toHaveProperty('passwordHash')
      expect(item).not.toHaveProperty('salt')
      expect(item).not.toHaveProperty('failedAttempts')
      expect(item).not.toHaveProperty('role')
    }
  })

  it('getInstructorList excludes non-instructor roles', async () => {
    await createUser('member1', 'Member')
    await createUser('member2', 'Member')
    await createUser('dispatcher', 'Dispatcher')

    const list = await userService.getInstructorList()
    expect(list.length).toBe(0)
  })
})

describe('data isolation — fish detail user lookup', () => {
  it('getUsernames returns only username, never credential fields', async () => {
    const alice = await createUser('alice', 'ContentEditor')
    const bob = await createUser('bob', 'ContentEditor')

    const map = await userService.getUsernames([alice.id!, bob.id!])
    expect(map.size).toBe(2)
    // Map values are strings (usernames only) — no user objects with credentials
    for (const value of map.values()) {
      expect(typeof value).toBe('string')
    }
  })

  it('getUsernames with empty input returns no data', async () => {
    await createUser('alice', 'ContentEditor')
    const map = await userService.getUsernames([])
    expect(map.size).toBe(0)
  })
})

describe('data isolation — campaign list service layer', () => {
  it('listCampaigns returns campaigns through service, not raw db', async () => {
    await db.campaigns.add({
      title: 'Open Campaign',
      description: 'test',
      fishEntryId: 1,
      pricePerUnit: 10,
      unit: 'lb',
      status: 'Open',
      cutoffAt: Date.now() + 60_000,
      minParticipants: 1,
      createdBy: 1,
      createdAt: Date.now(),
      version: 1,
    })

    const adminActor: User = { username: 'admin', passwordHash: 'x', salt: 'x', role: 'Administrator', failedAttempts: 0 }
    const campaigns = await campaignService.listCampaigns(adminActor)
    expect(campaigns.length).toBe(1)
    expect(campaigns[0].title).toBe('Open Campaign')
  })

  it('getPublishedFishEntries returns safe DTOs with no internal fields', async () => {
    await db.fishEntries.add({
      slug: 'test-fish',
      commonName: 'Test Fish',
      scientificName: 'Testus fishus',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'published',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })
    await db.fishEntries.add({
      slug: 'draft-fish',
      commonName: 'Draft Fish',
      scientificName: 'Draftus fishus',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'draft',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })

    const adminActor: User = { username: 'admin', passwordHash: 'x', salt: 'x', role: 'Administrator', failedAttempts: 0 }
    const entries = await campaignService.getPublishedFishEntries(adminActor)
    expect(entries.length).toBe(1)
    expect(entries[0].commonName).toBe('Test Fish')
    // Safe DTO: only id and commonName
    for (const e of entries) {
      expect(e).toHaveProperty('id')
      expect(e).toHaveProperty('commonName')
      expect(e).not.toHaveProperty('slug')
      expect(e).not.toHaveProperty('createdBy')
      expect(e).not.toHaveProperty('taxonomy')
    }
  })
})

describe('data isolation — course list service layer', () => {
  it('listCourses returns courses through service', async () => {
    await db.courses.add({
      title: 'Test Course',
      description: 'test',
      instructorId: 1,
      startDateTime: '2026-12-01T09:00',
      endDateTime: '2026-12-01T17:00',
      dropDeadline: '11/30/2026 23:59',
      capacity: 10,
      prerequisiteCourseIds: [],
      status: 'Open',
      version: 1,
    })

    const adminActor: User = { username: 'admin', passwordHash: 'x', salt: 'x', role: 'Administrator', failedAttempts: 0 }
    const courses = await courseService.listCourses(adminActor)
    expect(courses.length).toBe(1)
    expect(courses[0].title).toBe('Test Course')
  })
})

describe('data isolation — fish detail service layer', () => {
  it('getEntry returns published entry for Member role', async () => {
    const id = await db.fishEntries.add({
      slug: 'published-fish',
      commonName: 'Published Fish',
      scientificName: 'Pub fishus',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'published',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })

    const entry = await fishService.getEntry(id, { role: 'Member' })
    expect(entry).not.toBeNull()
    expect(entry!.commonName).toBe('Published Fish')
  })

  it('getEntry returns null for non-published entry when actor is Member', async () => {
    const id = await db.fishEntries.add({
      slug: 'draft-fish',
      commonName: 'Draft Fish',
      scientificName: 'Draft fishus',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'draft',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })

    const entry = await fishService.getEntry(id, { role: 'Member' })
    expect(entry).toBeNull()
  })

  it('getEntry returns draft entry for ContentEditor', async () => {
    const id = await db.fishEntries.add({
      slug: 'draft-fish-2',
      commonName: 'Draft Fish 2',
      scientificName: 'Draft fishus',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'draft',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })

    const entry = await fishService.getEntry(id, { role: 'ContentEditor' })
    expect(entry).not.toBeNull()
    expect(entry!.commonName).toBe('Draft Fish 2')
  })

  it('getRevisions returns empty array for non-editorial Member role', async () => {
    const editor = await createUser('editor', 'ContentEditor')
    const fish = await fishService.createEntry(
      {
        commonName: 'Rev Fish',
        scientificName: 'Rev fishus',
        taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      },
      editor,
    )

    // Editorial user sees revisions
    const editorRevisions = await fishService.getRevisions(fish.id!, { role: 'ContentEditor' })
    expect(editorRevisions.length).toBeGreaterThan(0)

    // Member gets empty array — no revision data exposed
    const memberRevisions = await fishService.getRevisions(fish.id!, { role: 'Member' })
    expect(memberRevisions.length).toBe(0)

    // Dispatcher gets empty array
    const dispatcherRevisions = await fishService.getRevisions(fish.id!, { role: 'Dispatcher' })
    expect(dispatcherRevisions.length).toBe(0)
  })
})

describe('data isolation — page-level: no direct db import in member pages', () => {
  // These tests verify the architectural constraint that member-visible pages
  // do not import db directly. If a page reintroduces `import { db }`, the
  // corresponding source assertion will fail.

  async function readFileContent(relativePath: string): Promise<string> {
    // Use dynamic import of node:fs to read source files
    const fs = await import('node:fs')
    const path = await import('node:path')
    const fullPath = path.resolve(__dirname, '..', relativePath)
    return fs.readFileSync(fullPath, 'utf-8')
  }

  it('CampaignListPage.tsx does not import db directly', async () => {
    const source = await readFileContent('pages/CampaignListPage.tsx')
    expect(source).not.toMatch(/from ['"]\.\.\/db\/db/)
    expect(source).not.toMatch(/db\.(campaigns|orders|users|fishEntries)\./)
  })

  it('CourseListPage.tsx does not import db directly', async () => {
    const source = await readFileContent('pages/CourseListPage.tsx')
    expect(source).not.toMatch(/from ['"]\.\.\/db\/db/)
    expect(source).not.toMatch(/db\.(courses|users|enrollments)\./)
  })

  it('FishDetailPage.tsx does not import db directly', async () => {
    const source = await readFileContent('pages/FishDetailPage.tsx')
    expect(source).not.toMatch(/from ['"]\.\.\/db\/db/)
    expect(source).not.toMatch(/db\.(users|fishEntries|fishRevisions)\./)
  })
})

describe('data isolation — dashboard service layer', () => {
  it('getCounts returns aggregate numbers only, no record data', async () => {
    const { dashboardService } = await import('./dashboardService.ts')
    const counts = await dashboardService.getCounts()
    expect(typeof counts.openCampaigns).toBe('number')
    expect(typeof counts.confirmedOrders).toBe('number')
    expect(typeof counts.unassignedTasks).toBe('number')
    expect(typeof counts.pendingNotifications).toBe('number')
    expect(typeof counts.publishedFish).toBe('number')
    expect(typeof counts.openCourses).toBe('number')
  })
})

describe('data isolation — fish list service layer', () => {
  it('listEntries returns only published entries for Member role', async () => {
    await db.fishEntries.add({
      slug: 'pub',
      commonName: 'Published',
      scientificName: 'Pub',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'published',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })
    await db.fishEntries.add({
      slug: 'draft',
      commonName: 'Draft',
      scientificName: 'Draft',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'draft',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })

    const memberEntries = await fishService.listEntries({ role: 'Member' })
    expect(memberEntries.length).toBe(1)
    expect(memberEntries[0].status).toBe('published')

    const editorEntries = await fishService.listEntries({ role: 'ContentEditor' })
    expect(editorEntries.length).toBe(2)
  })

  it('listEntries returns all entries for Administrator role', async () => {
    await db.fishEntries.add({
      slug: 'in-review',
      commonName: 'In Review',
      scientificName: 'Rev',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'in_review',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })

    const adminEntries = await fishService.listEntries({ role: 'Administrator' })
    expect(adminEntries.length).toBe(1)

    const memberEntries = await fishService.listEntries({ role: 'Member' })
    expect(memberEntries.length).toBe(0)
  })

  it('listEntries for Dispatcher role returns only published (non-editorial)', async () => {
    await db.fishEntries.add({
      slug: 'draft-disp',
      commonName: 'Draft Disp',
      scientificName: 'DD',
      taxonomy: { kingdom: 'A', phylum: 'C', class: 'A', order: 'P', family: 'T', genus: 'T', species: 'T' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None',
      mediaAssets: [],
      status: 'draft',
      tags: [],
      currentVersion: 1,
      updatedAt: Date.now(),
      createdBy: 1,
    })

    const dispatcherEntries = await fishService.listEntries({ role: 'Dispatcher' })
    expect(dispatcherEntries.length).toBe(0)
  })
})

describe('data isolation — page-level: no db import in ALL member-accessible pages', () => {
  async function readFileContent(relativePath: string): Promise<string> {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const fullPath = path.resolve(__dirname, '..', relativePath)
    return fs.readFileSync(fullPath, 'utf-8')
  }

  it('DashboardPage.tsx does not import db directly', async () => {
    const source = await readFileContent('pages/DashboardPage.tsx')
    expect(source).not.toMatch(/from ['"]\.\.\/db\/db/)
  })

  it('FishListPage.tsx does not import db directly', async () => {
    const source = await readFileContent('pages/FishListPage.tsx')
    expect(source).not.toMatch(/from ['"]\.\.\/db\/db/)
  })

  it('CampaignDetailPage.tsx does not import db directly', async () => {
    const source = await readFileContent('pages/CampaignDetailPage.tsx')
    expect(source).not.toMatch(/from ['"]\.\.\/db\/db/)
  })

  it('CourseDetailPage.tsx does not import db directly', async () => {
    const source = await readFileContent('pages/CourseDetailPage.tsx')
    expect(source).not.toMatch(/from ['"]\.\.\/db\/db/)
  })

  it('NotificationsPage.tsx does not import db directly', async () => {
    const source = await readFileContent('pages/NotificationsPage.tsx')
    expect(source).not.toMatch(/from ['"]\.\.\/db\/db/)
  })
})

describe('data isolation — getUsernames', () => {
  it('returns only requested user IDs', async () => {
    const alice = await createUser('alice', 'Member')
    const bob = await createUser('bob', 'Member')
    await createUser('charlie', 'Member')

    const map = await userService.getUsernames([alice.id!, bob.id!])
    expect(map.size).toBe(2)
    expect(map.get(alice.id!)).toBe('alice')
    expect(map.get(bob.id!)).toBe('bob')
  })

  it('returns empty map for empty input', async () => {
    await createUser('alice', 'Member')
    const map = await userService.getUsernames([])
    expect(map.size).toBe(0)
  })
})
