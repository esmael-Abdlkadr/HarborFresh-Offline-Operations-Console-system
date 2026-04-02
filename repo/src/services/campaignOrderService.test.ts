// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedIfEmpty } from '../db/seed.ts'
import { campaignService } from './campaignService.ts'
import { fishService } from './fishService.ts'
import { orderService, OrderError } from './orderService.ts'

async function getUser(username: string) {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

async function createPublishedFish(adminUsername = 'admin') {
  const admin = await getUser(adminUsername)
  const fish = await fishService.createEntry(
    {
      commonName: 'Halibut',
      scientificName: 'Hippoglossus stenolepis',
      taxonomy: {
        kingdom: 'Animalia',
        phylum: 'Chordata',
        class: 'Actinopterygii',
        order: 'Pleuronectiformes',
        family: 'Pleuronectidae',
        genus: 'Hippoglossus',
        species: 'H. stenolepis',
      },
    },
    admin,
  )
  await fishService.publishEntry(fish.id!, admin)
  return fish
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedIfEmpty()
})

describe('campaign and order services', () => {
  it('creates campaign and supports idempotent join with operationId', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Friday Halibut Drop',
        description: 'Bulk buy for this weekend',
        fishEntryId: fish.id!,
        pricePerUnit: 19.99,
        unit: 'lb',
        minParticipants: 2,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )
    expect(campaign.status).toBe('Open')

    const opId = '11111111-1111-4111-8111-111111111111'
    const first = await orderService.joinCampaign(campaign.id!, member.id!, 2, opId)
    const second = await orderService.joinCampaign(campaign.id!, member.id!, 2, opId)
    expect(second.id).toBe(first.id)
  })

  it('blocks second member join to same campaign for same user', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Weekend Group Buy',
        description: 'One order per member',
        fishEntryId: fish.id!,
        pricePerUnit: 12,
        unit: 'lb',
        minParticipants: 1,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID())
    await expect(
      orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'ORDER_ALREADY_EXISTS' })
  })

  it('auto-closes unpaid created order after 30 min', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Auto close check',
        description: 'No payment window',
        fishEntryId: fish.id!,
        pricePerUnit: 10,
        unit: 'lb',
        minParticipants: 1,
        cutoffAt: Date.now() + 300_000,
      },
      admin,
    )

    const order = await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID())
    await db.orders.update(order.id!, { autoCloseAt: Date.now() - 1000 })
    await orderService.autoCloseUnpaid()

    const closed = await db.orders.get(order.id!)
    expect(closed?.status).toBe('Cancelled')
  })

  it('confirms campaign on cutoff and leaves created orders awaiting payment', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const editor = await getUser('editor')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Enough participants',
        description: 'Confirm on cutoff',
        fishEntryId: fish.id!,
        pricePerUnit: 15,
        unit: 'lb',
        minParticipants: 2,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID())
    await orderService.joinCampaign(campaign.id!, editor.id!, 1, crypto.randomUUID())

    await db.campaigns.update(campaign.id!, { cutoffAt: Date.now() - 1000 })
    await campaignService.checkAndCloseExpired()

    const updatedCampaign = await db.campaigns.get(campaign.id!)
    expect(updatedCampaign?.status).toBe('Confirmed')

    const campaignOrders = await db.orders.where('campaignId').equals(campaign.id!).toArray()
    expect(campaignOrders.every((order) => order.status === 'Created')).toBe(true)
    expect(campaignOrders.every((order) => order.paymentMethod === undefined)).toBe(true)
  })

  it('cancels campaign on cutoff when not enough orders', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Not enough participants',
        description: 'Cancel on cutoff',
        fishEntryId: fish.id!,
        pricePerUnit: 9,
        unit: 'lb',
        minParticipants: 2,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    const order = await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID())
    await db.campaigns.update(campaign.id!, { cutoffAt: Date.now() - 1000 })
    await campaignService.checkAndCloseExpired()

    const updatedCampaign = await db.campaigns.get(campaign.id!)
    const updatedOrder = await db.orders.get(order.id!)
    expect(updatedCampaign?.status).toBe('Cancelled')
    expect(updatedOrder?.status).toBe('Cancelled')
  })

  it('throws optimistic lock conflict with stale version', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Version conflict test',
        description: 'Stale transition should fail',
        fishEntryId: fish.id!,
        pricePerUnit: 9,
        unit: 'lb',
        minParticipants: 1,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    const order = await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID())
    await expect(
      orderService.transitionStatus(order.id!, 'Confirmed', admin, {
        expectedVersion: order.version + 1,
        paymentMethod: 'ManualMark',
      }),
    ).rejects.toBeInstanceOf(OrderError)
    await expect(
      orderService.transitionStatus(order.id!, 'Confirmed', admin, {
        expectedVersion: order.version + 1,
        paymentMethod: 'ManualMark',
      }),
    ).rejects.toMatchObject({ code: 'ORDER_VERSION_CONFLICT' })
  })

  it('writes audit logs for transitions', async () => {
    const admin = await getUser('admin')
    const member = await getUser('member')
    const fish = await createPublishedFish()

    const campaign = await campaignService.createCampaign(
      {
        title: 'Audit check',
        description: 'Ensure logs',
        fishEntryId: fish.id!,
        pricePerUnit: 20,
        unit: 'lb',
        minParticipants: 1,
        cutoffAt: Date.now() + 60_000,
      },
      admin,
    )

    const order = await orderService.joinCampaign(campaign.id!, member.id!, 1, crypto.randomUUID())
    await orderService.transitionStatus(order.id!, 'Confirmed', admin, {
      expectedVersion: order.version,
      paymentMethod: 'ManualMark',
    })

    const logs = await db.auditLogs.where('entityType').equals('Order').toArray()
    expect(logs.some((log) => log.action === 'ORDER_CREATED')).toBe(true)
    expect(logs.some((log) => log.action === 'ORDER_CONFIRMED')).toBe(true)
  })
})
