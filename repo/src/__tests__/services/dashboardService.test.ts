// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db.ts'
import { dashboardService } from '../../services/dashboardService.ts'

async function clearDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}

describe('dashboardService.getCounts', () => {
  beforeEach(async () => {
    await clearDb()
  })
  afterEach(async () => {
    await clearDb()
  })

  it('returns all zeros on empty db', async () => {
    const counts = await dashboardService.getCounts()
    expect(counts.openCampaigns).toBe(0)
    expect(counts.confirmedOrders).toBe(0)
    expect(counts.unassignedTasks).toBe(0)
    expect(counts.pendingNotifications).toBe(0)
    expect(counts.publishedFish).toBe(0)
    expect(counts.openCourses).toBe(0)
  })

  it('counts open campaigns correctly', async () => {
    await db.campaigns.bulkAdd([
      { title: 'Open A', description: '', fishEntryId: 1, pricePerUnit: 10, unit: 'lb', minParticipants: 1, cutoffAt: Date.now() + 86400000, status: 'Open', createdBy: 1, createdAt: Date.now(), version: 1 },
      { title: 'Open B', description: '', fishEntryId: 1, pricePerUnit: 10, unit: 'lb', minParticipants: 1, cutoffAt: Date.now() + 86400000, status: 'Open', createdBy: 1, createdAt: Date.now(), version: 1 },
      { title: 'Closed', description: '', fishEntryId: 1, pricePerUnit: 10, unit: 'lb', minParticipants: 1, cutoffAt: Date.now() - 1000, status: 'Closed', createdBy: 1, createdAt: Date.now(), version: 1 },
    ])

    const counts = await dashboardService.getCounts()
    expect(counts.openCampaigns).toBe(2)
  })

  it('counts published fish correctly', async () => {
    const baseFish = {
      slug: 'fish',
      commonName: 'Test Fish',
      scientificName: 'Testus fishus',
      taxonomy: { kingdom: 'Animalia', phylum: '', class: '', order: '', family: '', genus: '', species: '' },
      morphologyNotes: '',
      habitat: '',
      distribution: '',
      protectionLevel: 'None' as const,
      mediaAssets: [],
      currentVersion: 1,
      tags: [],
      createdBy: 1,
      updatedAt: Date.now(),
    }
    await db.fishEntries.bulkAdd([
      { ...baseFish, slug: 'fish-1', status: 'published' },
      { ...baseFish, slug: 'fish-2', status: 'published' },
      { ...baseFish, slug: 'fish-3', status: 'draft' },
    ])

    const counts = await dashboardService.getCounts()
    expect(counts.publishedFish).toBe(2)
  })

  it('counts pending notifications correctly', async () => {
    await db.notifications.bulkAdd([
      { recipientId: 1, templateKey: 'ORDER_CONFIRMED', templateData: { orderId: '1' }, status: 'Pending', isRead: false, createdAt: Date.now(), retries: 0 },
      { recipientId: 2, templateKey: 'ORDER_CONFIRMED', templateData: { orderId: '2' }, status: 'Pending', isRead: false, createdAt: Date.now(), retries: 0 },
      { recipientId: 3, templateKey: 'ORDER_CONFIRMED', templateData: { orderId: '3' }, status: 'Delivered', isRead: false, createdAt: Date.now(), retries: 0 },
    ])

    const counts = await dashboardService.getCounts()
    expect(counts.pendingNotifications).toBe(2)
  })
})
