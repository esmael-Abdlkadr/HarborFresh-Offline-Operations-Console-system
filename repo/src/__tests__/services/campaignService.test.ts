// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db.ts'
import { campaignService } from '../../services/campaignService.ts'
import type { FishEntry, User } from '../../types/index.ts'

async function clearDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}

async function makeUser(overrides: Partial<User> = {}): Promise<User & { id: number }> {
  const user: User = {
    username: `user_${Math.random().toString(36).slice(2, 6)}`,
    passwordHash: 'fakehash',
    salt: 'fakesalt',
    role: 'Member',
    failedAttempts: 0,
    ...overrides,
  }
  const id = await db.users.add(user)
  return { ...user, id }
}

async function makePublishedFish(): Promise<FishEntry & { id: number }> {
  const entry: FishEntry = {
    slug: `fish-${Math.random().toString(36).slice(2, 6)}`,
    commonName: 'Test Fish',
    scientificName: 'Testus fishus',
    taxonomy: { kingdom: 'Animalia', phylum: 'Chordata', class: 'Actinopterygii', order: 'Perciformes', family: 'Testidae', genus: 'Testus', species: 'fishus' },
    morphologyNotes: '',
    habitat: '',
    distribution: '',
    protectionLevel: 'None',
    mediaAssets: [],
    status: 'published',
    currentVersion: 1,
    tags: [],
    createdBy: 1,
    updatedAt: Date.now(),
  }
  const id = await db.fishEntries.add(entry)
  return { ...entry, id }
}

describe('campaignService', () => {
  beforeEach(async () => {
    await clearDb()
  })
  afterEach(async () => {
    await clearDb()
  })

  it('listCampaigns returns all campaigns for authenticated user', async () => {
    const admin = await makeUser({ role: 'Administrator' })
    await db.campaigns.bulkAdd([
      { title: 'Campaign A', description: '', fishEntryId: 1, pricePerUnit: 10, unit: 'lb', minParticipants: 1, cutoffAt: Date.now() + 86400000, status: 'Open', createdBy: admin.id, createdAt: Date.now(), version: 1 },
      { title: 'Campaign B', description: '', fishEntryId: 1, pricePerUnit: 5, unit: 'kg', minParticipants: 2, cutoffAt: Date.now() + 86400000, status: 'Confirmed', createdBy: admin.id, createdAt: Date.now(), version: 1 },
    ])

    const campaigns = await campaignService.listCampaigns(admin)
    expect(campaigns.length).toBe(2)
  })

  it('createCampaign throws for non-admin/member role (Dispatcher)', async () => {
    const dispatcher = await makeUser({ role: 'Dispatcher' })
    const fish = await makePublishedFish()

    await expect(
      campaignService.createCampaign(
        { title: 'New', description: '', fishEntryId: fish.id, pricePerUnit: 10, unit: 'lb', minParticipants: 1, cutoffAt: Date.now() + 86400000 },
        dispatcher,
      ),
    ).rejects.toThrow(/only administrators or members/i)
  })

  it('createCampaign throws for past cutoff time', async () => {
    const admin = await makeUser({ role: 'Administrator' })
    const fish = await makePublishedFish()

    await expect(
      campaignService.createCampaign(
        { title: 'Late', description: '', fishEntryId: fish.id, pricePerUnit: 10, unit: 'lb', minParticipants: 1, cutoffAt: Date.now() - 1000 },
        admin,
      ),
    ).rejects.toThrow(/cutoff time must be in the future/i)
  })

  it('createCampaign creates campaign successfully for Administrator', async () => {
    const admin = await makeUser({ role: 'Administrator' })
    const fish = await makePublishedFish()

    const campaign = await campaignService.createCampaign(
      { title: 'Spring Sale', description: 'Fresh catch', fishEntryId: fish.id, pricePerUnit: 15, unit: 'lb', minParticipants: 3, cutoffAt: Date.now() + 86400000 },
      admin,
    )

    expect(campaign.id).toBeTruthy()
    expect(campaign.title).toBe('Spring Sale')
    expect(campaign.status).toBe('Open')
    expect(campaign.pricePerUnit).toBe(15)
  })

  it('getCampaign returns campaign by id', async () => {
    const admin = await makeUser({ role: 'Administrator' })
    const id = await db.campaigns.add({ title: 'My Campaign', description: '', fishEntryId: 1, pricePerUnit: 10, unit: 'lb', minParticipants: 1, cutoffAt: Date.now() + 86400000, status: 'Open', createdBy: admin.id, createdAt: Date.now(), version: 1 })

    const campaign = await campaignService.getCampaign(id, admin)
    expect(campaign).toBeTruthy()
    expect(campaign?.title).toBe('My Campaign')
  })

  it('getCampaignWithOrderCount returns orderCount', async () => {
    const admin = await makeUser({ role: 'Administrator' })
    const campaignId = await db.campaigns.add({ title: 'Count Test', description: '', fishEntryId: 1, pricePerUnit: 10, unit: 'lb', minParticipants: 1, cutoffAt: Date.now() + 86400000, status: 'Open', createdBy: admin.id, createdAt: Date.now(), version: 1 })

    // Add 2 active orders and 1 cancelled order
    await db.orders.bulkAdd([
      { operationId: crypto.randomUUID(), campaignId, memberId: 1, quantity: 1, totalPrice: 10, status: 'Created', createdAt: Date.now(), autoCloseAt: Date.now() + 30 * 60 * 1000, version: 1 },
      { operationId: crypto.randomUUID(), campaignId, memberId: 2, quantity: 1, totalPrice: 10, status: 'Confirmed', createdAt: Date.now(), autoCloseAt: Date.now() + 30 * 60 * 1000, version: 1 },
      { operationId: crypto.randomUUID(), campaignId, memberId: 3, quantity: 1, totalPrice: 10, status: 'Cancelled', createdAt: Date.now(), autoCloseAt: Date.now() + 30 * 60 * 1000, version: 1 },
    ])

    const result = await campaignService.getCampaignWithOrderCount(campaignId)
    expect(result?.orderCount).toBe(2)
  })
})
