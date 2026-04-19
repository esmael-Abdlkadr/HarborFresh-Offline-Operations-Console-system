// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db.ts'
import { orderService, OrderError } from '../../services/orderService.ts'
import type { Campaign, User } from '../../types/index.ts'

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

async function makeCampaign(overrides: Partial<Campaign> = {}): Promise<Campaign & { id: number }> {
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

describe('orderService', () => {
  beforeEach(async () => {
    await clearDb()
  })
  afterEach(async () => {
    await clearDb()
  })

  it('joinCampaign creates order for member', async () => {
    const member = await makeUser({ username: 'member1', role: 'Member' })
    const campaign = await makeCampaign()
    const operationId = crypto.randomUUID()

    const order = await orderService.joinCampaign(campaign.id, member.id, member, 2, operationId, campaign.version)

    expect(order.id).toBeTruthy()
    expect(order.memberId).toBe(member.id)
    expect(order.campaignId).toBe(campaign.id)
    expect(order.quantity).toBe(2)
    expect(order.totalPrice).toBe(20.00)
    expect(order.status).toBe('Created')
  })

  it('joinCampaign throws ORDER_RBAC_DENIED when member tries to join for another member', async () => {
    const member = await makeUser({ username: 'member1', role: 'Member' })
    const otherMember = await makeUser({ username: 'member2', role: 'Member' })
    const campaign = await makeCampaign()

    await expect(
      orderService.joinCampaign(campaign.id, otherMember.id, member, 1, crypto.randomUUID(), campaign.version),
    ).rejects.toThrow(OrderError)
  })

  it('joinCampaign throws ORDER_CAMPAIGN_CLOSED for closed campaign', async () => {
    const member = await makeUser({ username: 'member1', role: 'Member' })
    const campaign = await makeCampaign({ status: 'Closed' })

    await expect(
      orderService.joinCampaign(campaign.id, member.id, member, 1, crypto.randomUUID(), campaign.version),
    ).rejects.toThrow(OrderError)
  })

  it('joinCampaign is idempotent: same operationId returns existing order', async () => {
    const member = await makeUser({ username: 'member1', role: 'Member' })
    const campaign = await makeCampaign()
    const operationId = crypto.randomUUID()

    const order1 = await orderService.joinCampaign(campaign.id, member.id, member, 1, operationId, campaign.version)
    const order2 = await orderService.joinCampaign(campaign.id, member.id, member, 1, operationId, campaign.version)

    expect(order1.id).toBe(order2.id)
  })

  it('joinCampaign throws ORDER_INVALID_QUANTITY for quantity < 1', async () => {
    const member = await makeUser({ username: 'member1', role: 'Member' })
    const campaign = await makeCampaign()

    await expect(
      orderService.joinCampaign(campaign.id, member.id, member, 0, crypto.randomUUID(), campaign.version),
    ).rejects.toThrow(OrderError)
  })

  it('getParticipantCounts returns correct counts', async () => {
    const campaign1 = await makeCampaign()
    const campaign2 = await makeCampaign()

    await db.orders.bulkAdd([
      { operationId: crypto.randomUUID(), campaignId: campaign1.id, memberId: 1, quantity: 1, totalPrice: 10, status: 'Created', createdAt: Date.now(), autoCloseAt: Date.now() + 30 * 60 * 1000, version: 1 },
      { operationId: crypto.randomUUID(), campaignId: campaign1.id, memberId: 2, quantity: 2, totalPrice: 20, status: 'Created', createdAt: Date.now(), autoCloseAt: Date.now() + 30 * 60 * 1000, version: 1 },
      { operationId: crypto.randomUUID(), campaignId: campaign2.id, memberId: 3, quantity: 1, totalPrice: 10, status: 'Cancelled', createdAt: Date.now(), autoCloseAt: Date.now() + 30 * 60 * 1000, version: 1 },
    ])

    const counts = await orderService.getParticipantCounts()
    expect(counts.get(campaign1.id)).toBe(2)
    // Cancelled orders are excluded
    expect(counts.get(campaign2.id)).toBeUndefined()
  })
})
