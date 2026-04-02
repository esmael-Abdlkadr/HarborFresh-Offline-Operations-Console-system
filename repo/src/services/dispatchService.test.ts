// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db.ts'
import { seedTestUsers } from '../db/seed.ts'
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
  await seedTestUsers()
})

describe('dispatchService', () => {
  it('auto plans tasks respecting capacity and windows', async () => {
    const dispatcher = await getUser('dispatcher')
    const now = Date.now()
    const date = dateString(now)

    const batchId = await db.deliveryBatches.add({
      label: 'Batch A',
      vehicleId: 'van-1',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 18 * 60,
      vehicleCapacityLbs: 200,
      status: 'Planned',
      version: 1,
    })

    const startInShift = new Date(`${date}T10:00:00`).getTime()
    const outOfShift = new Date(`${date}T22:00:00`).getTime()

    await db.deliveryTasks.bulkAdd([
      {
        orderId: 1,
        status: 'Unassigned',
        priority: 1,
        weightLbs: 100,
        promisedPickupWindow: { start: startInShift - 1800000, end: startInShift },
        promisedDeliveryWindow: { start: startInShift, end: startInShift + 3600000 },
        address: '1 Dock',
        version: 1,
      },
      {
        orderId: 2,
        status: 'Unassigned',
        priority: 1,
        weightLbs: 150,
        promisedPickupWindow: { start: startInShift - 1800000, end: startInShift },
        promisedDeliveryWindow: { start: startInShift, end: startInShift + 3600000 },
        address: '2 Dock',
        version: 1,
      },
      {
        orderId: 3,
        status: 'Unassigned',
        priority: 2,
        weightLbs: 40,
        promisedPickupWindow: { start: outOfShift - 1800000, end: outOfShift },
        promisedDeliveryWindow: { start: outOfShift, end: outOfShift + 3600000 },
        address: '3 Dock',
        version: 1,
      },
    ])

    await dispatchService.autoPlan(date, dispatcher)

    const assigned = await db.deliveryTasks.where('batchId').equals(batchId).toArray()
    const unassigned = await db.deliveryTasks.where('status').equals('Unassigned').toArray()
    expect(assigned).toHaveLength(1)
    expect(unassigned.length).toBeGreaterThanOrEqual(2)
  })

  it('throws capacity conflict on manual assign and keeps task unassigned', async () => {
    const dispatcher = await getUser('dispatcher')
    const date = dateString(Date.now())
    const batchId = await db.deliveryBatches.add({
      label: 'Small Van',
      vehicleId: 'van-small',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 16 * 60,
      vehicleCapacityLbs: 80,
      status: 'Planned',
      version: 1,
    })

    const taskId = await db.deliveryTasks.add({
      orderId: 77,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 120,
      promisedPickupWindow: {
        start: new Date(`${date}T09:00:00`).getTime(),
        end: new Date(`${date}T09:30:00`).getTime(),
      },
      promisedDeliveryWindow: {
        start: new Date(`${date}T10:00:00`).getTime(),
        end: new Date(`${date}T11:00:00`).getTime(),
      },
      address: '4 Harbor',
      version: 1,
    })

    await expect(
      dispatchService.assignTask(taskId, batchId, 'Need this moved quickly', dispatcher),
    ).rejects.toBeInstanceOf(DispatchError)

    await expect(
      dispatchService.assignTask(taskId, batchId, 'Need this moved quickly', dispatcher),
    ).rejects.toMatchObject({ code: 'DISPATCH_CAPACITY_EXCEEDED' })

    const stillUnassigned = await db.deliveryTasks.get(taskId)
    expect(stillUnassigned?.status).toBe('Unassigned')
  })

  it('rejects stale task versions on manual assignment', async () => {
    const dispatcher = await getUser('dispatcher')
    const date = dateString(Date.now())
    const batchId = await db.deliveryBatches.add({
      label: 'Versioned Batch',
      vehicleId: 'van-versioned',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 16 * 60,
      vehicleCapacityLbs: 300,
      status: 'Planned',
      version: 1,
    })

    const taskId = await db.deliveryTasks.add({
      orderId: 78,
      status: 'Unassigned',
      priority: 1,
      weightLbs: 40,
      promisedPickupWindow: {
        start: new Date(`${date}T09:00:00`).getTime(),
        end: new Date(`${date}T09:30:00`).getTime(),
      },
      promisedDeliveryWindow: {
        start: new Date(`${date}T10:00:00`).getTime(),
        end: new Date(`${date}T11:00:00`).getTime(),
      },
      address: '6 Harbor',
      version: 1,
    })

    await db.deliveryTasks.update(taskId, { version: 2 })

    await expect(
      dispatchService.assignTask(taskId, batchId, 'Need this moved quickly', dispatcher, {
        expectedTaskVersion: 1,
        expectedBatchVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'DISPATCH_VERSION_CONFLICT' })
  })

  it('recalculate unassigns then replans and logs action', async () => {
    const dispatcher = await getUser('dispatcher')
    const date = dateString(Date.now())
    const batchId = await db.deliveryBatches.add({
      label: 'Batch R',
      vehicleId: 'van-r',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 18 * 60,
      vehicleCapacityLbs: 500,
      status: 'Planned',
      version: 1,
    })
    const taskId = await db.deliveryTasks.add({
      orderId: 90,
      batchId,
      status: 'Assigned',
      priority: 1,
      weightLbs: 50,
      promisedPickupWindow: {
        start: new Date(`${date}T09:00:00`).getTime(),
        end: new Date(`${date}T09:30:00`).getTime(),
      },
      promisedDeliveryWindow: {
        start: new Date(`${date}T10:00:00`).getTime(),
        end: new Date(`${date}T11:00:00`).getTime(),
      },
      address: '5 Wharf',
      version: 1,
    })

    await dispatchService.recalculate(date, dispatcher, 'Rebalance routes and workloads')
    const task = await db.deliveryTasks.get(taskId)
    expect(task?.status).toBe('Assigned')

    const recalcLog = await db.dispatchLogs.where('action').equals('RECALCULATE').first()
    expect(recalcLog).toBeTruthy()
  })

  it('detects capacity and duplicate address conflicts', async () => {
    const dispatcher = await getUser('dispatcher')
    const date = dateString(Date.now())
    const batchId = await db.deliveryBatches.add({
      label: 'Conflict batch',
      vehicleId: 'van-c',
      driverId: dispatcher.id!,
      date,
      shiftStart: 8 * 60,
      shiftEnd: 18 * 60,
      vehicleCapacityLbs: 100,
      status: 'Planned',
      version: 1,
    })

    const deliveryStart = new Date(`${date}T09:30:00`).getTime()
    await db.deliveryTasks.bulkAdd([
      {
        orderId: 201,
        batchId,
        status: 'Assigned',
        priority: 1,
        weightLbs: 70,
        promisedPickupWindow: { start: deliveryStart - 3600000, end: deliveryStart },
        promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 1800000 },
        address: 'same place',
        version: 1,
      },
      {
        orderId: 202,
        batchId,
        status: 'Assigned',
        priority: 2,
        weightLbs: 60,
        promisedPickupWindow: { start: deliveryStart - 3600000, end: deliveryStart },
        promisedDeliveryWindow: { start: deliveryStart, end: deliveryStart + 1800000 },
        address: 'same place',
        version: 1,
      },
    ])

    const conflicts = await dispatchService.detectConflicts(batchId)
    expect(conflicts.some((item) => item.type === 'CAPACITY_EXCEEDED')).toBe(true)
    expect(conflicts.some((item) => item.type === 'DUPLICATE_ADDRESS')).toBe(true)
  })
})
