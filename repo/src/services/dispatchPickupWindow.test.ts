// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedIfEmpty } from '../db/seed.ts'
import { dispatchService, DispatchError } from './dispatchService.ts'

async function getUser(username: string) {
  const user = await db.users.where('username').equals(username).first()
  if (!user) throw new Error(`Missing user: ${username}`)
  return user
}

function dateString(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

beforeEach(async () => {
  localStorage.clear()
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await seedIfEmpty()
})

describe('dispatchService — pickup window validation', () => {
  it('rejects manual assignment when pickup window is outside shift', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    const batchId = await db.deliveryBatches.add({
      label: 'Morning Batch',
      vehicleId: 'van-1',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,   // 08:00
      shiftEnd: 12 * 60,    // 12:00
      vehicleCapacityLbs: 500,
      status: 'Planned',
      version: 1,
    })

    // Pickup at 22:00 — outside shift (08:00–12:00), delivery at 10:00 — inside shift
    const latePickup = new Date(`${date}T22:00:00`).getTime()
    const goodDelivery = new Date(`${date}T10:00:00`).getTime()

    const taskId = await db.deliveryTasks.add({
      orderId: 99,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 50,
      promisedPickupWindow: { start: latePickup, end: latePickup + 1800000 },
      promisedDeliveryWindow: { start: goodDelivery, end: goodDelivery + 3600000 },
      address: '1 Harbor Rd',
      version: 1,
    })

    await expect(
      dispatchService.assignTask(taskId, batchId, 'Reason long enough here', dispatcher),
    ).rejects.toThrow(DispatchError)
  })

  it('detects pickup window violation in detectConflicts', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    const batchId = await db.deliveryBatches.add({
      label: 'Afternoon Batch',
      vehicleId: 'van-2',
      driverId: dispatcher.id!,
      date,
      shiftStart: 13 * 60,  // 13:00
      shiftEnd: 18 * 60,    // 18:00
      vehicleCapacityLbs: 500,
      status: 'Planned',
      version: 1,
    })

    // Pickup at 08:00 (outside shift 13:00–18:00), delivery at 15:00 (inside shift)
    const earlyPickup = new Date(`${date}T08:00:00`).getTime()
    const goodDelivery = new Date(`${date}T15:00:00`).getTime()

    await db.deliveryTasks.add({
      orderId: 100,
      batchId,
      status: 'Assigned',
      priority: 2,
      weightLbs: 40,
      promisedPickupWindow: { start: earlyPickup, end: earlyPickup + 1800000 },
      promisedDeliveryWindow: { start: goodDelivery, end: goodDelivery + 3600000 },
      address: '2 Dock St',
      version: 1,
    })

    const conflicts = await dispatchService.detectConflicts(batchId)
    const types = conflicts.map((c) => c.type)
    expect(types).toContain('PICKUP_WINDOW_VIOLATION')
  })

  it('allows assignment when both pickup and delivery fit the shift', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    const batchId = await db.deliveryBatches.add({
      label: 'Full-Day Batch',
      vehicleId: 'van-3',
      driverId: dispatcher.id!,
      date,
      shiftStart: 6 * 60,   // 06:00
      shiftEnd: 20 * 60,    // 20:00
      vehicleCapacityLbs: 500,
      status: 'Planned',
      version: 1,
    })

    const pickup = new Date(`${date}T09:00:00`).getTime()
    const delivery = new Date(`${date}T11:00:00`).getTime()

    const taskId = await db.deliveryTasks.add({
      orderId: 101,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 50,
      promisedPickupWindow: { start: pickup, end: pickup + 1800000 },
      promisedDeliveryWindow: { start: delivery, end: delivery + 3600000 },
      address: '3 Wharf Ave',
      version: 1,
    })

    await expect(
      dispatchService.assignTask(taskId, batchId, 'Valid assignment reason', dispatcher),
    ).resolves.toBeUndefined()
  })

  it('auto-plan skips tasks whose pickup window is outside shift', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    await db.deliveryBatches.add({
      label: 'Morning Only',
      vehicleId: 'van-4',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 12 * 60,
      vehicleCapacityLbs: 500,
      status: 'Planned',
      version: 1,
    })

    // Pickup at 23:00 — outside morning shift
    const latePickup = new Date(`${date}T23:00:00`).getTime()
    const lateDelivery = new Date(`${date}T10:00:00`).getTime()

    await db.deliveryTasks.add({
      orderId: 102,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 30,
      promisedPickupWindow: { start: latePickup, end: latePickup + 1800000 },
      promisedDeliveryWindow: { start: lateDelivery, end: lateDelivery + 3600000 },
      address: '4 Sea Ln',
      version: 1,
    })

    await dispatchService.autoPlan(date, dispatcher)

    const task = await db.deliveryTasks.where('orderId').equals(102).first()
    expect(task?.status).toBe('Unassigned')
    expect(task?.batchId).toBeUndefined()
  })
})
