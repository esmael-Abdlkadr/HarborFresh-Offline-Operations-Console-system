// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { courseService } from '../services/courseService.ts'
import { campaignService } from '../services/campaignService.ts'
import type { User } from '../types/index.ts'

const adminActor: User = {
  username: 'admin',
  passwordHash: 'x',
  salt: 'x',
  role: 'Administrator',
  failedAttempts: 0,
}

const memberActor: User = {
  username: 'member',
  passwordHash: 'x',
  salt: 'x',
  role: 'Member',
  failedAttempts: 0,
}

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
})

afterEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
})

describe('courseService read RBAC', () => {
  it('listCourses — allows any authenticated role', async () => {
    await expect(courseService.listCourses(adminActor)).resolves.toEqual([])
    await expect(courseService.listCourses(memberActor)).resolves.toEqual([])
  })

  it('listCourses — rejects null actor (unauthenticated bypass)', async () => {
    await expect(
      courseService.listCourses(null as unknown as User),
    ).rejects.toThrow('RBAC_AUTH_REQUIRED')
  })

  it('getCourse — allows any authenticated role', async () => {
    await expect(courseService.getCourse(999, adminActor)).resolves.toBeUndefined()
    await expect(courseService.getCourse(999, memberActor)).resolves.toBeUndefined()
  })

  it('getCourse — rejects null actor (unauthenticated bypass)', async () => {
    await expect(
      courseService.getCourse(1, null as unknown as User),
    ).rejects.toThrow('RBAC_AUTH_REQUIRED')
  })

  it('getEnrolledCounts — allows any authenticated role', async () => {
    await expect(courseService.getEnrolledCounts(adminActor)).resolves.toBeInstanceOf(Map)
  })

  it('getEnrolledCounts — rejects null actor (unauthenticated bypass)', async () => {
    await expect(
      courseService.getEnrolledCounts(null as unknown as User),
    ).rejects.toThrow('RBAC_AUTH_REQUIRED')
  })

  it('getMyEnrollmentStatuses — allows any authenticated role', async () => {
    await expect(courseService.getMyEnrollmentStatuses(1, memberActor)).resolves.toBeInstanceOf(Map)
  })

  it('getMyEnrollmentStatuses — rejects null actor (unauthenticated bypass)', async () => {
    await expect(
      courseService.getMyEnrollmentStatuses(1, null as unknown as User),
    ).rejects.toThrow('RBAC_AUTH_REQUIRED')
  })
})

describe('campaignService read RBAC', () => {
  it('listCampaigns — allows any authenticated role', async () => {
    await expect(campaignService.listCampaigns(adminActor)).resolves.toEqual([])
    await expect(campaignService.listCampaigns(memberActor)).resolves.toEqual([])
  })

  it('listCampaigns — rejects null actor (unauthenticated bypass)', async () => {
    await expect(
      campaignService.listCampaigns(null as unknown as User),
    ).rejects.toThrow('RBAC_AUTH_REQUIRED')
  })

  it('getCampaign — allows any authenticated role', async () => {
    await expect(campaignService.getCampaign(999, adminActor)).resolves.toBeUndefined()
    await expect(campaignService.getCampaign(999, memberActor)).resolves.toBeUndefined()
  })

  it('getCampaign — rejects null actor (unauthenticated bypass)', async () => {
    await expect(
      campaignService.getCampaign(1, null as unknown as User),
    ).rejects.toThrow('RBAC_AUTH_REQUIRED')
  })

  it('getPublishedFishEntries — allows any authenticated role', async () => {
    await expect(campaignService.getPublishedFishEntries(adminActor)).resolves.toEqual([])
  })

  it('getPublishedFishEntries — rejects null actor (unauthenticated bypass)', async () => {
    await expect(
      campaignService.getPublishedFishEntries(null as unknown as User),
    ).rejects.toThrow('RBAC_AUTH_REQUIRED')
  })
})
